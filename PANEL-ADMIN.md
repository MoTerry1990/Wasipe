# Wasipe — Panel de administración

Herramienta de operación diaria, no un navegador de tablas.

---

## 1. El principio: colas, no tablas

Casi todos los paneles de administración se diseñan como "una pantalla por tabla". Después resultan incómodos de operar, porque el trabajo real **no tiene forma de tabla, tiene forma de cola**.

Quien abre Wasipe a las 9 de la mañana no piensa *"voy a revisar la tabla propiedades"*. Piensa **"¿qué necesita mi atención ahora?"**.

Por eso:

| Superficie | Para qué | Cuánto tiempo se pasa ahí |
|---|---|---|
| **Colas** — Hoy, Moderación, Reportes, Verificaciones | El trabajo diario | ~80% |
| **Catálogos** — Usuarios, Avisos, Inmobiliarias | Buscar algo puntual | ~15% |
| **Informes** — Métricas, Auditoría | Decidir, revisar | ~5% |

Las colas se optimizan por **velocidad**: atajos de teclado, avance automático, una decisión por pantalla. Los catálogos se optimizan por **búsqueda**: filtros, columnas ordenables, exportar.

---

## 2. Secciones

```
OPERACIÓN     Hoy · Moderación · Reportes · Verificaciones
CATÁLOGO      Avisos · Usuarios · Inmobiliarias
NEGOCIO       Planes · Suscripciones · Pagos
DATOS         Índice · Métricas · Leads · Auditoría
```

| Sección | Qué resuelve |
|---|---|
| **Hoy** | Pantalla de arranque. Todo lo que requiere acción, ordenado por urgencia |
| **Moderación** | Cola de avisos en `revision`, por riesgo |
| **Reportes** | Contenido denunciado por usuarios |
| **Verificaciones** | Agentes e inmobiliarias esperando validación de RUC |
| **Avisos** | Buscador de todos los avisos, cualquier estado |
| **Usuarios** | Ficha 360 de cada cuenta |
| **Inmobiliarias** | Agencias, equipos y planes |
| **Planes** | Editor del catálogo — sin deploy |
| **Suscripciones** | Activas, en cobranza, bajas |
| **Pagos** | Transacciones, comprobantes, devoluciones |
| **Índice** | Carga y publicación mensual |
| **Métricas** | Salud del marketplace y del negocio |
| **Leads** | Calidad y volumen — **no contenido** (ver §3) |
| **Auditoría** | Registro de todo lo que hizo el staff |

---

## 3. Permisos

Dos roles de staff, ya definidos en `AUTENTICACION.md`.

| Acción | `moderador` | `admin` |
|---|:--:|:--:|
| Ver Hoy, Métricas | ✓ | ✓ |
| Aprobar / rechazar avisos | ✓ | ✓ |
| Resolver reportes | ✓ | ✓ |
| Ver usuarios y avisos | ✓ | ✓ |
| Preparar verificaciones (dejar listo el dictamen) | ✓ | ✓ |
| **Aprobar** una verificación | — | ✓ |
| Archivar aviso por fraude | — | ✓ |
| Suspender usuario | — | ✓ |
| Cambiar rol de usuario | — | ✓ |
| Editar planes y precios | — | ✓ |
| Ver pagos | — | ✓ |
| Reembolsar | — | ✓ |
| Acreditar plan o créditos de cortesía | — | ✓ |
| Cargar y publicar el Índice | — | ✓ |
| Entrar como usuario (soporte) | — | ✓ |
| Ver auditoría | — | ✓ |

**La división es simple: el moderador decide sobre contenido; el admin, sobre personas y dinero.** Moderar es trabajo de volumen que vas a delegar pronto. Un moderador que se equivoca rechaza un aviso; un admin que se equivoca devuelve plata o cierra una cuenta.

### Privacidad de los leads ⚠️

Los leads tienen nombre, teléfono y correo de compradores. Navegarlos libremente es un problema bajo la **Ley 29733 de protección de datos personales**.

```
Métricas de leads (volumen, tasa de respuesta, spam)   → moderador y admin, siempre
Contenido del lead (nombre, teléfono, mensaje)         → solo al investigar un
                                                          reporte concreto, con motivo
                                                          obligatorio y registro en auditoría
```

La sección **Leads** muestra agregados, no filas. Para ver un lead puntual hay que entrar desde un reporte y escribir por qué:

```
┌─ Ver datos de contacto ──────────────────────────────┐
│  Esto queda registrado con tu nombre y la fecha.      │
│  Motivo (obligatorio):  [ Denuncia de estafa #1284 ]  │
│                            [ Cancelar ]  [ Ver ]      │
└───────────────────────────────────────────────────────┘
```

