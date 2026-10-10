import { api } from '../api';

export interface ItemCatalogo {
  id: number;
  nombre: string;
}

// El catalogo casi no cambia (se actualiza una vez al año): se guarda cada respuesta en memoria
// mientras la app esta abierta, para no repetir llamadas al escribir y borrar.
const cache = new Map<string, Promise<unknown>>();

function pedir<T>(ruta: string): Promise<T> {
  let p = cache.get(ruta);
  if (!p) {
    p = api<T>(ruta).catch((e: unknown) => {
      cache.delete(ruta); // un error no se recuerda
      throw e;
    });
    cache.set(ruta, p);
  }
  return p as Promise<T>;
}

export const buscarMarcas = (q: string) => pedir<ItemCatalogo[]>(`/catalogo/marcas?q=${encodeURIComponent(q)}`);

export const buscarModelos = (marcaId: number, q: string, anio?: number) =>
  pedir<ItemCatalogo[]>(`/catalogo/modelos?marcaId=${marcaId}&q=${encodeURIComponent(q)}${anio ? `&anio=${anio}` : ''}`);

export const buscarAnios = (filtro: { modeloId: number } | { marcaId: number }) =>
  pedir<number[]>('modeloId' in filtro ? `/catalogo/anios?modeloId=${filtro.modeloId}` : `/catalogo/anios?marcaId=${filtro.marcaId}`);

/**
 * Marcas (o, con `marca`, modelos de esa marca) que este taller ya registro en sus vehiculos. Pueden
 * no estar en el catalogo (p. ej. un modelo del año nuevo). No se guarda en cache: cambia al guardar.
 */
export const buscarPropios = (marca: string | null, q: string) =>
  api<string[]>(`/catalogo/propios?q=${encodeURIComponent(q)}${marca ? `&marca=${encodeURIComponent(marca)}` : ''}`);

/** Para comparar lo escrito con el catalogo: sin tildes, sin mayusculas y sin espacios de sobra. */
export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
