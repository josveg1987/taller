import type { Zona } from '@taller/shared';

// Deben coincidir con apps/api/src/piezas/piezas.service.ts y combos.service.ts.
export interface Pieza {
  id: string;
  nombre: string;
  usaPosicion: boolean;
  /** null = usa la tarifa de pintura del taller. */
  tarifaPintura: number | null;
  /** Monto con que parte el desabollado al reparar la pieza (editable en el presupuesto); null = sin sugerencia. */
  desabolladoSugerido: number | null;
  /** Zona del plano del auto (null = no esta en el dibujo, solo en la lista). */
  zona: Zona | null;
  activa: boolean;
  orden: number;
}

export interface Combo {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
  piezas: { id: string; nombre: string; usaPosicion: boolean }[];
}
