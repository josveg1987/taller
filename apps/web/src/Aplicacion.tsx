import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Hoja } from './Hoja';
import { Icono, type NombreIcono } from './Iconos';
import { irA, useRuta } from './ruta';
import { useSesion, type Perfil } from './sesion';
import { ClienteDetalle } from './clientes/ClienteDetalle';
import { ClienteNuevo } from './clientes/ClienteNuevo';
import { Clientes } from './clientes/Clientes';
import { VehiculoDetalle } from './clientes/VehiculoDetalle';
import { TallerDetalle } from './admin/TallerDetalle';
import { TallerNuevo } from './admin/TallerNuevo';
import { Talleres } from './admin/Talleres';
import { Combos } from './piezas/Combos';
import { Piezas } from './piezas/Piezas';
import { Asistente } from './presupuestos/Asistente';
import { IniciarBorrador } from './presupuestos/IniciarBorrador';
import { PresupuestoDetalle } from './presupuestos/PresupuestoDetalle';
import { Presupuestos } from './presupuestos/Presupuestos';
import { MiTaller } from './taller/MiTaller';
import { UsuariosTaller } from './taller/UsuariosTaller';

interface Pestana {
  ruta: string;
  texto: string;
  icono: NombreIcono;
  actual: boolean;
}

/** Marco de la app con la sesion iniciada: barra superior, contenido, barra inferior y hoja de cuenta. */
export function Aplicacion({ perfil }: { perfil: Perfil }) {
  const { salir, refrescar } = useSesion();
  const ruta = useRuta();
  const [cuenta, setCuenta] = useState(false);
  const contenido = useRef<HTMLElement>(null);

  const esAdmin = perfil.tipo === 'admin_app';
  const dentro = esAdmin && perfil.taller !== null;
  const enAdmin = esAdmin && ruta.startsWith('/talleres');
  // Hay un taller sobre el cual trabajar: el propio, o aquel al que entro el administrador de la app.
  const hayTaller = !esAdmin || dentro;

  // El administrador de la app que no esta dentro de un taller parte en la lista de talleres.
  useEffect(() => {
    if (esAdmin && !dentro && !enAdmin) irA('/talleres');
  }, [esAdmin, dentro, enAdmin]);

  // Cada pantalla parte arriba.
  useEffect(() => {
    contenido.current?.scrollTo(0, 0);
  }, [ruta]);

  async function salirDelTaller() {
    await api('/admin/salir-taller', { method: 'POST' });
    await refrescar();
    irA('/talleres');
  }

  let pantalla = <Presupuestos />;
  // Dentro del asistente la barra inferior se oculta: la accion principal va abajo, fija.
  let enAsistente = false;
  if (enAdmin) {
    const [, segundo] = ruta.split('/').filter(Boolean);
    if (segundo === 'nuevo') pantalla = <TallerNuevo />;
    else if (segundo) pantalla = <TallerDetalle key={segundo} id={segundo} />;
    else pantalla = <Talleres />;
  } else if (hayTaller) {
    const [primero, segundo, tercero, cuarto] = ruta.split('/').filter(Boolean);
    if (primero === 'presupuestos' && segundo === 'nuevo' && tercero === 'vehiculo' && cuarto) {
      pantalla = <IniciarBorrador key={ruta} modo={{ tipo: 'vehiculo', vehiculoId: cuarto }} />;
      enAsistente = true;
    } else if (primero === 'presupuestos' && segundo === 'nuevo' && tercero === 'cliente' && cuarto) {
      pantalla = <IniciarBorrador key={ruta} modo={{ tipo: 'cliente', clienteId: cuarto }} />;
      enAsistente = true;
    } else if (primero === 'presupuestos' && segundo === 'nuevo') {
      pantalla = <IniciarBorrador key={ruta} modo={{ tipo: 'nuevo' }} />;
      enAsistente = true;
    } else if (primero === 'presupuestos' && segundo === 'borrador' && tercero) {
      pantalla = <Asistente key={tercero} borradorId={tercero} />;
      enAsistente = true;
    } else if (primero === 'presupuestos' && segundo && tercero === 'editar') {
      pantalla = <IniciarBorrador key={ruta} modo={{ tipo: 'editar', presupuestoId: segundo }} />;
      enAsistente = true;
    } else if (primero === 'presupuestos' && segundo) pantalla = <PresupuestoDetalle key={segundo} id={segundo} />;
    else if (primero === 'mi-taller') pantalla = <MiTaller />;
    else if (primero === 'usuarios') pantalla = <UsuariosTaller />;
    else if (primero === 'piezas') pantalla = <Piezas />;
    else if (primero === 'combos') pantalla = <Combos />;
    else if (primero === 'clientes' && segundo === 'nuevo') pantalla = <ClienteNuevo />;
    else if (primero === 'clientes' && segundo) pantalla = <ClienteDetalle key={segundo} id={segundo} />;
    else if (primero === 'clientes') pantalla = <Clientes />;
    else if (primero === 'vehiculos' && segundo) pantalla = <VehiculoDetalle key={segundo} id={segundo} />;
  }

  // Seccion de la barra inferior a la que pertenece la pantalla actual.
  const primerTramo = ruta.split('/').filter(Boolean)[0];
  const seccion = enAdmin
    ? 'talleres'
    : primerTramo === 'clientes' || primerTramo === 'vehiculos'
      ? 'clientes'
      : primerTramo === 'mi-taller' || primerTramo === 'usuarios' || primerTramo === 'piezas' || primerTramo === 'combos'
        ? 'mi-taller'
        : 'inicio';

  const pestanas: Pestana[] = [];
  if (esAdmin) pestanas.push({ ruta: '/talleres', texto: 'Talleres', icono: 'talleres', actual: seccion === 'talleres' });
  if (hayTaller) {
    pestanas.push(
      { ruta: '/', texto: 'Presupuestos', icono: 'documento', actual: seccion === 'inicio' },
      { ruta: '/clientes', texto: 'Clientes', icono: 'clientes', actual: seccion === 'clientes' },
      { ruta: '/mi-taller', texto: 'Mi taller', icono: 'ajustes', actual: seccion === 'mi-taller' },
    );
  }

  return (
    <div className="app">
      <header className="barra-superior">
        <span className="contexto">{esAdmin ? 'Administrador de la APP' : perfil.taller?.nombre}</span>
        <button type="button" className="avatar" aria-label={`Cuenta de ${perfil.nombre}`} onClick={() => setCuenta(true)}>
          {(perfil.nombre.match(/\p{L}/u)?.[0] ?? '?').toUpperCase()}
        </button>
      </header>

      {dentro && (
        <div className="banner">
          <span>
            Dentro de <strong>{perfil.taller?.nombre}</strong>
          </span>
          <button type="button" className="enlace" onClick={() => void salirDelTaller()}>
            Salir
          </button>
        </div>
      )}

      <main className="contenido" ref={contenido}>
        {pantalla}
      </main>

      {/* Con una sola seccion (administrador fuera de un taller) la barra no aporta. */}
      {pestanas.length > 1 && !enAsistente && (
        <nav className="barra-inferior" aria-label="Secciones">
          {pestanas.map((p) => (
            <button
              key={p.ruta}
              type="button"
              className="pestana"
              aria-current={p.actual ? 'page' : undefined}
              onClick={() => irA(p.ruta)}
            >
              <span className="icono-pestana">
                <Icono nombre={p.icono} />
              </span>
              {p.texto}
            </button>
          ))}
        </nav>
      )}

      <Hoja abierta={cuenta} titulo="Cuenta" onCerrar={() => setCuenta(false)}>
        <div className="grupo">
          <div className="item">
            <span className="item-texto">
              <span className="item-titulo">{perfil.nombre}</span>
              <span className="detalle">{perfil.email}</span>
            </span>
          </div>
          <div className="item">
            <span className="item-texto detalle">{esAdmin ? 'Administrador de la APP' : `Administrador de ${perfil.taller?.nombre}`}</span>
          </div>
        </div>
        <div className="pila">
          <button
            type="button"
            className="boton secundario"
            onClick={() => {
              setCuenta(false);
              void salir();
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </Hoja>
    </div>
  );
}
