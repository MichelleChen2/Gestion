# Gestión de Sistemas Informáticos - 2C2026

## Integrantes: 
- Oviedo, Ignacio 109821
- Avila Solano, Nelson 100244
- Alzogaray, Joaquin 108905
- Tosi, Marco 107237
- Paz Blanco, Pilar 105600
- Chen, Michelle Melisa 105506

---

# CoopGestión — Entrega 5-bis: Plan de Mejoras y Desafíos de Producto

Esta entrega evoluciona el producto incorporando dos grandes mejoras estratégicas justificadas en el **contexto de negocio cooperativo** y fundamentadas en **feedbacks de usuarios reales**:

1. **Modelo de Negocio Freemium con Monetización por Escala de Asociados.**
2. **Módulo de Distribución de Excedentes y Fondos Obligatorios de Ley (Ley 20.337 Art. 42).**

---

## 1. Justificación de Mejoras y Trazabilidad de Feedbacks

### 🚀 Mejora 1: Modelo Freemium (Plan Semilla vs. Plan Profesional)

* **Contexto y Desafío de Negocio:**
  En la entrega anterior el producto carecía de un modelo de sustentabilidad comercial; cualquier cooperativa accedía a todo de forma ilimitada y sin costo. En el ecosistema cooperativo coexisten dos realidades dispares: cooperativas incipientes de 4 a 6 personas que no tienen presupuesto para software, y cooperativas consolidadas de 20 a 50 miembros que liquidan millones de pesos y precisan automatización y soporte legal.
  
* **Trazabilidad de Feedbacks (Usuarios Reales):**
  > **Laura Benítez (Tesorera de Cooperativa Textil en formación, 5 asociados):**  
  > *"Cuando recién arrancamos 5 compañeros a producir, no tenemos presupuesto para licencias de software. Si nos cobran de entrada una suscripción mensual fija, seguimos anotando en cuadernos y Excel. Necesitamos empezar gratis para ordenar el padrón y las horas sin costos iniciales."*  
  >
  > **Martín Gómez (Administrador de Cooperativa Gráfica, 38 asociados):**  
  > *"Con casi 40 socios liquidar quincenas complejas, feriados y retenciones a mano nos insume semanas. Nuestra cooperativa sí puede y quiere pagar un abono mensual si la plataforma nos automatiza las retribuciones, el cierre contable de excedentes y nos asegura almacenamiento sin límite de la documentación."*

* **Definición de Planes en el Producto:**
  * **Plan Semilla (Gratuito):**
    - Hasta 5 asociados activos o en verificación.
    - Padrón social, verificación de CUIT y aporte de capital inicial.
    - Registro de horas habituales y asambleas democráticas (1 socio = 1 voto).
    - Simulación de cálculo de excedentes.
    - Límite: Al alcanzar el 5to asociado, el alta de nuevos miembros se bloquea hasta actualizar de plan.
  * **Plan Profesional / Premium ($25.000 / mes):**
    - **Asociados ilimitados** (sin tope de 5).
    - **Módulo de Distribución de Excedentes y Fondos de Ley habilitado** para asentar cierres de ejercicio en base de datos.
    - Liquidación automática con tarifas especiales y feriados globales.
    - Almacenamiento ilimitado de constancias PDF de monotributo.
    - Soporte prioritario y exportación contable.

---

### ⚖️ Mejora 2: Distribución de Excedentes y Fondos de Ley (Ley 20.337)

* **Contexto y Desafío de Negocio:**
  En una cooperativa de trabajo **no existen las "ganancias mercantiles"**, sino **"excedentes repartibles"**. A diferencia de una sociedad anónima o SRL comercial, por exigencia del **Art. 42 de la Ley Nacional de Cooperativas 20.337**, el excedente no puede repartirse según el capital o las acciones suscriptas: **debe distribuirse en estricta proporción al trabajo efectivamente prestado** (horas trabajadas por cada socio). Además, la ley exige retener previamente un **15% obligatorio** para tres fondos específicos antes de repartir un solo peso.

