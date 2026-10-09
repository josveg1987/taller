// Reglas de calculo del presupuesto. Los montos son pesos chilenos enteros.
// Esta misma funcion se usa en la PWA (total en vivo) y en la API (valor oficial).

export type Operacion = 'reparar' | 'reemplazar';

export interface LineaInput {
  operacion: Operacion;
  /** Tarifa de pintura de la pieza (por defecto la del taller, editable). */
  pintura: number;
  /** Solo aplica al reparar. */
  desabollado?: number;
  /** Costo del repuesto para el taller. Solo aplica al reemplazar. */
  repuestoCosto?: number;
  /** Margen del taller sobre el repuesto, en porcentaje. */
  margenPct: number;
}

export interface LineaCalculada {
  pintura: number;
  desabollado: number;
  repuestoCosto: number;
  repuestoPrecio: number;
  precioTotal: number;
}

export function calcularLinea(l: LineaInput): LineaCalculada {
  const reemplaza = l.operacion === 'reemplazar';
  const repuestoCosto = reemplaza ? (l.repuestoCosto ?? 0) : 0;
  const repuestoPrecio = Math.round(repuestoCosto * (1 + l.margenPct / 100));
  const desabollado = reemplaza ? 0 : (l.desabollado ?? 0);
  return {
    pintura: l.pintura,
    desabollado,
    repuestoCosto,
    repuestoPrecio,
    precioTotal: l.pintura + desabollado + repuestoPrecio,
  };
}

export interface PresupuestoCalculado {
  lineas: LineaCalculada[];
  subtotal: number;
  descuento: number;
  total: number;
  /** Lo que le cuestan los repuestos al taller. Solo vista interna. */
  costoRepuestos: number;
  /** Margen ganado en repuestos. Solo vista interna. */
  gananciaRepuestos: number;
  /** Precio de los repuestos con margen (lo que ve el cliente integrado en la pieza). */
  precioRepuestos: number;
}

export function calcularPresupuesto(
  lineas: LineaInput[],
  descuento = 0,
): PresupuestoCalculado {
  const calc = lineas.map(calcularLinea);
  const subtotal = calc.reduce((s, l) => s + l.precioTotal, 0);
  const costoRepuestos = calc.reduce((s, l) => s + l.repuestoCosto, 0);
  const precioRepuestos = calc.reduce((s, l) => s + l.repuestoPrecio, 0);
  return {
    lineas: calc,
    subtotal,
    descuento,
    total: Math.max(0, subtotal - descuento),
    costoRepuestos,
    precioRepuestos,
    gananciaRepuestos: precioRepuestos - costoRepuestos,
  };
}

export type ReglaAnticipo =
  | { tipo: 'ninguno' }
  | { tipo: 'repuestos' }
  | { tipo: 'porcentaje'; valor: number }
  | { tipo: 'fijo'; valor: number };

/**
 * Monto para iniciar el trabajo. 'repuestos' usa el precio con margen
 * (supuesto a confirmar con el taller: puede que cobren a costo).
 */
export function calcularMontoInicio(
  p: Pick<PresupuestoCalculado, 'total' | 'precioRepuestos'>,
  regla: ReglaAnticipo,
): number {
  switch (regla.tipo) {
    case 'ninguno':
      return 0;
    case 'repuestos':
      return Math.min(p.precioRepuestos, p.total);
    case 'porcentaje':
      return Math.round((p.total * regla.valor) / 100);
    case 'fijo':
      return Math.min(regla.valor, p.total);
  }
}
