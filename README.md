# Gestión de Sistemas Informáticos - 2C2026

## Integrantes: 
- Oviedo, Ignacio 109821
- Avila Solano, Nelson 100244
- Alzogaray, Joaquin 108905
- Tosi, Marco 107237
- Paz Blanco, Pilar 105600
- Chen, Michelle Melisa 105506

## Aplicación para Cooperativas 
Este es un prototipo web desarrollado para facilitar la administración de una cooperativa de trabajo.

El proyecto surge a partir del relevamiento de necesidades realizado mediante entrevistas a una cooperativa y fue evolucionando de forma iterativa. En esta instancia se incorporaron y profundizaron funcionalidades a partir de las reglas, ejemplos y casos definidos mediante **Example Mapping y BDD (Behavior Driven Development)**.

El objetivo es representar de manera sencilla algunos de los procesos cotidianos de una cooperativa: 
- Gestión de asociados (alta/baja de socios) 
- Registro de trabajo (horas de trabajo de cada socio)
- Liquidación de retribuciones
- Administración de autoridades
- Toma de decisiones colectivas (asambleas).

## Funcionalidades implementadas

### Gestión de socios

El sistema permite registrar y administrar los asociados de la cooperativa.

Para realizar un alta se solicitan:

- Nombre y apellido.
- DNI.
- CUIT.
- Correo electrónico.
- Capital social suscripto.
- Aporte inicial integrado.
- Constancia de monotributo en PDF.

Se incorporaron distintas validaciones sobre estos datos:

- DNI compuesto únicamente por números.
- CUIT con formato válido.
- El CUIT no puede encontrarse duplicado entre los socios existentes.
- Si el CUIT pertenece a un exsocio, el sistema propone reincorporar el registro existente en lugar de generar uno nuevo.
- El aporte inicial debe representar como mínimo el 5% del capital social suscripto.

Los nuevos asociados quedan inicialmente pendientes de verificación y no son considerados socios activos hasta completar el proceso correspondiente.

También se cuenta con búsqueda, filtros y paginación para facilitar la consulta del padrón.



## Verificación de monotributo

Durante el alta debe adjuntarse una constancia de monotributo en formato PDF.

Como mejora de esta instancia se incorporó una **verificación automática del documento**.

El sistema analiza el contenido textual del PDF y verifica:

1. Que el documento contenga información compatible con una constancia de monotributo.
2. Que el CUIT encontrado dentro del documento coincida con el CUIT ingresado para el asociado.

Si ambas condiciones se cumplen, la verificación automática se considera satisfactoria.

Luego de este control, la constancia continúa en estado **Pendiente de revisión**, ya que la habilitación definitiva del asociado corresponde a una revisión administrativa.

> Esta funcionalidad forma parte del prototipo y no realiza una validación oficial contra servicios externos como ARCA.


## Estados de los asociados

Los asociados pueden encontrarse en distintos estados:

- **Pendiente de verificación:** fue registrado pero todavía no fue habilitado.
- **Activo:** puede participar de las distintas funcionalidades de la cooperativa.
- **Baja:** permanece registrado en el sistema pero no participa de las operaciones actuales.

Los asociados pendientes o dados de baja no pueden registrar horas, ocupar autoridades ni participar de las votaciones.


## Autoridades de la cooperativa

El sistema contempla los siguientes cargos:

- Presidente
- Secretario
- Tesorero

Estos cargos deben permanecer asignados.

De acuerdo con las reglas relevadas:

- El Presidente puede ocupar además Secretaría y/o Tesorería.
- Un asociado que no sea Presidente no puede acumular más de un cargo especial.
- Cuando se cambia una autoridad, se debe seleccionar inmediatamente al nuevo responsable para evitar que el cargo quede vacante.

Los asociados que no ocupan alguno de estos cargos mantienen el rol general de **Asociado**.

## Registro de trabajo

El módulo de Trabajo permite registrar las horas realizadas por cada asociado activo.

Cada registro incluye:

- Asociado.
- Fecha.
- Cantidad de horas.
- Descripción de la tarea realizada.

Se aplican las siguientes reglas:

