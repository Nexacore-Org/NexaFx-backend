import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { MultiSignatureWalletsService } from './multi-signature-wallets.service';

/**
 * Stub controller for v2 feature: multi-signature-wallets (issue #499).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #499.
 */
@Controller('v2/multi-signature-wallets')
export class MultiSignatureWalletsController {
  constructor(private readonly service: MultiSignatureWalletsService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #499 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #499 - scaffold stub');
  }
}
