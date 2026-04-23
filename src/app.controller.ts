import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  healthCheck() {
    return {
      status: 'ok',
      service: 'NexaFX API',
      timestamp: new Date().toISOString(),
    };
  }
}
