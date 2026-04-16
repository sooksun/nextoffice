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

  // Heap keepalive: prevents V8 idle GC from shrinking committed heap to the bare
  // live-set minimum (~88 MB NestJS baseline × 1.05 = ~92 MB), leaving no room
  // for fork() + IPC overhead → 3× ineffective mark-compact → FATAL OOM.
  //
  // Key: null the OLD reference BEFORE creating the new array.
  // Without this, during Array.from() both old+new are live → GC finds 0 freeable
  // → still ineffective. With null-first: old 20 MB becomes garbage in old-space,
  // Array.from() triggers GC, frees old 20 MB → 20/(88+20)=18.5% > 5% → EFFECTIVE
  // → V8 keeps committed at (108)×1.5 = 162 MB → 54 MB headroom for any job.
  let _heapKeepAlive: Array<{ v: number }> | null = null;
  function _refreshHeapKeepAlive() {
    _heapKeepAlive = null; // release old → becomes old-space garbage, GC can free it
    _heapKeepAlive = Array.from({ length: 500_000 }, (_, i) => ({ v: i })); // ~20 MB
  }
  _refreshHeapKeepAlive(); // immediate: raise live set before the first job arrives
  setInterval(_refreshHeapKeepAlive, 3_000).unref(); // cycle every 3 s
}
bootstrap();
