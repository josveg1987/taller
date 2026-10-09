import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
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
      <div className="fila">
        <h1>Talleres</h1>
        <button type="button" className="boton" onClick={() => irA('/talleres/nuevo')}>
          Nuevo taller
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!talleres && !error && <p className="detalle">Cargando…</p>}
      {talleres?.length === 0 && <p className="detalle">Aún no hay talleres. Crea el primero con “Nuevo taller”.</p>}

      <ul className="lista">
        {talleres?.map((t) => (
          <li key={t.id}>
            <button type="button" className="tarjeta" onClick={() => irA(`/talleres/${t.id}`)}>
              <span className="tarjeta-titulo">{t.nombre}</span>
              <span className="detalle">
                {t.usuariosActivos} de {t.maxUsuarios} usuarios
              </span>
              <span className={`chip ${t.activo ? 'activo' : 'suspendido'}`}>{t.activo ? 'Activo' : 'Suspendido'}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
