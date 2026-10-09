import { useEffect } from 'react';
import { API_URL } from './api';
import { Aplicacion } from './Aplicacion';
import { Login } from './Login';
import { ProveedorSesion, useSesion } from './sesion';

function Pantalla() {
  const { estado, reintentar } = useSesion();

  if (estado.fase === 'cargando') {
    return (
      <div className="app">
        <main className="contenido centrado" aria-busy="true">
          <h1>Presupuestos</h1>
          <p className="chip conectando">Conectando con el servidor…</p>
        </main>
      </div>
    );
  }
  if (estado.fase === 'sin-conexion') {
    return (
      <div className="app">
        <main className="contenido centrado">
          <h1>Presupuestos</h1>
          <p className="chip sin-conexion" role="alert">
            Sin conexión con el servidor
          </p>
          <button type="button" className="boton" onClick={reintentar}>
            Reintentar
          </button>
        </main>
      </div>
    );
  }
  return estado.fase === 'activa' ? <Aplicacion perfil={estado.perfil} /> : <Login />;
}

export function App() {
  // Despierta el servidor apenas se abre la app (Render plan gratis se duerme a los 15 min).
  useEffect(() => {
    fetch(`${API_URL}/health`).catch(() => undefined);
  }, []);

  return (
    <ProveedorSesion>
      <Pantalla />
    </ProveedorSesion>
  );
}
