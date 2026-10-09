// Iconos propios y genericos (trazos simples). No se copian iconos ni marca de otras plataformas.
const TRAZOS = {
  inicio: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
  talleres: 'M5 21V4h9v17M14 9h5v12M3 21h18M8 8h3M8 12h3M8 16h3',
  ajustes: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M8 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  usuarios: 'M9 11a3 3 0 1 0 0-6a3 3 0 0 0 0 6M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 11a2.5 2.5 0 1 0 0-5M17 14.2c2.4.5 4 2.5 4 5.8',
  chevron: 'M9 6l6 6-6 6',
  atras: 'M15 6l-6 6 6 6',
  check: 'M5 12l5 5 9-10',
  mas: 'M12 5v14M5 12h14',
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre }: { nombre: NombreIcono }) {
  return (
    <svg className="icono" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}
