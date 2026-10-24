# CoopGestión — Administrador + Asociado + PostgreSQL

Esta versión reemplaza el login y los datos compartidos en `localStorage` por un backend real con **Node.js + Express + PostgreSQL**.

## Qué queda guardado en la base

El archivo `sql/schema.sql` crea, entre otras, las tablas:

- `members`: socios, capital y estado de monotributo.
- `users`: usuarios de inicio de sesión vinculados a un socio mediante `member_id`.
- `authorities`: Presidente, Secretario y Tesorero.
- `work_logs`: cargas de horas. Tiene `UNIQUE(member_id, work_date)`.
- `retribution_settings`: valor de hora habitual y especial.
- `holidays`: feriados globales.
- `retribution_transfers`: transferencias registradas.
- `motions`: mociones ordinarias y extraordinarias.
- `votes`: votos. Su PK `(motion_id, member_id)` implementa **1 socio = 1 voto por moción**.
- `minutes_drafts`: borrador de acta.
- `financial_movements` y `fund_movements`: estructura preparada para migrar también finanzas y fondos.

## Usuarios demo

Se crean desde SQL y las contraseñas se guardan hasheadas con `pgcrypto`.

- Administrador: `admin` / `admin`
- Asociado Ana Gómez: `ana` / `1234`
- Asociado Juan Pérez: `juan` / `1234`
- Asociada María Ríos: `maria` / `1234`

Carlos se deja pendiente/no habilitado para representar el flujo de verificación.

## Opción recomendada: ejecutar todo con Docker

Con Docker Desktop instalado:

```bash
docker compose up --build
```

Luego abrir:

```text
http://localhost:3000
```

La base PostgreSQL queda en el volumen `coopgestion_pgdata` y los datos sobreviven al reinicio de los contenedores.

Para borrar la base y volver a ejecutar los seeds:

```bash
docker compose down -v
docker compose up --build
```

## Ejecutarlo sin Docker

1. Crear una base PostgreSQL llamada `coopgestion`.
2. Ejecutar `sql/schema.sql` sobre esa base.
3. Copiar `.env.example` a `.env` y ajustar `DATABASE_URL`.
4. Ejecutar:

```bash
npm install
npm start
```

5. Abrir `http://localhost:3000`.

## Flujo para probar la sincronización

1. Abrir una ventana normal y entrar con `admin / admin`.
2. Abrir otra ventana o navegador y entrar con `ana / 1234`.
3. Como Ana, entrar en **Mis horas** y registrar una carga.
4. Volver a Administración → **Trabajo**. La carga aparece desde PostgreSQL.
5. Como Administrador, crear una moción.
6. Como Ana, entrar en **Asamblea** y votar.
7. Volver a Administración → **Asamblea**. El cómputo refleja el voto.

La interfaz consulta de nuevo al backend cada pocos segundos, por lo que también funciona entre dispositivos distintos siempre que ambos puedan acceder al mismo backend.

## Arquitectura

```text
Navegador Administrador ─┐
                         ├── HTTP/JSON ──> Node + Express ──> PostgreSQL
Navegador Asociado ──────┘
```

El frontend ya no conoce la contraseña de PostgreSQL. Solo habla con la API.

## Deploy posterior

Para acceder desde cualquier dispositivo por Internet hay que desplegar **la app/backend y PostgreSQL** en un servicio online. GitHub Pages por sí solo no ejecuta Node ni PostgreSQL.

En producción también hay que cambiar `JWT_SECRET`, usar HTTPS y configurar `FRONTEND_ORIGIN` con el dominio real.

## Nota sobre la entrega anterior

Esta versión backend migra los módulos que necesitan datos compartidos entre roles: login/usuarios, socios, horas, retribuciones, feriados, mociones, votos e historial. El esquema ya deja preparadas tablas para movimientos financieros y fondos; esas pantallas pueden conectarse a la API en una iteración siguiente.

La versión restaurada conserva también Ingresos y gastos, Retiros y excedentes y Fondos en la vista Administrador.


## Constancia de monotributo: almacenamiento real

