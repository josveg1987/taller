import { Inject, Injectable } from '@nestjs/common';
import { DETALLE_DESABOLLADO_ESTANDAR, DETALLE_PINTURA_ESTANDAR, detalleEfectivo, pasosDeDetalle } from '@taller/shared';
import { dirname, join } from 'node:path';
import pdfmake = require('pdfmake');
import { DatabaseService } from '../database/database.service';
import { PresupuestosService } from '../presupuestos/presupuestos.service';
import { construirDocumento, type CuentaParaPdf, type TallerParaPdf } from './pdf.documento';

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
    const { taller, cuentas } = await this.db.conTaller(tallerId, async (c) => {
      const t = await c.query<{
        nombre: string;
        direccion: string | null;
        telefono: string | null;
        datos_transferencia: string | null;
        logo_claro_svg: string | null;
        detalle_pintura: string | null;
        detalle_desabollado: string | null;
      }>('SELECT nombre, direccion, telefono, datos_transferencia, logo_claro_svg, detalle_pintura, detalle_desabollado FROM talleres');
      const k = await c.query<{ titular: string; rut: string; banco: string; tipo_cuenta: CuentaParaPdf['tipoCuenta']; numero: string; email: string | null }>(
        'SELECT titular, rut, banco, tipo_cuenta, numero, email FROM cuentas_bancarias WHERE activa ORDER BY orden, creado_en',
      );
      return { taller: t.rows[0], cuentas: k.rows };
    });
    const datos: TallerParaPdf = {
      nombre: taller.nombre,
      direccion: taller.direccion,
      telefono: taller.telefono,
      notaPago: taller.datos_transferencia,
      logoSvg: taller.logo_claro_svg,
      cuentas: cuentas.map((x) => ({ titular: x.titular, rut: x.rut, banco: x.banco, tipoCuenta: x.tipo_cuenta, numero: x.numero, email: x.email })),
      detallePintura: pasosDeDetalle(detalleEfectivo(taller.detalle_pintura, DETALLE_PINTURA_ESTANDAR)),
      detalleDesabollado: pasosDeDetalle(detalleEfectivo(taller.detalle_desabollado, DETALLE_DESABOLLADO_ESTANDAR)),
    };
    const pdf = await pdfmake.createPdf(construirDocumento(datos, p)).getBuffer();
    return { numero: p.numero, pdf: Buffer.from(pdf) };
  }
}