* **Trazabilidad de Feedbacks (Usuarios Reales):**
  > **Carlos Varela (Contador y Síndico de Cooperativa):**  
  > *"A fin de año cerramos el balance y tenemos un excedente neto (por ejemplo $1.000.000). Por ley debemos retener el 5% para Reserva Legal, 5% para el Fondo de Educación Cooperativa y 5% para Acción Asistencial. El 85% restante se debe prorratear entre los socios según las horas que laburó cada uno en el año. Hacer este cálculo a mano en Excel siempre genera errores de redondeo, quejas y sospechas de favoritismo en la asamblea anual."*

* **Implementación en el Producto:**
  * **Deducción legal automática del 15%:**
    1. **5% Fondo de Reserva Legal** (Ley 20.337 Art. 42 inc. 1).
    2. **5% Fondo de Educación y Capacitación Cooperativa** (Art. 42 inc. 2).
    3. **5% Fondo de Acción Asistencial y Laboral** (Art. 42 inc. 3).
  * **Prorrateo proporcional del 85% restante:**
    El sistema suma todas las horas acumuladas en `work_logs` por los socios activos y calcula la participación porcentual exacta:
    $$\text{Retorno por socio } i = \text{Excedente Neto} \times 0.85 \times \frac{\text{Horas del socio } i}{\text{Total de horas de la cooperativa}}$$
  * **Afectación contable automática:**
    Al asentar la distribución, se generan automáticamente los asientos de ingreso en `fund_movements` para los 3 fondos y el egreso en `financial_movements`.
  * **Transparencia en el Portal del Asociado:**
    Cada socio puede consultar en su panel su tarjeta de *"Mi Retorno de Excedentes (Ley 20.337)"*, conociendo sus horas computadas, su porcentaje de esfuerzo laboral colectivo y el monto justo asignado.

---

## 2. Gestión de Suscripción: Cómo pasar a Premium y volver a Gratis

La aplicación incluye un panel interactivo dedicado en la vista de Administración: **Suscripción y Plan**.

```text
Barra Superior (Topbar)  ──>  Indicador visual del Plan y cupo de socios
                               │
                               └── Botón "Mejorar" ──> Pantalla "Suscripción y Plan"
```

### 🔼 Cómo pasar de cuenta Gratis a Premium (Upgrade):
1. Iniciar sesión como **Administrador** (`admin` / `admin`).
2. En la barra superior (topbar) o en el menú lateral, hacer clic en **Suscripción y Plan** (o en el botón *Mejorar* del banner superior).
3. En la tarjeta **Plan Profesional (Premium)**, hacer clic en **"Mejorar a Plan Profesional (Activar Premium)"**.
4. El sistema actualiza el estado a Premium:
   - Se eliminan los topes de miembros (permite altas ilimitadas).
   - Se habilita el botón para asentar distribuciones oficiales en el módulo de Excedentes.
   - El badge superior cambia a `⭐ Plan Profesional`.

### 🔽 Cómo dar de baja la suscripción y volver a Gratis (Downgrade):
1. En la pantalla **Suscripción y Plan**, localizar la tarjeta **Plan Semilla (Gratuito)**.
2. Hacer clic en el botón rojo **"Dar de baja suscripción y volver a Plan Semilla"**.
3. Confirmar la acción en el cuadro de diálogo del navegador.
4. El sistema vuelve al Plan Gratuito:
   - El límite para incorporar nuevos socios vuelve a ser de 5 miembros.
   - Los datos de socios y horas ya existentes se preservan íntegramente.
   - Si la cooperativa ya cuenta con 5 o más socios, el formulario de alta se bloqueará preventivamente hasta volver a mejorar a Pro.

---

## 3. Guía paso a paso para probar las mejoras

### Paso 1: Comprobar el límite del Plan Gratuito (Semilla)
1. Entrar a `http://localhost:3000` con `admin / admin`.
2. Verificar en la barra superior el indicador: `🌱 Plan Semilla (4/5 socios)`.
3. Ir a **Socios y aportes** y hacer clic en **＋ Nuevo socio**.
4. Completar un alta (ej. Lucas Benítez, DNI 38111222, CUIT 20-38111222-3, adjuntando la constancia `constancia_monotributo_prueba.pdf`, verificándola y guardando).
5. Ahora el cupo llega a 5/5 socios.
6. Intentar registrar un nuevo socio adicional: el sistema impedirá abrir el formulario y notificará:  
   *`Límite del Plan Semilla alcanzado (5 asociados). Actualizá al Plan Profesional para incorporar más miembros.`*

