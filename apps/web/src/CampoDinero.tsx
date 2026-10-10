import { useId } from 'react';

interface Props {
  etiqueta: string;
  valor: number;
  onCambio(n: number): void;
  ayuda?: string;
  /** Campo corto alineado a la derecha, para usarlo dentro de una fila. */
  corto?: boolean;
}

const formatear = (n: number) => (n === 0 ? '' : n.toLocaleString('es-CL'));

/** Monto en pesos chilenos enteros: se escribe con el teclado numerico y se muestra con puntos (80.000). */
export function CampoDinero({ etiqueta, valor, onCambio, ayuda, corto }: Props) {
  const id = useId();
  const input = (
    <input
      id={id}
      className={corto ? 'corto' : undefined}
      inputMode="numeric"
      autoComplete="off"
      placeholder="0"
      value={formatear(valor)}
      onChange={(e) => {
        const digitos = e.target.value.replace(/\D/g, '').slice(0, 10);
        onCambio(digitos ? Number(digitos) : 0);
      }}
    />
  );
  if (corto) {
    return (
      <label className="item campo-fila" htmlFor={id}>
        <span className="item-texto">
          <span className="item-titulo">{etiqueta} ($)</span>
          {ayuda && <span className="detalle">{ayuda}</span>}
        </span>
        {input}
      </label>
    );
  }
  return (
    <label className="campo" htmlFor={id}>
      {etiqueta} ($)
      {ayuda && <span className="ayuda">{ayuda}</span>}
      {input}
    </label>
  );
}
