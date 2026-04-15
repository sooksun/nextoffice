import './load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json } from 'express';
import { AppModule } from './app.module';

/**
 * V8 old-space heap anchor — keeps ≈50 MB of live strings in old-space
 * as permanent GC roots, allocated at module-load time (before NestJS init).
 *
 * Root cause of OOM:
 *   NestJS baseline (≈88 MB) sits at 97% of V8's auto-sized initial old-space
 *   (≈90 MB on this host). Any allocation during job processing triggers
 *   consecutive "ineffective" mark-compact GC cycles → fatal OOM.
 *
 * Why the previous Uint8Array approach FAILED:
 *   TypedArray backing stores live in EXTERNAL memory (tracked separately by V8).
 *   They do NOT affect heapTotal or V8's old-space growth target — the V8 heap
 *   stayed at 90 MB even after allocating 200 MB of Uint8Array.
 *
 * This fix: 100 × 500 KB SeqOneByteStrings are real V8 old-space objects.
 *   Live old-space after NestJS init: ≈88 MB (NestJS) + ≈50 MB (anchor) = ≈138 MB.
 *   V8 heap target: 138 MB × growth_factor ≈ 200–350 MB → ample headroom.
 *   Memory cost: 50 MB of the container's 4 GB — acceptable.
 */
const _V8_HEAP_ANCHOR: string[] = Array.from(
  { length: 100 },
  () => 'a'.repeat(500_000), // 100 × 500 KB ≈ 50 MB in V8 old-space (SeqOneByteString)
);

async function bootstrap() {
  void _V8_HEAP_ANCHOR; // prevent dead-code elimination
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
}
bootstrap();
