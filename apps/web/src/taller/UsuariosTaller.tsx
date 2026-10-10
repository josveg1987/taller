import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { mensajeDe, useAcciones } from '../acciones';
import { Icono } from '../Iconos';
import { irA } from '../ruta';
import { useSesion } from '../sesion';
import { GestionUsuarios, type RutasUsuarios, type UsuarioFila } from '../usuarios/GestionUsuarios';

const RUTAS: RutasUsuarios = {
  crear: '/taller/usuarios',
  usuario: (id) => `/taller/usuarios/${id}`,
  password: (id) => `/taller/usuarios/${id}/password`,
};

interface Limites {
  maxUsuarios: number;
  usuariosActivos: number;
}

/** Usuarios del taller en el que se esta (los gestiona el administrador del taller). */
export function UsuariosTaller() {
  const { estado } = useSesion();
  const miId = estado.fase === 'activa' && estado.perfil.tipo === 'taller' ? estado.perfil.id : undefined;

  const [usuarios, setUsuarios] = useState<UsuarioFila[] | null>(null);
  const [limites, setLimites] = useState<Limites | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = useCallback(() => {
    Promise.all([api<UsuarioFila[]>('/taller/usuarios'), api<Limites>('/taller')])
      .then(([u, l]) => {
        setUsuarios(u);
        setLimites(l);
      })
      .catch((e: unknown) => setErrorCarga(mensajeDe(e, 'No se pudieron cargar los usuarios')));
  }, []);
  useEffect(cargar, [cargar]);
  const { error, aviso, ejecutar, limpiarError } = useAcciones(cargar);

  if (!usuarios || !limites) {
    return errorCarga ? (
      <p className="error" role="alert">
        {errorCarga}
      </p>
    ) : (
      <p className="vacio">Cargando…</p>
    );
  }

  return (
    <section>
      <button type="button" className="enlace volver" onClick={() => irA('/mi-taller')}>
        <Icono nombre="atras" />
        Mi taller
      </button>
      <h1>Usuarios</h1>
      <p className="subtitulo">Quienes pueden entrar a la app de este taller. Todos tienen los mismos permisos.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="ok" role="status">
          {aviso}
        </p>
      )}
      <GestionUsuarios
        usuarios={usuarios}
        usuariosActivos={limites.usuariosActivos}
        maxUsuarios={limites.maxUsuarios}
        rutas={RUTAS}
        miId={miId}
        principal
        ejecutar={ejecutar}
        error={error}
        limpiarError={limpiarError}
      />
    </section>
  );
}
