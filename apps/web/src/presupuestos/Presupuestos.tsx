import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { clp } from '../dinero';
import { Encabezado } from '../Encabezado';
import { fechaCorta, haceCuanto } from '../fechas';
import { HojaConfirmar } from '../Hoja';
import { Icono } from '../Iconos';
import { irA } from '../ruta';
import { useTallerActual } from '../sesion';
import { borrarBorrador, listarBorradores } from './local';
import { ESTADOS, type Borrador, type PresupuestoResumen } from './tipos';

/** Inicio: el boton para un presupuesto nuevo, lo que quedo a medias en este telefono y los guardados. */
export function Presupuestos() {
  const tallerId = useTallerActual();
  const [presupuestos, setPresupuestos] = useState<PresupuestoResumen[] | null>(null);
  const [borradores, setBorradores] = useState<Borrador[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [descartar, setDescartar] = useState<Borrador | null>(null);

  const cargarBorradores = useCallback(() => {
    if (tallerId) void listarBorradores(tallerId).then(setBorradores);
  }, [tallerId]);

  useEffect(() => {
    cargarBorradores();
    api<PresupuestoResumen[]>('/presupuestos')
      .then(setPresupuestos)
      .catch((e: unknown) => setError(e instanceof ApiError && e.status !== 0 ? e.message : 'Sin conexión: no se pudieron cargar los presupuestos guardados.'));
  }, [cargarBorradores]);

  return (
    <section>
      <Encabezado titulo="Presupuestos" sub="Arma uno en 3 pasos: vehículo, piezas y ajustes." />
      <div className="flotante">
        <button type="button" className="boton" onClick={() => irA('/presupuestos/nuevo')}>
          <Icono nombre="mas" />
          Nuevo presupuesto
        </button>
      </div>

      <div className="cuerpo">
      {borradores.length > 0 && (
        <>
          <h2>Sin guardar en este teléfono</h2>
          <ul className="grupo">
            {borradores.map((x) => (
              <li key={x.id} className="item">
                <button type="button" className="item item-interno" onClick={() => irA(`/presupuestos/borrador/${x.id}`)}>
                  <span className="item-texto">
                    <span className="item-titulo">
                      {x.numero ? `Edición del N° ${x.numero}` : x.patente.trim() ? x.patente.toUpperCase() : 'Presupuesto nuevo'}
                    </span>
                    <span className="detalle">
                      {x.vehiculo?.cliente.nombre ?? x.clienteExistente?.nombre ?? (x.nuevo.nombre || 'Sin cliente')} · {x.lineas.length}{' '}
                      {x.lineas.length === 1 ? 'pieza' : 'piezas'} · {haceCuanto(x.actualizado)}
                    </span>
                  </span>
                  <Icono nombre="chevron" />
                </button>
                <button type="button" className="enlace peligro" aria-label="Descartar borrador" onClick={() => setDescartar(x)}>
                  <Icono nombre="cerrar" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!presupuestos && !error && <p className="vacio">Cargando…</p>}
      {presupuestos?.length === 0 && <p className="vacio">Aún no tienes presupuestos guardados.</p>}
      {presupuestos && presupuestos.length > 0 && (
        <>
          <h2>Recientes</h2>
          <ul className="grupo">
            {presupuestos.map((p) => (
              <li key={p.id}>
                <button type="button" className="item" onClick={() => irA(`/presupuestos/${p.id}`)}>
                  <span className="item-texto">
                    <span className="item-titulo">
                      N° {p.numero} · <span className="placa">{p.vehiculo.patente}</span>
                    </span>
                    <span className="detalle">
                      {p.cliente.nombre} · {fechaCorta(p.fecha)}
                    </span>
                  </span>
                  <span className="columna-derecha">
                    <span className="monto-fuerte">{clp(p.total)}</span>
                    <span className={`chip estado-${p.estado}`}>{ESTADOS[p.estado]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <HojaConfirmar
        abierta={descartar !== null}
        titulo="¿Descartar este borrador?"
        texto="Se borra de este teléfono. Si era la edición de un presupuesto guardado, el presupuesto no cambia."
        textoBoton="Descartar"
        peligro
        onCerrar={() => setDescartar(null)}
        onConfirmar={() => {
          const x = descartar;
          setDescartar(null);
          if (x) void borrarBorrador(x.id).then(cargarBorradores);
        }}
      />
      </div>
    </section>
  );
}
