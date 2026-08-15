# Wasipe — Sistema de monetización

Planes, créditos, destaques, pagos y facturación. Los límites ya existen como columnas en `planes` (`001_inicial.sql`), así que casi todo esto es configuración, no código nuevo.

---

## 1. El modelo, en una página

Urbania y Adondevivir venden **paquetes de avisos + destacados**, con vendedor y contrato anual. Funciona, pero tiene tres problemas que se pueden atacar:

| Problema del modelo clásico | Qué hace Wasipe |
|---|---|
| Cada destacado es una compra nueva: checkout, tarjeta, espera | **Créditos prepagados.** Se compran una vez, se gastan en un clic |
| Techo duro: si tu plan da 15 avisos y necesitás 16, cambiás de plan o te vas | **Créditos cubren el excedente** sin forzar cambio de plan |
| Solo se vende visibilidad | **Se vende también información** — el Índice Wasipe como beneficio de plan y como producto |

```
        SUSCRIPCIÓN                    +          CRÉDITOS
   ingreso recurrente, predecible          prepago, alto margen, sin fricción
   ─────────────────────────────           ────────────────────────────────
   · cupo de avisos activos                · destacar un aviso
   · fotos por aviso                       · aviso extra por 30 días
   · asientos de equipo                    · informe de mercado con tu marca
   · índice sin tope                       · certificación de aviso verificado
   · perfil público                        · subir al tope de recientes
   · N créditos incluidos por mes
```

**Por qué los créditos son la pieza clave:** el destaque es el producto de mayor margen y el que más se compra por impulso. Meter un checkout de tarjeta entre el impulso y la compra mata la mitad de las ventas. Con saldo cargado, destacar es un clic desde la tarjeta del aviso.

---

## 2. Tipos de paquete: tres pistas, no nueve opciones

Pediste 9 planes. Nueve opciones en una misma pantalla paralizan y bajan la conversión. La salida es organizarlos en **tres pistas según quién sos**, y que cada usuario vea solo las tres que le corresponden:

```
  Pista           Para                  Cobro           Se le muestra a
  ─────────────────────────────────────────────────────────────────────
  ARRANQUE        propietario           pago único      rol = propietario
  CRECIMIENTO     agente independiente  mensual/anual   rol = agente
  PREMIUM         inmobiliaria          mensual/anual   rol = inmobiliaria
```

`planes.para_rol` ya existe en el esquema y hace exactamente este filtrado. `GET /planes` devuelve solo los de tu rol, con un enlace discreto a "ver todos los planes".

**Los dueños pagan una sola vez, no se suscriben.** Alguien que vende su departamento no es un cliente recurrente: obligarlo a suscribirse genera cancelaciones, olvidos y contracargos. Pago único con vigencia y listo.

---

## 3. Los nueve planes

Precios en soles, **IGV incluido**. Anual = 10 meses (dos gratis).

### Pista ARRANQUE — propietarios · pago único

| | **Gratis** | **Dueño** | **Dueño Plus** |
|---|---|---|---|
| Precio | **S/ 0** | **S/ 39** · 60 días | **S/ 79** · 90 días |
| Avisos activos | 1 | 1 | 2 |
| Fotos por aviso | 8 | 20 | 30 |
| Índice de precios | 5 consultas/mes | sin tope | sin tope |
| Créditos incluidos | — | 1 | 3 |
| Vigencia del aviso | 90 días | 90 días | 120 días |
| Insignia "precio verificado" | — | — | ✓ |
| Soporte | ayuda en línea | correo | correo prioritario |

`Gratis` no es un período de prueba: es permanente. Es el gancho del Índice y la fuente de la oferta inicial.

### Pista CRECIMIENTO — agentes · mensual

| | **Agente Inicial** | **Agente** ⭐ | **Agente Pro** |
|---|---|---|---|
| Precio mensual | **S/ 69** | **S/ 139** | **S/ 249** |
| Precio anual | S/ 690 | S/ 1,390 | S/ 2,490 |
| Avisos activos | 8 | 20 | 50 |
| Fotos por aviso | 25 | 40 | sin tope |
| Créditos por mes | 2 | 6 | 15 |
| Índice | sin tope | sin tope + histórico | sin tope + histórico + informes |
| Perfil público `/agente/:slug` | ✓ | ✓ | ✓ destacado |
| Bandeja de leads | ✓ | ✓ | ✓ con puntaje |
| Alertas a tus compradores | — | ✓ | ✓ |
| Orden prioritario en resultados | — | +1 | +2 |
| Exportar leads (CSV / CRM) | — | — | ✓ |
| Informes de mercado con tu marca | — | — | ✓ |
| Videollamada de arranque | — | — | ✓ |

