/**
 * Borra todo lo guardado en el dispositivo (regla: al cerrar sesion se borran los datos locales).
 * Hoy limpia preferencias y cualquier base IndexedDB; los borradores locales (Fase 5) viviran ahi.
 */
export async function limpiarDatosLocales(): Promise<void> {
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
