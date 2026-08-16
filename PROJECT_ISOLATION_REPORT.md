# Informe de aislamiento entre Wasipe y Atheos

**16 de agosto de 2026**

Verificado con operaciones de **solo lectura**. Ningún comando se ejecutó
desde la carpeta de Atheos: donde hizo falta leer su repositorio se usó
`git --git-dir=…` desde Wasipe, que abre el archivo y no cambia de
directorio.

---

## Veredicto

**Los dos proyectos están separados.** No comparten repositorio, ni
carpeta, ni base de datos, ni proyecto de Vercel, ni variables.

Aparecieron **dos cosas que sí había que corregir**, y ninguna era
contaminación de Atheos:

1. Una variable de entorno de la terminal redirigía las llamadas de
   Wasi AI. Corregida.
2. La configuración de arranque de Wasipe vivía fuera de Wasipe.
   Corregida en parte; la parte que queda es una limitación de la
   herramienta y está explicada abajo.

---

## 1 · Dónde vive cada uno

| | Ruta |
|---|---|
| **Wasipe** | `C:\Users\mauri\Projects\wasipe` |
| **Atheos** | `C:\Users\mauri\Projects\atheos` |

Carpetas hermanas, ninguna dentro de la otra. Wasipe no tiene ningún
archivo de Atheos rastreado ni ninguna carpeta suya adentro.

---

## 2 · Repositorios

| | Wasipe | Atheos |
|---|---|---|
| Raíz | `C:/Users/mauri/Projects/wasipe` | `C:/Users/mauri/Projects/atheos` |
| Rama | `main` | `main` |
| Commit | `e0345b3b54f36a87bc5f39a67fb4c07f5b615416` | `97286b68b110afb037565692aa2c324e8e30fb34` |
| Último mensaje | «Sprint 18: almacenamiento separado…» | «feat(marketing): cinematic video loop behind the hero» |
| Remoto | **ninguno configurado** | *(no consultado — no hacía falta)* |

Dos repositorios distintos, con historias distintas. Los hashes no
coinciden en nada.

**Wasipe no tiene remoto configurado.** No es un problema de aislamiento
—al contrario, no puede empujar a ningún sitio por error— pero sí quiere
decir que **el historial solo existe en este disco**. Si el disco falla,
se pierden 18 sprints. Está en la sección de correcciones.

---

## 3 · Puertos

| Puerto | Proceso | Proyecto | Qué se hizo |
|---|---|---|---|
| **3000** | PID 31404 | **Atheos** — `atheos\node_modules\...\next start -p 3000` | **Nada. No se tocó.** |
| **3001** | PID 7964 | **Wasipe** — `wasipe\node_modules\next\...\start-server.js` | Lo levanté yo |

Comprobado con `Get-NetTCPConnection` y la línea de comandos de cada
proceso, que dice a qué carpeta pertenece. No hay ambigüedad.

El de Wasipe es el que arranqué en el turno anterior. Si en otra sesión el
3001 ya está ocupado, primero hay que mirar la línea de comandos: si
apunta a `Projects\wasipe`, se reutiliza; si apunta a otra cosa, no se
mata, se usa otro puerto.

---

## 4 · Servicios: qué tiene cada uno

| Servicio | Wasipe | Atheos | ¿Compartido? |
|---|---|---|---|
| Repositorio Git | Propio | Propio | **No** |
| Carpeta | Propia | Propia | **No** |
| Supabase | **No existe todavía** | *(no consultado)* | **No** |
| Base de datos | No existe | — | **No** |
| Migraciones | 27, propias | — | **No** |
| Buckets | 6, definidos en sus migraciones | — | **No** |
| Vercel | **Sin enlazar** (no hay `.vercel`) | Enlazado (`prj_YFPlGDYv…`) | **No** |
| Sentry | Sin proyecto | *(no consultado)* | **No** |
| `.env` / `.env.local` | **No existe todavía** | *(no leído)* | **No** |
| `.env.example` | Propio, 20 variables | — | **No** |
| Proveedor de mapas | Sin token | — | **No** |
| Claves de IA | Sin clave | — | **No** |
| Pagos | `PAGOS_EN_VIVO=no`, sin pasarela | — | **No** |
| Copias de seguridad | Ninguna todavía | — | **No** |

**Wasipe no está enlazado a ningún proyecto de Vercel.** Eso importa: la
sesión del CLI es la misma cuenta (`moterry1990`) que la de Atheos, así
que el día que se despliegue hay que **crear un proyecto nuevo**, no
aceptar el que proponga por defecto. Anotado en las correcciones.

Del proyecto de Vercel de Atheos solo leí los identificadores para poder
decir que no son el mismo. No se usaron para nada más.

---

## 5 · Riesgos encontrados

### R-1 · `ANTHROPIC_BASE_URL` en el entorno · **corregido**

**Gravedad: media. No venía de Atheos.**

