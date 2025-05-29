import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import { BadRequestException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true, //convert strings to number
      },
      exceptionFactory: (errors) => {
        const messages = errors.map((error) => {
          return {
            property: error.property,
            constraints: error.constraints,
          };
        });
        return new BadRequestException({
          message: 'Validation failed',
          errors: messages,
        });
      },
    }),
  );

  // Add a global exception filter to handle throttler exceptions and add Retry-After headers
  app.useGlobalFilters({
    catch(exception: any, host: any) {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse();

      if (exception instanceof ThrottlerException) {
        const retryAfter = Math.ceil(Number(exception.getResponse()) / 1000);

        return response
          .status(HttpStatus.TOO_MANY_REQUESTS)
          .header('Retry-After', retryAfter.toString())
          .json({
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests, please try again later.',
            retryAfter: retryAfter,
          });
      }

      return exception;
    },
  });

  app.setGlobalPrefix('api/v1');

  // Swagger configuration (from feature/swagger-documentation)
  const config = new DocumentBuilder()
    .setTitle('Bytechain Academy API')
    .setDescription('API documentation for Bytechain Academy platform')
    .setVersion('1.0')
    .addBearerAuth() // Enable JWT authentication in Swagger
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Enable CORS (from main)
  app.enableCors({
    origin: '*', // All locations
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed methods
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
