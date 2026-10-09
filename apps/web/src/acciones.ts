import { useCallback, useState } from 'react';
import { ApiError } from './api';

/** Ejecuta una accion y devuelve true si salio bien. El error o el aviso quedan en el estado. */
export type Ejecutar = (accion: () => Promise<unknown>, exito?: string) => Promise<boolean>;

export const mensajeDe = (e: unknown, defecto: string) => (e instanceof ApiError ? e.message : defecto);

/** Maneja el mensaje de error / exito de las acciones de una pantalla y recarga sus datos al terminar. */
export function useAcciones(recargar: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const ejecutar: Ejecutar = useCallback(
    async (accion, exito) => {
      setError(null);
      setAviso(null);
      try {
        await accion();
        if (exito) setAviso(exito);
        recargar();
        return true;
      } catch (e) {
        setError(mensajeDe(e, 'No se pudo completar la acción'));
        return false;
      }
    },
    [recargar],
  );

  const limpiarError = useCallback(() => setError(null), []);

  return { error, aviso, ejecutar, limpiarError };
}
