# Gestión de Sistemas Informáticos - 2C2026

## Integrantes: 
- Oviedo, Ignacio 109821
- Avila Solano, Nelson 100244
- Alzogaray, Joaquin 108905
- Tosi, Marco 107237
- Paz Blanco, Pilar 105600
- Chen, Michelle Melisa 105506

## Cooperativa — Administrador + Asociado + PostgreSQL

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