La constancia ya no se guarda solamente como nombre de archivo en `members.monotributo_file`.
Los PDFs cargados en nuevas altas o reincorporaciones se almacenan en PostgreSQL en
`member_documents.content` (`BYTEA`), junto con nombre, MIME type, tamaño, fecha y el
resultado de la verificación automática. El límite del prototipo es 5 MB por PDF.

La tabla `members` conserva `monotributo_file` y los flags de estado como resumen rápido.
`member_documents` conserva el documento real y permite mantener historial cuando se carga
una nueva constancia en una reincorporación.

El Administrador puede descargar la última constancia desde el detalle del socio y el
asociado puede descargar su propia constancia desde Mi perfil.

Para comprobarlo directamente en PostgreSQL:

```sql
SELECT id, member_id, document_type, file_name, mime_type, file_size,
       auto_verified, cuit_matched, uploaded_at
FROM member_documents
ORDER BY uploaded_at DESC;
```

No conviene hacer `SELECT content` en la consola porque el `BYTEA` puede ser muy grande.

La aplicación ejecuta una migración `CREATE TABLE IF NOT EXISTS member_documents` al
arrancar, por lo que esta corrección funciona incluso si conservás el volumen de PostgreSQL
anterior. Los socios demo creados antes de esta versión pueden tener solamente el nombre
histórico del archivo; el PDF real aparecerá para nuevas altas/reincorporaciones.


## Control de vencimiento de constancias de monotributo

La constancia actual queda almacenada en `member_documents` con fecha de emisión (si está disponible), fecha de vencimiento, estado de vigencia y resultado de la verificación. No se consulta ARCA ni se calcula una vigencia con reglas externas: la aplicación toma la fecha de vencimiento explícita del PDF y la compara con la fecha actual. Por defecto avisa 5 días antes; ese umbral se configura con `MONOTRIBUTO_ALERT_DAYS`.

- El asociado recibe una alerta en Inicio y Mi perfil cuando la constancia está por vencer o vencida.
- Desde Mi perfil puede subir una nueva constancia; el backend verifica tipo de documento, CUIT y vigencia antes de aceptarla.
- Administración ve en Socios y aportes una lista de asociados con constancias vencidas o próximas a vencer.
- Las constancias anteriores se conservan (`is_current=false`) y la última válida queda como actual.
- La validación final se realiza del lado servidor con `pdf-parse`. PDF.js queda como verificación previa visual en el alta administrativa.

Si ya existe un volumen PostgreSQL anterior, `server.js` agrega las nuevas columnas al iniciar. También se incluye `sql/migrations/002_monotributo_vigencia.sql`.


### Criterio de vigencia simplificado

La vigencia se determina exclusivamente comparando `expires_at` con la fecha actual (`CURRENT_DATE` en PostgreSQL). No se realizan consultas oficiales a ARCA y no se infiere el vencimiento a partir de la fecha de emisión. Si el PDF no contiene una fecha de vencimiento reconocible, la carga queda como no verificable y se solicita una constancia donde esa fecha pueda leerse.

> Compatibilidad: si una base existente contiene vencimientos calculados por una versión anterior (`validity_source` comenzando con `derived_`), al iniciar esta versión se descartan automáticamente esos vencimientos derivados y el documento pasa a `unknown` hasta que se cargue una constancia con vencimiento explícito.

## Corrección: PDFs que `pdf-parse` no puede leer

La API usa `pdf-parse` en servidor. Algunos PDFs pueden ser legibles por PDF.js del navegador pero no por esa librería. En ese caso el frontend envía también el texto extraído por PDF.js y el backend vuelve a ejecutar sobre ese texto los controles de CUIT y vencimiento. Además se agregó `express-async-errors` para que un error de validación devuelva HTTP 400 sin detener el proceso Node.

## Historial de asambleas y exportación PDF

Las mociones cerradas ya no muestran el `closed_snapshot` como JSON. El historial presenta el resultado, tipo, regla de mayoría, fecha de cierre, cómputo final y una tabla de votos por asociado con los roles congelados al cierre. Administración puede exportar un PDF detallado generado por el backend a partir del snapshot histórico.
