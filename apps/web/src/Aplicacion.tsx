import { useEffect } from 'react';
import { api } from './api';
import { Inicio } from './Inicio';
import { irA, useRuta } from './ruta';
import { useSesion, type Perfil } from './sesion';
import { TallerDetalle } from './admin/TallerDetalle';
import { TallerNuevo } from './admin/TallerNuevo';
import { Talleres } from './admin/Talleres';

/** Marco de la app con la sesion iniciada: cabecera, menu y la pantalla segun la ruta. */
export function Aplicacion({ perfil }: { perfil: Perfil }) {
  const { salir, refrescar } = useSesion();
  const ruta = useRuta();
  const esAdmin = perfil.tipo === 'admin_app';
  const dentro = esAdmin && perfil.taller !== null;
  const enAdmin = esAdmin && ruta.startsWith('/talleres');

  // El administrador de la app que no esta dentro de un taller parte en la lista de talleres.
  useEffect(() => {
    if (esAdmin && !dentro && !enAdmin) irA('/talleres');
  }, [esAdmin, dentro, enAdmin]);

  async function salirDelTaller() {
    await api('/admin/salir-taller', { method: 'POST' });
    await refrescar();
    irA('/talleres');
  }

  let pantalla = <Inicio />;
  if (enAdmin) {
    const [, segundo] = ruta.split('/').filter(Boolean);
    if (segundo === 'nuevo') pantalla = <TallerNuevo />;
    else if (segundo) pantalla = <TallerDetalle key={segundo} id={segundo} />;
    else pantalla = <Talleres />;
  }

  return (
    <main>
      <header className="barra">
        <div>
          <strong>{perfil.nombre}</strong>
          <div className="detalle">{esAdmin ? 'Administrador de la APP' : perfil.taller?.nombre}</div>
        </div>
        <button type="button" className="enlace" onClick={() => void salir()}>
          Cerrar sesión
        </button>
      </header>

      {esAdmin && (
        <nav className="menu">
          <button type="button" className={`enlace ${enAdmin ? 'actual' : ''}`} onClick={() => irA('/talleres')}>
            Talleres
          </button>
          {dentro && (
            <button type="button" className={`enlace ${!enAdmin ? 'actual' : ''}`} onClick={() => irA('/')}>
              Inicio del taller
            </button>
          )}
        </nav>
      )}

      {dentro && (
        <div className="banner">
          <span>
            Estás dentro del taller <strong>{perfil.taller?.nombre}</strong>
          </span>
          <button type="button" className="enlace" onClick={() => void salirDelTaller()}>
            Salir del taller
          </button>
        </div>
      )}

      {pantalla}
    </main>
  );
}
