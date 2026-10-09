# Modelo de datos

Implementado en `apps/api/migrations/1791562700525_modelo-inicial.sql` (Fase 2a). El SQL manda; este
esquema es un resumen. Todas las tablas de negocio llevan `taller_id` (también las líneas y el
historial) y Row Level Security. Las llaves foráneas incluyen `taller_id`, así un registro no puede
apuntar a otro taller. Montos en CLP enteros. Diferencias con el borrador original: `usuarios.activo`,
`presupuestos.condiciones`, `taller_id` en `presupuesto_lineas` e `historial_estados`, y anticipo del
taller como `anticipo_tipo` + `anticipo_valor`.

```
Taller ─┬─< Usuarios
        ├─< Clientes ─< Vehículos
        ├─< Piezas (catálogo)
        └─< Presupuestos ─< Líneas
                 ├── pertenece a 1 Cliente
                 ├── pertenece a 1 Vehículo
                 └─< Historial de estados
```

```
talleres            id, nombre, logo_key, direccion, telefono, datos_transferencia,
                    tarifa_pintura, margen_repuestos_pct, regla_anticipo (tipo, valor),
                    validez_dias, condiciones, siguiente_numero, montos_desabollado[],
                    combos (jsonb)

usuarios            id, taller_id, nombre, email, password_hash, rol

clientes            id, taller_id, nombre, telefono, rut?, email?, direccion?

vehiculos           id, taller_id, cliente_id, patente, marca?, modelo?, anio?, color?
                    (patente única por taller)

piezas              id, taller_id, nombre, usa_posicion, tarifa_pintura?, activa, orden

presupuestos        id, taller_id, numero, cliente_id, vehiculo_id, fecha, valido_hasta,
                    estado, descuento, total, monto_inicio, costo_repuestos,
                    observaciones, creado_por
                    (numero único por taller)

presupuesto_lineas  id, presupuesto_id, pieza_id?, nombre_pieza, posicion,
                    operacion (reparar | reemplazar | libre), pintura, desabollado,
                    repuesto_costo, margen_pct, precio_total, orden

historial_estados   id, presupuesto_id, estado, fecha, usuario_id
```

## Decisiones clave
1. El presupuesto guarda `cliente_id` **y** `vehiculo_id` del momento: si el auto cambia de dueño,
   los presupuestos antiguos quedan con el cliente anterior.
2. Las líneas guardan nombre y montos como se cotizaron (snapshot).
3. Totales, costo de repuestos y monto de inicio se calculan en el servidor y se guardan,
   para que los reportes sean simples y rápidos.
4. El historial de estados permite medir tasa de aceptación y tiempos de decisión.
5. **SQL puro** (decidido 2026-10-09, sin ORM). Migraciones en archivos `.sql` versionados en
   `apps/api/migrations/`, ejecutadas con `node-pg-migrate`. Consultas con `pg` y parámetros.

## Reportes
- MVP: R1 historial por cliente · R2 historial por vehículo · R3 resumen por período con tasa de
  aceptación · R4 pendientes y por vencer.
- Fase 2: ganancia en repuestos por período · piezas más cotizadas · exportar a Excel/CSV.
