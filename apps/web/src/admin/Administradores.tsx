import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { mensajeDe, useAcciones } from '../acciones';
import { Cargando } from '../Cargando';
import { Encabezado } from '../Encabezado';
import { useSesion } from '../sesion';
import { GestionUsuarios, type RutasUsuarios, type UsuarioFila } from '../usuarios/GestionUsuarios';

const RUTAS: RutasUsuarios = {
  crear: '/admin/administradores',
  usuario: (id) => `/admin/administradores/${id}`,
  password: (id) => `/admin/administradores/${id}/password`,
  // La propia contraseña se cambia pidiendo la actual, igual que para cualquier cuenta.
  passwordPropia: '/auth/password',
};

/** Administradores de la APP (los dueños de la plataforma): ver, agregar, desactivar y dar claves temporales. */
export function Administradores() {
  const { estado } = useSesion();
  const miId = estado.fase === 'activa' && estado.perfil.tipo === 'admin_app' ? estado.perfil.id : undefined;
  const [lista, setLista] = useState<UsuarioFila[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<UsuarioFila[]>('/admin/administradores')
      .then(setLista)
      .catch((e: unknown) => setErrorCarga(mensajeDe(e, 'No se pudieron cargar los administradores')));
  }, []);
  useEffect(cargar, [cargar]);
  const { error, aviso, ejecutar, limpiarError } = useAcciones(cargar);

  const atras = { texto: 'Talleres', ruta: '/talleres' };
  if (!lista) return <Cargando titulo="Administradores" atras={atras} error={errorCarga} />;

  return (
    <section>
      <Encabezado titulo="Administradores" sub="Quienes administran la plataforma. Tienen acceso a todos los talleres." atras={atras} />
      <div className="cuerpo">
        {aviso && (
          <p className="ok" role="status">
            {aviso}
          </p>
        )}
        <GestionUsuarios
          titulo={`Administradores (${lista.filter((a) => a.activo).length} activos)`}
          textoAgregar="Agregar administrador"
          usuarios={lista}
          usuariosActivos={lista.filter((a) => a.activo).length}
          maxUsuarios={Infinity}
          rutas={RUTAS}
          miId={miId}
          principal
          ejecutar={ejecutar}
          error={error}
          limpiarError={limpiarError}
        />
      </div>
    </section>
  );
}
