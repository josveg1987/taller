import { useEffect } from 'react';
import { API_URL } from './api';
import { Inicio } from './Inicio';
import { Login } from './Login';
import { ProveedorSesion, useSesion } from './sesion';

function Pantalla() {
  const { estado, reintentar } = useSesion();

  if (estado.fase === 'cargando') {
    return (
      <main>
        <h1>Presupuestos</h1>
        <p className="estado conectando">Conectando con el servidor…</p>
      </main>
    );
  }
  if (estado.fase === 'sin-conexion') {
    return (
      <main>
        <h1>Presupuestos</h1>
        <p className="estado sin-conexion">Sin conexión con el servidor</p>
        <p>
          <button type="button" className="boton" onClick={reintentar}>
            Reintentar
          </button>
        </p>
      </main>
    );
  }
  return estado.fase === 'activa' ? <Inicio perfil={estado.perfil} /> : <Login />;
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
