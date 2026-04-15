import './load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json } from 'express';
import { AppModule } from './app.module';

/**
 * Pre-warm the V8 heap so that NestJS baseline (~86MB) is not at 95% of the
 * initial heap size (~91MB). Without this, any tiny allocation after startup
 * triggers consecutive "ineffective" mark-compact GC cycles → fatal OOM.
 *
 * Strategy: allocate ~200MB of temporary objects so V8 grows the old-space
 * heap. After the function returns, objects become unreachable and V8 GCs them,
 * but the heap SIZE stays elevated (V8 never shrinks below its peak). Result:
 * NestJS 86MB / 300MB+ heap = <30% utilization → no GC pressure during jobs.
 */
function prewarmHeap() {
  const buckets: Uint8Array[] = [];
  try {
    for (let i = 0; i < 200; i++) {
      buckets.push(new Uint8Array(1_000_000)); // 200 × 1MB = 200MB total
    }
  } catch {
    // ignore — if allocation fails, heap is still larger than before
  }
  buckets.length = 0; // dereference all — eligible for GC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (global as any).gc === 'function') (global as any).gc();
  // V8 heap is now grown and stable at a larger size
}

async function bootstrap() {
  prewarmHeap();
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
