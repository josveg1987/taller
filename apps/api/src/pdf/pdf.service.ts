import { Inject, Injectable } from '@nestjs/common';
import { dirname, join } from 'node:path';
import pdfmake = require('pdfmake');
import { DatabaseService } from '../database/database.service';
import { PresupuestosService } from '../presupuestos/presupuestos.service';
import { construirDocumento, type TallerParaPdf } from './pdf.documento';

// Roboto viene dentro de pdfmake; se registra una sola vez.
const FUENTES = join(dirname(require.resolve('pdfmake/package.json')), 'fonts', 'Roboto');
pdfmake.addFonts({
  Roboto: {
    normal: join(FUENTES, 'Roboto-Regular.ttf'),
    bold: join(FUENTES, 'Roboto-Medium.ttf'),
    italics: join(FUENTES, 'Roboto-Italic.ttf'),
    bolditalics: join(FUENTES, 'Roboto-MediumItalic.ttf'),
  },
});

/** Genera el PDF de un presupuesto a demanda (no se guarda: regla 5). */
@Injectable()
export class PdfService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PresupuestosService) private readonly presupuestos: PresupuestosService,
  ) {}

  async presupuesto(tallerId: string, id: string): Promise<{ numero: number; pdf: Buffer }> {
    const p = await this.presupuestos.obtener(tallerId, id);
    const { rows } = await this.db.conTaller(tallerId, (c) =>
      c.query<{
        nombre: string;
        direccion: string | null;
        telefono: string | null;
        datos_transferencia: string | null;
        logo_claro_svg: string | null;
      }>('SELECT nombre, direccion, telefono, datos_transferencia, logo_claro_svg FROM talleres',
      ),
    );
    const t = rows[0];
    const taller: TallerParaPdf = { nombre: t.nombre, direccion: t.direccion, telefono: t.telefono, datosTransferencia: t.datos_transferencia, logoSvg: t.logo_claro_svg };
    const pdf = await pdfmake.createPdf(construirDocumento(taller, p)).getBuffer();
    return { numero: p.numero, pdf: Buffer.from(pdf) };
  }
}
