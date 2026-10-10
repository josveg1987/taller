import { useState } from 'react';
import { CampoDinero } from '../CampoDinero';
import { clp } from '../dinero';
import type { Actualizar } from './Asistente';
import type { Totales } from './calculo';
import type { DatosPresupuesto } from './datos';
import { nombreConLado, type Borrador, type LineaBorrador } from './tipos';

interface Props {
  b: Borrador;
  actualizar: Actualizar;
  datos: DatosPresupuesto;
  totales: Totales;
}

export function PasoAjustes({ b, actualizar, datos, totales }: Props) {
  const [vistaInterna, setVistaInterna] = useState(false);

  const cambiarLinea = (clave: string, cambio: Partial<LineaBorrador>) =>
    actualizar((x) => ({ lineas: x.lineas.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)) }));
  const quitar = (clave: string) => actualizar((x) => ({ lineas: x.lineas.filter((l) => l.clave !== clave) }));

  return (
    <div className="cuerpo sobre-encabezado">
      {b.lineas.length === 0 && <p className="vacio">No hay piezas. Vuelve al paso anterior para agregarlas.</p>}

      {b.lineas.map((l, i) => (
        <Linea
          key={l.clave}
          linea={l}
          precio={totales.lineas[i]?.precioTotal ?? 0}
          montosRapidos={datos.config.montosDesabollado}
          onCambio={(c) => cambiarLinea(l.clave, c)}
          onQuitar={() => quitar(l.clave)}
        />
      ))}

      <h2>Plazo, descuento y notas</h2>
      <div className="grupo">
        <CampoDias valor={b.plazoDias ?? 0} onCambio={(plazoDias) => actualizar({ plazoDias })} />
        <CampoDinero corto etiqueta="Descuento" valor={b.descuento} onCambio={(descuento) => actualizar({ descuento })} />
      </div>
      <div className="grupo formulario">
        <label className="campo">
          Observaciones
          <span className="ayuda">Van en el PDF. Por ejemplo: “Trabajo incluye pulido general”.</span>
          <textarea rows={3} maxLength={2000} value={b.observaciones} onChange={(e) => actualizar({ observaciones: e.target.value })} />
        </label>
        <label className="campo">
          Condiciones
          <span className="ayuda">Parten con las de tu taller; aquí cambian solo para este presupuesto.</span>
          <textarea
            rows={4}
            maxLength={4000}
            value={b.condiciones ?? datos.config.condiciones}
            onChange={(e) => actualizar({ condiciones: e.target.value })}
          />
        </label>
      </div>

      <h2>Resumen</h2>
      <div className="grupo">
        <FilaMonto texto="Subtotal" monto={totales.subtotal} />
        {b.descuento > 0 && <FilaMonto texto="Descuento" monto={-Math.min(b.descuento, totales.subtotal)} />}
        <FilaMonto texto="Total" monto={totales.total} fuerte />
        <FilaMonto texto="Para iniciar el trabajo" monto={totales.montoInicio} />
      </div>
      {b.descuento > totales.subtotal && (
        <p className="error" role="alert">
          El descuento es mayor que el subtotal.
        </p>
      )}

      <div className="grupo">
        <label className="item campo-fila">
          <span className="item-texto">
            <span className="item-titulo">Vista interna</span>
            <span className="detalle">Tu costo y ganancia en repuestos. Nunca aparece en el PDF.</span>
          </span>
          <input type="checkbox" role="switch" className="interruptor" checked={vistaInterna} onChange={(e) => setVistaInterna(e.target.checked)} />
        </label>
        {vistaInterna && (
          <>
            <FilaMonto texto="Costo de repuestos" monto={totales.costoRepuestos} />
            <FilaMonto texto="Repuestos con margen" monto={totales.precioRepuestos} />
            <FilaMonto texto="Ganancia en repuestos" monto={totales.gananciaRepuestos} fuerte />
          </>
        )}
      </div>
    </div>
  );
}

function FilaMonto({ texto, monto, fuerte }: { texto: string; monto: number; fuerte?: boolean }) {
  return (
    <div className="item">
      <span className={`item-texto ${fuerte ? 'item-titulo' : ''}`}>{texto}</span>
      <span className={fuerte ? 'monto-fuerte' : undefined}>{clp(monto)}</span>
    </div>
  );
}

