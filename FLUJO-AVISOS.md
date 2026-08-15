# Wasipe — Flujo completo del aviso

De borrador a archivado. Es el circuito central del producto y **hoy está roto**: `panel.html:293` sigue haciendo `alert('El formulario de publicación es el siguiente paso del proyecto.')`. La gente se registra y no puede publicar.

---

## 1. Dos públicos, una sola máquina de estados

Un dueño y un agente no publican igual, y diseñar un solo formulario para ambos deja a los dos incómodos.

| | **Propietario** | **Agente / Inmobiliaria** |
|---|---|---|
| Frecuencia | 1 aviso cada varios años | 15–40 avisos, todo el tiempo |
| Dispositivo | Celular, fotos en el carrete | Escritorio, fotos en carpetas |
| Sabe qué es "área techada" | No | Sí |
| Qué necesita | Que lo lleven de la mano | **Velocidad** |
| Qué lo hace abandonar | Un formulario largo y con jerga | Repetir 40 veces los mismos pasos |

**La misma API y la misma máquina de estados sirven a los dos. Cambia la interfaz:**

- **Dueño → asistente guiado de 5 pasos.** Una decisión por pantalla, lenguaje llano, campos avanzados escondidos.
- **Agente → formulario único de una pantalla + `Duplicar aviso`.** Todo a la vista, tabulable, sin pasos. Publicar 15 departamentos del mismo edificio = llenar uno y duplicar catorce cambiando piso y precio.

Se elige por rol al entrar a `/publicar`, con un enlace para cambiar de modo (`?modo=rapido` / `?modo=guiado`).

---

## 2. Estados

```
                 ┌──────────── editar ────────────┐
                 ▼                                │
  ┌──────────┐  publicar   ┌──────────┐ aprobar  ┌────────┐
  │ borrador │────────────>│ revision │─────────>│ activo │
  └──────────┘             └──────────┘          └────────┘
       ▲                        │ rechazar          │  ▲
       │                        ▼                   │  │
       │                  ┌───────────┐  corregir   │  │
       └──────────────────│ rechazado │─────────────┘  │
                          └───────────┘                │
                                                       │
   pausar ◄──────────────────────────────────────────┤
   ┌─────────┐  reactivar                             │
   │ pausado │───────────────────────────────────────►│
   └─────────┘                                        │
                                                      │
   vence_en  ┌─────────┐  renovar                     │
   ─────────►│ vencido │─────────────────────────────►│
             └─────────┘                              │
                                                      │
             ┌─────────┐  cerrar (vendida/alquilada)  │
             │ cerrado │◄─────────────────────────────┘
             └─────────┘
             ┌────────────┐
             │ archivado  │◄── admin, desde cualquier estado
             └────────────┘
```

| Estado | Público | Quién lo provoca | Significado |
|---|:--:|---|---|
| `borrador` | no | dueño | El asistente está a medio llenar. Se autoguarda |
| `revision` | no | dueño (`publicar`) | Esperando moderación |
| `rechazado` | no | moderador | Devuelto con `motivo_rechazo` y mensaje |
| `activo` | **sí** | moderador o auto-aprobación | Publicado y buscable |
| `pausado` | no | dueño | Escondido a propósito. No consume tope de plan |
| `vencido` | no | cron (`vence_en`) | Pasaron los 90 días. Recuperable con un clic |
| `cerrado` | no | dueño | Se vendió o alquiló. **Alimenta el índice de precios** |
| `archivado` | no | admin | Fraude o baja definitiva. Terminal |

**Reglas duras**

- Solo `activo` cuenta contra `tope_avisos`. Pausar libera cupo; reactivar lo vuelve a exigir (402 si no hay).
- `archivado` es terminal: no vuelve.
- `cerrado` puede volver a `activo` dentro de 30 días (se cayó la operación).
- Todas las transiciones se validan en `src/modulos/propiedades/estados.ts`, **no** en un CHECK: un CHECK no puede leer el estado anterior.

```ts
const TRANSICIONES: Record<Estado, Estado[]> = {
  borrador:  ['revision', 'archivado'],
  revision:  ['activo', 'rechazado', 'archivado'],
  rechazado: ['revision', 'borrador', 'archivado'],
  activo:    ['pausado', 'vencido', 'cerrado', 'revision', 'archivado'],
  pausado:   ['activo', 'cerrado', 'archivado'],
  vencido:   ['activo', 'cerrado', 'archivado'],
  cerrado:   ['activo', 'archivado'],     // solo dentro de 30 días
  archivado: [],
};
```

