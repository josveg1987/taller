import { api } from '../api';
import { guardarEnCache, leerDeCache } from './local';
import type { ComboCatalogo, ConfigTaller, PiezaCatalogo } from './tipos';

export interface DatosPresupuesto {
  config: ConfigTaller;
  piezas: PiezaCatalogo[];
  combos: ComboCatalogo[];
  /** true si no hubo conexion y se usa la ultima copia guardada en el telefono. */
  desdeCopia: boolean;
}

/**
 * Configuracion, piezas y combos del taller para armar un presupuesto. Si no hay conexion usa la
 * ultima copia guardada en el telefono, asi se puede seguir armando sin señal (HU-43).
 */
export async function cargarDatosPresupuesto(tallerId: string): Promise<DatosPresupuesto> {
  const clave = `datos-presupuesto-${tallerId}`;
  try {
    const [config, piezas, combos] = await Promise.all([
      api<ConfigTaller>('/taller'),
      api<PiezaCatalogo[]>('/piezas'),
      api<ComboCatalogo[]>('/combos'),
    ]);
    const datos = { config, piezas, combos: combos.filter((c) => c.activo) };
    await guardarEnCache(clave, datos);
    return { ...datos, desdeCopia: false };
  } catch (e) {
    const copia = await leerDeCache<Omit<DatosPresupuesto, 'desdeCopia'>>(clave);
    if (copia) return { ...copia, desdeCopia: true };
    throw e;
  }
}
