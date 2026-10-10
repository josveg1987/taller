import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { limpiarDatosLocales } from './datosLocales';

/** Debe coincidir con `Perfil` de apps/api/src/auth/auth.service.ts. */
export interface Perfil {
  tipo: 'admin_app' | 'taller';
  id: string;
  nombre: string;
  email: string;
  taller: { id: string; nombre: string } | null;
  /** true si entro con una contrasena temporal: debe cambiarla antes de usar la app. */
  debeCambiarPassword: boolean;
}

export type EstadoSesion =
  | { fase: 'cargando' }
  | { fase: 'sin-conexion' }
  | { fase: 'anonimo' }
  | { fase: 'activa'; perfil: Perfil };

interface Sesion {
  estado: EstadoSesion;
  entrar(email: string, password: string): Promise<void>;
  salir(): Promise<void>;
  reintentar(): void;
  /** Vuelve a pedir el perfil sin mostrar "cargando" (p. ej. tras entrar o salir de un taller). */
  refrescar(): Promise<void>;
}

const Contexto = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>({ fase: 'cargando' });

  const cargar = useCallback(() => {
    setEstado({ fase: 'cargando' });
    api<Perfil>('/auth/me')
      .then((perfil) => setEstado({ fase: 'activa', perfil }))
      .catch((e: unknown) =>
        // 401 = no hay sesion. Cualquier otra falla (sin red, servidor dormido) no dice nada de la sesion.
        setEstado({ fase: e instanceof ApiError && e.status === 401 ? 'anonimo' : 'sin-conexion' }),
      );
  }, []);

  useEffect(cargar, [cargar]);

  const valor = useMemo<Sesion>(
    () => ({
      estado,
      reintentar: cargar,
      async refrescar() {
        const perfil = await api<Perfil>('/auth/me');
        setEstado({ fase: 'activa', perfil });
      },
      async entrar(email, password) {
        const perfil = await api<Perfil>('/auth/login', { method: 'POST', json: { email, password } });
        setEstado({ fase: 'activa', perfil });
      },
      async salir() {
        try {
          await api('/auth/logout', { method: 'POST' });
        } catch {
          // Aunque no haya red, igual se limpia este dispositivo.
        }
        await limpiarDatosLocales();
        setEstado({ fase: 'anonimo' });
      },
    }),
    [estado, cargar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** Id del taller en que se trabaja (el propio, o al que entro el administrador de la APP); null si ninguno. */
export function useTallerActual(): string | null {
  const { estado } = useSesion();
  return estado.fase === 'activa' ? (estado.perfil.taller?.id ?? null) : null;
}

export function useSesion(): Sesion {
  const s = useContext(Contexto);
  if (!s) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>');
  return s;
}
