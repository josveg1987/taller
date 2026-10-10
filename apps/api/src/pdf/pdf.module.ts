import { Module } from '@nestjs/common';
import { PresupuestosModule } from '../presupuestos/presupuestos.module';
import { PdfController } from './pdf.controller';
import { PdfService } from './pdf.service';

@Module({
  imports: [PresupuestosModule],
  controllers: [PdfController],
  providers: [PdfService],
})
export class PdfModule {}
