import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icono } from './Iconos';

// Debe coincidir con --t-media de styles.css.
const DURACION_MS = 250;

const reducirMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Props {
  abierta: boolean;
  titulo: string;
  onCerrar(): void;
  children: ReactNode;
}

/**
 * Hoja que sube desde abajo (selecciones, confirmaciones y formularios cortos). Se cierra con
 * Escape o tocando fuera; mientras esta abierta el foco queda dentro y al cerrar vuelve al
 * elemento que la abrio.
 */
export function Hoja({ abierta, titulo, onCerrar, children }: Props) {
  const [montada, setMontada] = useState(abierta);
  const [visible, setVisible] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const origen = useRef<HTMLElement | null>(null);
  const idTitulo = useId();

  useEffect(() => {
    if (abierta) {
      origen.current = document.activeElement as HTMLElement | null;
      setMontada(true);
      // Dos cuadros: primero se pinta cerrada y despues se anima hacia arriba.
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(r);
    }
    setVisible(false);
    const t = window.setTimeout(
      () => {
        setMontada(false);
        origen.current?.focus?.();
      },
      reducirMovimiento() ? 0 : DURACION_MS,
    );
    return () => window.clearTimeout(t);
  }, [abierta]);

  useEffect(() => {
    if (visible) panel.current?.focus();
  }, [visible]);

  function alTeclear(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCerrar();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    const enfocables = panel.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!enfocables.length) return;
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    if (e.shiftKey && (document.activeElement === primero || document.activeElement === panel.current)) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  }

  if (!montada) return null;

  return createPortal(
    <div
      className={`hoja-velo ${visible ? 'visible' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        ref={panel}
        className="hoja"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        onKeyDown={alTeclear}
      >
        <div className="hoja-asa" aria-hidden="true" />
        <h2 id={idTitulo} className="hoja-titulo">
          {titulo}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmarProps {
  abierta: boolean;
  titulo: string;
  texto: string;
  textoBoton: string;
  /** Pinta el boton en rojo (accion destructiva). */
  peligro?: boolean;
  onConfirmar(): void;
  onCerrar(): void;
}

/** Confirmacion en hoja: reemplaza a window.confirm. */
export function HojaConfirmar({ abierta, titulo, texto, textoBoton, peligro, onConfirmar, onCerrar }: ConfirmarProps) {
  return (
    <Hoja abierta={abierta} titulo={titulo} onCerrar={onCerrar}>
      <p className="subtitulo">{texto}</p>
      <div className="pila">
        <button type="button" className={`boton ${peligro ? 'peligro' : ''}`} onClick={onConfirmar}>
          {textoBoton}
        </button>
        <button type="button" className="boton secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </Hoja>
  );
}

interface Opcion<T extends string> {
  valor: T;
  texto: string;
}

interface SelectorProps<T extends string> {
  abierta: boolean;
  titulo: string;
  opciones: readonly Opcion<T>[];
  valor: T;
  onElegir(valor: T): void;
  onCerrar(): void;
}

/** Seleccion de una opcion en hoja: reemplaza a <select>. */
export function HojaSelector<T extends string>({ abierta, titulo, opciones, valor, onElegir, onCerrar }: SelectorProps<T>) {
  return (
    <Hoja abierta={abierta} titulo={titulo} onCerrar={onCerrar}>
      <div className="grupo" role="radiogroup" aria-label={titulo}>
        {opciones.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={o.valor === valor}
            className="item opcion"
            onClick={() => {
              onElegir(o.valor);
              onCerrar();
            }}
          >
            <span className="item-texto">{o.texto}</span>
            {o.valor === valor && <Icono nombre="check" />}
          </button>
        ))}
      </div>
    </Hoja>
  );
}
