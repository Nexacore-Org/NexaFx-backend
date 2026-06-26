import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';

@Controller()
export class AppController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getStatus() {
    return {
      status: 'ok',
      service: 'NexaFX API v2',
      version: this.getPackageVersion(),
      timestamp: new Date().toISOString(),
      environment: this.configService.get<string>('NODE_ENV'),
    };
  }

  private getPackageVersion(): string {
    try {
      const packageJson = JSON.parse(
        readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
      );
      return packageJson.version ?? '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
}
