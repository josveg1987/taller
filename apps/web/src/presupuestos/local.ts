import Dexie, { type Table } from 'dexie';
import type { Borrador } from './tipos';

interface EntradaCache {
  clave: string;
  datos: unknown;
  actualizado: number;
}

/**
 * Base local del telefono (IndexedDB con Dexie): borradores de presupuestos y una copia de la
 * configuracion para seguir trabajando sin señal (HU-43). El servidor es la fuente de verdad; al cerrar
 * sesion esta base se borra completa (datosLocales.ts).
 */
class BaseLocal extends Dexie {
  borradores!: Table<Borrador, string>;
  cache!: Table<EntradaCache, string>;

  constructor() {
    super('taller-local');
    this.version(1).stores({ borradores: 'id, tallerId, actualizado', cache: 'clave' });
  }
}

export const baseLocal = new BaseLocal();

// Si el navegador bloquea IndexedDB (modo privado, almacenamiento lleno), se usa memoria: la app
// funciona igual, solo que el borrador no sobrevive a cerrar la pagina.
const enMemoria = new Map<string, Borrador>();
const cacheEnMemoria = new Map<string, unknown>();

export async function guardarBorrador(b: Borrador): Promise<void> {
  const conFecha = { ...b, actualizado: Date.now() };
  enMemoria.set(b.id, conFecha);
  try {
    await baseLocal.borradores.put(conFecha);
  } catch {
    // Queda en memoria.
  }
}

export async function leerBorrador(id: string): Promise<Borrador | undefined> {
  try {
    return (await baseLocal.borradores.get(id)) ?? enMemoria.get(id);
  } catch {
    return enMemoria.get(id);
  }
}

/** Borradores del taller, del mas reciente al mas antiguo. */
export async function listarBorradores(tallerId: string): Promise<Borrador[]> {
  let lista: Borrador[];
  try {
    lista = await baseLocal.borradores.where('tallerId').equals(tallerId).toArray();
  } catch {
    lista = [...enMemoria.values()].filter((b) => b.tallerId === tallerId);
  }
  return lista.sort((x, y) => y.actualizado - x.actualizado);
}

export async function borrarBorrador(id: string): Promise<void> {
  enMemoria.delete(id);
  try {
    await baseLocal.borradores.delete(id);
  } catch {
    // Nada que borrar.
  }
}

export async function guardarEnCache(clave: string, datos: unknown): Promise<void> {
  cacheEnMemoria.set(clave, datos);
  try {
    await baseLocal.cache.put({ clave, datos, actualizado: Date.now() });
  } catch {
    // Queda en memoria.
  }
}

export async function leerDeCache<T>(clave: string): Promise<T | undefined> {
  try {
    const e = await baseLocal.cache.get(clave);
    return (e?.datos ?? cacheEnMemoria.get(clave)) as T | undefined;
  } catch {
    return cacheEnMemoria.get(clave) as T | undefined;
  }
}

/** Al cerrar sesion: olvida todo lo guardado en este telefono. */
export async function vaciarBaseLocal(): Promise<void> {
  enMemoria.clear();
  cacheEnMemoria.clear();
  try {
    await baseLocal.delete();
  } catch {
    // El navegador no deja: se borra con el resto en datosLocales.ts.
  }
}
