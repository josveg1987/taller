import { useEffect } from 'react';
import { API_URL } from './api';
import { Aplicacion } from './Aplicacion';
import { CambiarPasswordObligatorio } from './cuenta/CambiarPassword';
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
  if (estado.fase === 'activa') {
    // Una contrasena temporal (dada por un administrador) se cambia antes de usar la app.
    return estado.perfil.debeCambiarPassword ? <CambiarPasswordObligatorio /> : <Aplicacion perfil={estado.perfil} />;
  }
  return <Login />;
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
