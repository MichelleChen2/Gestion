-- Datos ficticios para probar la paginación y filtros del Historial de trabajo.
-- Es idempotente: si socio + fecha ya existe, no duplica el registro.

INSERT INTO holidays(holiday_date, description)
VALUES ('2026-07-09','Día de la Independencia · prueba')
ON CONFLICT (holiday_date) DO UPDATE SET description=EXCLUDED.description;

WITH test_rows(full_name,work_date,hours,description) AS (
VALUES
  ('Juan Pérez','2026-07-01',8.0,'Producción · datos de prueba historial'),
  ('María Ríos','2026-07-01',7.0,'Administración · datos de prueba historial'),
  ('Ana Gómez','2026-07-01',8.5,'Atención de asociados · datos de prueba historial'),
  ('Juan Pérez','2026-07-02',8.5,'Administración · datos de prueba historial'),
  ('María Ríos','2026-07-02',7.5,'Atención de asociados · datos de prueba historial'),
  ('Ana Gómez','2026-07-02',7.5,'Producción · datos de prueba historial'),
  ('Juan Pérez','2026-07-03',9.0,'Atención de asociados · datos de prueba historial'),
  ('María Ríos','2026-07-03',6.5,'Producción · datos de prueba historial'),
  ('Ana Gómez','2026-07-03',8.0,'Administración · datos de prueba historial'),
  ('Juan Pérez','2026-07-04',8.0,'Producción · datos de prueba historial'),
  ('María Ríos','2026-07-04',7.0,'Administración · datos de prueba historial'),
  ('Ana Gómez','2026-07-04',8.5,'Atención de asociados · datos de prueba historial'),
  ('Juan Pérez','2026-07-05',8.5,'Administración · datos de prueba historial'),
  ('María Ríos','2026-07-05',7.5,'Atención de asociados · datos de prueba historial'),
  ('Ana Gómez','2026-07-05',7.5,'Producción · datos de prueba historial'),
  ('Juan Pérez','2026-07-06',9.0,'Atención de asociados · datos de prueba historial'),
  ('María Ríos','2026-07-06',6.5,'Producción · datos de prueba historial'),
  ('Ana Gómez','2026-07-06',8.0,'Administración · datos de prueba historial'),
  ('Juan Pérez','2026-07-07',8.0,'Producción · datos de prueba historial'),
  ('María Ríos','2026-07-07',7.0,'Administración · datos de prueba historial'),
  ('Ana Gómez','2026-07-07',8.5,'Atención de asociados · datos de prueba historial'),
  ('Juan Pérez','2026-07-08',8.5,'Administración · datos de prueba historial'),
  ('María Ríos','2026-07-08',7.5,'Atención de asociados · datos de prueba historial'),
  ('Ana Gómez','2026-07-08',7.5,'Producción · datos de prueba historial'),
  ('Juan Pérez','2026-07-09',9.0,'Atención de asociados · datos de prueba historial'),
  ('María Ríos','2026-07-09',6.5,'Producción · datos de prueba historial'),
  ('Ana Gómez','2026-07-09',8.0,'Administración · datos de prueba historial'),
  ('Juan Pérez','2026-07-10',8.0,'Producción · datos de prueba historial'),
  ('María Ríos','2026-07-10',7.0,'Administración · datos de prueba historial'),
  ('Ana Gómez','2026-07-10',8.5,'Atención de asociados · datos de prueba historial'),
  ('Juan Pérez','2026-07-11',8.5,'Administración · datos de prueba historial'),
  ('María Ríos','2026-07-11',7.5,'Atención de asociados · datos de prueba historial'),
  ('Ana Gómez','2026-07-11',7.5,'Producción · datos de prueba historial'),
  ('Juan Pérez','2026-07-12',9.0,'Atención de asociados · datos de prueba historial'),
  ('María Ríos','2026-07-12',6.5,'Producción · datos de prueba historial'),
  ('Ana Gómez','2026-07-12',8.0,'Administración · datos de prueba historial')
)
INSERT INTO work_logs(member_id,work_date,hours,description)
SELECT m.id,t.work_date::date,t.hours::numeric,t.description
FROM test_rows t
JOIN members m ON m.full_name=t.full_name
ON CONFLICT(member_id,work_date) DO NOTHING;

-- Control rápido
SELECT COUNT(*) AS registros_prueba
FROM work_logs
WHERE description LIKE '%datos de prueba historial%';
