import { useState, type KeyboardEvent } from 'react';
import {
  fondoDelPlano,
  piezasDelPlano,
  ROTULOS_PLANO,
  VISTAS_PLANO,
  ZONAS,
  type LadoPlano,
  type VistaPlano,
  type Zona,
} from '@taller/shared/plano';
import { nombreConLado, type LineaBorrador, type PiezaCatalogo, type Posicion } from './tipos';

const FONDO = fondoDelPlano();
const PIEZAS = piezasDelPlano();

interface Props {
  piezas: PiezaCatalogo[];
  lineas: LineaBorrador[];
  onAlternar(pieza: PiezaCatalogo, posicion: Posicion): void;
}

/**
 * Plano del auto (4 vistas) para elegir piezas con un toque. Cada zona corresponde a la pieza del taller que
 * tiene esa zona; tocarla en cualquier vista la agrega o la quita, y se marca en todas. Una zona sin pieza
 * activa en el taller se dibuja pero no se puede tocar (la pieza sigue en la lista de abajo si existe).
 */
export default function PlanoAuto({ piezas, lineas, onAlternar }: Props) {
  const [vista, setVista] = useState<VistaPlano>('todo');
  const [aviso, setAviso] = useState('Toca una pieza del auto para agregarla o quitarla.');
  const porZona = new Map<Zona, PiezaCatalogo>();
  for (const p of piezas) if (p.zona) porZona.set(p.zona, p);

  const posicionDe = (lado: LadoPlano | null): Posicion => lado ?? 'no_aplica';
  const marcada = (pieza: PiezaCatalogo, lado: LadoPlano | null) =>
    lineas.some((l) => l.piezaId === pieza.id && l.posicion === posicionDe(lado));

  function tocar(pieza: PiezaCatalogo, lado: LadoPlano | null) {
    const nombre = nombreConLado(pieza.nombre, posicionDe(lado));
    setAviso(`${marcada(pieza, lado) ? 'Quitado' : 'Agregado'}: ${nombre}`);
    onAlternar(pieza, posicionDe(lado));
  }

  return (
    <div className="plano">
      <div className="segmentos ancho compactos" role="group" aria-label="Vista del auto">
        {(Object.keys(VISTAS_PLANO) as VistaPlano[]).map((v) => (
          <button key={v} type="button" className="segmento" aria-pressed={vista === v} onClick={() => setVista(v)}>
            {VISTAS_PLANO[v].texto}
          </button>
        ))}
      </div>
      <div className="plano-dibujo">
        <svg viewBox={VISTAS_PLANO[vista].viewBox} role="group" aria-label="Plano del auto: vista superior, laterales, frente y atrás. Toca una pieza para agregarla o quitarla.">
          <defs>
            <pattern id="plano-marcada" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="18" height="18" className="plano-franja-fondo" />
              <rect width="18" height="7" className="plano-franja" />
            </pattern>
          </defs>
          {vista === 'todo' &&
            ROTULOS_PLANO.map((r) => (
              <text key={r.texto} x={r.x} y={r.y} className="plano-rotulo">
                {r.texto}
              </text>
            ))}
          {FONDO.vidrios.map((v) => (
            <path key={v.transform} transform={v.transform} className="plano-vidrio" fillRule="evenodd" d={v.d} />
          ))}
          {PIEZAS.map((pp) => {
            const pieza = porZona.get(pp.zona);
            // Una pieza por lado solo calza con la zona por lado (lo valida la API); si no, la zona queda inerte.
            const usable = pieza && pieza.usaPosicion === ZONAS[pp.zona].porLado;
            const on = usable ? marcada(pieza, pp.lado) : false;
            const trozos = pp.trozos.map((t, i) => (
              <g key={i} transform={t.transform}>
                <path className="plano-chapa" fillRule="evenodd" d={t.s} />
                {t.gl && <path className="plano-ventana" fillRule="evenodd" d={t.gl} />}
                {t.area?.tipo === 'circulo' && <circle className="plano-area" cx={t.area.cx} cy={t.area.cy} r={t.area.r} />}
                {t.area?.tipo === 'rect' && <rect className="plano-area" x={t.area.x} y={t.area.y} width={t.area.w} height={t.area.h} />}
              </g>
            ));
            if (!usable) return <g key={pp.clave}>{trozos}</g>;
            return (
              <g
                key={pp.clave}
                className={`plano-pieza${on ? ' marcada' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={nombreConLado(pieza.nombre, posicionDe(pp.lado))}
                onClick={() => tocar(pieza, pp.lado)}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    tocar(pieza, pp.lado);
                  }
                }}
              >
                {trozos}
              </g>
            );
          })}
          {FONDO.focos.map((f, i) => (
            <path key={i} transform={f.transform} className="plano-foco" fillRule="evenodd" d={f.d} />
          ))}
          {FONDO.arte.map((a) => (
            <g key={a.transform} transform={a.transform} className="plano-linea">
              {a.d.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          ))}
        </svg>
      </div>
      <div className="plano-leyenda">
        <span>
          <i className="plano-muestra marcada" /> En el presupuesto
        </span>
        <span>
          <i className="plano-muestra" /> Sin elegir
        </span>
      </div>
      <p className="ayuda centro" role="status" aria-live="polite">
        {aviso}
      </p>
    </div>
  );
}
