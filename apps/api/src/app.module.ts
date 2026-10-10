import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { ClientesModule } from './clientes/clientes.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { PdfModule } from './pdf/pdf.module';
import { PiezasModule } from './piezas/piezas.module';
import { PresupuestosModule } from './presupuestos/presupuestos.module';
import { TallerModule } from './taller/taller.module';
import { VehiculosModule } from './vehiculos/vehiculos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    DatabaseModule,
    AuthModule,
    AdminModule,
    TallerModule,
    ClientesModule,
    VehiculosModule,
    CatalogoModule,
    PiezasModule,
    PresupuestosModule,
    PdfModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
