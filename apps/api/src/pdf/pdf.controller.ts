import { Controller, Get, Inject, Param, Res, StreamableFile } from '@nestjs/common';
import { TallerActual } from '../auth/decoradores';
import { idValido } from '../validacion';
import { PdfService } from './pdf.service';

@Controller('presupuestos')
export class PdfController {
  constructor(@Inject(PdfService) private readonly pdf: PdfService) {}

  /** El PDF del presupuesto, para verlo antes de enviarlo o para compartirlo. */
  @Get(':id/pdf')
  async descargar(@TallerActual() tallerId: string, @Param('id') id: string, @Res({ passthrough: true }) res: { setHeader(nombre: string, valor: string): void }) {
    const { numero, pdf } = await this.pdf.presupuesto(tallerId, idValido(id));
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(pdf, { type: 'application/pdf', disposition: `inline; filename="presupuesto-${numero}.pdf"` });
  }
}
