import { useSyncExternalStore } from 'react';

// Navegacion minima con el hash de la URL (#/talleres/123). Evita una dependencia de router y no
// necesita reglas de reescritura en el hosting estatico.
const suscribir = (aviso: () => void) => {
  window.addEventListener('hashchange', aviso);
  return () => window.removeEventListener('hashchange', aviso);
};

export function useRuta(): string {
  return useSyncExternalStore(suscribir, () => location.hash.replace(/^#/, '') || '/');
}

export function irA(ruta: string): void {
  location.hash = ruta;
}

/** Como irA, pero sin dejar la ruta actual en el historial (el boton "atras" no vuelve a ella). */
export function reemplazarRuta(ruta: string): void {
  location.replace(`#${ruta}`);
}
