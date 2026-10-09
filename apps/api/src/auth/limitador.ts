// Freno simple contra adivinar contrasenas: en memoria, por clave (IP + email).
// Suficiente para una sola instancia (Render gratis); con varias instancias habria que
// moverlo a la base de datos.
export class Limitador {
  private readonly intentos = new Map<string, { n: number; desde: number }>();

  constructor(
    private readonly maximo = 5,
    private readonly ventanaMs = 15 * 60 * 1000,
    private readonly ahora: () => number = Date.now,
  ) {}

  /** true si la clave ya agoto sus intentos fallidos en la ventana. */
  bloqueado(clave: string): boolean {
    const e = this.intentos.get(clave);
    if (!e) return false;
    if (this.ahora() - e.desde >= this.ventanaMs) {
      this.intentos.delete(clave);
      return false;
    }
    return e.n >= this.maximo;
  }

  fallo(clave: string): void {
    const e = this.intentos.get(clave);
    if (!e || this.ahora() - e.desde >= this.ventanaMs) {
      this.intentos.set(clave, { n: 1, desde: this.ahora() });
    } else {
      e.n += 1;
    }
    // Evita que el mapa crezca sin limite.
    if (this.intentos.size > 10_000) this.limpiar();
  }

  exito(clave: string): void {
    this.intentos.delete(clave);
  }

  private limpiar(): void {
    const t = this.ahora();
    for (const [k, e] of this.intentos) if (t - e.desde >= this.ventanaMs) this.intentos.delete(k);
  }
}
