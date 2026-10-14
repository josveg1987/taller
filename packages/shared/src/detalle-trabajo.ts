/**
 * Texto estandar de "Qué incluye el trabajo" que sale en el PDF. Cada taller puede reemplazarlo por el suyo
 * (Mi taller → Detalle del trabajo); si no lo cambia, se usa este. Un paso por linea.
 */
export const DETALLE_PINTURA_ESTANDAR = [
  'Lijado y preparación de la superficie.',
  'Aplicación de masilla en imperfecciones y lijado de terminación.',
  'Limpieza y protección de las zonas cercanas.',
  'Aplicación de base (primer) y lijado fino.',
  'Pintura con igualación del color original.',
  'Aplicación de barniz.',
  'Secado y revisión final de calidad.',
].join('\n');

export const DETALLE_DESABOLLADO_ESTANDAR = [
  'Revisión del daño y de la zona afectada.',
  'Enderezado y reparación de la chapa con técnica de desabolladura.',
  'Nivelación de la superficie con masilla y lijado.',
  'Pieza lista para el proceso de pintura.',
].join('\n');

/** El texto que se usa: el del taller, o el estandar si no escribio ninguno (vacio o solo espacios). */
export function detalleEfectivo(personalizado: string | null | undefined, estandar: string): string {
  return personalizado && personalizado.trim() ? personalizado.trim() : estandar;
}

/** Los pasos (uno por linea, sin lineas vacias) de un texto de detalle. */
export function pasosDeDetalle(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Lo que se guarda en la base: null (= usar el estandar) si el texto esta vacio o es igual al estandar,
 * asi cambiar el estandar mas adelante llega a los talleres que nunca lo personalizaron.
 */
export function detalleParaGuardar(texto: string | null | undefined, estandar: string): string | null {
  const limpio = (texto ?? '').trim();
  if (!limpio || pasosDeDetalle(limpio).join('\n') === pasosDeDetalle(estandar).join('\n')) return null;
  return limpio;
}
