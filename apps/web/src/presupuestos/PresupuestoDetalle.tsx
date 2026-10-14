import { useEffect, useState } from 'react';
import { api } from '../api';
import { mensajeDe } from '../acciones';
import { descripcionVehiculo } from '../clientes/tipos';
import { clp } from '../dinero';
import { fechaCorta } from '../fechas';
import { Cargando } from '../Cargando';
import { Encabezado } from '../Encabezado';
import { Hoja, HojaConfirmar } from '../Hoja';
import { Icono } from '../Iconos';
import { InsigniaAuto, InsigniaCliente } from '../marca/insignias';
import { irA } from '../ruta';
import { textoEliminar } from './Presupuestos';
import { ESTADOS, nombreConLado, type Estado, type Presupuesto } from './tipos';

const OPERACION = { reparar: 'Reparar', reemplazar: 'Cambiar', libre: 'Ítem libre' } as const;

export function PresupuestoDetalle({ id }: { id: string }) {
  const [p, setP] = useState<Presupuesto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vistaInterna, setVistaInterna] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [errorEstado, setErrorEstado] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  async function eliminar() {
    setEliminando(true);
    try {
      await api(`/presupuestos/${id}`, { method: 'DELETE' });
      irA('/'); // vuelve a la lista: ya no aparece
    } catch (e) {
      setConfirmando(false);
      setEliminando(false);
      setErrorEstado(mensajeDe(e, 'No se pudo eliminar el presupuesto'));
    }
  }

  async function cambiarEstado(estado: Estado) {
    setCambiandoEstado(false);
    setErrorEstado(null);
    try {
      setP(await api<Presupuesto>(`/presupuestos/${id}/estado`, { method: 'PATCH', json: { estado } }));
    } catch (e) {
      setErrorEstado(mensajeDe(e, 'No se pudo cambiar el estado'));
    }
  }

  useEffect(() => {
    api<Presupuesto>(`/presupuestos/${id}`)
      .then(setP)
      .catch((e: unknown) => setError(mensajeDe(e, 'No se pudo cargar el presupuesto')));
  }, [id]);

  if (!p) return <Cargando titulo="Presupuesto" atras={{ texto: "Presupuestos", ruta: "/" }} error={error} />;

  return (
    <section>
      <Encabezado
        titulo={`N° ${p.numero}`}
        atras={{ texto: "Presupuestos", ruta: "/" }}
        sub={
          <>
            {fechaCorta(p.fecha)} · válido hasta el {fechaCorta(p.validoHasta)}
            {p.plazoDias ? <> · Plazo: {p.plazoDias} {p.plazoDias === 1 ? "día hábil" : "días hábiles"}</> : null}
          </>
        }
      />

      <div className="flotante">
        <div className="fila-estado">
          <span className="detalle">Estado</span>
          <span className={`chip estado-${p.estado}`}>{ESTADOS[p.estado]}</span>
        </div>
        <button type="button" className="boton" onClick={() => irA(`/presupuestos/${p.id}/pdf`)}>
          <Icono nombre="documento" />
          {p.estado === "borrador" ? "Ver PDF y enviar" : "Ver PDF"}
        </button>
        {p.estado === "borrador" ? (
          <button type="button" className="boton secundario" onClick={() => irA(`/presupuestos/${p.id}/editar`)}>
            Editar presupuesto
          </button>
        ) : (
          <>
            <button type="button" className="boton secundario" onClick={() => setCambiandoEstado(true)}>
              Cambiar estado
            </button>
            <button type="button" className="boton secundario" onClick={() => irA(`/presupuestos/${p.id}/duplicar`)}>
              Duplicar como borrador
            </button>
            <p className="ayuda centro-texto">Ya salió hacia el cliente, por eso no se edita. Para hacer cambios, duplícalo.</p>
          </>
        )}
        {errorEstado && (
          <p className="error" role="alert">
            {errorEstado}
          </p>
        )}
      </div>

      <div className="cuerpo">
      <h2>Cliente y vehículo</h2>
      <div className="grupo">
        <button type="button" className="item" onClick={() => irA(`/clientes/${p.cliente.id}`)}>
          <InsigniaCliente nombre={p.cliente.nombre} />
          <span className="item-texto">
            <span className="item-titulo">{p.cliente.nombre}</span>
            <span className="detalle">{p.cliente.telefono}</span>
          </span>
          <Icono nombre="chevron" />
        </button>
        <button type="button" className="item" onClick={() => irA(`/vehiculos/${p.vehiculo.id}`)}>
          <InsigniaAuto marca={p.vehiculo.marca} />
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
        {p.solicitaAnticipo ? <Fila texto="Anticipo" monto={p.montoInicio} /> : <Fila texto="Anticipo" valor="No se solicita" />}
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

      <div className="centro">
        <button type="button" className="enlace peligro" onClick={() => setConfirmando(true)}>
          Eliminar presupuesto
        </button>
      </div>

      <HojaConfirmar
        abierta={confirmando}
        titulo={`¿Eliminar el presupuesto N° ${p.numero}?`}
        texto={`${p.cliente.nombre} · ${p.vehiculo.patente}. ${textoEliminar(p.estado)}`}
        textoBoton={eliminando ? 'Eliminando…' : 'Eliminar'}
        peligro
        onCerrar={() => !eliminando && setConfirmando(false)}
        onConfirmar={() => void eliminar()}
      />

      <Hoja abierta={cambiandoEstado} titulo="Cambiar estado" onCerrar={() => setCambiandoEstado(false)}>
        <div className="grupo">
          {(p.estado === 'aceptado' || p.estado === 'rechazado'
            ? [{ estado: 'enviado' as const, texto: 'Volver a Enviado', detalle: 'Si te equivocaste al marcarlo' }]
            : [
                { estado: 'aceptado' as const, texto: 'Aceptado', detalle: 'El cliente aprobó el presupuesto' },
                { estado: 'rechazado' as const, texto: 'Rechazado', detalle: 'El cliente no lo aprobó' },
              ]
          ).map((o) => (
            <button key={o.estado} type="button" className="item" onClick={() => void cambiarEstado(o.estado)}>
              <span className="item-texto">
                <span className="item-titulo">{o.texto}</span>
                <span className="detalle">{o.detalle}</span>
              </span>
            </button>
          ))}
        </div>
      </Hoja>
      </div>
    </section>
  );
}

function Fila({ texto, monto, valor, fuerte }: { texto: string; monto?: number; valor?: string; fuerte?: boolean }) {
  return (
    <div className="item">
      <span className={`item-texto ${fuerte ? 'item-titulo' : ''}`}>{texto}</span>
      <span className={fuerte ? 'monto-fuerte' : undefined}>{valor ?? clp(monto ?? 0)}</span>
    </div>
  );
}
