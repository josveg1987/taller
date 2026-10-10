# Marca de cada taller: qué se necesita

Referencia: el paquete de Vega (`vega-logo-pack/`) y el prototipo (`prototipoUI/`). Este documento anota qué
material hay que pedirle a un taller nuevo (pintura o mecánica) para que la app, el PDF y el ícono salgan con su marca.
Aún no está implementado: se hará en la etapa "por taller" del plan de interfaz (rubro, logo y colores).

## Qué descubrimos en el paquete de Vega

- Los logos SVG son **solo trazos** (sin texto, fuentes, imágenes ni scripts), así que son seguros y escalan bien.
- Todas las variantes (color, oscuro, grises, negro, blanco…) tienen **exactamente la misma forma** y solo cambian
  los colores. El SVG está dividido en grupos con nombre: `icono` (4 trazos: 2 de marca y 2 de acento), `nombre`,
  `eslogan` y `linea`. Por eso **un solo logo maestro más 3 colores** permiten generar todas las variantes.
- Hay versión para fondo claro (`horizontal-color-naranja`, `grises`, `negro`) y para fondo oscuro
  (`horizontal-fondo-oscuro-naranja`). La primera sirve para el PDF y la segunda para el encabezado de la app.
- Íconos de la app: la **V** (monograma) se lee mejor en tamaños chicos; el auto se lee peor (lo dice el `LEEME`).
  Hay variantes de fondo (azul, naranja, blanco). El ícono "maskable" de Android lleva margen de seguridad.

## Lo que se le pide a cada taller (kit mínimo)

| # | Material | Obligatorio | Para qué se usa |
|---|---|---|---|
| 1 | **Logo horizontal en SVG**, vectorial, fondo transparente, con `viewBox`, menos de 100 KB, **dividido en grupos con nombre** (`icono`, `nombre`, y si los tiene `eslogan` y `linea`) | Sí | Encabezado de la app y PDF. De él se generan las versiones de color, fondo oscuro, fondo claro y una tinta |
| 2 | **Color de marca** (el oscuro: texto, encabezado, barra inferior) | Sí | Fondo del encabezado y la barra; el sistema deriva los tonos |
| 3 | **Color de acento** (botones, pestaña activa, selección) con contraste **mínimo 4,5:1 sobre blanco** (en Vega: `#C2410C`; el naranja del logo, `#DE4B20`, solo llega a 4,1:1 y se usa solo en gráficos) | Sí | Botón principal, foco, selección |
| 4 | Color del acento **sobre fondo oscuro** (en Vega: `#F0612E`) | Opcional (se deriva) | Pasos completados, logo en encabezado |
| 5 | **Ícono de la app** cuadrado en SVG (monograma o símbolo, legible a 48 px) | Sí | Pantalla de inicio del celular, favicon. Se generan PNG de 192, 512, maskable 512, apple-touch 180 y favicon |
| 6 | Logo **vertical** en SVG | Opcional (si falta, se usa el horizontal) | Pantalla de ingreso |
| 7 | Nombre, dirección, teléfono y datos de transferencia | Sí | Encabezado del PDF y datos de pago (ya existen en "Mi taller") |
| 8 | **Rubro**: pintura o mecánica | Sí | Decide la interfaz y el catálogo |

Lo que el sistema genera solo, sin pedirlo: logo para fondo claro y para fondo oscuro, versión de una tinta (PDF en
blanco y negro), tonos derivados de la paleta (con `color-mix` de CSS) y los PNG del ícono.

## Reglas de seguridad y calidad al subir un logo

- Rechazar SVG con `<script>`, `<foreignObject>`, atributos `on…`, enlaces externos o imágenes incrustadas.
- Limitar el tamaño (100 KB) y exigir `viewBox`.
- Mostrarlo con `<img>` (así un SVG nunca ejecuta código) y en el PDF con el SVG ya limpio.
- Validar el contraste del acento contra blanco (4,5:1) antes de guardar la paleta.
- **Quién lo edita: solo el administrador de la APP** (decidido). Desde el panel de talleres, al dar de alta o editar
  un taller. El administrador de un taller edita sus datos (nombre, dirección, teléfono, transferencia, tarifas) pero
  no su marca. Razón: la marca sale en el PDF del cliente y solo el administrador de la APP valida contraste y
  seguridad del SVG; se define una vez por taller.

## Pendiente de decidir: el ícono de la app por taller

El ícono y el nombre con que se instala la app están en un solo archivo (`manifest`), igual para todos. Para que
cada taller tenga el suyo hay dos caminos, que se verán después:
1. **Manifest por taller**: la API entrega un `manifest` distinto según la dirección con que se abre (por ejemplo un
   subdominio por taller). Requiere dominio propio.
2. **Un ícono único del producto**, y la marca del taller solo dentro de la app y en el PDF.

Mientras tanto, el piloto usa el ícono de Vega.
