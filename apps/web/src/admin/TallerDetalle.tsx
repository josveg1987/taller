import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { irA } from '../ruta';
import { useSesion } from '../sesion';
import type { TallerDetalle as Detalle, UsuarioResumen } from './tipos';

const mensaje = (e: unknown, defecto: string) => (e instanceof ApiError ? e.message : defecto);

export function TallerDetalle({ id }: { id: string }) {
  const { refrescar } = useSesion();
  const [taller, setTaller] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<Detalle>(`/admin/talleres/${id}`)
      .then(setTaller)
      .catch((e: unknown) => setError(mensaje(e, 'No se pudo cargar el taller')));
  }, [id]);

  useEffect(cargar, [cargar]);

  /** Ejecuta una accion, muestra el error o el aviso, y recarga los datos. */
  async function ejecutar(accion: () => Promise<unknown>, exito?: string): Promise<boolean> {
    setError(null);
    setAviso(null);
    try {
      await accion();
      if (exito) setAviso(exito);
      cargar();
      return true;
    } catch (e) {
      setError(mensaje(e, 'No se pudo completar la acción'));
      return false;
    }
  }

  async function entrar() {
    await ejecutar(async () => {
      await api(`/admin/talleres/${id}/entrar`, { method: 'POST' });
      await refrescar();
      irA('/');
    });
  }

  if (!taller) {
    return error ? (
      <p className="error" role="alert">
        {error}
      </p>
    ) : (
      <p className="detalle">Cargando…</p>
    );
  }

  return (
    <section>
      <button type="button" className="enlace" onClick={() => irA('/talleres')}>
        ← Talleres
      </button>
      <div className="fila">
        <h1>{taller.nombre}</h1>
        <span className={`chip ${taller.activo ? 'activo' : 'suspendido'}`}>{taller.activo ? 'Activo' : 'Suspendido'}</span>
      </div>

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

      <button type="button" className="boton" onClick={() => void entrar()}>
        Entrar a este taller
      </button>

      <DatosTaller taller={taller} ejecutar={ejecutar} />

      <h2>
        Usuarios ({taller.usuariosActivos} de {taller.maxUsuarios})
      </h2>
      {taller.usuarios.length === 0 && <p className="detalle">Este taller aún no tiene usuarios.</p>}
      <ul className="lista">
        {taller.usuarios.map((u) => (
          <FilaUsuario key={u.id} usuario={u} ejecutar={ejecutar} />
        ))}
      </ul>

      <NuevoUsuario tallerId={taller.id} lleno={taller.usuariosActivos >= taller.maxUsuarios} ejecutar={ejecutar} />
    </section>
  );
}

type Ejecutar = (accion: () => Promise<unknown>, exito?: string) => Promise<boolean>;

function DatosTaller({ taller, ejecutar }: { taller: Detalle; ejecutar: Ejecutar }) {
  const [nombre, setNombre] = useState(taller.nombre);
  const [maxUsuarios, setMaxUsuarios] = useState(taller.maxUsuarios);

  function guardar(e: FormEvent) {
    e.preventDefault();
    void ejecutar(() => api(`/admin/talleres/${taller.id}`, { method: 'PATCH', json: { nombre, maxUsuarios } }), 'Cambios guardados');
  }

  function cambiarEstado() {
    const quiere = taller.activo
      ? `¿Suspender “${taller.nombre}”? Sus usuarios perderán el acceso de inmediato.`
      : `¿Reactivar “${taller.nombre}”?`;
    if (!window.confirm(quiere)) return;
    void ejecutar(() => api(`/admin/talleres/${taller.id}`, { method: 'PATCH', json: { activo: !taller.activo } }));
  }

  return (
    <>
      <h2>Datos</h2>
      <form onSubmit={guardar} className="formulario">
        <label>
          Nombre del taller
          <input required maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label>
          Máximo de usuarios
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            required
            value={maxUsuarios}
            onChange={(e) => setMaxUsuarios(Number(e.target.value))}
          />
        </label>
        <button type="submit" className="boton">
          Guardar cambios
        </button>
      </form>
      <p>
        <button type="button" className="enlace peligro" onClick={cambiarEstado}>
          {taller.activo ? 'Suspender taller' : 'Reactivar taller'}
        </button>
      </p>
    </>
  );
}

function FilaUsuario({ usuario, ejecutar }: { usuario: UsuarioResumen; ejecutar: Ejecutar }) {
  const [cambiando, setCambiando] = useState(false);
  const [clave, setClave] = useState('');

  function cambiarClave(e: FormEvent) {
    e.preventDefault();
    void ejecutar(
      () => api(`/admin/usuarios/${usuario.id}/password`, { method: 'POST', json: { password: clave } }),
      `Contraseña de ${usuario.nombre} cambiada. Sus sesiones abiertas se cerraron.`,
    ).then((ok) => {
      if (!ok) return;
      setClave('');
      setCambiando(false);
    });
  }

  return (
    <li className="tarjeta fija">
      <div className="fila">
        <div>
          <span className="tarjeta-titulo">{usuario.nombre}</span>
          <div className="detalle">{usuario.email}</div>
        </div>
        <span className={`chip ${usuario.activo ? 'activo' : 'suspendido'}`}>{usuario.activo ? 'Activo' : 'Inactivo'}</span>
      </div>
      <div className="acciones">
        <button
          type="button"
          className="enlace"
          onClick={() =>
            void ejecutar(() => api(`/admin/usuarios/${usuario.id}`, { method: 'PATCH', json: { activo: !usuario.activo } }))
          }
        >
          {usuario.activo ? 'Desactivar' : 'Activar'}
        </button>
        <button type="button" className="enlace" onClick={() => setCambiando((v) => !v)}>
          Cambiar contraseña
        </button>
      </div>
      {cambiando && (
        <form onSubmit={cambiarClave} className="formulario">
          <label>
            Nueva contraseña (mínimo 8 caracteres)
            <input type="text" autoComplete="off" required minLength={8} value={clave} onChange={(e) => setClave(e.target.value)} />
          </label>
          <button type="submit" className="boton">
            Guardar contraseña
          </button>
        </form>
      )}
    </li>
  );
}

function NuevoUsuario({ tallerId, lleno, ejecutar }: { tallerId: string; lleno: boolean; ejecutar: Ejecutar }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function crear(e: FormEvent) {
    e.preventDefault();
    void ejecutar(
      () => api(`/admin/talleres/${tallerId}/usuarios`, { method: 'POST', json: { nombre, email, password } }),
      'Usuario creado',
    ).then((ok) => {
      if (!ok) return;
      setNombre('');
      setEmail('');
      setPassword('');
    });
  }

  return (
    <>
      <h2>Agregar usuario</h2>
      {lleno && <p className="detalle">El taller llegó a su límite de usuarios. Sube el límite o desactiva a alguien.</p>}
      <form onSubmit={crear} className="formulario">
        <label>
          Nombre
          <input required maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label>
          Correo
          <input type="email" required autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Contraseña inicial (mínimo 8 caracteres)
          <input type="text" autoComplete="off" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" className="boton">
          Crear usuario
        </button>
      </form>
    </>
  );
}
