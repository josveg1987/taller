import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  // La PWA lo llama al abrirse para despertar el servidor (Render plan gratis).
  // Siempre responde 200; el estado de la base va en el cuerpo.
  @Get()
  async health() {
    return { status: 'ok', time: new Date().toISOString(), db: await this.db.ping() };
  }
}
