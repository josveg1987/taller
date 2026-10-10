import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { Portada } from '../Portada';
import { useSesion } from '../sesion';

const MINIMO = 8;

/**
 * Formulario para cambiar la contraseña de la propia cuenta (pide la actual). Se usa en la hoja de la
 * cuenta y, con `temporal`, en la pantalla que obliga a cambiar una contraseña temporal.
 */
export function FormularioPassword({ temporal, onListo }: { temporal?: boolean; onListo(): void }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (nueva.length < MINIMO) return setError(`La contraseña nueva debe tener al menos ${MINIMO} caracteres.`);
    if (nueva !== repetida) return setError('Las contraseñas nuevas no coinciden.');
    if (nueva === actual) return setError('La contraseña nueva debe ser distinta de la actual.');
    setEnviando(true);
    try {
      await api('/auth/password', { method: 'POST', json: { actual, nueva } });
      onListo();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="formulario">
      <label className="campo">
        {temporal ? 'Contraseña temporal' : 'Contraseña actual'}
        {temporal && <span className="ayuda">La que te dieron para entrar.</span>}
        <input type="password" name="actual" autoComplete="current-password" required value={actual} onChange={(e) => setActual(e.target.value)} />
      </label>
      <label className="campo">
        Contraseña nueva
        <span className="ayuda">Mínimo {MINIMO} caracteres.</span>
        <input type="password" name="nueva" autoComplete="new-password" required minLength={MINIMO} value={nueva} onChange={(e) => setNueva(e.target.value)} />
      </label>
      <label className="campo">
        Repite la contraseña nueva
        <input type="password" name="repetida" autoComplete="new-password" required value={repetida} onChange={(e) => setRepetida(e.target.value)} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="boton" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar contraseña'}
      </button>
    </form>
  );
}

/** Pantalla que bloquea la app hasta que la persona cambia su contraseña temporal. */
export function CambiarPasswordObligatorio() {
  const { refrescar, salir } = useSesion();
  return (
    <Portada>
      <div>
        <h1>Elige tu contraseña</h1>
        <p className="subtitulo">Entraste con una contraseña temporal. Para continuar, crea una propia.</p>
      </div>
      <FormularioPassword temporal onListo={() => void refrescar()} />
      <button type="button" className="enlace" onClick={() => void salir()}>
        Cerrar sesión
      </button>
    </Portada>
  );
}