Fricción a propósito. Es el tipo de acceso que hay que poder justificar si alguien lo reclama.

### Entrar como usuario

Herramienta de soporte imprescindible y peligrosa:

- Solo `admin`, con motivo obligatorio
- Sesión de **30 minutos**, luego expira sola
- Barra roja fija: *"Estás viendo Wasipe como Ana Quispe · Salir"*
- **No puede pagar, cambiar contraseña, ni borrar la cuenta**
- Cada acción hecha así queda en `auditoria` con el admin real como actor

---

## 4. Pantallas clave

### 4.1 Hoy

La pantalla que se abre por defecto. Responde una sola pregunta: *¿qué hago ahora?*

```
┌─ Hoy · miércoles 5 de agosto ──────────────────────────────────┐
│                                                                  │
│  REQUIERE ACCIÓN                                                 │
│  ⚠ 14 avisos esperando revisión      2 fuera de SLA    [ Ir → ]  │
│  ⚠  3 reportes nuevos                 1 por estafa     [ Ir → ]  │
│     2 inmobiliarias por verificar                      [ Ir → ]  │
│     4 pagos fallidos en cobranza                       [ Ir → ]  │
│                                                                  │
│  AYER                                                            │
│  Avisos nuevos    23  (+15% vs. martes pasado)                  │
│  Aprobados 19 · Rechazados 4 · Tiempo medio de revisión 47 min  │
│  Registros 41 · Leads 78 · Ingresos S/ 417                      │
│                                                                  │
│  ATENCIÓN                                                        │
│  · "Los Olivos" tuvo 38 búsquedas sin resultados esta semana    │
│  · La tasa de rechazo subió a 21% (normal 12%)                  │
│  · 12 avisos vencen en 3 días y no fueron renovados             │
└──────────────────────────────────────────────────────────────────┘
```

El bloque **ATENCIÓN** es lo que diferencia un panel útil de uno decorativo. *"38 búsquedas sin resultados en Los Olivos"* es una instrucción concreta: andá a conseguir avisos ahí. Ninguna tabla te dice eso.

### 4.2 Moderación

Cola ordenada por `riesgo DESC, creado_en ASC` (usa `ix_prop_moderacion`).

```
┌─ WSP-10430 ─────────────────── riesgo 72 · esperando 3.5 h ────┐
│                                                                  │
│  [ ◄  galería grande, navegable con flechas          ►  ] 6 fotos│
│                                                                  │
│  US$ 82,000 · 92 m² · 3 dorm · Miraflores                       │
│  ⚠ US$ 891/m² · 61% por debajo del índice (US$ 2,285/m²)        │
│                                                                  │
│  Ana Quispe · sin verificar · 0 avisos previos · cuenta de 2 días│
│                                                                  │
│  MARCAS                                                          │
│  ⚠ precio-fuera-de-indice (4)                                    │
│  ⚠ contacto-en-descripcion (3)  → "llámame al 987..."           │
│                                                                  │
│  [ ✓ Aprobar (A) ]  [ ✗ Rechazar (R) ]  [ Saltar (S) ]  [ → ]   │
└──────────────────────────────────────────────────────────────────┘
                                             13 restantes · 47/hora
```

**Atajos de teclado y avance automático.** Con teclado se hacen ~200 avisos por hora; con mouse, ~40. En una cola que crece a diario, esa diferencia decide si el equipo sigue el ritmo.

`Saltar` deja el aviso para otro moderador — para cuando hay conflicto de interés o duda.

El rechazo pide motivo de un catálogo cerrado (detallado en `FLUJO-AVISOS.md` §4.3).

### 4.3 Ficha del usuario

La pantalla de soporte. Todo sobre una cuenta, en un lugar.

```
┌─ Ana Quispe · ana@correo.com ───────────────────────── [Acciones ▾]│
│  agente · sin verificar · activa · registrada hace 2 días         │
│  Plan: Agente (S/ 139/mes) · vence 04/09 · renovación automática  │
│─────────────────────────────────────────────────────────────────── │
│  AVISOS  7        activos 5 · revisión 1 · rechazados 1           │
│  LEADS   23       respondidos 19 (83%) · tiempo medio 1.4 h       │
│  PAGOS   S/ 278   2 pagos · 0 fallidos · 0 devoluciones           │
│  REPORTES 1       en su contra · resuelto: descartado             │
│─────────────────────────────────────────────────────────────────── │
│  HISTORIAL                                                         │
│  05/08 10:12  aviso WSP-10430 rechazado por Luis (contacto-en-...) │
│  04/08 18:30  pago S/ 139 aprobado · boleta B001-000042            │
│  03/08 09:15  cuenta creada                                        │
└────────────────────────────────────────────────────────────────────┘

Acciones ▾   Verificar · Suspender · Cambiar rol · Acreditar créditos
             Reenviar verificación · Entrar como · Exportar sus datos
```

