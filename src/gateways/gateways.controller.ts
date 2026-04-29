import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller('gateways')
export class GatewaysController {
  @Get('info')
  getInfo() {
    return {
      namespace: '/rates',
      authentication: {
        method: 'handshake.auth.token',
        type: 'JWT Bearer',
      },
      clientEvents: ['subscribe', 'unsubscribe'],
      serverEvents: ['rate_update', 'error', '401'],
    };
  }
}
