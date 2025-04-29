import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import { HttpStatus } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // // Use our custom throttler guard instead of the default one
  // app.useGlobalGuards(new CustomThrottlerGuard());
  
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
  
  await app.listen(3000);
}
bootstrap();
