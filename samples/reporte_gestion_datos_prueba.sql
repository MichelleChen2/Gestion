-- Datos ficticios para probar "Reporte de gestión" en CoopGestión.
-- Pensado para ejecutarse después de sql/schema.sql. Puede ejecutarse más de una vez:
-- los INSERT se protegen con NOT EXISTS / ON CONFLICT donde corresponde.

-- Feriado ficticio de prueba para mostrar la diferenciación de horas.
INSERT INTO holidays(holiday_date,description)
VALUES ('2026-11-06','Feriado de prueba para demo')
ON CONFLICT (holiday_date) DO NOTHING;

-- Horas de noviembre de 2026.
INSERT INTO work_logs(member_id,work_date,hours,description)
SELECT id,'2026-11-03',8,'Producción - demo reporte' FROM members WHERE cuit='20-30123456-9'
ON CONFLICT (member_id,work_date) DO NOTHING;
INSERT INTO work_logs(member_id,work_date,hours,description)
SELECT id,'2026-11-06',6,'Administración - demo feriado' FROM members WHERE cuit='27-33444555-4'
ON CONFLICT (member_id,work_date) DO NOTHING;
INSERT INTO work_logs(member_id,work_date,hours,description)
SELECT id,'2026-11-08',5,'Soporte - demo domingo' FROM members WHERE cuit='27-36777123-2'
ON CONFLICT (member_id,work_date) DO NOTHING;

-- Movimientos financieros del período.
INSERT INTO financial_movements(movement_type,concept,amount,movement_date)
SELECT 'Ingreso','Venta mayorista - demo reporte',1500000,'2026-11-02'
WHERE NOT EXISTS (SELECT 1 FROM financial_movements WHERE concept='Venta mayorista - demo reporte' AND movement_date='2026-11-02');
INSERT INTO financial_movements(movement_type,concept,amount,movement_date)
SELECT 'Gasto','Compra de insumos - demo reporte',320000,'2026-11-04'
WHERE NOT EXISTS (SELECT 1 FROM financial_movements WHERE concept='Compra de insumos - demo reporte' AND movement_date='2026-11-04');
INSERT INTO financial_movements(movement_type,concept,amount,movement_date)
SELECT 'Gasto','Servicios y mantenimiento - demo reporte',180000,'2026-11-05'
WHERE NOT EXISTS (SELECT 1 FROM financial_movements WHERE concept='Servicios y mantenimiento - demo reporte' AND movement_date='2026-11-05');
INSERT INTO financial_movements(movement_type,concept,amount,movement_date)
SELECT 'Ingreso','Trabajo especial - demo reporte',600000,'2026-11-07'
WHERE NOT EXISTS (SELECT 1 FROM financial_movements WHERE concept='Trabajo especial - demo reporte' AND movement_date='2026-11-07');

-- Movimientos de fondos.
INSERT INTO fund_movements(fund_name,movement_type,amount,reason,movement_date)
SELECT 'Fondo de reserva','Ingreso',120000,'Aporte de noviembre - demo reporte','2026-11-02'
WHERE NOT EXISTS (SELECT 1 FROM fund_movements WHERE fund_name='Fondo de reserva' AND reason='Aporte de noviembre - demo reporte');
INSERT INTO fund_movements(fund_name,movement_type,amount,reason,movement_date)
SELECT 'Fondo operativo','Egreso',20000,'Compra menor - demo reporte','2026-11-05'
WHERE NOT EXISTS (SELECT 1 FROM fund_movements WHERE fund_name='Fondo operativo' AND reason='Compra menor - demo reporte');
