import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logging/json-logger';
import {
  corsOrigins,
  requestBodyLimitBytes,
  swaggerEnabled,
  trustProxyHops,
} from './common/config/http-config';

/** Containers want one JSON object per line; a terminal wants Nest's colours. */
function wantsJsonLogs(): boolean {
  if (process.env.LOG_FORMAT === 'json') return true;
  if (process.env.LOG_FORMAT === 'pretty') return false;
  return process.env.NODE_ENV === 'production';
}

async function bootstrap(): Promise<void> {
  const jsonLogs = wantsJsonLogs();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: jsonLogs,
    bodyParser: false,
    rawBody: true,
  });
  if (jsonLogs) app.useLogger(new JsonLogger());

  app.useBodyParser('json', { limit: requestBodyLimitBytes(process.env) });
  app.useBodyParser('urlencoded', {
    limit: requestBodyLimitBytes(process.env),
    extended: true,
  });
  app.use(
    helmet({
      // Swagger uses inline scripts and styles. It is disabled by default in
      // production; deployments that opt it back in can supply CSP at a proxy.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', trustProxyHops(process.env));

  const allowedOrigins = corsOrigins(process.env);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error('Origin is not allowed by CORS'));
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Request-ID',
    ],
    // The SPA reads the CSV export filename from this header; CORS strips it
    // from cross-origin responses unless it is exposed.
    exposedHeaders: ['Content-Disposition'],
    maxAge: 86_400,
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

  if (swaggerEnabled(process.env)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Mini E-commerce API')
      .setDescription('API documentation for the mini e-commerce backend.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
