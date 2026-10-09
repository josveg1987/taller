import { useState, type FormEvent } from 'react';
import { ApiError } from './api';
import { useSesion } from './sesion';

export function Login() {
  const { entrar } = useSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await entrar(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ocurrió un error inesperado');
      setEnviando(false);
    }
  }

  return (
    <main>
      <h1>Presupuestos</h1>
      <p className="detalle">Ingresa con tu cuenta para continuar.</p>
      <form onSubmit={enviar} className="formulario">
        <label>
          Correo
          <input
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Contraseña
          <span className="campo-clave">
            <input
              type={verClave ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="enlace" onClick={() => setVerClave((v) => !v)}>
              {verClave ? 'Ocultar' : 'Mostrar'}
            </button>
          </span>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="boton" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
