import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { mensajeDe, useAcciones } from '../acciones';
import { clp } from '../dinero';
import { Hoja } from '../Hoja';
import { Icono } from '../Iconos';
import { irA } from '../ruta';
import type { Pieza } from './tipos';

interface DatosPieza {
  nombre: string;
  usaPosicion: boolean;
  tarifaPintura: number | null;
  activa: boolean;
}

export function Piezas() {
  const [piezas, setPiezas] = useState<Pieza[] | null>(null);
  const [tarifaTaller, setTarifaTaller] = useState(0);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [idHoja, setIdHoja] = useState<string | null>(null); // se conserva al cerrar para la animacion de salida
  const [editando, setEditando] = useState(false);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(() => {
    Promise.all([api<Pieza[]>('/piezas?todas=1'), api<{ tarifaPintura: number }>('/taller')])
      .then(([p, t]) => {
        setPiezas(p);
        setTarifaTaller(t.tarifaPintura);
      })
      .catch((e: unknown) => setErrorCarga(mensajeDe(e, 'No se pudieron cargar las piezas')));
  }, []);
  useEffect(cargar, [cargar]);
  const { error, aviso, ejecutar, limpiarError } = useAcciones(cargar);

  if (!piezas) {
    return errorCarga ? (
      <p className="error" role="alert">
        {errorCarga}
      </p>
    ) : (
      <p className="vacio">Cargando…</p>
    );
  }

  const elegida = piezas.find((p) => p.id === idHoja);
  const indice = elegida ? piezas.indexOf(elegida) : -1;
  const cerrar = (poner: (v: boolean) => void) => () => {
    limpiarError();
    poner(false);
  };

  return (
    <section>
      <button type="button" className="enlace volver" onClick={() => irA('/mi-taller')}>
        <Icono nombre="atras" />
        Mi taller
      </button>
      <h1>Piezas</h1>
      <p className="subtitulo">
        {tarifaTaller > 0
          ? `Las piezas que cotizas. La tarifa de pintura por defecto es ${clp(tarifaTaller)}; cada pieza puede tener la suya.`
          : 'Las piezas que cotizas. Define la tarifa de pintura por defecto en Mi taller, en Presupuestos.'}
      </p>

      <div className="pila">
        <button
          type="button"
          className="boton"
          onClick={() => {
            limpiarError();
            setCreando(true);
          }}
        >
          <Icono nombre="mas" />
          Nueva pieza
        </button>
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

      {piezas.length === 0 ? (
        <p className="vacio">Aún no tienes piezas. Carga las estándar para partir.</p>
      ) : (
        <ul className="grupo">
          {piezas.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="item"
                onClick={() => {
                  limpiarError();
                  setIdHoja(p.id);
                  setEditando(true);
                }}
              >
                <span className="item-texto">
                  <span className="item-titulo">{p.nombre}</span>
                  <span className="detalle">
                    {p.usaPosicion ? 'Por lado' : 'Una sola'} · Pintura {p.tarifaPintura === null ? `${clp(tarifaTaller)} (del taller)` : clp(p.tarifaPintura)}
                  </span>
                </span>
                {!p.activa && <span className="chip suspendido">Inactiva</span>}
                <Icono nombre="chevron" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="centro">
        <button
          type="button"
          className="enlace"
          onClick={() => void ejecutar(() => api('/piezas/estandar', { method: 'POST' }), 'Listo: las piezas estándar están al día')}
        >
          Agregar las piezas estándar que falten
        </button>
      </div>

      <Hoja abierta={creando} titulo="Nueva pieza" onCerrar={cerrar(setCreando)}>
        <FormularioPieza
          tarifaTaller={tarifaTaller}
          textoBoton="Crear pieza"
          error={error}
          onGuardar={(d) =>
            void ejecutar(() => api('/piezas', { method: 'POST', json: d }), 'Pieza creada').then((ok) => ok && setCreando(false))
          }
        />
      </Hoja>

      <Hoja abierta={editando} titulo={elegida?.nombre ?? 'Pieza'} onCerrar={cerrar(setEditando)}>
        {elegida && (
          <>
            <FormularioPieza
              inicial={elegida}
              tarifaTaller={tarifaTaller}
              textoBoton="Guardar cambios"
              error={error}
              onGuardar={(d) =>
                void ejecutar(() => api(`/piezas/${elegida.id}`, { method: 'PATCH', json: d }), 'Pieza actualizada').then((ok) => ok && setEditando(false))
              }
            />
            <div className="pila">
              <button
                type="button"
                className="boton secundario"
                disabled={indice <= 0}
                onClick={() => void ejecutar(() => api(`/piezas/${elegida.id}/mover`, { method: 'POST', json: { direccion: 'arriba' } }))}
              >
                Subir en la lista
              </button>
              <button
                type="button"
                className="boton secundario"
                disabled={indice >= piezas.length - 1}
                onClick={() => void ejecutar(() => api(`/piezas/${elegida.id}/mover`, { method: 'POST', json: { direccion: 'abajo' } }))}
              >
                Bajar en la lista
              </button>
            </div>
          </>
        )}
      </Hoja>
    </section>
  );
}

function FormularioPieza({
  inicial,
  tarifaTaller,
  textoBoton,
  error,
  onGuardar,
}: {
  inicial?: Pieza;
  tarifaTaller: number;
  textoBoton: string;
  error: string | null;
  onGuardar(d: DatosPieza): void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [usaPosicion, setUsaPosicion] = useState(inicial?.usaPosicion ?? true);
  const [tarifa, setTarifa] = useState(inicial?.tarifaPintura === null || inicial === undefined ? '' : String(inicial.tarifaPintura));
  const [activa, setActiva] = useState(inicial?.activa ?? true);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErrorLocal(null);
    const digitos = tarifa.replace(/\D/g, '');
    if (tarifa.trim() !== '' && digitos === '') return setErrorLocal('La tarifa debe ser un número');
    onGuardar({ nombre, usaPosicion, tarifaPintura: digitos === '' ? null : Number(digitos), activa });
  }

  return (
    <form onSubmit={enviar} className="formulario">
      <label className="campo">
        Nombre
        <input required maxLength={80} autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <div className="grupo">
        <label className="item campo-fila">
          <span className="item-texto">
            <span className="item-titulo">Se cotiza por lado</span>
            <span className="detalle">Izquierda o derecha (puertas, tapabarros…)</span>
          </span>
          <input type="checkbox" role="switch" className="interruptor" checked={usaPosicion} onChange={(e) => setUsaPosicion(e.target.checked)} />
        </label>
        {inicial && (
          <label className="item campo-fila">
            <span className="item-texto">
              <span className="item-titulo">Pieza activa</span>
              <span className="detalle">Las inactivas no se ofrecen en los presupuestos</span>
            </span>
            <input type="checkbox" role="switch" className="interruptor" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          </label>
        )}
      </div>
      <label className="campo">
        Tarifa de pintura propia ($)
        <span className="ayuda">Déjala vacía para usar la del taller ({clp(tarifaTaller)}).</span>
        <input inputMode="numeric" autoComplete="off" placeholder={`Usa la del taller`} value={tarifa} onChange={(e) => setTarifa(e.target.value)} />
      </label>
      {(errorLocal ?? error) && (
        <p className="error" role="alert">
          {errorLocal ?? error}
        </p>
      )}
      <button type="submit" className="boton">
        {textoBoton}
      </button>
    </form>
  );
}
