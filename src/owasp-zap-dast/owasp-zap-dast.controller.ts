import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { OwaspZapDastService } from './owasp-zap-dast.service';

/**
 * Stub controller for v2 feature: owasp-zap-dast (issue #508).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #508.
 */
@Controller('v2/owasp-zap-dast')
export class OwaspZapDastController {
  constructor(private readonly service: OwaspZapDastService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #508 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #508 - scaffold stub');
  }
}
