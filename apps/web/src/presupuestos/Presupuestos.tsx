import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { clp } from '../dinero';
import { Encabezado } from '../Encabezado';
import { fechaCorta, haceCuanto } from '../fechas';
import { Hoja, HojaConfirmar } from '../Hoja';
import { Icono } from '../Iconos';
import { InsigniaAuto } from '../marca/insignias';
import { irA } from '../ruta';
import { useTallerActual } from '../sesion';
import { ConfiguracionPendiente } from './ConfiguracionPendiente';
import { borrarBorrador, listarBorradores } from './local';
import { ESTADOS, type Borrador, type Estado, type PresupuestoResumen } from './tipos';

const POR_PAGINA = 20;
const ESPERA_BUSQUEDA_MS = 350;

type Periodo = 'todo' | 'mes' | '30dias';
const PERIODOS: { valor: Periodo; texto: string }[] = [
  { valor: 'todo', texto: 'Todo' },
  { valor: 'mes', texto: 'Este mes' },
  { valor: '30dias', texto: 'Últimos 30 días' },
];

interface Lista {
  presupuestos: PresupuestoResumen[];
  hayMas: boolean;
}

/** YYYY-MM-DD en la hora local (no en UTC, para no correr un dia por la noche). */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function desdeDe(periodo: Periodo): string | null {
  const hoy = new Date();
  if (periodo === 'mes') return iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  if (periodo === '30dias') return iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 30));
  return null;
}

/** Texto de la confirmacion de eliminar: avisa si el cliente ya lo recibio. */
export function textoEliminar(estado: Estado): string {
  const base = 'Se quita de tu lista, pero queda guardado y su número no se vuelve a usar.';
  return estado === 'borrador' ? base : `Está en estado "${ESTADOS[estado]}": el cliente ya lo recibió. ${base}`;
}

