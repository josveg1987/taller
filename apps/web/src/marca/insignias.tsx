import { iniciales, logoDeMarca } from '@taller/shared';
import { Icono } from '../Iconos';

/** Circulo con el logo de la marca del auto (o sus iniciales si no hay logo). Es decorativo: la marca va escrita al lado. */
export function InsigniaAuto({ marca }: { marca: string | null | undefined }) {
  const nombre = marca?.trim();
  if (!nombre) {
    return (
      <span className="insignia insignia-vacia" aria-hidden="true">
        <Icono nombre="auto" />
      </span>
    );
  }
  const trazo = logoDeMarca(nombre);
  return trazo ? (
    <span className="insignia" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d={trazo} />
      </svg>
    </span>
  ) : (
    <span className="insignia insignia-texto" aria-hidden="true">
      {iniciales(nombre)}
    </span>
  );
}

/** Circulo con las iniciales del cliente. */
export function InsigniaCliente({ nombre }: { nombre: string }) {
  return (
    <span className="insignia insignia-cliente" aria-hidden="true">
      {iniciales(nombre)}
    </span>
  );
}
