import { Module } from '@nestjs/common';
import { CombosService } from './combos.service';
import { CombosController, PiezasController } from './piezas.controller';
import { PiezasService } from './piezas.service';

@Module({
  controllers: [PiezasController, CombosController],
  providers: [PiezasService, CombosService],
})
export class PiezasModule {}
