import { NestFactory } from '@nestjs/core';
import { Logger, UnprocessableEntityException, ValidationPipe, } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ResponseInterceptor, GlobalExceptionFilter, } from '@poojawala/common';
import { PaymentManagementModule } from './payment-management.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(PaymentManagementModule, {
    /*
     * Required later if Razorpay webhook
     * signature verification uses raw body.
     */
    rawBody: true,
  });

  app.setGlobalPrefix('api');

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
    : [];

  const localOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ];

  if (process.env.NODE_ENV !== 'production') {
    app.enableCors({
      origin: true, // Allow all origins
      credentials: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    });
  }

  const logger = new Logger('HTTP');

  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;

      const status = res.statusCode;

      let colorStart = '\x1b[0m';

      const reset = '\x1b[0m';

      if (status >= 200 && status < 300) {
        colorStart = '\x1b[32m';
      } else if (status >= 400) {
        colorStart = '\x1b[31m';
      } else if (status >= 300) {
        colorStart = '\x1b[33m';
      }

      logger.log(
        `${colorStart}${req.method} ${req.originalUrl} -> ${status} - ${duration}ms${reset}`,
      );
    });

    next();
  });

  app.useGlobalInterceptors(new ResponseInterceptor());

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,

      transformOptions: {
        enableImplicitConversion: true,
      },

      exceptionFactory: (errors) => {
        const errorMessages = errors.flatMap((error) =>
          Object.values(error.constraints ?? {}),
        );

        return new UnprocessableEntityException({
          success: false,
          message: 'Validation failed',
          error: errorMessages,
        });
      },
    }),
  );

  const port = Number(process.env.PAYMENT_MANAGEMENT_PORT ?? 8012);

  await app.listen(port);

  Logger.log(`🚀 Payment Service running on http://localhost:${port}/api`);
}

bootstrap();
