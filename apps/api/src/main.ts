import './load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      strictTransportSecurity: false,
    }),
  );
  app.enableCors({
    origin: (process.env.WEB_URL || 'http://localhost:3001,https://nextoffice.cnppai.com')
      .split(',')
      .map((s) => s.trim()),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Enable raw body parsing for LINE webhook signature validation
  app.use(
    json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('NextOffice AI E-office API')
    .setDescription('AI-powered document management system for Thai schools')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Redirect root to Swagger docs
  app.use('/', (req: any, res: any, next: any) => {
    if (req.method === 'GET' && req.path === '/') {
      return res.redirect('/api/docs');
    }
    next();
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 NextOffice API running on http://localhost:${port}`);
  console.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);

  // Heap keepalive: prevents V8 idle GC from shrinking committed heap below NestJS
  // baseline + job headroom. Without this, idle periods cause committed heap to decay
  // from ~132 MB → ~92 MB (= live × 1.05 ≈ 88 × 1.05). When a job then allocates
  // ~2 MB (file base64 + IPC JSON for child.send), GC triggers, finds 0 bytes
  // freeable (all NestJS DI singletons are live) → 3× ineffective → FATAL OOM.
  //
  // Mechanism: cycle ~10 MB of plain objects every 5 s. Old allocation is promoted
  // to old-space (~1 s), becomes garbage when reference is replaced. Major GC frees
  // the old 10 MB → 10/(88+10) = 10.2% > 5% threshold → EFFECTIVE → V8 keeps
  // committed heap at ~147 MB → 57 MB headroom for job allocations.
  let _heapKeepAlive: Array<{ v: number }> | null = null;
  setInterval(() => {
    _heapKeepAlive = Array.from({ length: 300_000 }, (_, i) => ({ v: i }));
  }, 5_000).unref();
}
bootstrap();
