import { NestFactory } from '@nestjs/core';
import { AuthModule } from './auth.module';
import {
  Logger,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { ResponseInterceptor } from '@likemyproduct/common';
import { GlobalExceptionFilter } from '@likemyproduct/common';
import { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule);

  app.setGlobalPrefix('api');

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [];

  const localOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin) ||
        localOrigins.includes(origin)
      ) {
        callback(null, true);
        return;
      }

      // Check if origin is localhost or same local network / WiFi
      const isLocal =
        /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(
          origin,
        );

      if (isLocal || process.env.NODE_ENV !== 'production') {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  const logger = new Logger('HTTP');

  // APPLY LOGGER EARLY
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;

      let colorStart = '\x1b[0m';
      const reset = '\x1b[0m';

      if (status >= 200 && status < 300) {
        colorStart = '\x1b[32m'; // green
      } else if (status >= 400) {
        colorStart = '\x1b[31m'; // red
      } else if (status >= 300) {
        colorStart = '\x1b[33m'; // yellow
      }

      logger.log(
        `${colorStart}${req.method} ${req.originalUrl} -> ${status} - ${duration}ms${reset}`,
      );
    });

    next();
  });

  // GLOBALS
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        const errorMessages = errors.flatMap((err) =>
          Object.values(err.constraints || {}),
        );

        return new UnprocessableEntityException({
          success: false,
          message: 'Validation failed',
          error: errorMessages,
        });
      },
    }),
  );

  const port = process.env.AUTHENTICATION_PORT || 5000;
  await app.listen(port);

  Logger.log(
    `🚀 Authentication Server running on http://localhost:${port}/api`,
  );
}

bootstrap();