/** Inicio: el boton para un presupuesto nuevo, lo que quedo a medias en este telefono y los guardados (con filtros). */
export function Presupuestos() {
  const tallerId = useTallerActual();
  const [borradores, setBorradores] = useState<Borrador[]>([]);
  const [descartar, setDescartar] = useState<Borrador | null>(null);

  const [texto, setTexto] = useState('');
  const [q, setQ] = useState(''); // el texto ya con la espera de tipeo
  const [estado, setEstado] = useState<Estado | 'todos'>('todos');
  const [periodo, setPeriodo] = useState<Periodo>('todo');
  const [filtrando, setFiltrando] = useState(false);

  const [items, setItems] = useState<PresupuestoResumen[] | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [eliminar, setEliminar] = useState<PresupuestoResumen | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const peticion = useRef(0); // ignora respuestas viejas si los filtros cambian mientras carga

  const cargarBorradores = useCallback(() => {
    if (tallerId) void listarBorradores(tallerId).then(setBorradores);
  }, [tallerId]);
  useEffect(cargarBorradores, [cargarBorradores]);

  // Espera a que termine de escribir antes de buscar.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(texto.trim()), ESPERA_BUSQUEDA_MS);
    return () => window.clearTimeout(t);
  }, [texto]);

  const consulta = useCallback(
    (antes?: number) => {
      const p = new URLSearchParams({ limite: String(POR_PAGINA) });
      if (q) p.set('q', q);
      if (estado !== 'todos') p.set('estado', estado);
      const desde = desdeDe(periodo);
      if (desde) p.set('desde', desde);
      if (antes) p.set('antes', String(antes));
      return api<Lista>(`/presupuestos?${p.toString()}`);
    },
    [q, estado, periodo],
  );

  // Primera pagina cada vez que cambia la busqueda o un filtro.
  useEffect(() => {
    const mia = ++peticion.current;
    setError(null);
    consulta()
      .then((r) => {
        if (mia !== peticion.current) return;
        setItems(r.presupuestos);
        setHayMas(r.hayMas);
      })
      .catch((e: unknown) => {
        if (mia !== peticion.current) return;
        setItems((previo) => previo ?? []);
        setError(e instanceof ApiError && e.status !== 0 ? e.message : 'Sin conexión: no se pudieron cargar los presupuestos guardados.');
      });
  }, [consulta]);

  async function verMas() {
    if (!items?.length || cargandoMas) return;
    const mia = peticion.current;
    setCargandoMas(true);
    try {
      const r = await consulta(items[items.length - 1].numero);
      if (mia !== peticion.current) return;
      setItems((previo) => [...(previo ?? []), ...r.presupuestos]);
      setHayMas(r.hayMas);
    } catch (e) {
      setError(e instanceof ApiError && e.status !== 0 ? e.message : 'Sin conexión: no se pudieron cargar más presupuestos.');
    } finally {
      setCargandoMas(false);
    }
  }

  async function confirmarEliminar() {
    const p = eliminar;
    if (!p) return;
    setEliminando(true);
    try {
      await api(`/presupuestos/${p.id}`, { method: 'DELETE' });
      setItems((previo) => previo?.filter((x) => x.id !== p.id) ?? null);
      setAviso(`Presupuesto N° ${p.numero} eliminado.`);
      setEliminar(null);
    } catch (e) {
      setEliminar(null);
      setAviso(null);
      setError(e instanceof ApiError && e.status !== 0 ? e.message : 'Sin conexión: no se pudo eliminar. Inténtalo de nuevo.');
    } finally {
      setEliminando(false);
    }
  }

  const activos = (estado !== 'todos' ? 1 : 0) + (periodo !== 'todo' ? 1 : 0);
  const hayFiltros = activos > 0 || q !== '';
  const limpiar = () => {
    setTexto('');
    setQ('');
    setEstado('todos');
    setPeriodo('todo');
  };

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
        <ConfiguracionPendiente />
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

        <h2>Guardados</h2>
        <div className="barra-filtros">
          <div className="busqueda">
            <Icono nombre="buscar" />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              aria-label="Buscar por número, patente o cliente"
              placeholder="N°, patente o cliente"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <button type="button" className={`boton-filtros ${activos > 0 ? 'con-filtros' : ''}`} onClick={() => setFiltrando(true)}>
            <Icono nombre="filtro" />
            Filtros{activos > 0 ? ` (${activos})` : ''}
          </button>
        </div>
        {activos > 0 && (
          <p className="detalle resumen-filtros">
            {[estado !== 'todos' ? ESTADOS[estado] : null, periodo !== 'todo' ? PERIODOS.find((x) => x.valor === periodo)?.texto : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}

        {aviso && (
          <p className="ok" role="status">
            {aviso}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!items && !error && <p className="vacio">Cargando…</p>}
        {items?.length === 0 && !error && (
          <div className="vacio">
            <p>{hayFiltros ? 'No hay presupuestos con esa búsqueda o esos filtros.' : 'Aún no tienes presupuestos guardados.'}</p>
            {hayFiltros && (
              <button type="button" className="enlace" onClick={limpiar}>
                Limpiar búsqueda y filtros
              </button>
            )}
          </div>
        )}
        {items && items.length > 0 && (
          <>
            <ul className="grupo">
              {items.map((p) => (
                <li key={p.id} className="item">
                  <button type="button" className="item item-interno" onClick={() => irA(`/presupuestos/${p.id}`)}>
                    <InsigniaAuto marca={p.vehiculo.marca} />
                    <span className="item-texto">
                      <span className="item-titulo">
                        N° {p.numero} · <span className="placa">{p.vehiculo.patente}</span>
                      </span>
                      <span className="detalle">
                        {p.cliente.nombre} · <span className="sin-corte">{fechaCorta(p.fecha)}</span>
                      </span>
                    </span>
                    <span className="columna-derecha">
                      <span className="monto-fuerte">{clp(p.total)}</span>
                      <span className={`chip estado-${p.estado}`}>{ESTADOS[p.estado]}</span>
                    </span>
                  </button>
                  <button type="button" className="enlace peligro" aria-label={`Eliminar el presupuesto N° ${p.numero}`} onClick={() => setEliminar(p)}>
                    <Icono nombre="papelera" />
                  </button>
                </li>
              ))}
            </ul>
            {hayMas && (
              <div className="pila">
                <button type="button" className="boton secundario" disabled={cargandoMas} onClick={() => void verMas()}>
                  {cargandoMas ? 'Cargando…' : 'Ver más'}
                </button>
              </div>
            )}
          </>
        )}

        <Hoja abierta={filtrando} titulo="Filtros" onCerrar={() => setFiltrando(false)}>
          <h3 className="titulo-filtro">Estado</h3>
          <div className="fila-montos" role="group" aria-label="Estado del presupuesto">
            {(['todos', 'borrador', 'enviado', 'aceptado', 'rechazado', 'vencido'] as const).map((e) => (
              <button key={e} type="button" className="chip-monto" aria-pressed={estado === e} onClick={() => setEstado(e)}>
                {e === 'todos' ? 'Todos' : ESTADOS[e]}
              </button>
            ))}
          </div>
          <h3 className="titulo-filtro">Fecha</h3>
          <div className="fila-montos" role="group" aria-label="Período">
            {PERIODOS.map((x) => (
              <button key={x.valor} type="button" className="chip-monto" aria-pressed={periodo === x.valor} onClick={() => setPeriodo(x.valor)}>
                {x.texto}
              </button>
            ))}
          </div>
          <div className="pila">
            <button type="button" className="boton" onClick={() => setFiltrando(false)}>
              Ver resultados
            </button>
            {activos > 0 && (
              <button
                type="button"
                className="boton secundario"
                onClick={() => {
                  setEstado('todos');
                  setPeriodo('todo');
                }}
              >
                Quitar filtros
              </button>
            )}
          </div>
        </Hoja>

        <HojaConfirmar
          abierta={eliminar !== null}
          titulo={eliminar ? `¿Eliminar el presupuesto N° ${eliminar.numero}?` : '¿Eliminar?'}
          texto={eliminar ? `${eliminar.cliente.nombre} · ${eliminar.vehiculo.patente}. ${textoEliminar(eliminar.estado)}` : ''}
          textoBoton={eliminando ? 'Eliminando…' : 'Eliminar'}
          peligro
          onCerrar={() => !eliminando && setEliminar(null)}
          onConfirmar={() => void confirmarEliminar()}
        />

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
