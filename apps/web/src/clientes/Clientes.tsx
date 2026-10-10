import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { Icono } from '../Iconos';
import { irA } from '../ruta';
import type { ClienteLista } from './tipos';

const ESPERA_MS = 250;

export function Clientes() {
  const [q, setQ] = useState('');
  const [clientes, setClientes] = useState<ClienteLista[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pedido = useRef(0);

  // Busca mientras se escribe, esperando una pausa y descartando respuestas que llegan tarde.
  useEffect(() => {
    const mio = ++pedido.current;
    const t = window.setTimeout(() => {
      api<ClienteLista[]>(`/clientes?q=${encodeURIComponent(q.trim())}`)
        .then((r) => {
          if (mio !== pedido.current) return;
          setClientes(r);
          setError(null);
        })
        .catch((e: unknown) => {
          if (mio === pedido.current) setError(e instanceof ApiError ? e.message : 'No se pudo buscar');
        });
    }, q ? ESPERA_MS : 0);
    return () => window.clearTimeout(t);
  }, [q]);

  const buscando = q.trim() !== '';

  return (
    <section>
      <h1>Clientes</h1>
      <p className="subtitulo">Busca por patente, nombre o teléfono.</p>

      <div className="busqueda">
        <Icono nombre="buscar" />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          aria-label="Buscar por patente, nombre o teléfono"
          placeholder="Patente, nombre o teléfono"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="pila">
        <button type="button" className="boton" onClick={() => irA('/clientes/nuevo')}>
          <Icono nombre="mas" />
          Nuevo cliente
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!clientes && !error && <p className="vacio">Cargando…</p>}
      {clientes?.length === 0 && (
        <p className="vacio">{buscando ? `Sin resultados para “${q.trim()}”.` : 'Aún no tienes clientes. Crea el primero con “Nuevo cliente”.'}</p>
      )}

      {clientes && clientes.length > 0 && (
        <>
          <h2>{buscando ? 'Resultados' : 'Recientes'}</h2>
          <ul className="grupo">
            {clientes.map((c) => (
              <li key={c.id}>
                <button type="button" className="item" onClick={() => irA(`/clientes/${c.id}`)}>
                  <span className="item-texto">
                    <span className="item-titulo">{c.nombre}</span>
                    <span className="detalle">{c.telefono}</span>
                    {c.vehiculos.length > 0 && (
                      <span className="item-fila-chips">
                        {c.vehiculos.map((v) => (
                          <span key={v.id} className="placa">
                            {v.patente}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <Icono nombre="chevron" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
