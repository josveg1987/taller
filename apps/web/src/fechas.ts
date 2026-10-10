/** "2026-10-10" -> "10-10-2026" (como se escriben las fechas en Chile). */
export const fechaCorta = (iso: string) => iso.split('-').reverse().join('-');

/** Hace cuanto, en palabras simples ("hace 5 minutos"), para los borradores. */
export function haceCuanto(ms: number, ahora = Date.now()): string {
  const min = Math.round((ahora - ms) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}
