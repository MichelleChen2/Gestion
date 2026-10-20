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
  if (!member) return res.status(404).json({ error: 'Socio no encontrado.' });
  if (member.active || member.verification_pending) return res.status(409).json({ error: 'El socio no se encuentra dado de baja.' });
  const monotributoFile = String(req.body.monotributoFile || '').trim().slice(0,255);
  const monotributoMimeType = String(req.body.monotributoMimeType || 'application/pdf').trim().slice(0,120);
  const monotributoContent = decodePdfBase64(req.body.monotributoContentBase64);
  const verified = req.body.monotributoAutoVerified === true && req.body.monotributoCuitMatched === true;
  if (!monotributoFile || !verified) return res.status(400).json({ error: 'Para reincorporar se requiere una nueva constancia verificada.' });

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

ensureRuntimeSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CoopGestión disponible en http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('No se pudo preparar el esquema de base de datos:', err);
    process.exit(1);
  });
