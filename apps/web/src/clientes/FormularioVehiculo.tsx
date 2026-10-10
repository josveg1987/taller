import { useState, type FormEvent } from 'react';
import type { Vehiculo } from './tipos';

export interface PayloadVehiculo {
  patente: string;
  marca: string;
  modelo: string;
  anio: number | null;
  color: string;
}

interface Props {
  inicial?: Vehiculo;
  textoBoton: string;
  error: string | null;
  onGuardar(datos: PayloadVehiculo): void;
}

/** Campos de un vehiculo. Solo la patente es obligatoria; el resto se completa cuando se sepa. */
export function FormularioVehiculo({ inicial, textoBoton, error, onGuardar }: Props) {
  const [patente, setPatente] = useState(inicial?.patente ?? '');
  const [marca, setMarca] = useState(inicial?.marca ?? '');
  const [modelo, setModelo] = useState(inicial?.modelo ?? '');
  const [anio, setAnio] = useState(inicial?.anio ? String(inicial.anio) : '');
  const [color, setColor] = useState(inicial?.color ?? '');

  function enviar(e: FormEvent) {
    e.preventDefault();
    onGuardar({ patente, marca, modelo, anio: anio.trim() ? Number(anio) : null, color });
  }

  return (
    <form onSubmit={enviar} className="formulario">
      <label className="campo">
        Patente
        <input
          className="campo-placa"
          required
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          value={patente}
          onChange={(e) => setPatente(e.target.value)}
        />
      </label>
      <label className="campo">
        Marca
        <input maxLength={60} autoComplete="off" value={marca} onChange={(e) => setMarca(e.target.value)} />
      </label>
      <label className="campo">
        Modelo
        <input maxLength={60} autoComplete="off" value={modelo} onChange={(e) => setModelo(e.target.value)} />
      </label>
      <label className="campo">
        Año
        <input type="number" inputMode="numeric" min={1900} max={2100} value={anio} onChange={(e) => setAnio(e.target.value)} />
      </label>
      <label className="campo">
        Color
        <input maxLength={40} autoComplete="off" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="boton">
        {textoBoton}
      </button>
    </form>
  );
}
