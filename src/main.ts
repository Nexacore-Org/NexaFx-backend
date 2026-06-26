import './tracing'; // <-- MUST BE FIRST LINE BEFORE NESTJS BOOTSTRAP

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Distributed Tracing Context Propagation & Correlation Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Extract incoming request ID or generate a canonical fallback V4 UUID
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    
    // Mutate request headers for internal service propagation downstream
    req.headers['x-request-id'] = requestId;
    
    // Inject custom correlation header to outgoing HTTP response payload headers
    res.setHeader('X-Request-ID', requestId);
    
    next();
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`Application v2 is running on: http://localhost:${port}`);
}

bootstrap();