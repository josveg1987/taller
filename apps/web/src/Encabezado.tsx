import { createContext, useContext, type ReactNode } from 'react';
import { Icono } from './Iconos';
import { useMarca } from './marca';
import { irA } from './ruta';
import { useSesion } from './sesion';

/** La abre Aplicacion: el avatar de cada encabezado muestra la hoja de la cuenta. */
export const AbrirCuenta = createContext<() => void>(() => undefined);

interface Props {
  titulo: string;
  sub?: ReactNode;
  /** Boton para volver: texto y ruta (o una funcion). */
  atras?: { texto: string; ruta?: string; onClick?: () => void };
  /** Paso actual del asistente (1 a 3): muestra "Paso N de 3" y la barra de avance. */
  paso?: 1 | 2 | 3;
}

/** Encabezado con la marca al inicio de cada pantalla: logo, avatar, titulo grande y, si aplica, el paso. */
export function Encabezado({ titulo, sub, atras, paso }: Props) {
  const marca = useMarca();
  const abrirCuenta = useContext(AbrirCuenta);
  const { estado } = useSesion();
  const perfil = estado.fase === 'activa' ? estado.perfil : null;
  const inicial = (perfil?.nombre.match(/\p{L}/u)?.[0] ?? '?').toUpperCase();
  const contexto = perfil ? (perfil.tipo === 'admin_app' ? 'Administrador de la APP' : perfil.taller?.nombre) : undefined;

  return (
    <header className="encabezado">
      <div className="encabezado-fila">
        {atras && (
          <button type="button" className="atras" onClick={() => (atras.onClick ? atras.onClick() : atras.ruta && irA(atras.ruta))}>
            <Icono nombre="atras" />
            {atras.texto}
          </button>
        )}
        <img className={`encabezado-logo ${atras ? 'chico' : ''}`} src={marca.logoHorizontal} alt={marca.nombre} />
        <button type="button" className="avatar" aria-label={`Cuenta de ${perfil?.nombre ?? ''}`} onClick={abrirCuenta}>
          {inicial}
        </button>
      </div>
      {paso ? (
        <div>
          <div className="pasos-etiqueta">Paso {paso} de 3</div>
          <div className="pasos-barra" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <span key={n} className={`paso-seg ${n <= paso ? 'hecho' : ''}`} />
            ))}
          </div>
        </div>
      ) : (
        !atras && contexto && <div className="encabezado-contexto">{contexto}</div>
      )}
      <div>
        <h1>{titulo}</h1>
        {sub && <div className="encabezado-sub">{sub}</div>}
      </div>
    </header>
  );
}
