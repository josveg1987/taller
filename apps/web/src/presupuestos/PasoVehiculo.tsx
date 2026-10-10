import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { CamposVehiculo } from '../clientes/CamposVehiculo';
import { descripcionVehiculo, type ClienteLista } from '../clientes/tipos';
import { Icono } from '../Iconos';
import { InsigniaAuto } from '../marca/insignias';
import type { Actualizar } from './Asistente';
import { normalizarPatente } from './calculo';
import type { Borrador, VehiculoEncontrado } from './tipos';

const ESPERA_MS = 400;
const NUEVO_VACIO: Borrador['nuevo'] = { nombre: '', telefono: '', marca: '', modelo: '', anio: '' };

/** Un texto con letras y numeros que, sin espacios ni guiones, mide de 4 a 8 caracteres, se trata como patente. */
const pareceUnaPatente = (q: string) => {
  const n = normalizarPatente(q);
  return n.length >= 4 && n.length <= 8 && /\d/.test(n) && /[A-Z]/.test(n) && n.length === q.replace(/[\s.-]/g, '').length;
};

/**
 * Paso 1: buscar por patente o nombre y elegir un vehiculo (o un cliente para un vehiculo nuevo).
 * Si no esta, se crea el cliente y su vehiculo aqui mismo.
 */
export function PasoVehiculo({ b, actualizar }: { b: Borrador; actualizar: Actualizar }) {
  // Un borrador retomado con datos escritos vuelve directo al formulario de creacion.
  const [creando, setCreando] = useState(() => b.patente.trim() !== '' || b.nuevo.nombre.trim() !== '');

  const reiniciar = () => {
    setCreando(false);
    actualizar({ vehiculo: null, clienteExistente: null, patente: '', nuevo: NUEVO_VACIO });
  };

  if (b.vehiculo) return <VehiculoElegido b={b} onCambiar={reiniciar} />;
  if (b.clienteExistente || creando) return <DatosNuevos b={b} actualizar={actualizar} onVolver={reiniciar} />;
  return (
    <Buscador
      inicial={b.busqueda ?? ''}
      actualizar={actualizar}
      onCrear={(q) => {
        setCreando(true);
        if (pareceUnaPatente(q)) actualizar({ patente: q });
        else actualizar((x) => ({ nuevo: { ...x.nuevo, nombre: q.trim() } }));
      }}
    />
  );
}

function VehiculoElegido({ b, onCambiar }: { b: Borrador; onCambiar(): void }) {
  const v = b.vehiculo!;
  return (
    <div className="flotante">
      <h2>Vehículo elegido</h2>
      <div className="grupo">
        <div className="item">
          <span className="item-texto">
            <span className="placa">{v.patente}</span>
            <span className="detalle"> {descripcionVehiculo(v) || 'Sin marca ni modelo'}</span>
          </span>
        </div>
        <div className="item">
          <Icono nombre="clientes" />
          <span className="item-texto">
            <span className="item-titulo">{v.cliente.nombre}</span>
            <span className="detalle">{v.cliente.telefono}</span>
          </span>
        </div>
      </div>
      <button type="button" className="boton secundario" onClick={onCambiar}>
        Elegir otro
      </button>
    </div>
  );
}

