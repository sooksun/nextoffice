import './load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json } from 'express';
import { AppModule } from './app.module';

/**
 * V8 old-space heap anchor — 500 K plain JS objects (≈48 MB in regular old-space).
 *
 * Root cause of OOM:
 *   NestJS baseline (≈88 MB) sits at 97% of V8's auto-sized initial old-space
 *   (≈90 MB). Any allocation during job processing triggers consecutive
 *   "ineffective" mark-compact GC cycles → fatal OOM.
 *
 * Why previous attempts FAILED:
 *   1. Uint8Array (1 MB each): backing store → EXTERNAL memory, not old-space.
 *      heapTotal unchanged, GC threshold unaffected.
 *   2. String 'a'.repeat(500_000) (500 KB each): V8 puts objects > ~128 KB in
 *      Large Object Space (LOS). LOS is tracked separately — old-space "near
 *      heap limit" check ignores LOS. heapTotal showed only +4 MB (just headers).
 *
 * This fix: plain JS objects are always < kMaxRegularHeapObjectSize (~512 KB)
 *   and land in REGULAR old-space — the space that matters for GC limits.
 *   500 K × ~96 bytes = ≈48 MB in regular old-space.
 *   Live old-space after NestJS init: 88 + 48 = 136 MB.
 *   V8 heap target: 136 × growth_factor ≈ 200–350 MB → ample headroom for jobs.
 *   Cost: ≈48 MB of the container's 4 GB + ~130 ms extra startup time.
 */
const _V8_HEAP_ANCHOR: Array<{ v: number }> = Array.from(
  { length: 500_000 },
  (_, i) => ({ v: i }), // 500 K plain objects × ~96 bytes ≈ 48 MB in regular old-space
);
// Diagnostic: verify anchor actually landed in V8 heap (not external memory)
{
  const _h = process.memoryUsage();
  process.stdout.write(
    `[HeapAnchor] used=${Math.round(_h.heapUsed / 1e6)}MB total=${Math.round(_h.heapTotal / 1e6)}MB ext=${Math.round(_h.external / 1e6)}MB\n`,
  );
}

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
