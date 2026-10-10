/** Enlace para llamar desde el celular. */
export const enlaceLlamada = (telefono: string) => `tel:${telefono.replace(/[^\d+]/g, '')}`;

/**
 * Enlace de WhatsApp. WhatsApp pide el numero con codigo de pais y solo digitos: un celular chileno
 * de 9 digitos (9XXXXXXXX) se completa con 56.
 */
export function enlaceWhatsApp(telefono: string): string {
  const digitos = telefono.replace(/\D/g, '');
  const completo = digitos.length === 9 && digitos.startsWith('9') ? `56${digitos}` : digitos;
  return `https://wa.me/${completo}`;
}
