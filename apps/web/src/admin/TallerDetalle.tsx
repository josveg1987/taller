import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { mensajeDe, useAcciones, type Ejecutar } from '../acciones';
import { Cargando } from '../Cargando';
import { Encabezado } from '../Encabezado';
import { HojaConfirmar } from '../Hoja';
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
  const { error, aviso, ejecutar, limpiarError } = useAcciones(cargar);

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

  if (!taller) return <Cargando titulo="Taller" atras={{ texto: "Talleres", ruta: "/talleres" }} error={errorCarga} />;

  return (
    <section>
      <Encabezado titulo={taller.nombre} atras={{ texto: "Talleres", ruta: "/talleres" }} />

      <div className="flotante">
        <div className="fila-estado">
          <span className="detalle">Estado</span>
          <span className={`chip ${taller.activo ? 'activo' : 'suspendido'}`}>{taller.activo ? 'Activo' : 'Suspendido'}</span>
        </div>
        <button type="button" className="boton" onClick={() => void entrar()}>
          Entrar a este taller
        </button>
      </div>

      <div className="cuerpo">
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

      <DatosTaller taller={taller} ejecutar={ejecutar} />

      <GestionUsuarios
        usuarios={taller.usuarios}
        usuariosActivos={taller.usuariosActivos}
        maxUsuarios={taller.maxUsuarios}
        rutas={rutas}
        ejecutar={ejecutar}
        error={error}
        limpiarError={limpiarError}
      />

      <SuspenderTaller taller={taller} ejecutar={ejecutar} />
      </div>
    </section>
  );
}

function DatosTaller({ taller, ejecutar }: { taller: Detalle; ejecutar: Ejecutar }) {
  const [nombre, setNombre] = useState(taller.nombre);
  const [maxUsuarios, setMaxUsuarios] = useState(String(taller.maxUsuarios));

  function guardar(e: FormEvent) {
    e.preventDefault();
    void ejecutar(
      () => api(`/admin/talleres/${taller.id}`, { method: 'PATCH', json: { nombre, maxUsuarios: Number(maxUsuarios) } }),
      'Cambios guardados',
    );
  }

  return (
    <>
      <h2>Datos</h2>
      <form onSubmit={guardar} className="formulario">
        <div className="grupo formulario">
          <label className="campo">
            Nombre del taller
            <input required maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="campo">
            Máximo de usuarios
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              required
              value={maxUsuarios}
              onChange={(e) => setMaxUsuarios(e.target.value)}
            />
          </label>
        </div>
        <button type="submit" className="boton secundario">
          Guardar cambios
        </button>
      </form>
    </>
  );
}

function SuspenderTaller({ taller, ejecutar }: { taller: Detalle; ejecutar: Ejecutar }) {
  const [confirmando, setConfirmando] = useState(false);
  const suspender = taller.activo;

  return (
    <>
      <div className="centro">
        <button type="button" className={`enlace ${suspender ? 'peligro' : ''}`} onClick={() => setConfirmando(true)}>
          {suspender ? 'Suspender taller' : 'Reactivar taller'}
        </button>
      </div>
      <HojaConfirmar
        abierta={confirmando}
        titulo={suspender ? `¿Suspender ${taller.nombre}?` : `¿Reactivar ${taller.nombre}?`}
        texto={
          suspender
            ? 'Sus usuarios perderán el acceso de inmediato. Sus datos se conservan y puedes reactivarlo cuando quieras.'
            : 'Sus usuarios podrán volver a entrar.'
        }
        textoBoton={suspender ? 'Suspender' : 'Reactivar'}
        peligro={suspender}
        onCerrar={() => setConfirmando(false)}
        onConfirmar={() => {
          setConfirmando(false);
          void ejecutar(() => api(`/admin/talleres/${taller.id}`, { method: 'PATCH', json: { activo: !taller.activo } }));
        }}
      />
    </>
  );
}
