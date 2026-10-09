import { useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Ejecutar } from '../acciones';
import { Hoja } from '../Hoja';
import { Icono } from '../Iconos';

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
  /** "Agregar usuario" es la accion principal de la pantalla (si no, se ve como secundaria). */
  principal?: boolean;
  ejecutar: Ejecutar;
  /** Error de la ultima accion, para mostrarlo dentro de la hoja abierta. */
  error: string | null;
  limpiarError(): void;
}

/** Lista de usuarios como tarjetas agrupadas; el detalle y el alta se abren en hojas. */
export function GestionUsuarios({ usuarios, usuariosActivos, maxUsuarios, rutas, miId, principal, ejecutar, error, limpiarError }: Props) {
  // El id se conserva al cerrar para que la hoja mantenga su contenido durante la animacion de salida.
  const [idHoja, setIdHoja] = useState<string | null>(null);
  const [verUsuario, setVerUsuario] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const lleno = usuariosActivos >= maxUsuarios;
  const elegido = usuarios.find((u) => u.id === idHoja);

  const cerrar = (poner: (v: boolean) => void) => () => {
    limpiarError();
    poner(false);
  };

  return (
    <>
      <h2>
        Usuarios ({usuariosActivos} de {maxUsuarios})
      </h2>
      {usuarios.length === 0 ? (
        <p className="vacio">Este taller aún no tiene usuarios.</p>
      ) : (
        <ul className="grupo">
          {usuarios.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="item"
                onClick={() => {
                  limpiarError();
                  setIdHoja(u.id);
                  setVerUsuario(true);
                }}
              >
                <span className="item-texto">
                  <span className="item-titulo">
                    {u.nombre}
                    {u.id === miId && ' (tú)'}
                  </span>
                  <span className="detalle">{u.email}</span>
                </span>
                <span className={`chip ${u.activo ? 'activo' : 'suspendido'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                <Icono nombre="chevron" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="pila">
        <button
          type="button"
          className={`boton ${principal ? '' : 'secundario'}`}
          disabled={lleno}
          onClick={() => {
            limpiarError();
            setAgregando(true);
          }}
        >
          <Icono nombre="mas" />
          Agregar usuario
        </button>
        {lleno && <p className="detalle">Se alcanzó el límite de usuarios del taller. Desactiva a alguien o pide ampliarlo.</p>}
      </div>

      <Hoja abierta={verUsuario} titulo={elegido?.nombre ?? 'Usuario'} onCerrar={cerrar(setVerUsuario)}>
        {elegido && (
          <DetalleUsuario
            usuario={elegido}
            rutas={rutas}
            esYo={elegido.id === miId}
            ejecutar={ejecutar}
            error={error}
            alTerminar={() => setVerUsuario(false)}
          />
        )}
      </Hoja>

      <Hoja abierta={agregando} titulo="Agregar usuario" onCerrar={cerrar(setAgregando)}>
        <FormularioNuevo rutas={rutas} ejecutar={ejecutar} error={error} alTerminar={() => setAgregando(false)} />
      </Hoja>
    </>
  );
}

function Mensaje({ error }: { error: string | null }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}

function DetalleUsuario({
  usuario,
  rutas,
  esYo,
  ejecutar,
  error,
  alTerminar,
}: {
  usuario: UsuarioFila;
  rutas: RutasUsuarios;
  esYo: boolean;
  ejecutar: Ejecutar;
  error: string | null;
  alTerminar(): void;
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
    ).then((ok) => ok && alTerminar());
  }

  return (
    <>
      <div className="grupo">
        <div className="item">
          <span className="item-texto detalle">{usuario.email}</span>
          <span className={`chip ${usuario.activo ? 'activo' : 'suspendido'}`}>{usuario.activo ? 'Activo' : 'Inactivo'}</span>
        </div>
      </div>

      {cambiando ? (
        <form onSubmit={cambiarClave} className="formulario pila">
          {esYo && (
            <label className="campo">
              Contraseña actual
              <input type="password" autoComplete="current-password" required value={actual} onChange={(e) => setActual(e.target.value)} />
            </label>
          )}
          <label className="campo">
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
          <Mensaje error={error} />
          <button type="submit" className="boton">
            Guardar contraseña
          </button>
          <button type="button" className="boton secundario" onClick={() => setCambiando(false)}>
            Cancelar
          </button>
        </form>
      ) : (
        <div className="pila">
          <Mensaje error={error} />
          <button type="button" className="boton secundario" onClick={() => setCambiando(true)}>
            Cambiar contraseña
          </button>
          {!esYo && (
            <button
              type="button"
              className="boton secundario"
              onClick={() =>
                void ejecutar(() => api(rutas.usuario(usuario.id), { method: 'PATCH', json: { activo: !usuario.activo } })).then(
                  (ok) => ok && alTerminar(),
                )
              }
            >
              {usuario.activo ? 'Desactivar usuario' : 'Activar usuario'}
            </button>
          )}
        </div>
      )}
    </>
  );
}

function FormularioNuevo({
  rutas,
  ejecutar,
  error,
  alTerminar,
}: {
  rutas: RutasUsuarios;
  ejecutar: Ejecutar;
  error: string | null;
  alTerminar(): void;
}) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function crear(e: FormEvent) {
    e.preventDefault();
    void ejecutar(() => api(rutas.crear, { method: 'POST', json: { nombre, email, password } }), 'Usuario creado').then(
      (ok) => ok && alTerminar(),
    );
  }

  return (
    <form onSubmit={crear} className="formulario">
      <label className="campo">
        Nombre
        <input required maxLength={120} autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <label className="campo">
        Correo
        <input type="email" required autoCapitalize="none" autoComplete="off" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="campo">
        Contraseña inicial (mínimo 8 caracteres)
        <input type="text" autoComplete="off" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <Mensaje error={error} />
      <button type="submit" className="boton">
        Crear usuario
      </button>
    </form>
  );
}