⭐ = plan destacado en la comparativa. La mayoría debería terminar acá.

### Pista PREMIUM — inmobiliarias · mensual

| | **Inmobiliaria** | **Inmobiliaria Plus** | **Corporativa** |
|---|---|---|---|
| Precio mensual | **S/ 449** | **S/ 899** | **desde S/ 1,899** |
| Precio anual | S/ 4,490 | S/ 8,990 | a convenir |
| Avisos activos | 100 | 300 | sin tope |
| Asientos de equipo | 3 | 10 | 30+ |
| Créditos por mes | 25 | 60 | 150 |
| Página de agencia | ✓ | ✓ personalizable | ✓ micrositio con tu marca |
| Proyectos con tipologías | 2 | 10 | sin tope |
| Carga masiva (CSV / XML) | — | ✓ | ✓ + API |
| Analítica de equipo | — | ✓ | ✓ + reparto de leads |
| API del Índice | — | — | ✓ |
| Ejecutivo de cuenta | — | — | ✓ |
| Factura por transferencia | ✓ | ✓ | ✓ |

**Corporativa se vende hablando, no por checkout.** `GET /planes` devuelve `contacto: true` y el botón dice "Hablar con ventas". Las empresas grandes en Perú no cargan S/ 1,899 mensuales a una tarjeta.

---

## 4. Prueba gratuita

**14 días del plan Agente, sin tarjeta.** Al vencer baja a `Gratis`: los avisos que exceden el tope pasan a `pausado`, **nunca se borran**.

Pedir tarjeta convierte mejor en ingreso pero hunde el registro, y en Perú la penetración de tarjeta de crédito es baja. Mejor entrar sin fricción y ganárselos con el producto.

**Contra el abuso:** una prueba por correo verificado **y** celular verificado. `suscripciones.estado = 'prueba'` ya está en el esquema.

---

## 5. Créditos Wasipe

### Qué cuesta cada cosa

| Acción | Créditos |
|---|:--:|
| Destacado 7 días (tope de su página de resultados) | 1 |
| Súper destacado 7 días (tope del distrito) | 2 |
| Portada 7 días (carrusel del home) | 3 |
| Aviso extra por 30 días (1 cupo sobre el tope) | 2 |
| Subir al tope de "recientes" | 1 |
| Informe de mercado del distrito con tu marca | 2 |
| Certificación de aviso verificado (visita física) | 6 |

### Paquetes

| Paquete | Precio | Por crédito |
|---|---|---|
| 5 créditos | S/ 99 | S/ 19.80 |
| 15 créditos | S/ 269 | S/ 17.93 |
| 40 créditos | S/ 649 | S/ 16.23 |

Valor de referencia: **1 crédito ≈ S/ 20**.

### Vencimiento

| Origen | Vence |
|---|---|
| Incluidos en el plan | Fin del mes de facturación — se usan o se pierden |
| Comprados | 12 meses |

Se gastan primero los del plan (los que vencen antes), después los comprados. Que los del plan caduquen empuja a usarlos, y un aviso destacado rinde más que un crédito guardado.

**Nunca se devuelven en dinero.** Va en los términos, en claro, antes de comprar.

---

## 6. Lógica de destaques

### Orden de resultados

```sql
ORDER BY
  1. portada          -- solo en el home
  2. super destacado  -- tope de resultados de su distrito
  3. destacado        -- tope de su página de resultados
  4. planes.prioridad_orden           -- +2 Pro, +1 Agente
  5. el orden elegido por el usuario  -- relevancia | precio | recientes
```

### Las dos reglas que evitan que la búsqueda se vuelva un muro de avisos pagos

**1 · Tope de promocionados por página.** Máximo 3 en los primeros 10 resultados y no más del 20% de cualquier página. Si hay más comprados que cupos, entran por rotación.

Urbania se siente spam porque no tiene este límite. Un buscador que parece publicidad pierde compradores, y sin compradores los avisos no valen nada: el tope protege el activo.

