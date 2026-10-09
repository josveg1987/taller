import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { mensajeDe, useAcciones, type Ejecutar } from '../acciones';
import { irA } from '../ruta';
import { useSesion } from '../sesion';
import { GestionUsuarios, type RutasUsuarios } from '../usuarios/GestionUsuarios';
import type { TallerDetalle as Detalle } from './tipos';

export function TallerDetalle({ id }: { id: string }) {
  const { refrescar } = useSesion();
  const [taller, setTaller] = useState<Detalle | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<Detalle>(`/admin/talleres/${id}`)
      .then(setTaller)
      .catch((e: unknown) => setErrorCarga(mensajeDe(e, 'No se pudo cargar el taller')));
  }, [id]);

  useEffect(cargar, [cargar]);
  const { error, aviso, ejecutar } = useAcciones(cargar);

  const rutas: RutasUsuarios = {
    crear: `/admin/talleres/${id}/usuarios`,
    usuario: (u) => `/admin/usuarios/${u}`,
    password: (u) => `/admin/usuarios/${u}/password`,
  };

  async function entrar() {
    await ejecutar(async () => {
      await api(`/admin/talleres/${id}/entrar`, { method: 'POST' });
      await refrescar();
      irA('/');
    });
  }

  if (!taller) {
    return errorCarga ? (
      <p className="error" role="alert">
        {errorCarga}
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

      <GestionUsuarios
        usuarios={taller.usuarios}
        usuariosActivos={taller.usuariosActivos}
        maxUsuarios={taller.maxUsuarios}
        rutas={rutas}
        ejecutar={ejecutar}
      />
    </section>
  );
}

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