---

## 3. Flujo del usuario

### 3.1 Crear y guardar borrador

El aviso **nace en la base al primer clic**, no al final. Así el autoguardado tiene dónde escribir y nada se pierde.

```
Clic en "Publicar gratis"
      ↓
POST /propiedades  { operacion, tipo, ubicacion_id }
      ↓
201 → { id, codigo: "WSP-10429", estado: "borrador" }
      ↓
Redirige a /publicar/<id> — desde acá todo es PATCH
```

**Autoguardado:** `PATCH` con rebote de 800 ms al salir de cada campo, y al cambiar de paso. Indicador discreto: *"Guardado hace unos segundos"*. Sin botón de guardar.

**Los 5 pasos del modo guiado:**

| Paso | Pide | Por qué en ese orden |
|---|---|---|
| 1 · Qué y dónde | operación, tipo, distrito | Tres toques. Arranque sin fricción |
| 2 · **Fotos** | subir imágenes | **Antes que el texto.** Las fotos ya están en el celular; escribir cuesta más. Suben en segundo plano mientras sigue |
| 3 · Detalles | área, dormitorios, baños, piso, antigüedad | Lo tedioso, ya comprometido |
| 4 · Precio | monto, moneda, mantenimiento | Con el índice en vivo al costado |
| 5 · Aviso | título, descripción, características | Con vista previa de la tarjeta |

Poner las fotos en el paso 2 es contraintuitivo y funciona: quien ya subió ocho fotos casi nunca abandona.

**Vida del borrador:** sin actividad, aviso por correo a los 25 días y borrado a los 30, junto con sus imágenes en Cloudinary.

### 3.2 Subir imágenes

Tres pasos obligados por el límite de 6 MB de Netlify (ver `ARQUITECTURA.md` §8).

```
Elige archivos
   ↓
POST /medios/firma { propiedad_id, cantidad }   → firma + carpeta + restantes
   ↓
Sube DIRECTO a Cloudinary, en paralelo, con barra de progreso real
   ↓
POST /propiedades/:id/medios { public_id }      → el backend verifica contra
                                                   la Admin API y guarda
```

Lo que decide si el dueño termina o abandona:

- **La subida arranca al elegir el archivo**, no al apretar un botón. Y no bloquea: puede seguir llenando el formulario.
- **Comprimir en el navegador antes de subir** (`canvas` → WebP, lado mayor 2400 px). Una foto de celular pasa de 8 MB a ~600 KB: en 4G peruano es la diferencia entre 40 segundos y 4.
- **Reordenar con flechas ↑↓, no solo arrastrando.** Arrastrar en móvil es un desastre.
- **Portada explícita**, con la primera marcada por defecto.
- Avisos, no bloqueos: *"Esta foto salió oscura"* · *"Estas dos parecen la misma"* · *"Con menos de 5 fotos recibirás muchos menos contactos"*.
- Si falla una subida, se reintenta sola; el resto no se cae.

**Reglas** · máx 12 MB por imagen · jpg/png/webp/heic · **se borra el EXIF** (los celulares guardan el GPS exacto de la casa) · `phash` calculado y guardado.

### 3.3 Editar

| Tipo de cambio | Qué pasa |
|---|---|
| **Menor** — descripción, características, fotos, título | Sigue `activo`, sin revisión |
| **Sustancial** — precio ±15%, área, ubicación, tipo, operación | Sigue `activo` **pero** se crea una marca `edicion-sustancial` para revisión posterior |

**El primer alta se modera antes; las ediciones, después.** Bajar un aviso vivo por corregir una coma es inaceptable, y el riesgo real (publicar barato, aprobarse, y subir el precio) queda cubierto con la marca, el historial en `auditoria` y la posibilidad de suspender.

Un aviso `rechazado` que se edita vuelve a `revision` automáticamente al reenviarlo.

### 3.4 Publicar

```
POST /propiedades/:id/publicar
      ↓
¿Pasa las validaciones?  ── no ──> 422 con TODOS los faltantes
      ↓ sí
¿Dentro del tope del plan? ─ no ──> 402 + plan_sugerido
      ↓ sí
Calcular riesgo (marcas automáticas)
      ↓
¿Confianza alta y riesgo bajo? ── sí ──> activo    (auto-aprobado)
      ↓ no
   revision  → cola de moderación
```

Cuando falta algo se devuelve **la lista completa**, nunca el primer error:

```jsonc
// 422
{ "error": "A tu aviso le falta información.",
  "codigo": "AVISO_INCOMPLETO",
  "faltantes": [
    { "paso": 4, "campo": "precio", "mensaje": "Ponle precio. En Wasipe el precio siempre se ve." },
    { "paso": 2, "campo": "medios", "mensaje": "Sube al menos 3 fotos." }] }
```

El asistente marca los pasos en rojo de una sola vez. Ir descubriendo errores de a uno es la forma más rápida de perder a alguien.

### 3.5 Pausar, renovar, cerrar

**Pausar** (`activo → pausado`): libera cupo del plan. Reactivar lo revalida.

**Renovar.** Los 90 días de `vence_en` son el diferenciador del home (*"Aquí no hay propiedades vendidas hace meses"*). Para que funcione, renovar tiene que costar un solo gesto:

```
Día 83  correo: "¿Sigue disponible tu depa en Miraflores?"
        [ Sí, sigue disponible ]  ← enlace firmado, UN CLIC, SIN LOGIN
        [ Ya se vendió ]
Día 90  → vencido, sale de la búsqueda
Día 90-120  recuperable con un clic
Día 120 → archivado
```

El enlace lleva un token de un solo uso (`tokens_cuenta.tipo = 'renovar_aviso'`). Pedir login en ese correo hunde la tasa de renovación.

**Cerrar.** Acá se recupera el dato más valioso de todo el producto:

```jsonc
POST /propiedades/:id/cerrar
{ "motivo": "vendida",        // vendida|alquilada|desistio|otro
  "precio_final": 178000,     // opcional
  "moneda": "USD" }
```

> *"¿En cuánto cerraste? Es anónimo y mejora el índice de tu distrito para todos.
> Te regalamos 3 consultas extra al índice."*

Sin esto, el Índice Wasipe promedia **precios pedidos**. Con esto, promedia **operaciones reales** — que es lo que un banco o un tasador pagaría por saber. Es la diferencia entre una funcionalidad simpática y un activo defendible.

---

## 4. Flujo del administrador

### 4.1 Niveles de confianza: no moderar todo a mano

Revisar cada aviso no escala y mata el tiempo de publicación.

| Nivel | Quién | Qué pasa |
|---|---|---|
| **Nuevo** | Sin avisos aprobados, o sin correo verificado | Siempre revisión humana |
| **Conocido** | ≥2 aprobados, 0 rechazos, correo verificado | Auto-aprobado + **10% de muestreo** |
| **Confiable** | Agente o inmobiliaria verificada, ≥10 aprobados, 0 rechazos en 90 días | Auto-aprobado, moderación posterior |
| **Vigilado** | ≥1 rechazo en 30 días, o reporte confirmado | Siempre revisión humana |

**Riesgo ≥ 60 fuerza revisión humana siempre, sin importar el nivel.**

### 4.2 Reglas de riesgo

Generan filas en `marcas_moderacion` y suman a `propiedades.riesgo` (0–100).

| Regla | Sev. | Detecta |
|---|:--:|---|
| `fotos-repetidas` | 5 | `phash` que ya existe en otro aviso → fotos robadas |
| `discriminacion` | 5 | "sin niños", "solo parejas", "sin mascotas" en zonas donde aplica. **Ilegal en Perú** |
| `precio-fuera-de-indice` | 4 | `precio_m2` se desvía >60% del índice del distrito |
| `cuenta-nueva-volumen` | 4 | Cuenta de <24 h con >3 avisos |
| `descripcion-copiada` | 4 | Descripción idéntica a otro aviso de otro usuario |
| `contacto-en-descripcion` | 3 | Teléfono, correo o WhatsApp en el texto → evade el registro de leads |
| `direccion-repetida` | 3 | Misma `direccion` en varios avisos activos |
| `edicion-sustancial` | 2 | Cambio grande en un aviso ya aprobado |
| `datos-incoherentes` | 2 | 40 m² con 5 dormitorios; antigüedad 0 y estado "a refaccionar" |

`contacto-en-descripcion` se bloquea en validación (422), no solo se marca — es el abuso más común y el más fácil de frenar.

### 4.3 La cola

`GET /admin/moderacion` ordenada por `riesgo DESC, creado_en ASC` (usa `ix_prop_moderacion`).

La pantalla de revisión tiene que resolverse **en menos de 15 segundos por aviso**:

```
┌─ WSP-10430 ────────────────────── riesgo 72 · esperando 3.5 h ─┐
│  [galería de fotos, grande, navegable con ← →]                  │
│                                                                  │
│  US$ 82,000 · 92 m² · Miraflores          ⚠ 61% bajo el índice   │
│  Ana Quispe · sin verificar · 0 avisos previos                   │
│                                                                  │
│  ⚠ precio-fuera-de-indice (4)   ⚠ telefono-en-descripcion (3)    │
│                                                                  │
│  [ ✓ Aprobar  (A) ]   [ ✗ Rechazar  (R) ]   [ Siguiente  (→) ]  │
└──────────────────────────────────────────────────────────────────┘
```

Atajos de teclado y avance automático al siguiente. Un moderador con teclado hace 200 avisos por hora; con mouse, 40.

**Rechazar exige motivo de un catálogo cerrado** — un rechazo sin causa clasificada no se puede medir:

```jsonc
{ "motivo": "fotos-no-corresponden",
  "mensaje": "Las fotos parecen de otro inmueble. Súbelas de nuevo.",  // le llega al usuario
  "nota_interna": "phash coincide con WSP-9981" }                       // nunca sale
```

Motivos: `fotos-no-corresponden` · `precio-irreal` · `datos-incompletos` · `contacto-en-descripcion` · `duplicado` · `no-es-inmueble` · `discriminacion` · `sospecha-fraude`.

**Objetivo de servicio: menos de 2 horas en horario laboral.** Se muestra `sla_vencidos` en la cabecera de la cola.

Toda acción escribe en `auditoria` con `antes`/`despues`.

### 4.4 Destacar y promocionar

```
Tarjeta del aviso → "Destacar"
      ↓
Elige tipo y días · ve el precio y el impacto esperado
      ↓
POST /pagos/destacado { propiedad_id, tipo, dias }
      ↓
¿El plan incluye destacados sin usar?  ── sí → se descuenta, monto 0
      ↓ no
Checkout Culqi → webhook → fila en `destaques`
```

| Tipo | Dónde aparece | Precio |
|---|---|---|
| `destacado` | Arriba de su página de resultados | S/ 25 / 7 días |
| `super` | Arriba de todos los resultados de su distrito | S/ 45 / 7 días |
| `portada` | Carrusel del home | S/ 60 / 7 días |

El `EXCLUDE` del esquema impide vender dos veces el mismo destaque solapado. Solo se puede destacar un aviso `activo`.

Mostrar el impacto con datos reales en cuanto existan: *"Los avisos destacados reciben 3.2× más contactos"*. Sin datos todavía, no inventar el número.

---

## 5. Reglas de validación

### Por campo (espejan los CHECK del esquema)

| Campo | Regla |
|---|---|
| `titulo` | 10–140 caracteres. Sin MAYÚSCULAS COMPLETAS, sin más de 2 emojis |
| `descripcion` | ≤5000. **Sin teléfonos, correos ni URLs** → 422 |
| `precio` | >0, ≤14 dígitos. Obligatorio para publicar |
| `moneda` | `USD` \| `PEN` |
| `area_m2` | >0 y <1 000 000 |
| `dormitorios` / `banos` / `cocheras` | 0–30 |
| `piso` | −5 a 120 |
| `antiguedad` | 0–200 |
| `lat` / `lng` | −90–90 / −180–180, y dentro de Perú |
| `caracteristicas` | Existen en el catálogo y aplican al `tipo` |
| `ubicacion_id` | Existe y está `activo` |

### Por transición

| Transición | Exige |
|---|---|
| → `revision` | correo verificado · precio · título ≥10 · **≥3 fotos** · portada elegida · ubicación · área · dormitorios (salvo terreno/cochera) · dentro del tope del plan |
| → `activo` | permiso de moderador, **o** nivel de confianza suficiente y riesgo <60 |
| `pausado` → `activo` | Tope de plan revalidado |
| `vencido` → `activo` | Tope de plan revalidado · ≤30 días desde el vencimiento |
| → `cerrado` | Estaba `activo`, `pausado` o `vencido` |
| → `archivado` | Solo `admin` |

**Mínimo 3 fotos, no negociable.** Un aviso con una foto casi no recibe contactos; deja mal al portal y frustra a quien publica.

---

## 6. Requisitos de base de datos

Migración `002_avisos_workflow.sql`, sobre lo ya definido en `001_inicial.sql`:

```sql
ALTER TABLE propiedades
  ADD COLUMN origen         TEXT NOT NULL DEFAULT 'wizard'
      CHECK (origen IN ('wizard','rapido','duplicado','importado','whatsapp')),
  ADD COLUMN duplicado_de   UUID REFERENCES propiedades(id) ON DELETE SET NULL,
  ADD COLUMN auto_aprobado  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN completitud    SMALLINT NOT NULL DEFAULT 0 CHECK (completitud BETWEEN 0 AND 100),
  -- Cierre: el dato que convierte el índice en operaciones reales
  ADD COLUMN cerrado_motivo TEXT CHECK (cerrado_motivo IN
      ('vendida','alquilada','desistio','otro')),
  ADD COLUMN precio_final   NUMERIC(14,2) CHECK (precio_final > 0),
  ADD COLUMN moneda_final   TEXT CHECK (moneda_final IN ('USD','PEN')),
  ADD COLUMN cerrado_en     TIMESTAMPTZ,
  -- Para que el cron no mande el mismo aviso dos veces
  ADD COLUMN aviso_vencimiento_en TIMESTAMPTZ;

-- Contadores de confianza, desnormalizados para no recalcularlos en cada alta
ALTER TABLE usuarios
  ADD COLUMN avisos_aprobados  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN avisos_rechazados INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN ultimo_rechazo_en TIMESTAMPTZ;

-- Renovación en un clic desde el correo
ALTER TABLE tokens_cuenta DROP CONSTRAINT tokens_cuenta_tipo_check;
ALTER TABLE tokens_cuenta ADD CONSTRAINT tokens_cuenta_tipo_check
  CHECK (tipo IN ('verificar_email','recuperar_password','invitacion','renovar_aviso'));
ALTER TABLE tokens_cuenta
  ADD COLUMN propiedad_id UUID REFERENCES propiedades(id) ON DELETE CASCADE;

-- Cron de borradores abandonados
CREATE INDEX ix_prop_borradores ON propiedades (actualizado_en)
  WHERE estado = 'borrador';

-- Cron de vencimientos (ya existe ix_prop_vencer; este es para el preaviso)
CREATE INDEX ix_prop_preaviso ON propiedades (vence_en)
  WHERE estado = 'activo' AND aviso_vencimiento_en IS NULL;
```

El historial visible para el usuario (*"rechazado el 3 de agosto, aprobado el 4"*) sale de `auditoria` filtrando `entidad='propiedades'`. No hace falta otra tabla — pero hay que registrar también las transiciones que hace el dueño, no solo las del staff.

---

## 7. Endpoints

Ya especificados en `API.md` §3, §4 y §10. Lo que este flujo agrega:

```
POST   /propiedades/:id/duplicar          → copia todo menos fotos, código y slug
                                             Body opcional: { piso, precio, titulo }
POST   /propiedades/:id/renovar-token     → renovación pública con token de correo
                                             (sin sesión, un solo uso)
GET    /propiedades/:id/historial         → línea de tiempo desde `auditoria`
POST   /propiedades/:id/vista-previa      → devuelve la tarjeta tal como saldrá
GET    /propiedades/:id/completitud       → puntaje + qué falta para llegar a 100
POST   /admin/propiedades/:id/recalcular  → vuelve a correr las reglas de riesgo
```

`POST /propiedades/:id/duplicar` es el endpoint que decide si los agentes se quedan o se van.

---

## 8. Frontend: páginas y componentes

### Páginas

| Ruta | Qué es | Estado |
|---|---|---|
| `/publicar` | Elige modo y crea el borrador | **nueva** |
| `/publicar/:id` | Asistente o formulario rápido | **nueva** |
| `/panel` | Mis avisos con acciones | existe, hay que completarlo |
| `/propiedad/:slug` | Ficha pública | **nueva** — la que trae el tráfico |
| `/admin/moderacion` | Cola | **nueva** |
| `/admin/propiedades/:id` | Revisión de un aviso | **nueva** |

### Componentes (módulos ES, sin framework — como el `cuenta.js` actual)

```
componentes/
  subidor-fotos.js      ← el más importante y el más difícil
                          comprime, sube en paralelo, reordena, elige portada,
                          reintenta, avisa de oscuras y duplicadas
  campo-precio.js         monto + moneda + índice en vivo al costado
  selector-ubicacion.js   autocompletado sobre /ubicaciones/sugerir
  selector-caracteristicas.js  chips agrupados, filtrados por tipo
  pasos-asistente.js      barra de pasos con estado y errores por paso
  tarjeta-aviso.js        tarjeta del panel: estado, métricas, acciones
  insignia-estado.js      color y texto por estado
  modal-cerrar.js         motivo + precio final (con el incentivo)
  modal-destacar.js       tipo, días, precio, impacto
  vista-previa-aviso.js   la tarjeta como se verá en resultados
  guardado-automatico.js  PATCH con rebote + indicador "Guardado"
```