*Exportar sus datos* cubre el derecho de acceso de la Ley 29733. Vale tenerlo listo antes de que alguien lo pida.

### 4.4 Pagos

```
┌─ Pagos ────────────────────────────────────────────────────────┐
│  [Estado ▾] [Concepto ▾] [Desde][Hasta] [Buscar]  [Exportar CSV]│
│─────────────────────────────────────────────────────────────────│
│  Hoy  S/ 417 en 4 pagos   ·  Mes  S/ 11,240   ·  Fallidos 4     │
│─────────────────────────────────────────────────────────────────│
│  FECHA   USUARIO      CONCEPTO   MONTO   ESTADO      COMPROBANTE │
│  05/08   Ana Quispe   Plan       139.00  pagado      B001-42 PDF │
│  05/08   Inmob. Sur   Créditos   269.00  pagado      F001-18 PDF │
│  05/08   Luis Torres  Plan       139.00  fallido ⚠   —           │
│                                            └ día 3 de cobranza    │
└─────────────────────────────────────────────────────────────────┘
```

Acciones por fila: ver detalle Culqi · reenviar comprobante · **reembolsar** (emite nota de crédito) · reintentar cobro · contactar.

**El reembolso pide motivo y confirmación escrita del monto.** Es irreversible y contable.

### 4.5 Índice

Carga mensual, en dos tiempos: primero se revisa, después se publica.

```
┌─ Índice · período 2026-08 ─────────────────── borrador ────────┐
│  [ Subir CSV ]     43 distritos cargados                        │
│─────────────────────────────────────────────────────────────────│
│  DISTRITO       US$/m²   ANTERIOR   VARIACIÓN   MUESTRAS         │
│  Miraflores      2,285     2,193       +4.2%        184          │
│  San Isidro      2,640     2,601       +1.5%        142          │
│  Barranco        2,110     1,402      +50.5% ⚠       11 ⚠        │
│  …                                                               │
│                                                                  │
│  ⚠ 1 distrito con variación fuera de rango o pocas muestras     │
│                    [ Descartar ]   [ Publicar período ]         │
└──────────────────────────────────────────────────────────────────┘
```

Nada se publica sin revisar el diff. El Índice es el activo que sostiene la credibilidad del portal: un dato absurdo publicado cuesta más que un mes sin actualizar.

---

## 5. Tablas y acciones

### Moderación
**Columnas** código · título · precio · distrito · riesgo · marcas · usuario · espera
**Filtros** riesgo · tipo · distrito · antigüedad de cuenta · marca específica
**Acciones** aprobar · rechazar (con motivo) · saltar · ver ficha del usuario
**Masivas** aprobar seleccionados *(solo riesgo < 20, con confirmación)*

### Reportes
**Columnas** aviso · motivo · reportante · repeticiones · estado · fecha
**Filtros** motivo · estado · reportes acumulados
**Acciones** resolver · descartar · pausar aviso · archivar aviso · suspender usuario
**Regla automática** 3 reportes de `vendida` → aviso a `pausado` + correo al dueño

### Verificaciones
**Columnas** usuario/agencia · RUC · documento · rol solicitado · fecha
**Acciones** aprobar (admin) · rechazar con motivo · pedir más documentos
**Ayuda** enlace directo a la consulta RUC de SUNAT con el número precargado

### Avisos
**Columnas** código · título · estado · precio · vs. índice · distrito · dueño · vistas · leads · vence
**Filtros** estado · operación · tipo · distrito · rango de precio · con/sin leads · por vencer
**Acciones** ver ficha pública · ver en admin · archivar (admin) · forzar re-moderación · destacar de cortesía

### Usuarios
**Columnas** nombre · correo · rol · estado · verificado · avisos · leads · plan · registro
**Filtros** rol · estado · verificado · con plan pago · sin avisos · registrados en el período
**Acciones** ver ficha · verificar · suspender · cambiar rol · acreditar · entrar como

### Suscripciones
**Columnas** titular · plan · estado · inicio · fin · renovación · valor
**Filtros** estado · plan · vencen en 7 días · en cobranza
**Acciones** ver pagos · cancelar · extender de cortesía · cambiar plan

