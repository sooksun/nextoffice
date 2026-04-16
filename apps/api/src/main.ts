import './load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json } from 'express';
import { AppModule } from './app.module';

/**
 * V8 heap anchor — forces NestJS parent process heap target above OOM threshold.
 *
 * Problem: V8 auto-sizes initial old-space to cgroup_memory/45 ≈ 91 MB.
 * NestJS DI fills ≈88 MB = 97% of limit. Any allocation triggers GC.
 * GC frees 0 bytes (all objects are live NestJS DI singletons) →
 * "ineffective" counter → after 3 consecutive ineffective cycles → OOM.
 * This happens even before job processing starts (e.g. fork() for OCR child).
 *
 * Fix: allocate 48 MB of small JS objects (guaranteed regular old-space,
 * not LOS or external). Live old-space: 88 + 48 = 136 MB.
 * V8 heap target: 136 × 1.5 growth_factor ≈ 204 MB.
 * Parent has ≈68 MB headroom for fork(), IPC, embeddings, Qdrant calls.
 * OCR runs in a child process with its own 512 MB heap — no OOM risk there.
 *
 * Why plain {v:i} objects (not TypedArray or large strings):
 *   TypedArray → external memory (not heapTotal). Strings > 128 KB → LOS
 *   (not checked by old-space limit policy). Plain objects always land in
 *   regular old-space which is what V8's "near heap limit" check uses.
 */
const _V8_HEAP_ANCHOR = Array.from({ length: 500_000 }, (_, i) => ({ v: i }));
void _V8_HEAP_ANCHOR; // keep reference alive — never release
{
  const _h = process.memoryUsage();
  process.stdout.write(
    `[HeapAnchor] used=${Math.round(_h.heapUsed / 1e6)}MB total=${Math.round(_h.heapTotal / 1e6)}MB ext=${Math.round(_h.external / 1e6)}MB\n`,
  );
}

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
}
bootstrap();