Esta terminal tiene `ANTHROPIC_BASE_URL` puesta —la deja la propia
herramienta de desarrollo— y **el SDK de Anthropic la lee solo cuando no
se le pasa una `baseURL`**.

Consecuencia: cualquier llamada de Wasi AI hecha desde esta terminal
habría ido a esa dirección en vez de a la API de Anthropic, **con la clave
de Wasipe adentro**, sin ningún aviso.

No es contaminación de Atheos, pero es exactamente el tipo de acople
invisible que esta regla existe para evitar: una variable suelta del
entorno cambiando el comportamiento de Wasipe.

**Corrección:** `baseURL` explícita en
`lib/ia/proveedores/anthropic.ts`. Si algún día hace falta otro destino,
se cambia ahí y se ve en el diff.

**Prueba de regresión:** dos, en `tests/unidad/ia.test.ts`. Una comprueba
que la dirección está escrita; la otra que el adaptador no lee ninguna
variable de entorno que no sea suya.

### R-2 · La configuración de arranque vivía fuera de Wasipe · **corregido en parte**

**Gravedad: baja. Sin contacto con Atheos.**

La herramienta de vista previa lee `.claude/launch.json` **desde el
directorio de la sesión**, que en esta conversación es
`C:\Users\mauri\OneDrive\Desktop\Youtube Faceless Channel Technology` —
un tercer proyecto, el del canal de YouTube. Ahí quedó la configuración
del servidor de Wasipe.

**Qué se comprobó:** ese archivo no menciona a Atheos (0 coincidencias),
no contiene secretos, y solo referencia rutas de Wasipe. Atheos tiene su
propio `.claude/`, intacto.

**Corrección:** Wasipe tiene ahora su propio `.claude/launch.json`
adentro, portátil y sin rutas absolutas. Quien abra Wasipe como carpeta de
trabajo lo levanta en el 3001 sin más.

**Lo que queda:** la copia en la carpeta de la sesión sigue ahí porque es
donde la herramienta la busca. Es una limitación del arnés, no una
decisión de diseño, y se borra sola cuando la sesión se abra directamente
sobre `Projects\wasipe`.

### R-3 · Wasipe no tiene remoto Git · **abierto, decisión tuya**

**Gravedad: alta para el proyecto. Ninguna para el aislamiento.**

18 sprints de historia existen en un solo disco. No es un riesgo de
mezcla con Atheos —al contrario— pero sí es el riesgo más grande que
encontré hoy.

**Corrección propuesta:** un repositorio propio y vacío, solo de Wasipe.
Nunca el de Atheos, ni una rama suya.

---

## 6 · Lo que NO se tocó de Atheos

- No se modificó ningún archivo suyo
- No se detuvo, reinició ni redesplegó su servidor
- No se ejecutó ningún comando desde su carpeta
- No se reutilizó su repositorio, sus variables, su Supabase, su Vercel
  ni su Sentry
- No se copió ningún archivo entre los dos proyectos
- No se tocó su dominio ni su despliegue
- No se mató ningún proceso

Lo único que se leyó de Atheos: el hash de su último commit y los
identificadores de su proyecto de Vercel, **para poder demostrar que no
son los mismos que los de Wasipe**.

---

## 7 · Hash de Atheos, antes y después

| Momento | Commit |
|---|---|
| **Antes de empezar** | `97286b68b110afb037565692aa2c324e8e30fb34` |
| **Al terminar** | `97286b68b110afb037565692aa2c324e8e30fb34` |

**Coinciden.** El repositorio de Atheos no cambió.

Y su servidor tampoco: el PID 31404 sigue siendo el mismo proceso,
iniciado el 15 de agosto a las 16:49, sin reinicios.

---

## 8 · Correcciones

| # | Qué | Estado |
|---|---|---|
| R-1 | `baseURL` explícita en el adaptador de IA | ✅ Hecho, con 2 pruebas |
| R-2 | `launch.json` propio dentro de Wasipe | ✅ Hecho |
| R-3 | Remoto Git propio para Wasipe | ⬜ **Necesita tu decisión** |
| R-4 | Al desplegar, **crear** proyecto de Vercel, no reutilizar | ⬜ Anotado para cuando toque |
| R-5 | Cuando exista, `.env.local` propio y nunca uno compartido | ⬜ Anotado |

---

## 9 · Cómo volver a comprobar esto

Todo de solo lectura, desde Wasipe:

```bash
git rev-parse --show-toplevel && git log -1 --format=%H
```

```bash
git --git-dir="C:/Users/mauri/Projects/atheos/.git" log -1 --format=%H
```

```powershell
foreach ($p in 3000,3001) { $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { "$p -> " + (Get-CimInstance Win32_Process -Filter "ProcessId = $($c.OwningProcess)").CommandLine } }
```

La tercera es la importante: dice a qué carpeta pertenece cada servidor,
que es lo único que permite saber cuál se puede reutilizar y cuál no se
toca.
