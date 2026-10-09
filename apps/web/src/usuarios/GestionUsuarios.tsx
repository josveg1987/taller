import { useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Ejecutar } from '../acciones';

export interface UsuarioFila {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
}

/** Direcciones de la API segun quien administra (el administrador de la app o el del taller). */
export interface RutasUsuarios {
  crear: string;
  usuario(id: string): string;
  password(id: string): string;
}

interface Props {
  usuarios: UsuarioFila[];
  usuariosActivos: number;
  maxUsuarios: number;
  rutas: RutasUsuarios;
  /** Id del usuario que esta usando la pantalla (si es un usuario de taller), para proteger su cuenta. */
  miId?: string;
  ejecutar: Ejecutar;
}

/** Lista de usuarios con sus acciones y el formulario para agregar otro. */
export function GestionUsuarios({ usuarios, usuariosActivos, maxUsuarios, rutas, miId, ejecutar }: Props) {
  return (
    <>
      <h2>
        Usuarios ({usuariosActivos} de {maxUsuarios})
      </h2>
      {usuarios.length === 0 && <p className="detalle">Este taller aún no tiene usuarios.</p>}
      <ul className="lista">
        {usuarios.map((u) => (
          <FilaUsuario key={u.id} usuario={u} rutas={rutas} esYo={u.id === miId} ejecutar={ejecutar} />
        ))}
      </ul>
      <NuevoUsuario rutas={rutas} lleno={usuariosActivos >= maxUsuarios} ejecutar={ejecutar} />
    </>
  );
}

function FilaUsuario({
  usuario,
  rutas,
  esYo,
  ejecutar,
}: {
  usuario: UsuarioFila;
  rutas: RutasUsuarios;
  esYo: boolean;
  ejecutar: Ejecutar;
}) {
  const [cambiando, setCambiando] = useState(false);
  const [actual, setActual] = useState('');
  const [clave, setClave] = useState('');

  function cambiarClave(e: FormEvent) {
    e.preventDefault();
    void ejecutar(
      () =>
        api(rutas.password(usuario.id), {
          method: 'POST',
          json: esYo ? { password: clave, actual } : { password: clave },
        }),
      esYo
        ? 'Tu contraseña fue cambiada. Las demás sesiones abiertas se cerraron.'
        : `Contraseña de ${usuario.nombre} cambiada. Sus sesiones abiertas se cerraron.`,
    ).then((ok) => {
      if (!ok) return;
      setActual('');
      setClave('');
      setCambiando(false);
    });
  }

  return (
    <li className="tarjeta fija">
      <div className="fila">
        <div>
          <span className="tarjeta-titulo">
            {usuario.nombre}
            {esYo && ' (tú)'}
          </span>
          <div className="detalle">{usuario.email}</div>
        </div>
        <span className={`chip ${usuario.activo ? 'activo' : 'suspendido'}`}>{usuario.activo ? 'Activo' : 'Inactivo'}</span>
      </div>
      <div className="acciones">
        {!esYo && (
          <button
            type="button"
            className="enlace"
            onClick={() => void ejecutar(() => api(rutas.usuario(usuario.id), { method: 'PATCH', json: { activo: !usuario.activo } }))}
          >
            {usuario.activo ? 'Desactivar' : 'Activar'}
          </button>
        )}
        <button type="button" className="enlace" onClick={() => setCambiando((v) => !v)}>
          Cambiar contraseña
        </button>
      </div>
      {cambiando && (
        <form onSubmit={cambiarClave} className="formulario">
          {esYo && (
            <label>
              Contraseña actual
              <input type="password" autoComplete="current-password" required value={actual} onChange={(e) => setActual(e.target.value)} />
            </label>
          )}
          <label>
            Nueva contraseña (mínimo 8 caracteres)
            <input
              type={esYo ? 'password' : 'text'}
              autoComplete={esYo ? 'new-password' : 'off'}
              required
              minLength={8}
              value={clave}
              onChange={(e) => setClave(e.target.value)}
            />
          </label>
          <button type="submit" className="boton">
            Guardar contraseña
          </button>
        </form>
      )}
    </li>
  );
}

function NuevoUsuario({ rutas, lleno, ejecutar }: { rutas: RutasUsuarios; lleno: boolean; ejecutar: Ejecutar }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function crear(e: FormEvent) {
    e.preventDefault();
    void ejecutar(() => api(rutas.crear, { method: 'POST', json: { nombre, email, password } }), 'Usuario creado').then((ok) => {
      if (!ok) return;
      setNombre('');
      setEmail('');
      setPassword('');
    });
  }

  return (
    <>
      <h2>Agregar usuario</h2>
      {lleno && <p className="detalle">Se alcanzó el límite de usuarios del taller. Desactiva a alguien o pide ampliarlo.</p>}
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
