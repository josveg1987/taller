import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { CamposVehiculo } from '../clientes/CamposVehiculo';
import { descripcionVehiculo } from '../clientes/tipos';
import { Hoja } from '../Hoja';
import { Icono } from '../Iconos';
import type { Actualizar } from './Asistente';
import { normalizarPatente } from './calculo';
import type { Borrador, VehiculoEncontrado } from './tipos';

const ESPERA_MS = 400;

interface ClienteBuscado {
  id: string;
  nombre: string;
  telefono: string;
}

export function PasoVehiculo({ b, actualizar }: { b: Borrador; actualizar: Actualizar }) {
  const [buscando, setBuscando] = useState(false);
  const [sinConexion, setSinConexion] = useState(false);
  const [eligiendoCliente, setEligiendoCliente] = useState(false);
  const patente = normalizarPatente(b.patente);
  const valida = patente.length >= 4;

  // Busca la patente mientras se escribe: si el vehiculo existe, trae tambien a su dueño.
  useEffect(() => {
    if (!valida) {
      if (b.vehiculo) actualizar({ vehiculo: null });
      return;
    }
    if (b.vehiculo?.patente === patente) return;
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
          if (e instanceof ApiError && e.status === 404) {
            setSinConexion(false);
            actualizar({ vehiculo: null });
          } else {
            setSinConexion(true);
          }
        })
        .finally(() => vigente && setBuscando(false));
    }, ESPERA_MS);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
    // Solo depende de la patente escrita (actualizar es estable).
  }, [patente]);

  const nuevo = valida && !b.vehiculo && !buscando;

  return (
    <>
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
      </div>

      {sinConexion && (
        <p className="aviso" role="status">
          Sin conexión: no se pudo revisar si la patente ya existe. Completa los datos del cliente; al guardar se verifica.
        </p>
      )}

      {b.vehiculo && (
        <>
          <h2>Vehículo encontrado</h2>
          <div className="grupo">
            <div className="item">
              <span className="item-texto">
                <span className="placa">{b.vehiculo.patente}</span>
                <span className="detalle"> {descripcionVehiculo(b.vehiculo) || 'Sin marca ni modelo'}</span>
              </span>
            </div>
            <div className="item">
              <Icono nombre="clientes" />
              <span className="item-texto">
                <span className="item-titulo">{b.vehiculo.cliente.nombre}</span>
                <span className="detalle">{b.vehiculo.cliente.telefono}</span>
              </span>
            </div>
          </div>
        </>
      )}

      {nuevo && (
        <>
          <h2>Vehículo nuevo · cliente</h2>
          {b.clienteExistente ? (
            <div className="grupo">
              <div className="item">
                <Icono nombre="clientes" />
                <span className="item-texto">
                  <span className="item-titulo">{b.clienteExistente.nombre}</span>
                  <span className="detalle">{b.clienteExistente.telefono}</span>
                </span>
                <button type="button" className="enlace" onClick={() => actualizar({ clienteExistente: null })}>
                  Cambiar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grupo formulario">
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
              <div className="centro">
                <button type="button" className="enlace" onClick={() => setEligiendoCliente(true)}>
                  Es de un cliente que ya tengo
                </button>
              </div>
            </>
          )}

          <h2>Datos del vehículo (opcional)</h2>
          <div className="grupo formulario">
            <CamposVehiculo
              valor={{ marca: b.nuevo.marca, modelo: b.nuevo.modelo, anio: b.nuevo.anio }}
              onCambio={(v) => actualizar((x) => ({ nuevo: { ...x.nuevo, marca: v.marca, modelo: v.modelo, anio: v.anio } }))}
            />
          </div>
        </>
      )}

      <Hoja abierta={eligiendoCliente} titulo="Elegir cliente" onCerrar={() => setEligiendoCliente(false)}>
        <BuscarCliente
          onElegir={(c) => {
            actualizar({ clienteExistente: c });
            setEligiendoCliente(false);
          }}
        />
      </Hoja>
    </>
  );
}

function BuscarCliente({ onElegir }: { onElegir(c: ClienteBuscado): void }) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState<ClienteBuscado[]>([]);

  useEffect(() => {
    let vigente = true;
    const t = window.setTimeout(() => {
      api<ClienteBuscado[]>(`/clientes?q=${encodeURIComponent(q.trim())}`)
        .then((r) => vigente && setLista(r))
        .catch(() => vigente && setLista([]));
    }, 250);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
  }, [q]);

  return (
    <>
      <div className="busqueda">
        <Icono nombre="buscar" />
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          aria-label="Buscar cliente por nombre o teléfono"
          placeholder="Nombre o teléfono"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {lista.length === 0 ? (
        <p className="vacio">Sin resultados.</p>
      ) : (
        <ul className="grupo">
          {lista.map((c) => (
            <li key={c.id}>
              <button type="button" className="item" onClick={() => onElegir({ id: c.id, nombre: c.nombre, telefono: c.telefono })}>
                <span className="item-texto">
                  <span className="item-titulo">{c.nombre}</span>
                  <span className="detalle">{c.telefono}</span>
                </span>
                <Icono nombre="chevron" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
