import { useState, type FormEvent } from 'react';
import { CampoDinero } from '../CampoDinero';
import { Hoja } from '../Hoja';
import { Icono } from '../Iconos';
import type { Actualizar } from './Asistente';
import type { DatosPresupuesto } from './datos';
import type { Borrador, ComboCatalogo, Lado, LineaBorrador, PiezaCatalogo, Posicion } from './tipos';

/** Una pieza entra como "reparar + pintura", con la tarifa y el desabollado sugerido que correspondan. */
function nuevaLinea(p: PiezaCatalogo, posicion: Posicion, d: DatosPresupuesto): LineaBorrador {
  return {
    clave: crypto.randomUUID(),
    piezaId: p.id,
    nombre: p.nombre,
    usaPosicion: p.usaPosicion,
    posicion,
    operacion: 'reparar',
    pintura: p.tarifaPintura ?? d.config.tarifaPintura,
    desabollado: p.desabolladoSugerido ?? 0,
    repuestoCosto: 0,
    margenPct: d.config.margenRepuestosPct,
    precio: 0,
  };
}

const posicionDe = (p: { usaPosicion: boolean }, lado: Lado): Posicion => (p.usaPosicion ? lado : 'no_aplica');

export function PasoPiezas({ b, actualizar, datos }: { b: Borrador; actualizar: Actualizar; datos: DatosPresupuesto }) {
  const [agregandoLibre, setAgregandoLibre] = useState(false);

  const tiene = (piezaId: string, posicion: Posicion) => b.lineas.some((l) => l.piezaId === piezaId && l.posicion === posicion);

  function alternar(p: PiezaCatalogo) {
    const posicion = posicionDe(p, b.lado);
    actualizar((x) => ({
      lineas: x.lineas.some((l) => l.piezaId === p.id && l.posicion === posicion)
        ? x.lineas.filter((l) => !(l.piezaId === p.id && l.posicion === posicion))
        : [...x.lineas, nuevaLinea(p, posicion, datos)],
    }));
  }

  function aplicarCombo(c: ComboCatalogo) {
    actualizar((x) => {
      const nuevas: LineaBorrador[] = [];
      for (const pc of c.piezas) {
        const p = datos.piezas.find((y) => y.id === pc.id);
        if (!p) continue; // pieza desactivada: no se ofrece
        const posicion = posicionDe(p, x.lado);
        if (x.lineas.some((l) => l.piezaId === p.id && l.posicion === posicion)) continue;
        nuevas.push(nuevaLinea(p, posicion, datos));
      }
      return { lineas: [...x.lineas, ...nuevas] };
    });
  }

  const libres = b.lineas.filter((l) => l.operacion === 'libre');

  return (
    <>
      <h2>Lado</h2>
      <div className="segmentos" role="group" aria-label="Lado del vehículo">
        {(['izquierda', 'derecha'] as const).map((lado) => (
          <button key={lado} type="button" className="segmento" aria-pressed={b.lado === lado} onClick={() => actualizar({ lado })}>
            {lado === 'izquierda' ? 'Izquierdo' : 'Derecho'}
          </button>
        ))}
      </div>
      <p className="ayuda">Las piezas que van por lado se agregan del lado elegido. Para el otro lado, cámbialo y vuelve a tocarlas.</p>

      {datos.combos.length > 0 && (
        <>
          <h2>Combos</h2>
          <div className="fila-montos">
            {datos.combos.map((c) => (
              <button key={c.id} type="button" className="chip-monto" onClick={() => aplicarCombo(c)}>
                <Icono nombre="mas" /> {c.nombre}
              </button>
            ))}
          </div>
        </>
      )}

      <h2>Piezas</h2>
      {datos.piezas.length === 0 ? (
        <p className="vacio">No tienes piezas. Cárgalas en Mi taller → Piezas.</p>
      ) : (
        <div className="rejilla-piezas">
          {datos.piezas.map((p) => {
            const marcada = tiene(p.id, posicionDe(p, b.lado));
            const izq = p.usaPosicion && tiene(p.id, 'izquierda');
            const der = p.usaPosicion && tiene(p.id, 'derecha');
            return (
              <button key={p.id} type="button" className="pieza-boton" aria-pressed={marcada} onClick={() => alternar(p)}>
                <span className="pieza-nombre">{p.nombre}</span>
                {(izq || der || (!p.usaPosicion && marcada)) && (
                  <span className="marcas-lado">
                    {!p.usaPosicion && <span className="marca-lado">✓</span>}
                    {izq && <span className="marca-lado">Izq</span>}
                    {der && <span className="marca-lado">Der</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <h2>Otros</h2>
      {libres.length > 0 && (
        <ul className="grupo">
          {libres.map((l) => (
            <li key={l.clave} className="item">
              <span className="item-texto">{l.nombre}</span>
              <button
                type="button"
                className="enlace peligro"
                aria-label={`Quitar ${l.nombre}`}
                onClick={() => actualizar((x) => ({ lineas: x.lineas.filter((y) => y.clave !== l.clave) }))}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="pila">
        <button type="button" className="boton secundario" onClick={() => setAgregandoLibre(true)}>
          <Icono nombre="mas" />
          Agregar ítem libre
        </button>
      </div>

      <Hoja abierta={agregandoLibre} titulo="Ítem libre" onCerrar={() => setAgregandoLibre(false)}>
        <FormularioLibre
          onAgregar={(nombre, precio) => {
            actualizar((x) => ({
              lineas: [
                ...x.lineas,
                {
                  clave: crypto.randomUUID(),
                  piezaId: null,
                  nombre,
                  usaPosicion: false,
                  posicion: 'no_aplica',
                  operacion: 'libre',
                  pintura: 0,
                  desabollado: 0,
                  repuestoCosto: 0,
                  margenPct: 0,
                  precio,
                },
              ],
            }));
            setAgregandoLibre(false);
          }}
        />
      </Hoja>
    </>
  );
}

function FormularioLibre({ onAgregar }: { onAgregar(nombre: string, precio: number): void }) {
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState(0);

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (nombre.trim()) onAgregar(nombre.trim(), precio);
  }

  return (
    <form onSubmit={enviar} className="formulario">
      <p className="ayuda">Algo que no es una pieza del catálogo: pulido, un repuesto especial, un servicio…</p>
      <label className="campo">
        Descripción
        <input required maxLength={80} autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <CampoDinero etiqueta="Precio" valor={precio} onCambio={setPrecio} />
      <button type="submit" className="boton">
        Agregar
      </button>
    </form>
  );
}