### Planes
**Columnas** nombre · precio · período · topes · visible · suscriptores activos
**Acciones** editar · duplicar · ocultar
**Regla** nunca se borra un plan con suscriptores (`ON DELETE RESTRICT` ya lo impide). Se oculta: los actuales siguen, los nuevos no lo ven

### Exportaciones

Todas las tablas exportan CSV. **Los exports grandes van por background function** — el límite de 10 segundos de Netlify no aguanta 50.000 filas:

```
[ Exportar CSV ] → 202 "Te mandamos el archivo por correo en unos minutos"
                 → trabajo-export-background.ts → enlace firmado, 24 h de validez
```

---

## 6. Flujo de moderación

El detalle está en `FLUJO-AVISOS.md` §4 (niveles de confianza, reglas de riesgo, catálogo de motivos). Acá va lo propio del panel.

### Nivel de servicio

**Menos de 2 horas en horario laboral (9–19, Lima).** Se muestra en la cabecera de la cola y en Hoy. Un aviso que espera más de 2 h se marca en rojo y sube al tope aunque tenga riesgo bajo — quien publica no debería esperar un día para que su departamento aparezca.

### Muestreo de auto-aprobados

Los avisos auto-aprobados no desaparecen: **el 10% cae en una cola de revisión posterior**. Sirve para dos cosas:

1. Detectar si las reglas de confianza se aflojaron
2. Medir la tasa real de falsos negativos

Si el muestreo encuentra más de 5% de avisos que debieron rechazarse, se endurecen los umbrales.

### Apelaciones

Un aviso rechazado necesita salida. Sin ella, llegan correos enojados y se pierden usuarios legítimos.

```
Aviso rechazado
   ↓
El dueño corrige y reenvía   → vuelve a la cola normal
        o
El dueño apela una vez, con comentario
   ↓
Cola de apelaciones · la revisa un moderador DISTINTO al que rechazó
   ↓
Se confirma  → mensaje explicando mejor
Se revierte  → se aprueba + se marca el rechazo como error
```

Que revise otra persona no es burocracia: es la única forma de medir si alguien está rechazando de más.

### Rendimiento del equipo

| Métrica | Para qué |
|---|---|
| Avisos por hora, por moderador | Capacidad y necesidad de contratar |
| Tasa de rechazo por moderador | Un moderador muy por encima del resto está aplicando otro criterio |
| Apelaciones revertidas | **La medida real de calidad.** Alto = está rechazando mal |
| Coincidencia en el muestreo | Consistencia entre moderadores |

Se revisa mensualmente, no para vigilar, sino para descubrir dónde el catálogo de motivos es ambiguo.

---

## 7. Informes

### Envío automático

| Informe | Cuándo | A quién | Contenido |
|---|---|---|---|
| Resumen diario | 8:00 | admin, moderadores | Colas pendientes, actividad del día anterior, alertas |
| Semanal de negocio | lunes 8:00 | admin | Ingresos, altas y bajas, embudo, top distritos |
| Mensual | día 1 | admin | Estado completo + comparación con el mes previo |
| Recordatorio del Índice | día 25 | admin | "Falta cargar el período que viene" |

### Alertas inmediatas

| Disparador | Canal |
|---|---|
| Cola de moderación > 50 | correo + WhatsApp |
| Aviso esperando > 2 h en horario laboral | correo |
| Pago `pendiente` > 1 h | correo |
| Webhook de Culqi fallando | correo + WhatsApp |
| Avisos nuevos caen > 40% vs. la semana previa | correo |
| Tasa de rechazo > 25% | correo |
| Un usuario junta > 3 reportes | correo |
| `/api/salud` cae | WhatsApp |

La última no es menor: **hoy el backend está caído en producción y nadie se enteró.**

---

## 8. Métricas

Organizadas por la decisión que habilitan, no por lo que es fácil de contar.

### Estrella polar

> **Avisos activos que reciben al menos 1 lead en 30 días.**

Captura oferta y demanda a la vez. Si sube, el marketplace funciona. Si baja, algo se rompió aunque los avisos crezcan.

### Salud del marketplace

| Métrica | Por qué | Señal de alarma |
|---|---|---|
| Avisos activos | Tamaño de la oferta | Caída semanal |
| Avisos nuevos por día | Crecimiento de oferta | −40% vs. semana previa |
| **Avisos sin ningún lead en 30 días** | Oferta que no sirve | > 40% |
| **Tiempo hasta el primer lead** | Velocidad del marketplace | > 7 días |
| Leads por aviso activo | Intensidad de la demanda | < 0.5/mes |
| **Búsquedas sin resultados, por distrito** | **Dónde conseguir avisos** | — |
| Ratio búsquedas / avisos por distrito | Desbalance oferta-demanda | — |

