import { useEffect, useState } from 'react';
import { api } from '../api';
import { mensajeDe } from '../acciones';
import { descripcionVehiculo } from '../clientes/tipos';
import { clp } from '../dinero';
import { fechaCorta } from '../fechas';
import { Icono } from '../Iconos';
import { irA } from '../ruta';
import { ESTADOS, nombreConLado, type Presupuesto } from './tipos';

const OPERACION = { reparar: 'Reparar', reemplazar: 'Cambiar', libre: 'Ítem libre' } as const;

export function PresupuestoDetalle({ id }: { id: string }) {
  const [p, setP] = useState<Presupuesto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vistaInterna, setVistaInterna] = useState(false);

  useEffect(() => {
    api<Presupuesto>(`/presupuestos/${id}`)
      .then(setP)
      .catch((e: unknown) => setError(mensajeDe(e, 'No se pudo cargar el presupuesto')));
  }, [id]);

  if (!p) {
    return error ? (
      <p className="error" role="alert">
        {error}
      </p>
    ) : (
      <p className="vacio">Cargando…</p>
    );
  }

  return (
    <section>
      <button type="button" className="enlace volver" onClick={() => irA('/')}>
        <Icono nombre="atras" />
        Presupuestos
      </button>
      <div className="titulo-fila">
        <h1>N° {p.numero}</h1>
        <span className={`chip estado-${p.estado}`}>{ESTADOS[p.estado]}</span>
      </div>
      <p className="subtitulo">
        {fechaCorta(p.fecha)} · válido hasta el {fechaCorta(p.validoHasta)}
      </p>
      {p.plazoDias && (
        <p className="subtitulo">
          Plazo estimado: {p.plazoDias} {p.plazoDias === 1 ? 'día hábil' : 'días hábiles'}
        </p>
      )}

      {p.estado === 'borrador' && (
        <div className="pila">
          <button type="button" className="boton" onClick={() => irA(`/presupuestos/${p.id}/editar`)}>
            Editar presupuesto
          </button>
        </div>
      )}

      <h2>Cliente y vehículo</h2>
      <div className="grupo">
        <button type="button" className="item" onClick={() => irA(`/clientes/${p.cliente.id}`)}>
          <Icono nombre="clientes" />
          <span className="item-texto">
            <span className="item-titulo">{p.cliente.nombre}</span>
            <span className="detalle">{p.cliente.telefono}</span>
          </span>
          <Icono nombre="chevron" />
        </button>
        <button type="button" className="item" onClick={() => irA(`/vehiculos/${p.vehiculo.id}`)}>
          <span className="item-texto">
            <span className="placa">{p.vehiculo.patente}</span>
            <span className="detalle"> {descripcionVehiculo(p.vehiculo)}</span>
          </span>
          <Icono nombre="chevron" />
        </button>
      </div>

      <h2>Trabajos</h2>
      <ul className="grupo">
        {p.lineas.map((l) => (
          <li key={l.id} className="item">
            <span className="item-texto">
              <span className="item-titulo">{nombreConLado(l.nombre, l.posicion)}</span>
              <span className="detalle">{OPERACION[l.operacion]}</span>
            </span>
            <span>{clp(l.precioTotal)}</span>
          </li>
        ))}
      </ul>

      <div className="grupo">
        <Fila texto="Subtotal" monto={p.subtotal} />
        {p.descuento > 0 && <Fila texto="Descuento" monto={-p.descuento} />}
        <Fila texto="Total" monto={p.total} fuerte />
        <Fila texto="Para iniciar el trabajo" monto={p.montoInicio} />
      </div>

      <div className="grupo">
        <label className="item campo-fila">
          <span className="item-texto">
            <span className="item-titulo">Vista interna</span>
            <span className="detalle">Solo para ti; nunca aparece en el PDF.</span>
          </span>
          <input type="checkbox" role="switch" className="interruptor" checked={vistaInterna} onChange={(e) => setVistaInterna(e.target.checked)} />
        </label>
        {vistaInterna && (
          <>
            <Fila texto="Costo de repuestos" monto={p.costoRepuestos} />
            <Fila texto="Repuestos con margen" monto={p.precioRepuestos} />
            <Fila texto="Ganancia en repuestos" monto={p.gananciaRepuestos} fuerte />
          </>
        )}
      </div>

      {p.observaciones && (
        <>
          <h2>Observaciones</h2>
          <p className="grupo texto-largo">{p.observaciones}</p>
        </>
      )}
      {p.condiciones && (
        <>
          <h2>Condiciones</h2>
          <p className="grupo texto-largo">{p.condiciones}</p>
        </>
      )}
    </section>
  );
}

function Fila({ texto, monto, fuerte }: { texto: string; monto: number; fuerte?: boolean }) {
  return (
    <div className="item">
      <span className={`item-texto ${fuerte ? 'item-titulo' : ''}`}>{texto}</span>
      <span className={fuerte ? 'monto-fuerte' : undefined}>{clp(monto)}</span>
    </div>
  );
}
