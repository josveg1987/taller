import { useEffect } from 'react';
import { API_URL } from './api';
import { Aplicacion } from './Aplicacion';
import { Login } from './Login';
import { Portada } from './Portada';
import { ProveedorSesion, useSesion } from './sesion';

function Pantalla() {
  const { estado, reintentar } = useSesion();

  if (estado.fase === 'cargando') {
    return (
      <Portada ocupado>
        <h1>Presupuestos</h1>
        <p className="subtitulo">Conectando con el servidor…</p>
      </Portada>
    );
  }
  if (estado.fase === 'sin-conexion') {
    return (
      <Portada>
        <h1>Presupuestos</h1>
        <p className="error" role="alert">
          Sin conexión con el servidor
        </p>
        <button type="button" className="boton" onClick={reintentar}>
          Reintentar
        </button>
      </Portada>
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
