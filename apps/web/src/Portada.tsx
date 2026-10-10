import type { ReactNode } from 'react';
import { useMarca } from './marca';

/** Pantalla antes de entrar (ingreso, conectando, sin conexion): logo grande y una tarjeta flotante. */
export function Portada({ children, ocupado }: { children: ReactNode; ocupado?: boolean }) {
  const marca = useMarca();
  return (
    <div className="app">
      <main className="contenido" aria-busy={ocupado}>
        <div className="portada">
          <img src={marca.logoVertical} alt={`${marca.nombre}, desabolladura y pintura`} />
        </div>
        <div className="flotante acceso">{children}</div>
      </main>
    </div>
  );
}
