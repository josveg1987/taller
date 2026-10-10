import { calcularMontoInicio, calcularPresupuesto, type PresupuestoCalculado, type ReglaAnticipo } from '@taller/shared';
import type { Borrador, ConfigTaller, LineaBorrador } from './tipos';

export interface Totales extends PresupuestoCalculado {
  montoInicio: number;
}

function regla(c: ConfigTaller): ReglaAnticipo {
  if (c.anticipo.tipo === 'porcentaje') return { tipo: 'porcentaje', valor: c.anticipo.valor ?? 0 };
  if (c.anticipo.tipo === 'fijo') return { tipo: 'fijo', valor: c.anticipo.valor ?? 0 };
  return { tipo: c.anticipo.tipo };
}

/**
 * Totales en vivo con las MISMAS reglas que usa el servidor (@taller/shared). Son una vista previa:
 * al guardar, el servidor recalcula y su resultado es el oficial.
 */
export function calcularTotales(lineas: LineaBorrador[], descuento: number, config: ConfigTaller): Totales {
  const calc = calcularPresupuesto(
    lineas.map((l) => ({
      operacion: l.operacion,
      pintura: l.pintura,
      desabollado: l.desabollado,
      repuestoCosto: l.repuestoCosto,
      margenPct: l.margenPct,
      precio: l.precio,
    })),
    Math.min(descuento, Number.MAX_SAFE_INTEGER),
  );
  return { ...calc, montoInicio: calcularMontoInicio(calc, regla(config)) };
}

/** Lo que se envia a la API. Los totales no se mandan: los calcula el servidor. */
export function aEnvio(b: Borrador, condicionesTaller: string) {
  const anio = b.nuevo.anio.trim() ? Number(b.nuevo.anio) : null;
  const vehiculoNuevo = {
    patente: b.patente,
    marca: b.nuevo.marca.trim() || null,
    modelo: b.nuevo.modelo.trim() || null,
    anio,
  };
  return {
    ...(b.vehiculo
      ? { vehiculoId: b.vehiculo.id }
      : b.clienteExistente
        ? { vehiculo: vehiculoNuevo, clienteId: b.clienteExistente.id }
        : { vehiculo: vehiculoNuevo, cliente: { nombre: b.nuevo.nombre, telefono: b.nuevo.telefono } }),
    lineas: b.lineas.map((l) => ({
      piezaId: l.piezaId,
      nombre: l.nombre,
      posicion: l.posicion,
      operacion: l.operacion,
      pintura: l.pintura,
      desabollado: l.desabollado,
      repuestoCosto: l.repuestoCosto,
      margenPct: l.margenPct,
      ...(l.operacion === 'libre' ? { precio: l.precio } : {}),
    })),
    descuento: b.descuento,
    observaciones: b.observaciones.trim() || null,
    condiciones: b.condiciones ?? condicionesTaller,
  };
}

/** Patente como la guarda el servidor: mayusculas, sin espacios ni guiones. */
export const normalizarPatente = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '');
