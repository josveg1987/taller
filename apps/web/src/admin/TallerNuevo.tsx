import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { irA } from '../ruta';
import type { TallerResumen } from './tipos';

export function TallerNuevo() {
  const [nombre, setNombre] = useState('');
  const [maxUsuarios, setMaxUsuarios] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const t = await api<TallerResumen>('/admin/talleres', { method: 'POST', json: { nombre, maxUsuarios } });
      irA(`/talleres/${t.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el taller');
      setEnviando(false);
    }
  }

  return (
    <section>
      <button type="button" className="enlace" onClick={() => irA('/talleres')}>
        ← Talleres
      </button>
      <h1>Nuevo taller</h1>
      <form onSubmit={crear} className="formulario">
        <label>
          Nombre del taller
          <input required maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label>
          Máximo de usuarios
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            required
            value={maxUsuarios}
            onChange={(e) => setMaxUsuarios(Number(e.target.value))}
          />
        </label>
        <p className="detalle">Después de crearlo podrás agregar a sus usuarios.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="boton" disabled={enviando}>
          {enviando ? 'Creando…' : 'Crear taller'}
        </button>
      </form>
    </section>
  );
}