**2 · Rotación justa.** Si cinco avisos tienen `super` en Miraflores, el orden entre ellos rota por sesión (semilla estable por usuario y hora). Sin rotación, gana siempre el que compró primero, los demás no ven resultados y no renuevan.

```ts
// Rotación estable dentro del grupo de destacados
const semilla = hash(`${sesionId}:${new Date().getHours()}`);
destacados.sort((a, b) => hash(a.id + semilla) - hash(b.id + semilla));
```

### Reglas

- Solo se destaca un aviso `activo`.
- No se solapan dos destaques del mismo tipo — lo garantiza el `EXCLUDE` de la tabla `destaques`.
- Si el aviso se pausa o cierra, el destaque **se congela** y se reanuda al reactivar. Cobrar por días en que el aviso no se ve genera reclamos justificados.
- Los destacados llevan etiqueta visible (`Destacado`). Ocultar que es publicidad es mala práctica y, según cómo se mire, publicidad encubierta.

---

## 7. Lógica de suscripción

| Evento | Comportamiento |
|---|---|
| **Alta** | Cobro inmediato · `estado='activa'` · `fin = now() + periodo` |
| **Renovación** | Cobro automático 1 día antes de `fin` |
| **Subir de plan** | Inmediato, cobrando la diferencia prorrateada. Los créditos nuevos se acreditan al toque |
| **Bajar de plan** | Al terminar el período. La respuesta avisa qué avisos pasarán a `pausado` |
| **Cancelar** | Se apaga la renovación. **Sigue activa hasta `fin`**, sin devolución proporcional (dicho antes de comprar) |
| **Reactivar** | Antes de `fin`, un clic y sigue |
| **Volver después** | Dentro de 30 días, los avisos vuelven a su estado anterior |

### Cobro fallido: la secuencia que recupera plata

La mayor parte de las bajas no son decisiones, son tarjetas vencidas. Una buena secuencia recupera entre un tercio y la mitad.

```
Día 0   Falla el cobro → estado 'morosa', gracia_hasta = +7 días
        Los avisos SIGUEN publicados.
        Correo: "No pudimos cobrar tu plan. Actualiza tu tarjeta."
Día 1   Reintento automático
Día 3   Reintento + correo con tono más directo
Día 5   Reintento + aviso: "En 2 días tus avisos se pausan"
Día 7   Sin pago → estado 'vencida', avisos a 'pausado' (NO se borran)
Día 30  Correo de recuperación: "Tus 12 avisos siguen guardados"
```

Cortar el día 1 es tirar clientes que sí querían pagar.

---

## 8. Compras únicas

| Producto | Precio | Para quién |
|---|---|---|
| Plan Dueño / Dueño Plus | S/ 39 / S/ 79 | Propietarios |
| Paquetes de créditos | S/ 99 / 269 / 649 | Todos |
| Certificación de aviso verificado | S/ 120 (o 6 créditos) | Todos |
| Sesión de fotos profesional | desde S/ 180 | Comisión del 25% al fotógrafo |
| Tour 360 | desde S/ 250 | Comisión del 25% |

Los dos últimos son **marketplace de servicios**: no los prestás vos, cobrás comisión. Cero costo operativo, buen margen, y mejoran la calidad de los avisos, que es lo que le conviene al portal.

---

## 9. Complementos promocionales

Además de los destaques:

| Complemento | Precio | Qué hace |
|---|---|---|
| **Alerta a compradores** | 2 créditos | Notifica tu aviso a quienes lo tienen en una búsqueda guardada compatible |
| **Informe de mercado con tu marca** | 2 créditos | PDF del índice del distrito con tu logo y tus datos, para mandar a clientes |
| **Insignia de respuesta rápida** | incluida | Automática si respondés leads en <2 h de forma sostenida. **No se vende** — se gana |
| **Aviso extra** | 2 créditos | Un cupo más por 30 días, sin cambiar de plan |

El informe con marca es el complemento más interesante: cuesta casi nada producirlo, usa datos que ya tenés, y convierte tu diferenciador en una herramienta de venta que el agente le muestra a su cliente. Cada informe que circula lleva tu marca.

**La insignia de respuesta rápida no se vende a propósito.** Si se compra, deja de significar algo y el comprador aprende a ignorarla. Las señales de confianza se ganan; en cuanto se venden, se rompen.

