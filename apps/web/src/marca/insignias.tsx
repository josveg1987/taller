import { Icono } from '../Iconos';
import { LOGOS_AUTOS } from './autos';

// Marcas combinantes de Unicode (las tildes tras normalizar a NFD).
const SIN_TILDES = new RegExp('[\u0300-\u036f]', 'g');

/** "Citroën" -> "citroen", "Mercedes-Benz" -> "mercedesbenz": minusculas, sin tildes, espacios ni guiones. */
export const claveMarca = (marca: string): string =>
  marca
    .normalize('NFD')
    .replace(SIN_TILDES, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// Como la gente escribe la marca a mano (el catalogo guarda texto libre).
const ALIAS: Record<string, string> = { vw: 'volkswagen', chevy: 'chevrolet' };

/** Iniciales: dos palabras -> primera letra de cada una ("Land Rover" = LR); una palabra -> sus dos primeras letras. */
export function iniciales(texto: string): string {
  const palabras = texto
    .normalize('NFD')
    .replace(SIN_TILDES, '')
    .split(/[\s-]+/)
    .filter((p) => /[A-Za-z0-9]/.test(p));
  if (palabras.length === 0) return '?';
  const letras = palabras.length >= 2 ? palabras[0][0] + palabras[1][0] : palabras[0].slice(0, 2);
  return letras.toUpperCase();
}

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
  const clave = claveMarca(nombre);
  const trazo = LOGOS_AUTOS[ALIAS[clave] ?? clave];
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
