import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logging/json-logger';

/** Containers want one JSON object per line; a terminal wants Nest's colours. */
function wantsJsonLogs(): boolean {
  if (process.env.LOG_FORMAT === 'json') return true;
  if (process.env.LOG_FORMAT === 'pretty') return false;
  return process.env.NODE_ENV === 'production';
}

async function bootstrap(): Promise<void> {
  const jsonLogs = wantsJsonLogs();
  const app = await NestFactory.create(AppModule, { bufferLogs: jsonLogs });
  if (jsonLogs) app.useLogger(new JsonLogger());

  app.enableCors({
    origin:
      process.env.FRONTEND_URL ??
      process.env.CLIENT_ORIGIN ??
      'http://localhost:5173',
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  // Drains in-flight requests and closes the TypeORM pool on SIGTERM instead of
  // leaving a checkout transaction to be rolled back by InnoDB on process death.
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Mini E-commerce API')
    .setDescription('API documentation for the mini e-commerce backend.')
    .setVersion('1.0')
    // Controllers already carry @ApiBearerAuth(); without this the scheme they
    // reference does not exist and /api/docs renders no Authorize button.
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
