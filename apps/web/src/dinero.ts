/** Pesos chilenos enteros: 80000 -> "$80.000". */
export const clp = (n: number): string =>
  n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
