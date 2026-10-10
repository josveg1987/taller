import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { mensajeDe, useAcciones } from '../acciones';
import { Hoja, HojaConfirmar } from '../Hoja';
import { Icono } from '../Iconos';
import { irA } from '../ruta';
import type { Combo, Pieza } from './tipos';

export function Combos() {
  const [combos, setCombos] = useState<Combo[] | null>(null);
  const [piezas, setPiezas] = useState<Pieza[]>([]);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [idHoja, setIdHoja] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const cargar = useCallback(() => {
    Promise.all([api<Combo[]>('/combos'), api<Pieza[]>('/piezas')])
      .then(([c, p]) => {
        setCombos(c);
        setPiezas(p);
      })
      .catch((e: unknown) => setErrorCarga(mensajeDe(e, 'No se pudieron cargar los combos')));
  }, []);
  useEffect(cargar, [cargar]);
  const { error, aviso, ejecutar, limpiarError } = useAcciones(cargar);

  if (!combos) {
    return errorCarga ? (
      <p className="error" role="alert">
        {errorCarga}
      </p>
    ) : (
      <p className="vacio">Cargando…</p>
    );
  }

  const elegido = combos.find((c) => c.id === idHoja);
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
      <h1>Combos</h1>
      <p className="subtitulo">Grupos de piezas que se agregan juntas a un presupuesto, como “Lateral completo”.</p>

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
          Nuevo combo
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

      {combos.length === 0 ? (
        <p className="vacio">Aún no tienes combos.</p>
      ) : (
        <ul className="grupo">
          {combos.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="item"
                onClick={() => {
                  limpiarError();
                  setIdHoja(c.id);
                  setEditando(true);
                }}
              >
                <span className="item-texto">
                  <span className="item-titulo">{c.nombre}</span>
                  <span className="detalle">
                    {c.piezas.length === 0 ? 'Sin piezas' : c.piezas.map((p) => p.nombre).join(', ')}
                  </span>
                </span>
                {!c.activo && <span className="chip suspendido">Inactivo</span>}
                <Icono nombre="chevron" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Hoja abierta={creando} titulo="Nuevo combo" onCerrar={cerrar(setCreando)}>
        <FormularioCombo
          piezas={piezas}
          textoBoton="Crear combo"
          error={error}
          onGuardar={(d) =>
            void ejecutar(() => api('/combos', { method: 'POST', json: { nombre: d.nombre, piezaIds: d.piezaIds } }), 'Combo creado').then(
              (ok) => ok && setCreando(false),
            )
          }
        />
      </Hoja>

      <Hoja abierta={editando} titulo={elegido?.nombre ?? 'Combo'} onCerrar={cerrar(setEditando)}>
        {elegido && (
          <>
            <FormularioCombo
              inicial={elegido}
              piezas={piezas}
              textoBoton="Guardar cambios"
              error={error}
              onGuardar={(d) =>
                void ejecutar(() => api(`/combos/${elegido.id}`, { method: 'PATCH', json: d }), 'Combo actualizado').then((ok) => ok && setEditando(false))
              }
            />
            <div className="centro">
              <button type="button" className="enlace peligro" onClick={() => setEliminando(true)}>
                Eliminar combo
              </button>
            </div>
          </>
        )}
      </Hoja>

      <HojaConfirmar
        abierta={eliminando}
        titulo={`¿Eliminar ${elegido?.nombre ?? 'el combo'}?`}
        texto="Las piezas no se borran, solo este grupo."
        textoBoton="Eliminar"
        peligro
        onCerrar={() => setEliminando(false)}
        onConfirmar={() => {
          setEliminando(false);
          if (elegido) void ejecutar(() => api(`/combos/${elegido.id}`, { method: 'DELETE' }), 'Combo eliminado').then((ok) => ok && setEditando(false));
        }}
      />
    </section>
  );
}

interface DatosCombo {
  nombre: string;
  activo: boolean;
  piezaIds: string[];
}

function FormularioCombo({
  inicial,
  piezas,
  textoBoton,
  error,
  onGuardar,
}: {
  inicial?: Combo;
  piezas: Pieza[];
  textoBoton: string;
  error: string | null;
  onGuardar(d: DatosCombo): void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [activo, setActivo] = useState(inicial?.activo ?? true);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set(inicial?.piezas.map((p) => p.id) ?? []));

  function alternar(id: string, marcada: boolean) {
    setElegidas((antes) => {
      const n = new Set(antes);
      if (marcada) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    // Se conserva el orden de la lista de piezas del taller.
    onGuardar({ nombre, activo, piezaIds: piezas.filter((p) => elegidas.has(p.id)).map((p) => p.id) });
  }

  // Las piezas del combo que ahora estan inactivas siguen apareciendo para poder quitarlas.
  const visibles = [...piezas, ...(inicial?.piezas.filter((p) => !piezas.some((x) => x.id === p.id)).map((p) => ({ ...p, activa: false, tarifaPintura: null, desabolladoSugerido: null, orden: 0 })) ?? [])];

  return (
    <form onSubmit={enviar} className="formulario">
      <label className="campo">
        Nombre
        <input required maxLength={80} autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      {inicial && (
        <div className="grupo">
          <label className="item campo-fila">
            <span className="item-texto">
              <span className="item-titulo">Combo activo</span>
            </span>
            <input type="checkbox" role="switch" className="interruptor" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          </label>
        </div>
      )}
      <h2>Piezas del combo</h2>
      {visibles.length === 0 ? (
        <p className="vacio">Primero crea o carga piezas.</p>
      ) : (
        <div className="grupo">
          {visibles.map((p) => (
            <label key={p.id} className="item campo-fila">
              <span className="item-texto">
                <span className="item-titulo">{p.nombre}</span>
                <span className="detalle">{p.usaPosicion ? 'Por lado' : 'Una sola'}{p.activa ? '' : ' · inactiva'}</span>
              </span>
              <input type="checkbox" role="switch" className="interruptor" checked={elegidas.has(p.id)} onChange={(e) => alternar(p.id, e.target.checked)} />
            </label>
          ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="boton">
        {textoBoton}
      </button>
    </form>
  );
}
