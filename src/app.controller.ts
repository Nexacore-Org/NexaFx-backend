import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly configService: ConfigService) {}

  @Public()
  @Version(VERSION_NEUTRAL)
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
