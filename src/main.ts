import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global Filters (order matters: specific before general)
  app.useGlobalFilters(new HttpExceptionFilter(), new AllExceptionsFilter());

  // Global Interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformResponseInterceptor(),
  );

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NexaFX Backend API')
    .setDescription('NexaFX Backend API with Audit Logs')
    .setVersion('1.0')
    .addTag('auth', 'Authentication endpoints')
    .addTag('audit-logs', 'Audit logs endpoints (Admin only)')
    .addTag('transactions', 'Transaction management')
    .addTag('users', 'User management')
    .addTag('currencies', 'Currency management')
    .addTag('health', 'Health checks')
    .addTag('NexaFX', 'General API endpoints')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'access-token',
    )
    .build();

  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, swaggerDoc);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();


















// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { ValidationPipe, VersioningType } from '@nestjs/common';
// import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
// import { HttpExceptionFilter } from './common/filters/http-exception.filter';
// import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
// import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);

//   app.useGlobalPipes(
//     new ValidationPipe({
//       whitelist: true,
//       forbidNonWhitelisted: true,
//       transform: true,
//       transformOptions: { enableImplicitConversion: true },
//     }),
//   );

//   // Global Filters (order matters: specific before general)
//   app.useGlobalFilters(new HttpExceptionFilter(), new AllExceptionsFilter());

//   // Global Interceptors
//   app.useGlobalInterceptors(
//     new LoggingInterceptor(),
//     new TransformResponseInterceptor(),
//   );

//   app.enableVersioning({
//     type: VersioningType.URI,
//     defaultVersion: '1',
//   });

//   const swaggerConfig = new DocumentBuilder()
//     .setTitle('NexaFX API')
//     .setDescription('Web3 currency exchange backend')
//     .setVersion('v1')
//     .addTag('NexaFX')
//     .addBearerAuth(
//       {
//         type: 'http',
//         scheme: 'bearer',
//         bearerFormat: 'JWT',
//       },
//       'access-token',
//     )
//     .build();

//   const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
//   SwaggerModule.setup('api-docs', app, swaggerDoc);

//   await app.listen(process.env.PORT ?? 3000);
// }
// bootstrap();
