import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { StellarSep24AnchorService } from './stellar-sep24-anchor.service';

/**
 * Stub controller for v2 feature: stellar-sep24-anchor (issue #509).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #509.
 */
@Controller('v2/stellar-sep24-anchor')
export class StellarSep24AnchorController {
  constructor(private readonly service: StellarSep24AnchorService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #509 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #509 - scaffold stub');
  }
}
