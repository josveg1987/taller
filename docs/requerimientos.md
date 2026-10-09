# Requerimientos del MVP — Presupuestos

## Contexto
- Taller piloto: desabolladura y pintura. No trabaja con aseguradoras.
- Hoy cotiza en un Excel básico (ver "Presupuesto actual" abajo). Meta: reemplazarlo.
- Usuarios: máximo 2 por taller. Los presupuestos los hace el dueño.
- Volumen: ~3–4 presupuestos por semana; se aceptan entre 1 y todos.
- Solo cotizar: no se emiten boletas ni facturas. Sin IVA por ahora.
- El cliente final **solo recibe un PDF**; no instala nada ni usa portal.
- Plataforma: PWA usada desde celular (al lado del auto) y computador.

## Presupuesto actual (Excel del piloto)
Cabecera del taller; datos del cliente y vehículo (casi siempre vacíos); "Mano de obra" como un
monto global ($1.000.000) con descripción en texto; "Repuestos" por pieza; total. Sin número,
sin validez, sin condiciones, sin forma de pago.

## Reglas de negocio
- **Cobro por pieza.** Pintura = tarifa fija por pieza (hoy $80.000, configurable por taller y
  editable por pieza). Desabollado = monto variable según el daño, ingresado a mano.
- Por pieza se elige **reparar** (pintura + desabollado) o **reemplazar** (pintura + repuesto).
- El taller **compra los repuestos y les agrega margen** (% por defecto configurable, editable).
- El cliente ve **un precio por pieza** ("trabajo vendido"), sin separar materiales ni desglose.
  La **vista interna** muestra costo del repuesto, margen y ganancia; nunca aparece en el PDF.
- **Anticipo**: hoy piden por adelantado el dinero de los repuestos; están evaluando pedir
  anticipo. Regla configurable por taller: ninguno / monto de repuestos / % del total / monto fijo.
  El PDF muestra "Para iniciar el trabajo: $X". Por defecto: monto de repuestos.
- Supuesto a confirmar: el anticipo "de repuestos" se calcula con el precio con margen (puede que
  cobren a costo).
- Estados del presupuesto: Borrador → Enviado → Aceptado / Rechazado / Vencido. El taller los
  marca **a mano**. Cada cambio queda en un historial con fecha.
- Numeración correlativa automática por taller. Fecha de validez por defecto configurable.
- Un cliente puede tener varios vehículos; un cliente y un vehículo pueden tener varios presupuestos.
- Campos obligatorios mínimos al crear: patente, nombre y teléfono del cliente. Lo demás es opcional.
- Piezas estándar de carrocería (nombres editables por taller): parachoques delantero/trasero,
  capot, tapabarro delantero, puerta delantera/trasera, costado trasero, zócalo, espejo, techo,
  maleta/portalón, alerón, tolva. Se modelan como **pieza + posición** (izquierda/derecha/no aplica).

## Historias de usuario del MVP

### Configuración del taller
- HU-20 Datos del taller (nombre, logo, dirección, teléfono).
- HU-37 Datos de transferencia (aparecen en el PDF).
- HU-16 Catálogo de piezas con tarifa de pintura por defecto.
- HU-31 Margen % por defecto de repuestos.
- HU-34 Regla de anticipo por defecto.
- HU-29 Condiciones y validez por defecto (editables por presupuesto).
- HU-33 Montos rápidos de desabollado (ej. 30/60/100 mil), configurables.
- HU-38 Combos de piezas frecuentes (ej. "lateral completo"), configurables.

### Clientes y vehículos
- HU-01 Registrar cliente. HU-02 Registrar vehículo. HU-03 Buscar por patente, nombre o teléfono.

### Presupuesto
- HU-05 Crear presupuesto para un vehículo (numeración automática, HU-28).
- HU-06 Agregar piezas desde el catálogo (pieza + posición, con botones, no listas desplegables).
- HU-07 Por pieza: reparar (monto de desabollado) o reemplazar (costo del repuesto).
- HU-08 Pintura con tarifa automática, editable.
- HU-09 Ítems libres. HU-10 Totales y descuento. HU-13 Observaciones.
- HU-30 Campos obligatorios mínimos. HU-32 Vista interna (costo, margen, ganancia).
- HU-35 "Para iniciar el trabajo: $X".
- HU-43 Seguir armando presupuestos sin conexión o con el servidor lento (borradores locales).

### Salida y seguimiento
- HU-21 Generar el PDF. HU-22 Compartirlo por WhatsApp (Web Share API en celular; descarga en PC).
- HU-23 Marcar estados a mano. HU-24 Listado con filtros por estado y fecha.

### Historiales y reportes
- HU-39 Historial por cliente (totales cotizado y aceptado).
- HU-40 Historial por vehículo (por patente, aunque haya cambiado de dueño). Cubre HU-04.
- HU-41 Resumen del mes: cantidad, monto cotizado, monto aceptado, tasa de aceptación.
- HU-42 Presupuestos pendientes o por vencer (para hacer seguimiento).

## Flujo de "Nuevo presupuesto" (3 pasos, móvil)
1. **Patente** → carga vehículo y cliente si existen; si es nuevo, solo nombre y teléfono.
2. **Piezas** → elegir lado una vez y tocar piezas; atajos de combos. Cada pieza entra como
   "reparar + pintura".
3. **Ajustar** → por pieza reparar/cambiar, botones de desabollado, costo de repuesto (+margen).
   Total en vivo. Botón "Compartir PDF". Guardado automático como borrador.
Meta: ~15–20 toques por presupuesto.

## Contenido del PDF
Datos del taller y logo; N° de presupuesto, fecha y validez; cliente y vehículo; una línea por
pieza con su precio; total; "Para iniciar el trabajo"; datos de transferencia; condiciones
(plazo, daños ocultos se cotizan aparte).

## Fuera del MVP (fases posteriores)
Fotos del daño (HU-11), duplicar presupuesto (HU-14), diagrama del auto (HU-15), registro de pagos
y saldo (HU-36), versiones (HU-26), recargos por tipo de pintura/tamaño (HU-17/18), actualización
masiva de precios (HU-19), aceptación por enlace (HU-25), orden de trabajo (HU-27), módulo de
mecánica, facturación/SII, ganancia por período, exportar a Excel, completar vehículo por patente.

## Preguntas abiertas con el taller piloto
1. ¿Los $80.000 de pintura son iguales para toda pieza? ¿Cambian por tamaño (techo, capot),
   camioneta o pintura metalizada?
2. ¿Cómo decide el monto de desabollado? ¿Tiene rangos en la cabeza?
3. ¿El anticipo de repuestos es a costo o con margen?
4. ¿Qué nombres de piezas usan? ¿Falta alguna que pinten seguido?
5. ¿Qué es lo que más le molesta o le quita tiempo hoy al presupuestar?