### Paso 2: Activar el Plan Premium
1. Ir a **Suscripción y Plan** y presionar **"Mejorar a Plan Profesional (Activar Premium)"**.
2. Notarás la confirmación inmediata y el badge en verde `⭐ Plan Profesional`.
3. Volver a **Socios y aportes**: el bloqueo desaparece y permite altas ilimitadas.

### Paso 3: Probar el Módulo de Excedentes (Ley 20.337)
1. Como Administrador, ir a la pestaña **Excedentes (Ley 20.337)**.
2. En el simulador, ingresar un excedente de `$1.000.000` y hacer clic en **"Calcular distribución legal"**.
3. Observar el desglose automático:
   - **Reserva Legal (5%):** `$50.000`
   - **Fondo Educación (5%):** `$50.000`
   - **Acción Asistencial (5%):** `$50.000`
   - **Total Fondos Obligatorios (15%):** `$150.000`
   - **Excedente Repartible (85%):** `$850.000`
4. En la tabla inferior se visualiza el prorrateo de horas trabajadas:
   - Quienes más horas trabajaron perciben proporcionalmente mayor retorno.
5. Hacer clic en **"Aprobar y Asentar Distribución"** para confirmar.
6. Ir a la pestaña **Fondos**: los fondos de reserva, educación y asistencia recibieron sus créditos correspondientes.

### Paso 4: Verificación de Transparencia desde el Portal del Asociado
1. Abrir otra ventana (o pestaña de incógnito) e ingresar como asociada: `ana` / `1234`.
2. Ir a **Mi retribución**.
3. Debajo de la retribución horaria habitual, verás la nueva tarjeta destacada:  
   **⚖️ Mi Retorno de Excedentes (Ley 20.337 Art. 42)** con el período, sus horas aportadas, su porcentaje de participación y el monto en pesos que le corresponde por su trabajo.

---

## 4. Usuarios de prueba

Las contraseñas se encuentran hasheadas en PostgreSQL con `pgcrypto`:

* **Administrador:** `admin` / `admin`
* **Asociado Juan Pérez (Presidente y Tesorero):** `juan` / `1234`
* **Asociada Ana Gómez (Asociada activa):** `ana` / `1234`
* **Asociada María Ríos (Secretaria):** `maria` / `1234`

---

## 5. Cómo ejecutar en local

### Opción A: Con Docker (Recomendada)

```bash
docker compose up --build
```
*(o `docker-compose up --build`)*

Abrir en el navegador:
👉 **http://localhost:3000**

Para reiniciar la base limpia con los seeds originales:
```bash
docker compose down -v
docker compose up --build
```

### Opción B: Sin Docker (Node + PostgreSQL nativo)

1. Crear base de datos: `createdb coopgestion`
2. Cargar esquema: `psql -d coopgestion -f sql/schema.sql`
3. Configurar `.env` con `DATABASE_URL=postgres://usuario:password@localhost:5432/coopgestion`
4. Ejecutar:
   ```bash
   npm install
   npm start
   ```
5. Abrir `http://localhost:3000`.

---

## 6. Arquitectura y Modelo de Datos Extendido

```text
Navegador Administrador ─┐
                         ├── HTTP/REST (JWT) ──> Node + Express ──> PostgreSQL 16
Navegador Asociado ──────┘
```

Tablas incorporadas en `entrega5-bis`:
* `subscription_settings`: Estado del plan (`free` vs `pro`), límite de asociados (`max_members`), precio mensual y fecha de actualización.
* `surplus_distributions`: Registro del cierre de ejercicio anual con el desglose del 15% de reservas obligatorias y el 85% distribuible.
* `surplus_distribution_items`: Detalle por socio con horas computadas, porcentaje de participación y retorno liquidado.
* Vinculación contable automática con `fund_movements` (fondos de reserva, educación y asistencia) y `financial_movements` (egreso de retornos).
