/** Pesos chilenos enteros: 80000 -> "$80.000"; -10000 -> "-$10.000" (es-CL pondria "$-10.000"). */
export const clp = (n: number): string =>
  (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
