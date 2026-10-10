import logoHorizontal from './marca/vega/logo-horizontal.svg';
import logoVertical from './marca/vega/logo-vertical.svg';

/** Logos para fondo oscuro (encabezado y portada). */
export interface Marca {
  nombre: string;
  logoHorizontal: string;
  logoVertical: string;
}

const VEGA: Marca = { nombre: 'Vega', logoHorizontal, logoVertical };

/**
 * Marca con que se ve la app. Hoy es siempre la de Vega (taller piloto); cuando exista la marca por
 * taller (docs/marca-por-taller.md) saldra del taller de la sesion y este sera el unico lugar a cambiar.
 */
export const useMarca = (): Marca => VEGA;
