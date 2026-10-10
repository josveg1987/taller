import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { Encabezado } from '../Encabezado';
import { Icono } from '../Iconos';
import { irA } from '../ruta';
import type { TallerResumen } from './tipos';

export function Talleres() {
  const [talleres, setTalleres] = useState<TallerResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<TallerResumen[]>('/admin/talleres')
      .then(setTalleres)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar'));
  }, []);

  return (
    <section>
      <Encabezado titulo="Talleres" sub="Los talleres que usan la app." />

      <div className="flotante">
        <button type="button" className="boton" onClick={() => irA('/talleres/nuevo')}>
          <Icono nombre="mas" />
          Nuevo taller
        </button>
      </div>

      <div className="cuerpo">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!talleres && !error && <p className="vacio">Cargando…</p>}
      {talleres?.length === 0 && <p className="vacio">Aún no hay talleres. Crea el primero con “Nuevo taller”.</p>}

      {talleres && talleres.length > 0 && (
        <ul className="grupo">
          {talleres.map((t) => (
            <li key={t.id}>
              <button type="button" className="item" onClick={() => irA(`/talleres/${t.id}`)}>
                <span className="item-texto">
                  <span className="item-titulo">{t.nombre}</span>
                  <span className="detalle">
                    {t.usuariosActivos} de {t.maxUsuarios} usuarios
                  </span>
                </span>
                <span className={`chip ${t.activo ? 'activo' : 'suspendido'}`}>{t.activo ? 'Activo' : 'Suspendido'}</span>
                <Icono nombre="chevron" />
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>
    </section>
  );
}
