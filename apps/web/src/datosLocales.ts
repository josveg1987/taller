import { vaciarBaseLocal } from './presupuestos/local';

/**
 * Borra todo lo guardado en el dispositivo (regla: al cerrar sesion se borran los datos locales):
 * preferencias, borradores de presupuestos y la copia de la configuracion (IndexedDB).
 */
export async function limpiarDatosLocales(): Promise<void> {
  // Primero la base de borradores, que esta abierta: si no, el navegador no deja borrarla.
  await vaciarBaseLocal();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // El navegador puede bloquear el almacenamiento (modo privado): no es un error.
  }
  try {
    const bases = (await indexedDB.databases?.()) ?? [];
    await Promise.all(
      bases.map(
        (b) =>
          new Promise<void>((resolver) => {
            if (!b.name) return resolver();
            const peticion = indexedDB.deleteDatabase(b.name);
            peticion.onsuccess = peticion.onerror = peticion.onblocked = () => resolver();
          }),
      ),
    );
  } catch {
    // Sin IndexedDB no hay nada que borrar.
  }
}
