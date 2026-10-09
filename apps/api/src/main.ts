import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Render pone un proxy delante: asi req.ip es la IP real del visitante.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  const origins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins?.length ? origins : true, credentials: true });
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

bootstrap();
