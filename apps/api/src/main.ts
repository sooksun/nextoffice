import './load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json } from 'express';
import { AppModule } from './app.module';
import { MulterExceptionFilter } from './common/multer-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // HSTS is opt-in (ENABLE_HSTS=true) — keep off until HTTPS is stable; NPM can also terminate TLS/HSTS.
  const enableHsts = process.env.ENABLE_HSTS === 'true';
  app.use(
    helmet({
      // CSP in Report-Only mode: browsers report violations but never block, so it is
      // safe to ship without breaking LIFF/Google. Flip reportOnly:false after the
      // reports are clean to actually enforce it.
      contentSecurityPolicy: {
        useDefaults: true,
        reportOnly: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            'https://accounts.google.com',
            'https://apis.google.com',
            'https://static.line-scdn.net',
          ],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
          connectSrc: ["'self'", 'https:', 'wss:'],
          frameSrc: ["'self'", 'https://accounts.google.com', 'https://*.line.me'],
          frameAncestors: ["'self'", 'https://*.line.me'],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      // Keep these off: COEP/COOP break LIFF iframes + OAuth popups; CORP is handled by CORS.
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      strictTransportSecurity: enableHsts
        ? { maxAge: 15552000, includeSubDomains: true }
        : false,
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

  // Map Multer upload errors (size/type) to clean 4xx responses.
  app.useGlobalFilters(new MulterExceptionFilter());

  // Swagger exposes the full API surface + DTO schemas — keep it off in
  // production unless explicitly enabled (ENABLE_SWAGGER=true).
  const swaggerEnabled =
    process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('NextOffice AI E-office API')
      .setDescription('AI-powered document management system for Thai schools')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    // Redirect root to Swagger docs (only when docs are served)
    app.use('/', (req: any, res: any, next: any) => {
      if (req.method === 'GET' && req.path === '/') {
        return res.redirect('/api/docs');
      }
      next();
    });
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 NextOffice API running on http://localhost:${port}`);
  console.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
