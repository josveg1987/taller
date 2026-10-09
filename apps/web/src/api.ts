export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    /** 0 = no hubo respuesta (sin internet o servidor caido). */
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Opciones extends Omit<RequestInit, 'body'> {
  json?: unknown;
}

/** Llama a la API enviando la cookie de sesion. Los errores salen como ApiError en espanol. */
export async function api<T = void>(ruta: string, { json, headers, ...resto }: Opciones = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + ruta, {
      credentials: 'include',
      ...resto,
      headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor');
  }
  if (res.status === 204) return undefined as T;
  const cuerpo: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const mensaje = (cuerpo as { message?: unknown } | null)?.message;
    throw new ApiError(res.status, typeof mensaje === 'string' ? mensaje : 'Ocurrió un error inesperado');
  }
  return cuerpo as T;
}
