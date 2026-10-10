# Vega · Prototipo navegable (traspaso a Claude Code)

`index.html` es el diseño final ("Naranja iOS + Hogar", encabezado azul oscuro) funcionando con datos de ejemplo.
Ábrelo en el navegador (en escritorio muestra un panel para saltar entre pantallas). **Es una referencia visual y de comportamiento, no código para copiar tal cual.**

## Prioridad de reglas
1. El `CLAUDE.md` del proyecto ("Diseño móvil") manda si algo choca con este documento.
2. Luego este prototipo. 3. Tu criterio, sin agregar dependencias.

## Qué implementar
Reemplazar la capa visual de la app actual para que se vea y se comporte como el prototipo, **conservando** la lógica, datos, API y rutas existentes. Sin librerías nuevas: CSS con variables, system-ui.

## Qué NO copiar
- El estado en memoria (`S`), el `render()` por strings y el "router" (`go()`): son solo para la demo.
- El panel lateral de pantallas y el marco de teléfono (solo escritorio, solo demo).
- Los datos de ejemplo y los textos "Esta parte queda fuera del prototipo".

## Tokens (todos como variables CSS en `:root`, ver bloque al inicio de `index.html`)
| Variable | Valor | Uso |
|---|---|---|
| --navy-950 / 900 / 700 | #0B1424 / #11223D / #1E3556 | Encabezado (degradado), barra inferior, texto |
| --accent | #C2410C | Botón principal, pestaña activa, foco (contraste 5.2:1 con blanco) |
| --accent-on-dark | #F0612E | Pasos completados sobre fondo oscuro |
| --tint / --tint-ink | #FBE3D9 / #8F2F06 | Chips, selección, íconos |
| --bg / --surface / --field | #F7F3F0 / #FFF / #FBF9F7 | Fondo, tarjetas, campos |
| --muted / --line / --border | #5B6472 / #EEE9E0 / #D6D0C5 | Texto secundario, divisores, bordes |
| --danger / --disabled | #B42318 / #AEB4BE | Errores/Quitar, botón deshabilitado |
| Estados | Borrador gris, Enviado ámbar, Aprobado verde | `.status`, `.status--warn`, `.status--ok` |
Radios 7/12/16/22/24/28/36/pill · sombras card/float/nav/bar · gutter 20px · objetivo táctil 48px (mínimo 44).

## Componentes (clase → uso)
- `.hdr` encabezado con degradado, logo, avatar, título 32px; `.steps__*` indicador "Paso N de 3"; `.backbtn` volver.
- `.float` tarjeta blanca que se superpone al encabezado (margen negativo −44px); el encabezado deja 64px de padding inferior para eso.
- `.card`, `.card--flush` + `.row` listas en tarjeta (filas de 56px+, divisor, chevron).
- `.btn--primary` (una acción principal ancha por pantalla), `--secondary`, `--soft`, `--link`; `[disabled]` gris.
- `.input` (16px, 52px alto, foco naranja 2px), `.field` con etiqueta/ayuda/error, `.search`, `.seg` (Reparar/Cambiar, Izquierdo/Derecho), `.chip`, `.tile` (pieza seleccionable), `.toggle` (switch), `.plate` (patente).
- `.tabbar` barra flotante azul con pestaña activa naranja (Presupuestos, Clientes, Mi taller); **se oculta dentro del asistente**.
- `.actionbar` barra inferior del asistente: resumen (N piezas + total) y botón Siguiente / Guardar presupuesto.
- `.sheet` + `.scrim` hoja inferior (Editar pieza); `.toast` aviso breve.

## Pantallas (botones "saltar" del panel)
| Prototipo | Pantalla de la app |
|---|---|
| Ingreso | Login: logo vertical sobre fondo oscuro, tarjeta con correo/contraseña (Mostrar/Ocultar) |
| Presupuestos | Inicio: Nuevo presupuesto, borradores sin guardar, recientes con estado |
| 1 · Buscar vehículo / Cliente nuevo | Paso 1: buscar por patente o nombre, o crear cliente + vehículo |
| 2 · Piezas | Paso 2: lado, combo "Lateral completo", piezas activas |
| 3 · Ajustar | Paso 3: por pieza Reparar/Cambiar, pintura, desabollado (chips $30.000/$60.000/$100.000) o repuesto |
| Clientes / Cliente / Nuevo cliente | Lista con buscador, ficha (llamar, WhatsApp, vehículos), formulario |
| Mi taller / Piezas / Editar pieza | Datos del taller, lista de piezas, hoja de edición (subir/bajar) |

## Comportamientos a respetar
- Precio de línea = pintura + (desabollado si Reparar, repuesto si Cambiar). Total = suma. La pintura parte con la tarifa propia de la pieza o la del taller ($80.000).
- Piezas "por lado" se agregan del lado elegido; el combo agrega las piezas del combo.
- Siguiente deshabilitado hasta que haya datos válidos (cliente nuevo: nombre, teléfono y patente; piezas: al menos una).
- Atrás: Buscar→Presupuestos, Piezas→Vehículo, Ajustar→Piezas; la barra de pestañas vuelve fuera del asistente.
- Errores de formulario junto al campo, en texto (no solo color). Hoja: Esc y toque en el fondo la cierran.
- Teléfonos de ejemplo van como enlace `tel:`/WhatsApp.

## Pasos sugeridos
1. Pasar los tokens a un archivo CSS global y reemplazar los colores/radios actuales.
2. Armar los componentes base (botón, campo, tarjeta/fila, chip, segmentado, hoja, barras) reutilizables.
3. Migrar pantalla por pantalla en este orden: Login → Presupuestos → asistente (1, 2, 3) → Clientes → Mi taller/Piezas.
4. Íconos y manifest (abajo). 5. Revisar contra los criterios.

## Criterios de aceptación
- Sin horizontal scroll a 360px; áreas táctiles ≥48px; inputs 16px (sin zoom en iOS); contraste ≥4.5:1.
- Respeta safe areas (barras inferiores con `env(safe-area-inset-bottom)`).
- Foco visible, `aria-label` en botones de ícono, `prefers-reduced-motion` respetado.
- Ninguna dependencia nueva; todo el color sale de variables.

## Íconos de la PWA (`assets/icons/`)
```html
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">
<meta name="theme-color" content="#11223D">
```
```json
"background_color":"#11223D","theme_color":"#11223D",
"icons":[{"src":"/icons/icon-192.png","sizes":"192x192","type":"image/png"},
{"src":"/icons/icon-512.png","sizes":"512x512","type":"image/png"},
{"src":"/icons/icon-maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]
```
Logos: `assets/logo-horizontal-oscuro.svg` (encabezado), `assets/logo-vertical-oscuro.svg` (login).

## Prompt para pegar en Claude Code
> Lee `proto/HANDOFF.md` y abre `proto/index.html` como referencia visual. Revisa la app actual y propón un plan breve para llevar su interfaz a ese diseño (tokens, componentes, orden de pantallas), respetando el CLAUDE.md "Diseño móvil" y sin nuevas dependencias. Cuando yo apruebe el plan, impleméntalo pantalla por pantalla manteniendo la lógica existente, y al final revisa los criterios de aceptación.