`subidor-fotos.js` es el que concentra el riesgo: es donde más gente abandona y donde más cosas pueden salir mal (4G lento, HEIC de iPhone, fotos de 12 MB, subidas a medias). Conviene construirlo primero y probarlo en un celular real con datos móviles, no en wifi.

---

## 9. Mejoras de experiencia, por impacto

### Alto — hacer en la Fase 1

**1 · El índice en vivo mientras escribe el precio.**
```
Precio  [ US$ 185,000 ]
        US$ 2,011/m² · 12% debajo del promedio de Miraflores (US$ 2,285/m²)
        ✓ A este precio suele venderse en ~45 días
```
Es el momento exacto donde tu diferenciador se paga solo: evita precios irreales (menos rechazos) **y** le muestra al usuario para qué sirve el índice justo cuando le importa.

**2 · `Duplicar aviso`.** Sin esto, ningún agente publica 15 unidades del mismo edificio. Copia todo, pide solo piso y precio.

**3 · Las fotos en el paso 2, subiendo en segundo plano.** Bajan la barrera de entrada y comprometen a la persona antes de la parte aburrida.

**4 · Comprimir en el navegador antes de subir.** De 8 MB a 600 KB. En 4G peruano decide si terminan o no.

**5 · Todos los errores de una vez** al publicar, marcados sobre los pasos.

**6 · Renovación en un clic desde el correo, sin login.** Es lo que sostiene la promesa de "sin avisos muertos".

### Medio — Fase 2

**7 · Puntaje de calidad con motivo.**
> *Tu aviso está al 70%. Con 3 fotos más y una descripción llegás al 100%.
> Los avisos completos reciben 2,4× más contactos.*

**8 · Vista previa en vivo** de la tarjeta mientras escribe. Hace obvio por qué conviene un buen título y una buena portada.

**9 · Precio sugerido desde el índice**, precargado y editable, según distrito, metraje, piso y antigüedad. El estimador ya existe en `panel.html` — hay que traerlo al formulario.

**10 · Continuar después**, con enlace por correo o WhatsApp. Recupera abandonos en móvil.

**11 · Campos avanzados plegados para dueños, desplegados para agentes.** A un dueño no se le pregunta "área techada".

### Más adelante — Fase 3

**12 · Publicar por WhatsApp.** Mandar fotos y un audio a un número; la IA arma el borrador y devuelve el enlace para revisar y publicar. Es literalmente como trabajan los agentes peruanos hoy.

**13 · La IA hace lo aburrido** — los 4 pasos que el home ya promete: ordenar y revisar fotos, sugerir precio, redactar el aviso, responder las preguntas de siempre.

**14 · Carga masiva por CSV o feed XML** para inmobiliarias con cartera grande.

---

## 10. Orden de construcción

```
1. estados.ts + transiciones + auditoría de cambios de estado
2. POST /propiedades + PATCH + guardado automático        ← el borrador ya vive
3. subidor-fotos.js + firma + confirmación                ← probar en celular real
4. Validaciones + /publicar con todos los faltantes juntos
5. /propiedad/:slug — la ficha pública                    ← sin esto no hay tráfico
6. Cola de moderación + aprobar/rechazar + reglas de riesgo
7. Panel: tarjetas, pausar, reactivar, cerrar
8. Cron de vencimientos + preaviso + renovación por token
9. Niveles de confianza y auto-aprobación                 ← cuando la cola moleste
10. Duplicar aviso                                        ← antes de captar agentes
11. Destaques + checkout
```

Los pasos 1–5 son el circuito mínimo: publicar y que se vea. Los pasos 6–8 son lo que lo hace sostenible. El 10 es el que decide si los agentes se quedan.

---

## 11. Lo que más importa

1. **Las fotos deciden todo.** Es el paso donde se abandona. Comprimir en el navegador, subir en paralelo desde el momento de elegir el archivo, y probarlo en un celular con datos móviles antes de darlo por bueno.
2. **Moderar antes de publicar solo la primera vez.** Ediciones y usuarios confiables van con moderación posterior; si no, la cola te come y el tiempo de publicación mata la experiencia.
3. **Pedir el precio de cierre.** Es lo que convierte el Índice Wasipe de un promedio de precios pedidos en un registro de operaciones reales — y eso es lo único de todo el producto que un competidor no puede copiar con dinero.