- Solo se pueden cargar horas a asociados activos.
- La cantidad de horas debe ser mayor a 0 y menor a 24 por día.
- No puede existir más de una carga para el mismo asociado en la misma fecha.

El historial permite buscar y filtrar registros, consultar el total de horas y eliminar cargas incorrectas.


## Liquidación de retribuciones

A partir de las reglas trabajadas en Example Mapping se incorporó un módulo para calcular las retribuciones de los asociados según las horas registradas.

La liquidación distingue entre:

- **Horas habituales.**
- **Horas trabajadas en domingos o feriados nacionales.**

Como valores iniciales del ejemplo se utilizaron:

- Día habitual: `$10.000` por hora.
- Domingo o feriado nacional: `$15.000` por hora.

Estos valores pueden modificarse desde la configuración de la liquidación.

Los domingos se reconocen automáticamente por la fecha y los feriados nacionales se configuran de manera global para toda la cooperativa. De esta forma, si una fecha es marcada como feriado, la tarifa especial se aplica de manera consistente a todos los asociados que hayan trabajado ese día.

El sistema calcula para cada asociado:

- Horas habituales.
- Horas especiales.
- Importe correspondiente a cada tipo.
- Retribución total.

Finalmente, permite registrar la transferencia de la retribución.


## Asamblea y votación de propuestas

El módulo de Asamblea implementa algunas de las reglas definidas mediante Example Mapping para la toma de decisiones colectivas.

### Creación de mociones

Se pueden crear nuevas mociones indicando:

- Título.
- Tipo de moción:
  - Ordinaria.
  - Extraordinaria.

Mientras una moción se encuentra abierta aparece disponible para votación.

### Unicidad del voto

Se aplica la regla:

> **1 socio = 1 voto**

Cada asociado activo y habilitado puede emitir un único voto por moción.

Las opciones disponibles son:

- A favor.
- En contra.
- Abstención.

Una vez emitido el voto, queda registrado y no puede volver a modificarse ni emitirse nuevamente para esa misma moción.

### Cómputo de resultados

El sistema actualiza automáticamente:

- Cantidad de socios habilitados.
- Votos emitidos.
- Votos a favor.
- Votos en contra.
- Abstenciones.

Para las mociones ordinarias se utiliza mayoría simple.

Para las mociones extraordinarias se aplica la regla definida en el Example Mapping: al menos **66% de votos afirmativos**.

Una vez finalizada la votación, el sistema determina si la moción fue:

- **APROBADA**
- **RECHAZADA**

## Cierre e historial de asambleas

Una vez finalizada una votación, la moción puede cerrarse.

Al hacerlo:

- deja de aparecer entre las mociones abiertas;
- se guarda el resultado final;
- se conserva el padrón de socios habilitados en ese momento;
- se almacenan los votos emitidos;
- se registra la fecha y hora de cierre.

Las mociones cerradas se trasladan al apartado independiente **Historial de asambleas**, accesible desde el menú lateral.

El historial se encuentra ordenado desde las mociones más recientes hacia las más antiguas y utiliza paginación para evitar una interfaz excesivamente extensa.

Es importante que una moción cerrada funcione como un registro histórico. Por este motivo, modificaciones posteriores en los asociados —por ejemplo altas, bajas o reincorporaciones— no alteran el padrón ni los votos de una asamblea ya finalizada.

También es posible consultar sus detalles y exportar el resultado en formato JSON.

## Actas

Dentro de Asamblea se dispone de un espacio para registrar acuerdos y decisiones.

El sistema permite:

- redactar un borrador del acta;
- incorporar automáticamente el resultado de una moción finalizada;
- guardar el borrador.

El contenido se almacena localmente para evitar perderlo al actualizar o volver a ingresar a la aplicación.


## Otras funcionalidades

El prototipo mantiene además los módulos iniciales de:

- Registro de ingresos y gastos.
- Anticipos de retiro y excedentes.
- Fondos de la cooperativa.
- Resumen general de información.

Estas funcionalidades forman parte de la estructura general relevada inicialmente y continuarán evolucionando en futuras iteraciones.

