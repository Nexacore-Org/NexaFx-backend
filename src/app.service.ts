import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getStatus() {
    return {
      status: 'ok',
      service: 'NexaFX API',
      version: process.env.npm_package_version || 'unknown',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
