import { useEffect } from 'react';
import { api } from './api';
import { Inicio } from './Inicio';
import { irA, useRuta } from './ruta';
import { useSesion, type Perfil } from './sesion';
import { TallerDetalle } from './admin/TallerDetalle';
import { TallerNuevo } from './admin/TallerNuevo';
import { Talleres } from './admin/Talleres';
import { MiTaller } from './taller/MiTaller';
import { UsuariosTaller } from './taller/UsuariosTaller';

/** Marco de la app con la sesion iniciada: cabecera, menu y la pantalla segun la ruta. */
export function Aplicacion({ perfil }: { perfil: Perfil }) {
  const { salir, refrescar } = useSesion();
  const ruta = useRuta();
  const esAdmin = perfil.tipo === 'admin_app';
  const dentro = esAdmin && perfil.taller !== null;
  const enAdmin = esAdmin && ruta.startsWith('/talleres');
  // Hay un taller sobre el cual trabajar: el propio, o aquel al que entro el administrador de la app.
  const hayTaller = !esAdmin || dentro;

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
  } else if (hayTaller && ruta === '/mi-taller') {
    pantalla = <MiTaller />;
  } else if (hayTaller && ruta === '/usuarios') {
    pantalla = <UsuariosTaller />;
  }

  const items: { ruta: string; texto: string; actual: boolean }[] = [];
  if (esAdmin) items.push({ ruta: '/talleres', texto: 'Talleres', actual: enAdmin });
  if (hayTaller) {
    items.push(
      { ruta: '/', texto: 'Inicio', actual: !enAdmin && ruta !== '/mi-taller' && ruta !== '/usuarios' },
      { ruta: '/mi-taller', texto: 'Datos del taller', actual: ruta === '/mi-taller' },
      { ruta: '/usuarios', texto: 'Usuarios', actual: ruta === '/usuarios' },
    );
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

      <nav className="menu">
        {items.map((i) => (
          <button key={i.ruta} type="button" className={`enlace ${i.actual ? 'actual' : ''}`} onClick={() => irA(i.ruta)}>
            {i.texto}
          </button>
        ))}
      </nav>

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
