import './load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json } from 'express';
import { AppModule } from './app.module';

/**
 * V8 old-space heap anchor — stored on `global` so the job processor can RELEASE it.
 *
 * Strategy:
 *   1. At startup: allocate 500 K plain JS objects (≈48 MB regular old-space).
 *      This forces V8 to grow its heap from ~90 MB → ~136 MB initial target.
 *      NestJS init proceeds with headroom.
 *   2. At job start (KnowledgeImportProcessor.handleEmbed):
 *      Set `global.__v8HeapAnchor = null` → 48 MB becomes garbage.
 *      First auto-GC frees it: freed/live = 48/88 = 54% → EFFECTIVE.
 *      V8 grows heap: target = 88 × 1.5 = 132 MB → job has ~44 MB headroom.
 *   3. After job completes (finally block): recreate smaller anchor (≈24 MB)
 *      so startup invariant holds for subsequent jobs.
 *
 * Why plain JS objects (not TypedArray, not strings):
 *   - TypedArray: backing store → EXTERNAL memory, heapTotal unchanged.
 *   - Large strings > ~128 KB → Large Object Space (LOS). LOS not checked by
 *     old-space "near heap limit" policy. Only regular old-space matters.
 *   - Plain { v: i } objects are always < kMaxRegularHeapObjectSize → regular old-space.
 */
(global as any).__v8HeapAnchor = Array.from(
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
  void (global as any).__v8HeapAnchor; // prevent dead-code elimination
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
