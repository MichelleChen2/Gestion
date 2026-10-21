require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';

app.use(cors({
  origin(origin, cb) {
    const allowed = (process.env.FRONTEND_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!origin || !allowed.length || allowed.includes(origin)) return cb(null, true);
    return cb(new Error('Origen no permitido por CORS'));
  }
}));
app.use(express.json({ limit: '8mb' }));


async function ensureRuntimeSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS member_documents (
      id BIGSERIAL PRIMARY KEY,
      member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      document_type VARCHAR(40) NOT NULL CHECK (document_type IN ('monotributo')),
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL DEFAULT 'application/pdf',
      file_size INTEGER NOT NULL CHECK (file_size > 0),
      content BYTEA NOT NULL,
      auto_verified BOOLEAN NOT NULL DEFAULT FALSE,
      cuit_matched BOOLEAN NOT NULL DEFAULT FALSE,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS member_documents_member_type_idx
      ON member_documents(member_id, document_type, uploaded_at DESC);

    CREATE TABLE IF NOT EXISTS subscription_settings (
      singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
      plan VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro')),
      max_members INTEGER NOT NULL DEFAULT 5,
      price_per_month NUMERIC(14,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO subscription_settings(singleton, plan, max_members, price_per_month)
    VALUES (TRUE, 'free', 5, 0)
    ON CONFLICT (singleton) DO NOTHING;

    CREATE TABLE IF NOT EXISTS surplus_distributions (
      id BIGSERIAL PRIMARY KEY,
      period_label VARCHAR(100) NOT NULL,
      total_surplus NUMERIC(14,2) NOT NULL CHECK (total_surplus > 0),
      reserve_legal_amount NUMERIC(14,2) NOT NULL CHECK (reserve_legal_amount >= 0),
      education_fund_amount NUMERIC(14,2) NOT NULL CHECK (education_fund_amount >= 0),
      assistance_fund_amount NUMERIC(14,2) NOT NULL CHECK (assistance_fund_amount >= 0),
      distributable_amount NUMERIC(14,2) NOT NULL CHECK (distributable_amount >= 0),
      total_hours NUMERIC(10,1) NOT NULL CHECK (total_hours >= 0),
      status VARCHAR(20) NOT NULL DEFAULT 'closed' CHECK (status IN ('draft','closed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS surplus_distribution_items (
      id BIGSERIAL PRIMARY KEY,
      distribution_id BIGINT NOT NULL REFERENCES surplus_distributions(id) ON DELETE CASCADE,
      member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
      hours NUMERIC(10,1) NOT NULL CHECK (hours >= 0),
      percentage NUMERIC(6,3) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
      return_amount NUMERIC(14,2) NOT NULL CHECK (return_amount >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function decodePdfBase64(value) {
  const raw = String(value || '').replace(/^data:application\/pdf;base64,/i, '').trim();
  if (!raw) {
    const err = new Error('No se recibió el contenido de la constancia de monotributo.');
    err.statusCode = 400;
    throw err;
  }
  const content = Buffer.from(raw, 'base64');
  if (!content.length || content.length > 5 * 1024 * 1024) {
    const err = new Error('La constancia debe ser un PDF de hasta 5 MB.');
    err.statusCode = 400;
    throw err;
  }
  if (content.subarray(0,4).toString('ascii') !== '%PDF') {
    const err = new Error('El archivo recibido no parece ser un PDF válido.');
    err.statusCode = 400;
    throw err;
  }
  return content;
}

function signUser(user) {
  return jwt.sign(
    { userId: user.id, role: user.role, memberId: user.member_id || null, username: user.username },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [kind, token] = header.split(' ');
  if (kind !== 'Bearer' || !token) return res.status(401).json({ error: 'Sesión requerida.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión vencida o inválida.' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).json({ error: 'No tenés permisos para esta acción.' });
    next();
  };
}

async function getMember(memberId) {
  const { rows } = await pool.query(`
    SELECT m.*,
      EXISTS (
        SELECT 1 FROM member_documents d
        WHERE d.member_id=m.id AND d.document_type='monotributo'
      ) AS monotributo_stored,
      COALESCE(array_agg(a.role ORDER BY a.role) FILTER (WHERE a.role IS NOT NULL), '{}') AS roles
    FROM members m
    LEFT JOIN authorities a ON a.member_id = m.id
    WHERE m.id = $1
    GROUP BY m.id
  `, [memberId]);
  return rows[0] || null;
}

async function getRetribution(memberId) {
  const { rows } = await pool.query(`
    WITH cfg AS (
      SELECT normal_rate, special_rate FROM retribution_settings WHERE singleton=TRUE
    ), totals AS (
      SELECT
        COALESCE(SUM(CASE WHEN EXTRACT(DOW FROM w.work_date)=0 OR h.holiday_date IS NOT NULL THEN 0 ELSE w.hours END),0) AS normal_hours,
        COALESCE(SUM(CASE WHEN EXTRACT(DOW FROM w.work_date)=0 OR h.holiday_date IS NOT NULL THEN w.hours ELSE 0 END),0) AS special_hours
      FROM work_logs w
      LEFT JOIN holidays h ON h.holiday_date=w.work_date
      WHERE w.member_id=$1
    )
    SELECT
      t.normal_hours::float8 AS normal_hours,
      t.special_hours::float8 AS special_hours,
      c.normal_rate::float8 AS normal_rate,
      c.special_rate::float8 AS special_rate,
      (t.normal_hours*c.normal_rate)::float8 AS normal_amount,
      (t.special_hours*c.special_rate)::float8 AS special_amount,
      ((t.normal_hours*c.normal_rate)+(t.special_hours*c.special_rate))::float8 AS total,
      rt.amount::float8 AS transferred_amount,
      rt.transferred_at
    FROM totals t CROSS JOIN cfg c
    LEFT JOIN retribution_transfers rt ON rt.member_id=$1 AND rt.period_key='actual'
  `, [memberId]);
  return rows[0];
}

async function motionTally(motionId) {
  const motionRes = await pool.query('SELECT * FROM motions WHERE id=$1', [motionId]);
  const motion = motionRes.rows[0];
  if (!motion) return null;

  const { rows } = await pool.query(`
    WITH eligible AS (
      SELECT id FROM members WHERE active=TRUE AND verification_pending=FALSE
    )
    SELECT
      (SELECT COUNT(*)::int FROM eligible) AS eligible,
      COUNT(v.*)::int AS emitted,
      COUNT(*) FILTER (WHERE v.vote='A favor')::int AS in_favor,
      COUNT(*) FILTER (WHERE v.vote='En contra')::int AS against,
      COUNT(*) FILTER (WHERE v.vote='Abstención')::int AS abstentions
    FROM votes v
    JOIN eligible e ON e.id=v.member_id
    WHERE v.motion_id=$1
  `, [motionId]);
  const tally = rows[0];
  const eligible = Number(tally.eligible || 0);
  const inFavor = Number(tally.in_favor || 0);
  const complete = eligible > 0 && Number(tally.emitted) >= eligible;
  let result = null;
  if (complete) {
    const ratio = eligible ? inFavor / eligible : 0;
    result = motion.motion_type === 'extraordinary'
      ? (ratio >= 0.66 ? 'approved' : 'rejected')
      : (ratio > 0.5 ? 'approved' : 'rejected');
  }
  return { ...motion, tally, complete, computed_result: result };
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (err) {
    res.status(500).json({ ok: false, database: 'disconnected' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ error: 'Completá usuario y contraseña.' });

  const { rows } = await pool.query(`
    SELECT u.id,u.username,u.role,u.member_id,u.display_name,u.enabled,
           m.active,m.verification_pending
    FROM users u
    LEFT JOIN members m ON m.id=u.member_id
    WHERE LOWER(u.username)=LOWER($1)
      AND u.password_hash=crypt($2,u.password_hash)
    LIMIT 1
  `, [username, password]);
  const user = rows[0];
  if (!user || !user.enabled) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  if (user.role === 'associate' && (!user.active || user.verification_pending)) {
    return res.status(403).json({ error: 'El asociado todavía no está habilitado para ingresar.' });
  }

  res.json({
    token: signUser(user),
    user: { id: user.id, username: user.username, role: user.role, memberId: user.member_id, displayName: user.display_name }
  });
});

app.get('/api/me', auth, async (req, res) => {
  if (req.user.role === 'admin') {
    return res.json({ role: 'admin', username: req.user.username, displayName: 'Administrador' });
  }
  const member = await getMember(req.user.memberId);
  if (!member) return res.status(404).json({ error: 'Socio no encontrado.' });
  res.json({ role: 'associate', member });
});

app.get('/api/members', auth, requireRole('admin'), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT m.*,
      EXISTS (
        SELECT 1 FROM member_documents d
        WHERE d.member_id=m.id AND d.document_type='monotributo'
      ) AS monotributo_stored,
      COALESCE(array_agg(a.role ORDER BY a.role) FILTER (WHERE a.role IS NOT NULL), '{}') AS roles
    FROM members m
    LEFT JOIN authorities a ON a.member_id=m.id
    GROUP BY m.id
    ORDER BY m.full_name
  `);
  res.json(rows);
});


function cleanDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatCuitServer(value) {
  const d = cleanDigits(value).slice(0,11);
  if (d.length !== 11) return String(value || '').trim();
  return `${d.slice(0,2)}-${d.slice(2,10)}-${d.slice(10)}`;
}

async function ensureAssociateUser(client, memberId, username, password, displayName, enabled=false) {
  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanPassword = String(password || '');
  if (!cleanUsername || cleanPassword.length < 4) {
    const err = new Error('Usuario o contraseña inicial inválidos.');
    err.statusCode = 400;
    throw err;
  }
  const existing = await client.query('SELECT id FROM users WHERE member_id=$1', [memberId]);
  if (existing.rows[0]) {
    await client.query(`
      UPDATE users
      SET username=$2,
          password_hash=crypt($3, gen_salt('bf')),
          display_name=$4,
          enabled=$5
      WHERE member_id=$1
    `,[memberId,cleanUsername,cleanPassword,displayName,enabled]);
  } else {
    await client.query(`
      INSERT INTO users(username,password_hash,role,member_id,display_name,enabled)
      VALUES($1,crypt($2,gen_salt('bf')),'associate',$3,$4,$5)
    `,[cleanUsername,cleanPassword,memberId,displayName,enabled]);
  }
}

async function getSubscriptionSettings(clientOrPool) {
  const subRes = await clientOrPool.query('SELECT plan, max_members, price_per_month, updated_at FROM subscription_settings WHERE singleton = TRUE');
  return subRes.rows[0] || { plan: 'free', max_members: 5, price_per_month: 0 };
}

async function assertMemberQuotaAvailable(clientOrPool, actionDescription) {
  const sub = await getSubscriptionSettings(clientOrPool);
  if (sub.plan === 'free') {
    const countRes = await clientOrPool.query('SELECT COUNT(*) AS total FROM members WHERE active = TRUE OR verification_pending = TRUE');
    const currentTotal = Number(countRes.rows[0]?.total || 0);
    if (currentTotal >= Number(sub.max_members || 5)) {
      const error = new Error(`Límite del Plan Semilla alcanzado (${sub.max_members} asociados). Actualizá al Plan Profesional para ${actionDescription}.`);
      error.statusCode = 403;
      throw error;
    }
  }
  return sub;
}

function calculateSurplusBreakdown(totalSurplus) {
  const reserveLegal = Math.round(totalSurplus * 0.05 * 100) / 100;
  const educationFund = Math.round(totalSurplus * 0.05 * 100) / 100;
  const assistanceFund = Math.round(totalSurplus * 0.05 * 100) / 100;
  const totalFunds = Math.round((reserveLegal + educationFund + assistanceFund) * 100) / 100;
  const distributable = Math.round((totalSurplus - totalFunds) * 100) / 100;
  return { reserveLegal, educationFund, assistanceFund, totalFunds, distributable };
}

async function getActiveMembersWorkSummary(clientOrPool) {
  const membersRes = await clientOrPool.query(`
    SELECT m.id, m.full_name, m.dni, m.cuit,
           COALESCE(SUM(w.hours), 0)::float8 AS total_hours
    FROM members m
    LEFT JOIN work_logs w ON w.member_id = m.id
    WHERE m.active = TRUE
    GROUP BY m.id, m.full_name, m.dni, m.cuit
    ORDER BY total_hours DESC, m.full_name ASC
  `);
  return membersRes.rows;
}

app.post('/api/members', auth, requireRole('admin'), async (req, res) => {
  const fullName = String(req.body.fullName || '').trim().slice(0,120);
  const dni = cleanDigits(req.body.dni);
  const cuitDigits = cleanDigits(req.body.cuit);
  const cuit = formatCuitServer(cuitDigits);
  const email = String(req.body.email || '').trim().toLowerCase().slice(0,160);
  const capitalSubscribed = Number(req.body.capitalSubscribed);
  const capitalIntegrated = Number(req.body.capitalIntegrated);
  const monotributoFile = String(req.body.monotributoFile || '').trim().slice(0,255);
  const monotributoMimeType = String(req.body.monotributoMimeType || 'application/pdf').trim().slice(0,120);
  const monotributoContent = decodePdfBase64(req.body.monotributoContentBase64);
  const autoVerified = req.body.monotributoAutoVerified === true;
  const cuitMatched = req.body.monotributoCuitMatched === true;
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (fullName.length < 3 || dni.length < 7 || cuitDigits.length !== 11 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Revisá nombre, DNI, CUIT y correo.' });
  }
  if (!(capitalSubscribed > 0) || capitalIntegrated < capitalSubscribed * 0.05 || capitalIntegrated > capitalSubscribed) {
    return res.status(400).json({ error: 'El aporte inicial debe estar entre el 5% y el 100% del capital suscripto.' });
  }
  if (!monotributoFile || !autoVerified || !cuitMatched) {
    return res.status(400).json({ error: 'La constancia de monotributo debe verificarse y coincidir con el CUIT.' });
  }

  try {
    await assertMemberQuotaAvailable(pool, 'incorporar más miembros');
  } catch (quotaError) {
    return res.status(quotaError.statusCode || 403).json({ error: quotaError.message });
  }

  const duplicate = await pool.query(`
    SELECT id,full_name,active,verification_pending
    FROM members
    WHERE regexp_replace(cuit,'\\D','','g')=$1 OR dni=$2
    LIMIT 1
  `,[cuitDigits,dni]);
  if (duplicate.rows[0]) {
    return res.status(409).json({
      error: duplicate.rows[0].active || duplicate.rows[0].verification_pending
        ? 'Ya existe un socio o alta pendiente con ese DNI/CUIT.'
        : 'El DNI/CUIT pertenece a un ex-socio. Debe reincorporarse el registro existente.',
      code: duplicate.rows[0].active || duplicate.rows[0].verification_pending ? 'DUPLICATE_MEMBER' : 'INACTIVE_DUPLICATE',
      member: duplicate.rows[0]
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(`
      INSERT INTO members(
        full_name,dni,cuit,email,capital_subscribed,capital_integrated,
        monotributo_file,monotributo_status,monotributo_auto_verified,
        monotributo_cuit_matched,verification_pending,active
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,'Pendiente de revisión',TRUE,TRUE,TRUE,FALSE)
      RETURNING *
    `,[fullName,dni,cuit,email,capitalSubscribed,capitalIntegrated,monotributoFile]);
    const member = inserted.rows[0];
    await client.query(`
      INSERT INTO member_documents(
        member_id,document_type,file_name,mime_type,file_size,content,auto_verified,cuit_matched
      ) VALUES($1,'monotributo',$2,$3,$4,$5,TRUE,TRUE)
    `,[member.id,monotributoFile,monotributoMimeType,monotributoContent.length,monotributoContent]);
    await ensureAssociateUser(client, member.id, username, password, fullName, false);
    await client.query('COMMIT');
    res.status(201).json(member);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'DNI, CUIT, correo o usuario ya registrado.' });
    throw err;
  } finally {
    client.release();
  }
});

app.post('/api/members/:id/approve', auth, requireRole('admin'), async (req, res) => {
  const memberId = Number(req.params.id);
  const { rows } = await pool.query(`
    UPDATE members
    SET active=TRUE, verification_pending=FALSE, monotributo_status='Al día', updated_at=NOW()
    WHERE id=$1 AND verification_pending=TRUE
    RETURNING *
  `,[memberId]);
  if (!rows[0]) return res.status(404).json({ error: 'No hay un alta pendiente para aprobar.' });
  await pool.query('UPDATE users SET enabled=TRUE WHERE member_id=$1',[memberId]);
  res.json(rows[0]);
});

app.post('/api/members/:id/deactivate', auth, requireRole('admin'), async (req, res) => {
  const memberId = Number(req.params.id);
  const held = await pool.query('SELECT role FROM authorities WHERE member_id=$1',[memberId]);
  if (held.rows.length) return res.status(409).json({ error: `Antes de dar de baja al socio, reasigná: ${held.rows.map(x=>x.role).join(', ')}.` });
  const { rows } = await pool.query(`UPDATE members SET active=FALSE,verification_pending=FALSE,updated_at=NOW() WHERE id=$1 RETURNING *`,[memberId]);
  if (!rows[0]) return res.status(404).json({ error: 'Socio no encontrado.' });
  await pool.query('UPDATE users SET enabled=FALSE WHERE member_id=$1',[memberId]);
  res.json(rows[0]);
});

app.post('/api/members/:id/reactivate', auth, requireRole('admin'), async (req, res) => {
  const memberId = Number(req.params.id);
  const member = await getMember(memberId);
  if (!member) {
    return res.status(404).json({ error: 'Socio no encontrado.' });
  }
  if (member.active || member.verification_pending) {
    return res.status(409).json({ error: 'El socio no se encuentra dado de baja.' });
  }
  const monotributoFile = String(req.body.monotributoFile || '').trim().slice(0,255);
  const monotributoMimeType = String(req.body.monotributoMimeType || 'application/pdf').trim().slice(0,120);
  const monotributoContent = decodePdfBase64(req.body.monotributoContentBase64);
  const verified = req.body.monotributoAutoVerified === true && req.body.monotributoCuitMatched === true;
  if (!monotributoFile || !verified) {
    return res.status(400).json({ error: 'Para reincorporar se requiere una nueva constancia verificada.' });
  }

  try {
    await assertMemberQuotaAvailable(pool, 'reincorporar asociados');
  } catch (quotaError) {
    return res.status(quotaError.statusCode || 403).json({ error: quotaError.message });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      UPDATE members SET monotributo_file=$2,monotributo_status='Pendiente de revisión',monotributo_auto_verified=TRUE,
        monotributo_cuit_matched=TRUE,verification_pending=TRUE,active=FALSE,updated_at=NOW()
      WHERE id=$1 RETURNING *
    `,[memberId,monotributoFile]);
    await client.query(`
      INSERT INTO member_documents(
        member_id,document_type,file_name,mime_type,file_size,content,auto_verified,cuit_matched
      ) VALUES($1,'monotributo',$2,$3,$4,$5,TRUE,TRUE)
    `,[memberId,monotributoFile,monotributoMimeType,monotributoContent.length,monotributoContent]);
    await client.query('UPDATE users SET enabled=FALSE WHERE member_id=$1',[memberId]);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

app.get('/api/members/:id/monotributo', auth, async (req,res) => {
  const memberId = Number(req.params.id);
  if (req.user.role !== 'admin' && Number(req.user.memberId) !== memberId) {
    return res.status(403).json({ error: 'No tenés permisos para consultar este documento.' });
  }
  const { rows } = await pool.query(`
    SELECT file_name,mime_type,file_size,content,uploaded_at
    FROM member_documents
    WHERE member_id=$1 AND document_type='monotributo'
    ORDER BY uploaded_at DESC,id DESC
    LIMIT 1
  `,[memberId]);
  const doc = rows[0];
  if (!doc) return res.status(404).json({ error: 'No hay un PDF almacenado para este socio.' });
  const safeName = encodeURIComponent(doc.file_name || 'constancia_monotributo.pdf');
  res.setHeader('Content-Type', doc.mime_type || 'application/pdf');
  res.setHeader('Content-Length', String(doc.file_size));
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeName}`);
  res.send(doc.content);
});

app.get('/api/authorities', auth, requireRole('admin'), async (req,res) => {
  const { rows } = await pool.query(`
    SELECT a.role,a.member_id,m.full_name
    FROM authorities a JOIN members m ON m.id=a.member_id
    ORDER BY CASE a.role WHEN 'Presidente' THEN 1 WHEN 'Secretario' THEN 2 ELSE 3 END
  `);
  res.json(rows);
});

app.put('/api/authorities/:role', auth, requireRole('admin'), async (req,res) => {
  const role = decodeURIComponent(req.params.role);
  if (!['Presidente','Secretario','Tesorero'].includes(role)) return res.status(400).json({ error:'Cargo inválido.' });
  const memberId = Number(req.body.memberId);
  const member = await getMember(memberId);
  if (!member || !member.active || member.verification_pending) return res.status(400).json({ error:'El asociado debe estar activo y habilitado.' });
  const currentRoles = member.roles || [];
  if (role !== 'Presidente' && !currentRoles.includes('Presidente')) {
    const other = currentRoles.filter(r => r !== role);
    if (other.length) return res.status(409).json({ error:'Solo el Presidente puede acumular más de un cargo especial.' });
  }
  await pool.query(`
    INSERT INTO authorities(role,member_id,assigned_at) VALUES($1,$2,NOW())
    ON CONFLICT(role) DO UPDATE SET member_id=EXCLUDED.member_id,assigned_at=NOW()
  `,[role,memberId]);
  const { rows } = await pool.query(`SELECT a.role,a.member_id,m.full_name FROM authorities a JOIN members m ON m.id=a.member_id WHERE a.role=$1`,[role]);
  res.json(rows[0]);
});

app.get('/api/work-logs', auth, async (req, res) => {
  const params = [];
  let where = '';
  if (req.user.role === 'associate') {
    params.push(req.user.memberId);
    where = 'WHERE w.member_id=$1';
  }
  const { rows } = await pool.query(`
    SELECT w.id,w.member_id,w.work_date,w.hours::float8,w.description,w.created_at,m.full_name,
      (EXTRACT(DOW FROM w.work_date)=0 OR h.holiday_date IS NOT NULL) AS special
    FROM work_logs w
    JOIN members m ON m.id=w.member_id
    LEFT JOIN holidays h ON h.holiday_date=w.work_date
    ${where}
    ORDER BY w.work_date DESC,w.id DESC
  `, params);
  res.json(rows);
});

app.post('/api/work-logs', auth, async (req, res) => {
  let memberId = req.user.memberId;
  if (req.user.role === 'admin') memberId = Number(req.body.memberId);
  const workDate = String(req.body.workDate || '');
  const hours = Number(req.body.hours);
  const description = String(req.body.description || '').trim().slice(0,180);
  if (!memberId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !(hours > 0 && hours < 24)) {
    return res.status(400).json({ error: 'Fecha, socio u horas inválidas.' });
  }
  const member = await getMember(memberId);
  if (!member || !member.active || member.verification_pending) {
    return res.status(400).json({ error: 'El socio seleccionado no está activo y habilitado.' });
  }
  try {
    const { rows } = await pool.query(`
      INSERT INTO work_logs(member_id,work_date,hours,description)
      VALUES($1,$2,$3,$4)
      RETURNING *
    `, [memberId, workDate, hours, description || null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una carga para ese socio en esa fecha.' });
    throw err;
  }
});

app.delete('/api/work-logs/:id', auth, requireRole('admin'), async (req, res) => {
  await pool.query('DELETE FROM work_logs WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

app.get('/api/retribution/settings', auth, async (req, res) => {
  const [cfg, holidays] = await Promise.all([
    pool.query('SELECT normal_rate::float8,special_rate::float8,updated_at FROM retribution_settings WHERE singleton=TRUE'),
    pool.query('SELECT holiday_date,description FROM holidays ORDER BY holiday_date')
  ]);
  res.json({ ...cfg.rows[0], holidays: holidays.rows });
});

app.put('/api/retribution/settings', auth, requireRole('admin'), async (req, res) => {
  const normalRate = Number(req.body.normalRate);
  const specialRate = Number(req.body.specialRate);
  if (normalRate < 0 || specialRate < 0 || !Number.isFinite(normalRate) || !Number.isFinite(specialRate)) {
    return res.status(400).json({ error: 'Las tarifas son inválidas.' });
  }
  const { rows } = await pool.query(`
    UPDATE retribution_settings
    SET normal_rate=$1,special_rate=$2,updated_at=NOW()
    WHERE singleton=TRUE
    RETURNING normal_rate::float8,special_rate::float8,updated_at
  `,[normalRate,specialRate]);
  res.json(rows[0]);
});

app.post('/api/holidays', auth, requireRole('admin'), async (req, res) => {
  const date = String(req.body.date || '');
  const description = String(req.body.description || 'Feriado nacional').trim().slice(0,160) || 'Feriado nacional';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Fecha inválida.' });
  try {
    const { rows } = await pool.query('INSERT INTO holidays(holiday_date,description) VALUES($1,$2) RETURNING *',[date,description]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese feriado ya está cargado.' });
    throw err;
  }
});

app.delete('/api/holidays/:date', auth, requireRole('admin'), async (req, res) => {
  await pool.query('DELETE FROM holidays WHERE holiday_date=$1',[req.params.date]);
  res.status(204).end();
});

app.get('/api/retribution/me', auth, requireRole('associate'), async (req, res) => {
  res.json(await getRetribution(req.user.memberId));
});

app.get('/api/retributions', auth, requireRole('admin'), async (req, res) => {
  const { rows: members } = await pool.query('SELECT id,full_name FROM members WHERE active=TRUE AND verification_pending=FALSE ORDER BY full_name');
  const result = [];
  for (const member of members) result.push({ member, ...(await getRetribution(member.id)) });
  res.json(result);
});

app.post('/api/retributions/:memberId/transfer', auth, requireRole('admin'), async (req, res) => {
  const memberId = Number(req.params.memberId);
  const calc = await getRetribution(memberId);
  if (!calc) return res.status(404).json({ error: 'Socio no encontrado.' });
  const { rows } = await pool.query(`
    INSERT INTO retribution_transfers(member_id,period_key,amount,transferred_at)
    VALUES($1,'actual',$2,NOW())
    ON CONFLICT(member_id,period_key)
    DO UPDATE SET amount=EXCLUDED.amount,transferred_at=NOW()
    RETURNING *
  `,[memberId, calc.total]);
  res.json(rows[0]);
});

app.post('/api/retributions/transfer-all', auth, requireRole('admin'), async (req, res) => {
  const { rows: members } = await pool.query('SELECT id,full_name FROM members WHERE active=TRUE AND verification_pending=FALSE ORDER BY full_name');
  let transferredCount = 0;
  for (const member of members) {
    const calc = await getRetribution(member.id);
    if (calc && Number(calc.total) > 0) {
      await pool.query(`
        INSERT INTO retribution_transfers(member_id,period_key,amount,transferred_at)
        VALUES($1,'actual',$2,NOW())
        ON CONFLICT(member_id,period_key)
        DO UPDATE SET amount=EXCLUDED.amount,transferred_at=NOW()
      `, [member.id, calc.total]);
      transferredCount++;
    }
  }
  res.json({ message: `Se registraron las transferencias de ${transferredCount} asociados.`, transferredCount });
});


app.get('/api/financial-movements', auth, requireRole('admin'), async (req,res) => {
  const { rows } = await pool.query(`SELECT id,movement_type,concept,amount::float8,movement_date,created_at FROM financial_movements ORDER BY movement_date DESC,id DESC`);
  res.json(rows);
});

app.post('/api/financial-movements', auth, requireRole('admin'), async (req,res) => {
  const movementType = req.body.movementType === 'Gasto' ? 'Gasto' : 'Ingreso';
  const concept = String(req.body.concept || '').trim().slice(0,120);
  const amount = Number(req.body.amount);
  const movementDate = String(req.body.movementDate || new Date().toISOString().slice(0,10));
  if (!concept || !(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(movementDate)) return res.status(400).json({error:'Movimiento inválido.'});
  const { rows } = await pool.query(`INSERT INTO financial_movements(movement_type,concept,amount,movement_date) VALUES($1,$2,$3,$4) RETURNING *`,[movementType,concept,amount,movementDate]);
  res.status(201).json(rows[0]);
});

app.get('/api/fund-movements', auth, requireRole('admin'), async (req,res) => {
  const { rows } = await pool.query(`SELECT id,fund_name,movement_type,amount::float8,reason,movement_date,created_at FROM fund_movements ORDER BY movement_date DESC,id DESC`);
  res.json(rows);
});

app.post('/api/fund-movements', auth, requireRole('admin'), async (req,res) => {
  const fundName = String(req.body.fundName || '').trim().slice(0,80);
  const movementType = req.body.movementType === 'Egreso' ? 'Egreso' : 'Ingreso';
  const amount = Number(req.body.amount);
  const reason = String(req.body.reason || '').trim().slice(0,180);
  const movementDate = String(req.body.movementDate || new Date().toISOString().slice(0,10));
  if (!fundName || !(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(movementDate)) return res.status(400).json({error:'Movimiento de fondo inválido.'});
  const { rows } = await pool.query(`INSERT INTO fund_movements(fund_name,movement_type,amount,reason,movement_date) VALUES($1,$2,$3,$4,$5) RETURNING *`,[fundName,movementType,amount,reason||null,movementDate]);
  res.status(201).json(rows[0]);
});

app.get('/api/subscription', auth, async (req, res) => {
  const sub = await getSubscriptionSettings(pool);
  const countRes = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE active = TRUE OR verification_pending = TRUE) AS active_count,
      COUNT(*) AS total_count
    FROM members
  `);
  const activeCount = Number(countRes.rows[0]?.active_count || 0);
  const totalCount = Number(countRes.rows[0]?.total_count || 0);
  const isFree = sub.plan === 'free';
  res.json({
    plan: sub.plan,
    planName: isFree ? 'Plan Semilla (Gratis)' : 'Plan Profesional (Premium)',
    maxMembers: isFree ? Number(sub.max_members || 5) : null,
    pricePerMonth: Number(sub.price_per_month || 0),
    activeCount,
    totalCount,
    isLimitReached: isFree && activeCount >= Number(sub.max_members || 5),
    features: {
      unlimitedMembers: !isFree,
      surplusModule: !isFree,
      prioritySupport: !isFree,
      advancedReporting: !isFree
    },
    updatedAt: sub.updated_at
  });
});

app.post('/api/subscription/upgrade', auth, requireRole('admin'), async (req, res) => {
  await pool.query(`
    UPDATE subscription_settings
    SET plan = 'pro', max_members = 999999, price_per_month = 25000, updated_at = NOW()
    WHERE singleton = TRUE
  `);
  res.json({
    ok: true,
    plan: 'pro',
    message: '¡Felicitaciones! Tu cooperativa ahora cuenta con el Plan Profesional (Premium) con asociados ilimitados y módulo de excedentes.'
  });
});

app.post('/api/subscription/downgrade', auth, requireRole('admin'), async (req, res) => {
  await pool.query(`
    UPDATE subscription_settings
    SET plan = 'free', max_members = 5, price_per_month = 0, updated_at = NOW()
    WHERE singleton = TRUE
  `);
  res.json({
    ok: true,
    plan: 'free',
    message: 'Has vuelto al Plan Semilla (Gratuito). El límite para incorporar nuevos asociados es de 5 miembros.'
  });
});

app.post('/api/surplus/calculate', auth, requireRole('admin'), async (req, res) => {
  const totalSurplus = Number(req.body.totalSurplus);
  const periodLabel = String(req.body.periodLabel || 'Ejercicio Anual').trim().slice(0, 100);
  if (!(totalSurplus > 0)) {
    return res.status(400).json({ error: 'El monto de excedente a distribuir debe ser mayor a 0.' });
  }

  const { reserveLegal, educationFund, assistanceFund, totalFunds, distributable } = calculateSurplusBreakdown(totalSurplus);
  const members = await getActiveMembersWorkSummary(pool);
  if (!members.length) {
    return res.status(400).json({ error: 'No hay asociados activos para distribuir excedentes.' });
  }

  const totalHours = members.reduce((sum, m) => sum + Number(m.total_hours || 0), 0);
  const distribution = members.map((m) => {
    const hours = Number(m.total_hours || 0);
    const percentage = totalHours > 0 ? (hours / totalHours) * 100 : (100 / members.length);
    const returnAmount = Math.round(distributable * (percentage / 100) * 100) / 100;
    return {
      memberId: m.id,
      fullName: m.full_name,
      cuit: m.cuit,
      hours,
      percentage: Math.round(percentage * 1000) / 1000,
      returnAmount
    };
  });

  res.json({
    periodLabel,
    totalSurplus,
    reserveLegal,
    educationFund,
    assistanceFund,
    totalFunds,
    distributable,
    totalHours,
    activeMembersCount: members.length,
    distribution
  });
});

app.post('/api/surplus/distributions', auth, requireRole('admin'), async (req, res) => {
  const totalSurplus = Number(req.body.totalSurplus);
  const periodLabel = String(req.body.periodLabel || 'Ejercicio Anual').trim().slice(0, 100);
  if (!(totalSurplus > 0)) {
    return res.status(400).json({ error: 'El monto de excedente debe ser mayor a 0.' });
  }

  const sub = await getSubscriptionSettings(pool);
  if (sub.plan !== 'pro') {
    return res.status(403).json({
      error: 'La registración contable de excedentes requiere una suscripción al Plan Profesional activa.'
    });
  }

  const { reserveLegal, educationFund, assistanceFund, distributable } = calculateSurplusBreakdown(totalSurplus);
  const members = await getActiveMembersWorkSummary(pool);
  if (!members.length) {
    return res.status(400).json({ error: 'No hay asociados activos para distribuir excedentes.' });
  }

  const totalHours = members.reduce((sum, m) => sum + Number(m.total_hours || 0), 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const distRes = await client.query(`
      INSERT INTO surplus_distributions (
        period_label, total_surplus, reserve_legal_amount, education_fund_amount,
        assistance_fund_amount, distributable_amount, total_hours, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'closed')
      RETURNING *
    `, [periodLabel, totalSurplus, reserveLegal, educationFund, assistanceFund, distributable, totalHours]);

    const distId = distRes.rows[0].id;

    for (const m of members) {
      const hours = Number(m.total_hours || 0);
      const percentage = totalHours > 0 ? (hours / totalHours) * 100 : (100 / members.length);
      const returnAmount = Math.round(distributable * (percentage / 100) * 100) / 100;
      await client.query(`
        INSERT INTO surplus_distribution_items (
          distribution_id, member_id, hours, percentage, return_amount
        ) VALUES ($1, $2, $3, $4, $5)
      `, [distId, m.id, hours, Math.round(percentage * 1000) / 1000, returnAmount]);
    }

    await client.query(`
      INSERT INTO fund_movements (fund_name, movement_type, amount, reason, movement_date)
      VALUES
        ('Fondo de reserva', 'Ingreso', $1, $2, CURRENT_DATE),
        ('Fondo de educación y capacitación', 'Ingreso', $3, $4, CURRENT_DATE),
        ('Fondo de acción asistencial', 'Ingreso', $5, $6, CURRENT_DATE)
    `, [
      reserveLegal, `Excedente Ley 20.337 (5% Reserva Legal) - ${periodLabel}`,
      educationFund, `Excedente Ley 20.337 (5% Educación Cooperativa) - ${periodLabel}`,
      assistanceFund, `Excedente Ley 20.337 (5% Acción Asistencial) - ${periodLabel}`
    ]);

    await client.query(`
      INSERT INTO financial_movements (movement_type, concept, amount, movement_date)
      VALUES ('Gasto', $1, $2, CURRENT_DATE)
    `, [`Retorno de excedentes a asociados (85%) - ${periodLabel}`, distributable]);

    await client.query('COMMIT');
    res.status(201).json({ ok: true, distribution: distRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

app.get('/api/surplus/distributions', auth, requireRole('admin'), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT d.*,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', i.id,
          'memberId', i.member_id,
          'fullName', m.full_name,
          'cuit', m.cuit,
          'hours', i.hours,
          'percentage', i.percentage,
          'returnAmount', i.return_amount
        ) ORDER BY i.return_amount DESC)
        FROM surplus_distribution_items i
        JOIN members m ON m.id = i.member_id
        WHERE i.distribution_id = d.id
      ), '[]'::json) AS items
    FROM surplus_distributions d
    ORDER BY d.created_at DESC
  `);
  res.json(rows);
});

app.get('/api/surplus/me', auth, requireRole('associate'), async (req, res) => {
  const memberId = req.user.memberId;
  if (!memberId) {
    return res.status(400).json({ error: 'Usuario no asociado a un miembro.' });
  }
  const { rows } = await pool.query(`
    SELECT d.id AS distribution_id, d.period_label, d.total_surplus, d.distributable_amount,
           d.total_hours AS total_coop_hours, d.created_at,
           i.hours AS my_hours, i.percentage AS my_percentage, i.return_amount AS my_return_amount
    FROM surplus_distributions d
    JOIN surplus_distribution_items i ON i.distribution_id = d.id AND i.member_id = $1
    ORDER BY d.created_at DESC
    LIMIT 1
  `, [memberId]);

  if (!rows.length) {
    return res.json({
      hasDistribution: false,
      distributionId: null,
      periodLabel: null,
      totalSurplus: 0,
      distributableAmount: 0,
      totalCoopHours: 0,
      createdAt: null,
      myHours: 0,
      myPercentage: 0,
      myReturnAmount: 0
    });
  }
  const row = rows[0];
  res.json({
    hasDistribution: true,
    distributionId: row.distribution_id,
    periodLabel: row.period_label,
    totalSurplus: Number(row.total_surplus || 0),
    distributableAmount: Number(row.distributable_amount || 0),
    totalCoopHours: Number(row.total_coop_hours || 0),
    createdAt: row.created_at,
    myHours: Number(row.my_hours || 0),
    myPercentage: Number(row.my_percentage || 0),
    myReturnAmount: Number(row.my_return_amount || 0)
  });
});

app.get('/api/motions', auth, async (req, res) => {
  const status = req.query.status === 'closed' ? 'closed' : 'open';
  const { rows } = await pool.query('SELECT * FROM motions WHERE status=$1 ORDER BY created_at DESC',[status]);
  const result = [];
  for (const motion of rows) {
    const data = await motionTally(motion.id);
    if (req.user.role === 'associate' && status === 'open') {
      const own = await pool.query('SELECT vote,created_at FROM votes WHERE motion_id=$1 AND member_id=$2',[motion.id,req.user.memberId]);
      data.own_vote = own.rows[0] || null;
    }
    if (req.user.role === 'admin') {
      const voters = await pool.query(`
        SELECT v.member_id,m.full_name,v.vote,v.created_at
        FROM votes v JOIN members m ON m.id=v.member_id
        WHERE v.motion_id=$1 ORDER BY v.created_at
      `,[motion.id]);
      data.votes = voters.rows;
    }
    result.push(data);
  }
  res.json(result);
});

app.post('/api/motions', auth, requireRole('admin'), async (req, res) => {
  const title = String(req.body.title || '').trim();
  const motionType = req.body.motionType === 'extraordinary' ? 'extraordinary' : 'ordinary';
  if (title.length < 3) return res.status(400).json({ error: 'Ingresá un título para la moción.' });
  try {
    const { rows } = await pool.query('INSERT INTO motions(title,motion_type) VALUES($1,$2) RETURNING *',[title,motionType]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una moción abierta con ese título.' });
    throw err;
  }
});

app.post('/api/motions/:id/vote', auth, requireRole('associate'), async (req, res) => {
  const motionId = Number(req.params.id);
  const vote = String(req.body.vote || '');
  if (!['A favor','En contra','Abstención'].includes(vote)) return res.status(400).json({ error: 'Voto inválido.' });
  const motion = await pool.query('SELECT status FROM motions WHERE id=$1',[motionId]);
  if (!motion.rows[0] || motion.rows[0].status !== 'open') return res.status(409).json({ error: 'La moción ya no está abierta.' });
  const member = await getMember(req.user.memberId);
  if (!member || !member.active || member.verification_pending) return res.status(403).json({ error: 'No estás habilitado para votar.' });
  try {
    const { rows } = await pool.query('INSERT INTO votes(motion_id,member_id,vote) VALUES($1,$2,$3) RETURNING *',[motionId,req.user.memberId,vote]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya emitiste tu voto para esta moción.' });
    throw err;
  }
});

app.post('/api/motions/:id/close', auth, requireRole('admin'), async (req, res) => {
  const motionId = Number(req.params.id);
  const data = await motionTally(motionId);
  if (!data) return res.status(404).json({ error: 'Moción no encontrada.' });
  if (data.status !== 'open') return res.status(409).json({ error: 'La moción ya está cerrada.' });
  if (!data.complete) return res.status(409).json({ error: 'Todavía faltan votos de socios habilitados.' });

  const [electorate, votes] = await Promise.all([
    pool.query(`
      SELECT m.id AS member_id,m.full_name,
        COALESCE(array_agg(a.role ORDER BY a.role) FILTER(WHERE a.role IS NOT NULL),'{}') AS roles
      FROM members m LEFT JOIN authorities a ON a.member_id=m.id
      WHERE m.active=TRUE AND m.verification_pending=FALSE
      GROUP BY m.id ORDER BY m.full_name
    `),
    pool.query(`SELECT v.member_id,m.full_name,v.vote,v.created_at FROM votes v JOIN members m ON m.id=v.member_id WHERE v.motion_id=$1 ORDER BY v.created_at`,[motionId])
  ]);
  const snapshot = {
    tally: data.tally,
    result: data.computed_result,
    electorate: electorate.rows,
    votes: votes.rows
  };
  const { rows } = await pool.query(`
    UPDATE motions SET status='closed',closed_at=NOW(),result=$2,closed_snapshot=$3::jsonb
    WHERE id=$1 RETURNING *
  `,[motionId,data.computed_result,JSON.stringify(snapshot)]);
  res.json(rows[0]);
});

app.get('/api/minutes', auth, requireRole('admin'), async (req, res) => {
  const { rows } = await pool.query('SELECT content,updated_at FROM minutes_drafts WHERE singleton=TRUE');
  res.json(rows[0]);
});

app.put('/api/minutes', auth, requireRole('admin'), async (req, res) => {
  const content = String(req.body.content || '');
  const { rows } = await pool.query(`UPDATE minutes_drafts SET content=$1,updated_at=NOW() WHERE singleton=TRUE RETURNING content,updated_at`,[content]);
  res.json(rows[0]);
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint no encontrado.' }));

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || 'Ocurrió un error en el servidor.' });
});

if (require.main === module) {
  ensureRuntimeSchema()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`CoopGestión disponible en http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('No se pudo preparar el esquema de base de datos:', err);
      process.exit(1);
    });
}

module.exports = {
  app,
  calculateSurplusBreakdown
};