Las dos en negrita son las que más se ignoran y más sirven. *"Búsquedas sin resultados en Los Olivos"* es una lista de tareas comerciales.

### Calidad y confianza

| Métrica | Alarma |
|---|---|
| Tasa de rechazo | > 25% |
| Reportes por cada 100 avisos activos | > 3 |
| Avisos con precio fuera del índice | > 10% |
| Tasa de renovación al vencer | < 40% |
| **Avisos cerrados que reportan precio final** | < 20% — se rompe el Índice |
| Fotos por aviso (mediana) | < 6 |

### Conversión

```
Visita          →  Registro     →  Publica    →  Aprobado  →  Recibe lead
              4-8%            25-40%         85%+          60%+
```
Cada caída marca dónde arreglar. Poco registro = el gancho del Índice no se ve. Poco "publica" = el formulario espanta. Poco "recibe lead" = falta demanda o los avisos están mal.

Del lado del comprador:
```
Búsqueda → Ve una ficha → Contacta
              25-40%        2-5%
```

### Negocio

MRR y su desglose (nuevo, expansión, baja) · usuarios pagos · ARPU · **churn mensual** (alarma > 8%) · **churn involuntario** — tarjetas fallidas, la parte recuperable · ingreso por créditos como % de la suscripción · conversión de gratis a pago (alarma < 3%) · tasa de recuperación en cobranza (objetivo > 30%).

### Operación

Profundidad de cola · tiempo medio de moderación · SLA cumplido · avisos/hora por moderador · apelaciones revertidas · tiempo de respuesta de la API (p95) · tasa de error.

---

## 9. Nota técnica

Mismo enfoque que el resto del frontend: páginas estáticas con módulos ES, sin framework.

```
public/admin/
  index.html          Hoy
  moderacion.html     cola + revisión
  reportes.html
  verificaciones.html
  avisos.html
  usuarios.html   usuario.html
  inmobiliarias.html
  planes.html   suscripciones.html   pagos.html
  indice.html   metricas.html   leads.html   auditoria.html
  admin.js            cliente + navegación + guardas
  admin.css
```

**Sobre la seguridad de servir HTML de admin desde el CDN:** los archivos son públicos y eso está bien, siempre que **el HTML no contenga ningún dato**. Todo llega de `/api/v1/admin/*`, que sí exige `conRol('moderador','admin')`. El esqueleto sin datos no filtra nada. Todas las páginas llevan `<meta name="robots" content="noindex">`.

Lo que **no** hay que hacer es esconder el menú de admin en el frontend y creer que eso es seguridad. La única barrera real es el chequeo de rol en el backend, en cada endpoint.

---

## 10. Orden de construcción

```
FASE 1 — lo mínimo para operar
  1. Guardas de admin + esqueleto de navegación
  2. Cola de moderación con atajos de teclado      ← sin esto no se puede publicar nada
  3. Aprobar / rechazar + auditoría
  4. Ficha del usuario (soporte)
  5. Hoy, versión simple: contadores de las colas

FASE 2 — sostener
  6. Reportes + regla de auto-pausa
  7. Verificaciones con enlace a SUNAT
  8. Pagos y suscripciones (llega con Culqi)
  9. Editor de planes
  10. Carga y publicación del Índice
  11. Alertas por correo y WhatsApp

FASE 3 — mejorar
  12. Métricas completas + informes automáticos
  13. Búsquedas sin resultados por distrito
  14. Muestreo de auto-aprobados + apelaciones
  15. Exportaciones en background
  16. Entrar como usuario
```

**Lo primero es la cola de moderación.** Sin ella, ningún aviso pasa de `revision` a `activo` y el marketplace no arranca. Todo lo demás puede esperar; eso no.

---

## 11. Las cinco decisiones que importan

1. **Colas antes que tablas.** El trabajo diario es una fila de decisiones, no una grilla. La pantalla Hoy tiene que responder "¿qué hago ahora?" sin que nadie tenga que buscar.
2. **Atajos de teclado en moderación.** 200 avisos por hora contra 40. Es lo que decide si la cola se controla o te come.
3. **Los leads se miden, no se leen.** Datos personales de compradores. Agregados siempre; el contenido, solo con motivo registrado.
4. **El SLA es visible y manda.** Menos de 2 horas. Un aviso vencido sube al tope aunque tenga riesgo bajo — quien publica no debería esperar un día.
5. **Alertas que llegan solas.** Un panel que hay que abrir para enterarse no sirve. Hoy el backend está caído en producción y no saltó ninguna alarma: esa es exactamente la falla que esto tiene que evitar.
