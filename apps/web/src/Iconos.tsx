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
  clientes: 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8M4 21c0-4 3.6-7 8-7s8 3 8 7',
  buscar: 'M11 18a7 7 0 1 0 0-14a7 7 0 0 0 0 14M21 21l-5-5',
  telefono: 'M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  mensaje: 'M4 5h16v11H9l-5 4z',
  documento: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  cerrar: 'M6 6l12 12M18 6L6 18',
  papelera: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  filtro: 'M4 6h16M7 12h10M10 18h4',
  banco: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18',
  servicio: 'M12 3l2 5 5 .5-4 3.5 1.3 5L12 14.3 7.7 17l1.3-5L5 8.5 10 8z',
  auto: 'M4 15v-3l2-5h12l2 5v3M4 15h16M4 15v3h3v-3M17 15v3h3v-3',
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre }: { nombre: NombreIcono }) {
  return (
    <svg className="icono" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}
