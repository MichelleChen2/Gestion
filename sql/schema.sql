CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS members (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  dni VARCHAR(12) NOT NULL UNIQUE,
  cuit VARCHAR(13) NOT NULL UNIQUE,
  email VARCHAR(160) UNIQUE,
  joined_on DATE NOT NULL DEFAULT CURRENT_DATE,
  capital_subscribed NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (capital_subscribed >= 0),
  capital_integrated NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (capital_integrated >= 0 AND capital_integrated <= capital_subscribed),
  monotributo_file VARCHAR(255),
  monotributo_status VARCHAR(40) NOT NULL DEFAULT 'Pendiente de revisión',
  monotributo_auto_verified BOOLEAN NOT NULL DEFAULT FALSE,
  monotributo_cuit_matched BOOLEAN NOT NULL DEFAULT FALSE,
  verification_pending BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


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

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(80) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin','associate')),
  member_id BIGINT UNIQUE REFERENCES members(id) ON DELETE CASCADE,
  display_name VARCHAR(120) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((role = 'admin' AND member_id IS NULL) OR (role = 'associate' AND member_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uidx ON users (LOWER(username));

CREATE TABLE IF NOT EXISTS authorities (
  role VARCHAR(20) PRIMARY KEY CHECK (role IN ('Presidente','Secretario','Tesorero')),
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_logs (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  hours NUMERIC(4,1) NOT NULL CHECK (hours > 0 AND hours < 24),
  description VARCHAR(180),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(member_id, work_date)
);

CREATE TABLE IF NOT EXISTS retribution_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
  normal_rate NUMERIC(14,2) NOT NULL CHECK (normal_rate >= 0),
  special_rate NUMERIC(14,2) NOT NULL CHECK (special_rate >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS holidays (
  holiday_date DATE PRIMARY KEY,
  description VARCHAR(160) NOT NULL DEFAULT 'Feriado nacional'
);

CREATE TABLE IF NOT EXISTS retribution_transfers (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  period_key VARCHAR(30) NOT NULL DEFAULT 'actual',
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(member_id, period_key)
);

CREATE TABLE IF NOT EXISTS motions (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(220) NOT NULL,
  motion_type VARCHAR(20) NOT NULL CHECK (motion_type IN ('ordinary','extraordinary')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  result VARCHAR(20) CHECK (result IN ('approved','rejected')),
  closed_snapshot JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS open_motion_title_uidx
  ON motions (LOWER(title)) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS votes (
  motion_id BIGINT NOT NULL REFERENCES motions(id) ON DELETE CASCADE,
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  vote VARCHAR(20) NOT NULL CHECK (vote IN ('A favor','En contra','Abstención')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (motion_id, member_id)
);

CREATE TABLE IF NOT EXISTS minutes_drafts (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financial_movements (
  id BIGSERIAL PRIMARY KEY,
  movement_type VARCHAR(10) NOT NULL CHECK (movement_type IN ('Ingreso','Gasto')),
  concept VARCHAR(120) NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fund_movements (
  id BIGSERIAL PRIMARY KEY,
  fund_name VARCHAR(80) NOT NULL,
  movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('Ingreso','Egreso')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reason VARCHAR(180),
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO retribution_settings(singleton, normal_rate, special_rate)
VALUES (TRUE, 10000, 15000)
ON CONFLICT (singleton) DO NOTHING;

INSERT INTO minutes_drafts(singleton, content)
VALUES (TRUE, '')
ON CONFLICT (singleton) DO NOTHING;

-- Datos demo equivalentes al prototipo actual.
INSERT INTO members
(full_name,dni,cuit,email,joined_on,capital_subscribed,capital_integrated,monotributo_file,monotributo_status,monotributo_auto_verified,monotributo_cuit_matched,verification_pending,active)
VALUES
('Juan Pérez','30123456','20-30123456-9','juan@coop.test','2024-03-12',500000,500000,'constancia_juan.pdf','Al día',TRUE,TRUE,FALSE,TRUE),
('María Ríos','33444555','27-33444555-4','maria@coop.test','2024-05-08',400000,100000,'constancia_maria.pdf','Al día',TRUE,TRUE,FALSE,TRUE),
('Carlos López','28999111','20-28999111-7','carlos@coop.test','2024-06-21',370000,50000,'constancia_carlos.pdf','Pendiente de revisión',FALSE,FALSE,TRUE,FALSE),
('Ana Gómez','36777123','27-36777123-2','ana@coop.test','2025-02-04',370000,370000,'constancia_ana.pdf','Al día',TRUE,TRUE,FALSE,TRUE),
('Gonzalo Alispe','25444333','20-25444333-8','gonzalo@coop.test','2024-04-10',370000,18500,'constancia_gonzalo.pdf','Al día',TRUE,TRUE,FALSE,FALSE)
ON CONFLICT (cuit) DO NOTHING;

INSERT INTO authorities(role, member_id)
SELECT 'Presidente', id FROM members WHERE cuit='20-30123456-9'
ON CONFLICT (role) DO NOTHING;
INSERT INTO authorities(role, member_id)
SELECT 'Secretario', id FROM members WHERE cuit='27-33444555-4'
ON CONFLICT (role) DO NOTHING;
INSERT INTO authorities(role, member_id)
SELECT 'Tesorero', id FROM members WHERE cuit='20-30123456-9'
ON CONFLICT (role) DO NOTHING;

-- Usuarios demo reales en base de datos. Las contraseñas quedan hasheadas con pgcrypto.
INSERT INTO users(username,password_hash,role,member_id,display_name)
VALUES ('admin', crypt('admin', gen_salt('bf')), 'admin', NULL, 'Administrador')
ON CONFLICT DO NOTHING;

INSERT INTO users(username,password_hash,role,member_id,display_name)
SELECT 'ana', crypt('1234', gen_salt('bf')), 'associate', m.id, m.full_name
FROM members m WHERE m.cuit='27-36777123-2'
ON CONFLICT DO NOTHING;

INSERT INTO users(username,password_hash,role,member_id,display_name)
SELECT 'juan', crypt('1234', gen_salt('bf')), 'associate', m.id, m.full_name
FROM members m WHERE m.cuit='20-30123456-9'
ON CONFLICT DO NOTHING;

INSERT INTO users(username,password_hash,role,member_id,display_name)
SELECT 'maria', crypt('1234', gen_salt('bf')), 'associate', m.id, m.full_name
FROM members m WHERE m.cuit='27-33444555-4'
ON CONFLICT DO NOTHING;

INSERT INTO work_logs(member_id,work_date,hours,description)
SELECT id,'2026-10-13',8,'Producción' FROM members WHERE cuit='27-36777123-2'
ON CONFLICT (member_id,work_date) DO NOTHING;
INSERT INTO work_logs(member_id,work_date,hours,description)
SELECT id,'2026-10-14',6,'Administración' FROM members WHERE cuit='27-36777123-2'
ON CONFLICT (member_id,work_date) DO NOTHING;

INSERT INTO motions(title,motion_type)
VALUES
('Aprobación de compra de nueva maquinaria gráfica por $1.200.000','ordinary'),
('Reforma del Estatuto Social','extraordinary')
ON CONFLICT DO NOTHING;


INSERT INTO financial_movements(movement_type,concept,amount,movement_date)
VALUES ('Ingreso','Venta mensual',850000,'2026-10-01'),('Gasto','Insumos',270000,'2026-10-03'),('Gasto','Servicios',160000,'2026-10-05')
ON CONFLICT DO NOTHING;

INSERT INTO fund_movements(fund_name,movement_type,amount,reason,movement_date)
VALUES ('Fondo de reserva','Ingreso',180000,'Saldo inicial','2026-10-01'),('Fondo operativo','Ingreso',95000,'Saldo inicial','2026-10-01')
ON CONFLICT DO NOTHING;
