# Modelo de datos (borrador para Fase 2)

Todas las tablas de negocio llevan `taller_id` y Row Level Security. Montos en CLP enteros.

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
5. Usar Prisma o Drizzle con migraciones versionadas en el repo (decidir en Fase 2).

## Reportes
- MVP: R1 historial por cliente · R2 historial por vehículo · R3 resumen por período con tasa de
  aceptación · R4 pendientes y por vencer.
- Fase 2: ganancia en repuestos por período · piezas más cotizadas · exportar a Excel/CSV.