function Linea({
  linea: l,
  precio,
  montosRapidos,
  onCambio,
  onQuitar,
}: {
  linea: LineaBorrador;
  precio: number;
  montosRapidos: number[];
  onCambio(c: Partial<LineaBorrador>): void;
  onQuitar(): void;
}) {
  return (
    <div className="grupo linea-presupuesto">
      <div className="item">
        <span className="item-texto">
          <span className="item-titulo">{nombreConLado(l.nombre, l.posicion)}</span>
          {l.operacion === 'libre' && <span className="detalle">Ítem libre</span>}
        </span>
        <button type="button" className="enlace peligro" aria-label={`Quitar ${l.nombre}`} onClick={onQuitar}>
          Quitar
        </button>
      </div>

      {l.operacion === 'libre' ? (
        <CampoDinero corto etiqueta="Precio" valor={l.precio} onCambio={(precio) => onCambio({ precio })} />
      ) : (
        <>
          <div className="item">
            <div className="segmentos ancho" role="group" aria-label={`Qué se hace con ${l.nombre}`}>
              <button type="button" className="segmento" aria-pressed={l.operacion === 'reparar'} onClick={() => onCambio({ operacion: 'reparar' })}>
                Reparar
              </button>
              <button type="button" className="segmento" aria-pressed={l.operacion === 'reemplazar'} onClick={() => onCambio({ operacion: 'reemplazar' })}>
                Cambiar
              </button>
            </div>
          </div>
          <CampoDinero corto etiqueta="Pintura" ayuda="Mano de obra y materiales" valor={l.pintura} onCambio={(pintura) => onCambio({ pintura })} />
          {l.operacion === 'reparar' ? (
            <>
              <CampoDinero corto etiqueta="Desabollado" ayuda="Mano de obra" valor={l.desabollado} onCambio={(desabollado) => onCambio({ desabollado })} />
              {montosRapidos.length > 0 && (
                <div className="item columna">
                  <div className="fila-montos" role="group" aria-label="Montos rápidos de desabollado">
                    {montosRapidos.map((m) => (
                      <button key={m} type="button" className="chip-monto" aria-pressed={l.desabollado === m} onClick={() => onCambio({ desabollado: m })}>
                        {clp(m)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <CampoDinero corto etiqueta="Costo del repuesto" ayuda="Lo que te cuesta a ti" valor={l.repuestoCosto} onCambio={(repuestoCosto) => onCambio({ repuestoCosto })} />
              <CampoMargen valor={l.margenPct} onCambio={(margenPct) => onCambio({ margenPct })} />
            </>
          )}
        </>
      )}

      <div className="item">
        <span className="item-texto detalle">Precio para el cliente</span>
        <span className="monto-fuerte">{clp(precio)}</span>
      </div>
    </div>
  );
}

/** Plazo total del trabajo en dias habiles (vacio = sin plazo). */
function CampoDias({ valor, onCambio }: { valor: number; onCambio(n: number): void }) {
  return (
    <label className="item campo-fila">
      <span className="item-texto">
        <span className="item-titulo">Plazo estimado (días hábiles)</span>
        <span className="detalle">Todo el trabajo. Opcional</span>
      </span>
      <input
        className="corto"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0"
        value={valor === 0 ? '' : String(valor)}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, '').slice(0, 3);
          onCambio(Math.min(Number(digitos) || 0, 365));
        }}
      />
    </label>
  );
}

/** Margen en %, con coma o punto decimal (22,5). */
function CampoMargen({ valor, onCambio }: { valor: number; onCambio(n: number): void }) {
  const [texto, setTexto] = useState(String(valor).replace('.', ','));
  return (
    <label className="item campo-fila">
      <span className="item-texto">
        <span className="item-titulo">Margen del repuesto (%)</span>
        <span className="detalle">Se suma al costo del repuesto</span>
      </span>
      <input
        className="corto"
        inputMode="decimal"
        autoComplete="off"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          const n = Number(e.target.value.replace(',', '.'));
          if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 500) onCambio(Math.round(n * 100) / 100);
          if (e.target.value.trim() === '') onCambio(0);
        }}
      />
    </label>
  );
}
