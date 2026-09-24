import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { VolumeFeeTiersService } from './volume-fee-tiers.service';

@ApiTags('admin-fee-tiers')
@Controller('admin/fee-tiers')
export class VolumeFeeTiersController {
  constructor(private readonly service: VolumeFeeTiersService) {}

  /** #697: list the active volume-based fee tiers. */
  @ApiOperation({ summary: 'List volume-based fee tiers' })
  @Get()
  list() {
    return this.service.listActive();
  }
}