---

## 10. Flujo de pago

```
Elige plan
    ↓
POST /suscripciones { plan_slug, periodo, comprobante:{ tipo, dni|ruc } }
    ↓  ← el tipo de comprobante se pide ANTES de pagar: va impreso en él
Crea `pagos` en estado 'pendiente' + orden en Culqi
    ↓
Checkout de Culqi  ·  tarjeta  o  Yape
    ↓
POST /webhooks/culqi   ← función aparte, firma HMAC verificada
    ↓
charge.succeeded ──> activa suscripción · acredita créditos · emite comprobante · correo
charge.failed    ──> 'morosa' + gracia 7 días + secuencia de cobranza
```

### Medios de pago

| Medio | Para quién | Nota |
|---|---|---|
| **Tarjeta** (Culqi) | Todos | Débito y crédito, Visa/Mastercard |
| **Yape** (Culqi) | Todos | Imprescindible en Perú. Muchos agentes no tienen tarjeta de crédito |
| **Transferencia + factura** | Premium | Manual: se emite factura, se concilia y un admin activa |

Stripe no sirve acá: no cubre bien tarjetas peruanas ni Yape.

### Idempotencia

Culqi reenvía webhooks. Ya está resuelto en el esquema:

```sql
CREATE UNIQUE INDEX ux_pagos_proveedor ON pagos (proveedor, proveedor_ref)
  WHERE proveedor_ref IS NOT NULL;
```

El webhook responde **200 siempre que la firma sea válida**, incluso si el evento ya se procesó. Un 500 hace que Culqi reintente en bucle.

---

## 11. Facturación y comprobantes

En Perú toda venta exige comprobante electrónico ante SUNAT. No es opcional.

| | **Boleta** | **Factura** |
|---|---|---|
| Para | Personas (DNI) | Empresas (RUC) |
| Sirve para deducir | No | **Sí** — las inmobiliarias la exigen |
| Serie | `B001` | `F001` |
| Se pide | Antes de pagar | Antes de pagar |

**Emisión vía Nubefact** (OSE económico y con buena API). Alternativas: Bizlinks, Efact.

```
Pago aprobado
   ↓
Genera comprobante: serie + correlativo (bloqueo en base para no duplicar)
   ↓
Envía a Nubefact → firma y remite a SUNAT
   ↓
Guarda pdf_url, xml_url, hash_sunat, estado_sunat
   ↓
Correo al cliente con el PDF adjunto
```

### IGV

Los precios se **muestran con IGV incluido** en toda la web (es lo que exige Indecopi y evita la sorpresa en el checkout). En el comprobante se desglosa:

```
Plan Agente · mensual
  Subtotal      S/ 117.80
  IGV (18%)     S/  21.20
  Total         S/ 139.00
```

`pagos.igv` y los campos de `comprobantes` ya están en el esquema.

### Devoluciones

Se emite **nota de crédito** referida al comprobante original — no se anula ni se borra nada. `comprobantes.tipo = 'nota-credito'` ya está previsto.

### Obligaciones que conviene tener listas

- **Libro de Reclamaciones** digital (obligatorio, hoy es un enlace muerto en tu footer)
- Términos con la política de créditos y devoluciones, en claro
- Precios con IGV incluido a la vista
- Datos del emisor: razón social, RUC y domicilio fiscal en el pie

---

## 12. Base de datos

`planes`, `suscripciones`, `pagos`, `comprobantes` y `destaques` ya cubren casi todo. Falta la billetera de créditos:

```sql
-- migración 003_creditos.sql

CREATE TABLE creditos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  agencia_id   UUID REFERENCES agencias(id) ON DELETE CASCADE,
  cantidad     INTEGER NOT NULL CHECK (cantidad > 0),
  restantes    INTEGER NOT NULL CHECK (restantes >= 0),
  origen       TEXT NOT NULL CHECK (origen IN ('plan','compra','cortesia','reintegro')),
  pago_id      UUID REFERENCES pagos(id) ON DELETE SET NULL,
  vence_en     TIMESTAMPTZ NOT NULL,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_titular_credito CHECK (num_nonnulls(usuario_id, agencia_id) = 1),
  CONSTRAINT ck_restantes CHECK (restantes <= cantidad)
);
-- Consumo FIFO por vencimiento: primero lo que caduca antes
CREATE INDEX ix_creditos_disponibles ON creditos (usuario_id, vence_en)
  WHERE restantes > 0;

CREATE TABLE movimientos_credito (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credito_id   UUID NOT NULL REFERENCES creditos(id) ON DELETE RESTRICT,
  cantidad     INTEGER NOT NULL,          -- negativo = gasto
  concepto     TEXT NOT NULL,             -- 'destacado','aviso-extra','informe'
  propiedad_id UUID REFERENCES propiedades(id) ON DELETE SET NULL,
  destaque_id  UUID REFERENCES destaques(id) ON DELETE SET NULL,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_movim_credito ON movimientos_credito (credito_id, creado_en);

-- Los créditos que trae cada plan cada mes
ALTER TABLE planes ADD COLUMN creditos_mes SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE planes ADD COLUMN contacto_ventas BOOLEAN NOT NULL DEFAULT false;
```

`movimientos_credito` como libro mayor deja el saldo auditable: `restantes` siempre tiene que cuadrar con la suma de movimientos. Cuando alguien reclame "me descontaron créditos que no usé", hay con qué responder.

### Endpoints nuevos

```
GET  /creditos                → { saldo, por_vencer, movimientos[] }
POST /creditos/comprar        → { paquete } → checkout
POST /creditos/gastar         → { concepto, propiedad_id, dias } → consume FIFO
GET  /planes?rol=agente       → filtrado por para_rol
POST /suscripciones/cambiar-plan
```

---

## 13. Orden de construcción

```
FASE 2.1 — cobrar algo
  1. Sembrar los 9 planes en `planes` (es configuración, no código)
  2. Aplicar límites en limites.ts             ← ya diseñado, falta conectarlo
  3. Culqi: checkout + webhook idempotente
  4. Comprobantes con Nubefact
  5. Página /planes filtrada por rol

FASE 2.2 — que se sostenga
  6. Secuencia de cobranza (los 7 días de gracia)
  7. Subir y bajar de plan con prorrateo
  8. Panel de facturación (historial + PDFs)

FASE 2.3 — los créditos
  9. Billetera + libro de movimientos
  10. Destaques desde la tarjeta del aviso, en un clic
  11. Tope de promocionados y rotación justa

FASE 2.4 — el margen
  12. Informes de mercado con marca
  13. Marketplace de servicios (fotografía, tour 360)
  14. Prueba de 14 días
```

**Empezá por el plan Agente a S/ 139.** Un solo plan, un solo precio, cobrando de verdad. Los otros ocho son filas en una tabla que se agregan después, sin tocar código.

---

## 14. Qué esperar

Modelo ilustrativo — **no es una proyección**, es para ver qué palanca mueve más:

| Escenario | Agentes pagos | Ticket medio | MRR |
|---|---|---|---|
| Arranque | 20 | S/ 120 | S/ 2,400 |
| Tracción | 80 | S/ 145 | S/ 11,600 |
| Consolidado | 250 + 8 inmobiliarias | S/ 165 | S/ 46,700 |

Los créditos suelen sumar entre un 15% y un 30% sobre la suscripción, porque se compran por impulso cuando el agente quiere mover un aviso puntual.

**La palanca real no es el precio, es cuántos agentes hay.** Y para que un agente pague hacen falta compradores. Por eso el orden del roadmap importa: primero avisos e Índice para atraer demanda, después cobrar por visibilidad. Cobrar antes de tener tráfico es vender vidrieras en una calle sin gente.

---

## 15. Las cinco decisiones que definen esto

1. **Créditos en vez de comprar cada destaque.** Convierte una compra con checkout en un clic. Es el producto de mayor margen del portal y la fricción es lo único que lo frena.
2. **Los dueños pagan una vez; los agentes se suscriben.** Suscribir a quien vende un solo departamento genera cancelaciones y contracargos.
3. **Tope y rotación de promocionados.** Protege la búsqueda de convertirse en publicidad. Sin compradores, la visibilidad no vale nada.
4. **Siete días de gracia con secuencia de cobranza.** La mayoría de las bajas son tarjetas vencidas, no decisiones.
5. **El Índice como beneficio de plan y como producto.** Es lo único del catálogo que un competidor no consigue con dinero — hay que cobrarlo en varios niveles: consultas, histórico, informes con marca y API.