function Buscador({ inicial, actualizar, onCrear }: { inicial: string; actualizar: Actualizar; onCrear(q: string): void }) {
  const [q, setQ] = useState(inicial);
  const [lista, setLista] = useState<ClienteLista[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const texto = q.trim();

  useEffect(() => {
    if (!texto) {
      setLista(null);
      return;
    }
    let vigente = true;
    const t = window.setTimeout(() => {
      api<ClienteLista[]>(`/clientes?q=${encodeURIComponent(texto)}`)
        .then((r) => {
          if (!vigente) return;
          setError(null);
          setLista(r);
        })
        .catch((e: unknown) => {
          if (!vigente) return;
          setLista(null);
          setError(e instanceof ApiError && e.status !== 0 ? e.message : 'Sin conexión: no se puede buscar. Puedes crear el cliente y se verifica al guardar.');
        });
    }, ESPERA_MS);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
  }, [texto]);

  async function elegirVehiculo(id: string) {
    if (eligiendo) return;
    setEligiendo(true);
    setError(null);
    try {
      const v = await api<VehiculoEncontrado>(`/vehiculos/${id}`);
      actualizar({
        vehiculo: { id: v.id, patente: v.patente, marca: v.marca, modelo: v.modelo, anio: v.anio, cliente: v.cliente },
        patente: v.patente,
        clienteExistente: null,
      });
    } catch (e) {
      setEligiendo(false);
      setError(e instanceof ApiError && e.status !== 0 ? e.message : 'Sin conexión: no se pudo abrir el vehículo.');
    }
  }

  return (
    <div className="flotante">
      <div className="busqueda">
        <Icono nombre="buscar" />
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCapitalize="none"
          aria-label="Buscar por patente o nombre del cliente"
          placeholder="Patente o nombre del cliente"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {!texto && <p className="vacio">Escribe la patente o el nombre para encontrar al cliente y su vehículo.</p>}

      {error && (
        <p className="aviso" role="status">
          {error}
        </p>
      )}

      {lista?.map((c) => (
        <div key={c.id} className="grupo">
          <div className="item">
            <span className="item-texto">
              <span className="item-titulo">{c.nombre}</span>
              <span className="detalle">{c.telefono}</span>
            </span>
            <button
              type="button"
              className="enlace"
              onClick={() => actualizar({ clienteExistente: { id: c.id, nombre: c.nombre, telefono: c.telefono }, patente: '', nuevo: NUEVO_VACIO })}
            >
              Otro vehículo
            </button>
          </div>
          {c.vehiculos.map((v) => (
            <button key={v.id} type="button" className="item" disabled={eligiendo} onClick={() => void elegirVehiculo(v.id)}>
              <InsigniaAuto marca={v.marca} />
              <span className="item-texto">
                <span className="placa">{v.patente}</span>
                <span className="detalle"> {descripcionVehiculo({ marca: v.marca, modelo: v.modelo, anio: null })}</span>
              </span>
              <Icono nombre="chevron" />
            </button>
          ))}
        </div>
      ))}

      {lista?.length === 0 && <p className="vacio">No hay coincidencias.</p>}

      <button type="button" className={texto && lista?.length !== 0 ? 'boton secundario' : 'boton'} onClick={() => onCrear(texto)}>
        <Icono nombre="mas" />
        Crear cliente nuevo
      </button>
    </div>
  );
}

/** Vehiculo nuevo: de un cliente que ya existe, o con un cliente nuevo (nombre y telefono). */
function DatosNuevos({ b, actualizar, onVolver }: { b: Borrador; actualizar: Actualizar; onVolver(): void }) {
  const [buscando, setBuscando] = useState(false);
  const [sinConexion, setSinConexion] = useState(false);
  const patente = normalizarPatente(b.patente);
  const valida = patente.length >= 4;

  // Si la patente escrita ya existe, se usa ese vehiculo (y su dueño) en vez de crear otro.
  useEffect(() => {
    if (!valida) return;
    let vigente = true;
    const t = window.setTimeout(() => {
      setBuscando(true);
      api<VehiculoEncontrado>(`/vehiculos/patente/${patente}`)
        .then((v) => {
          if (!vigente) return;
          setSinConexion(false);
          actualizar({
            vehiculo: { id: v.id, patente: v.patente, marca: v.marca, modelo: v.modelo, anio: v.anio, cliente: v.cliente },
            clienteExistente: null,
          });
        })
        .catch((e: unknown) => {
          if (!vigente) return;
          setSinConexion(!(e instanceof ApiError && e.status === 404));
        })
        .finally(() => vigente && setBuscando(false));
    }, ESPERA_MS);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
    // Solo depende de la patente escrita (actualizar es estable).
  }, [patente]);

  return (
    <>
      <div className="flotante">
      <h2>{b.clienteExistente ? 'Vehículo nuevo de' : 'Cliente nuevo'}</h2>
      {b.clienteExistente ? (
        <div className="grupo">
          <div className="item">
            <Icono nombre="clientes" />
            <span className="item-texto">
              <span className="item-titulo">{b.clienteExistente.nombre}</span>
              <span className="detalle">{b.clienteExistente.telefono}</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="formulario">
          <label className="campo">
            Nombre del cliente
            <input
              maxLength={120}
              autoComplete="off"
              autoCapitalize="words"
              value={b.nuevo.nombre}
              onChange={(e) => actualizar((x) => ({ nuevo: { ...x.nuevo, nombre: e.target.value } }))}
            />
          </label>
          <label className="campo">
            Teléfono
            <input
              type="tel"
              inputMode="tel"
              maxLength={20}
              autoComplete="off"
              placeholder="+56 9 1234 5678"
              value={b.nuevo.telefono}
              onChange={(e) => actualizar((x) => ({ nuevo: { ...x.nuevo, telefono: e.target.value } }))}
            />
          </label>
        </div>
      )}
      </div>

      <div className="cuerpo">
      <h2>Vehículo</h2>
      <div className="grupo formulario">
        <label className="campo">
          Patente
          <input
            className="campo-placa"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
            placeholder="ABCD12"
            value={b.patente}
            onChange={(e) => actualizar({ patente: e.target.value })}
          />
        </label>
        {buscando && <span className="detalle">Buscando…</span>}
        <CamposVehiculo
          valor={{ marca: b.nuevo.marca, modelo: b.nuevo.modelo, anio: b.nuevo.anio }}
          onCambio={(v) => actualizar((x) => ({ nuevo: { ...x.nuevo, marca: v.marca, modelo: v.modelo, anio: v.anio } }))}
        />
      </div>
      <p className="ayuda">Marca, modelo y año son opcionales.</p>

      {sinConexion && (
        <p className="aviso" role="status">
          Sin conexión: no se pudo revisar si la patente ya existe. Al guardar se verifica.
        </p>
      )}

      <div className="centro">
        <button type="button" className="enlace" onClick={onVolver}>
          Volver a buscar
        </button>
      </div>
      </div>
    </>
  );
}
