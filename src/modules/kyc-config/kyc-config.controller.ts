import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { KycConfigService } from './kyc-config.service';
import { CreateKycFieldDto } from './dto/kyc-config.dto';

@Controller('kyc-config')
export class KycConfigController {
  constructor(private readonly configService: KycConfigService) {}

  @Get(':jurisdiction')
  getConfig(@Param('jurisdiction') jurisdiction: string) {
    return this.configService.getConfig({ jurisdiction });
  }

  @Post()
  addField(@Body() dto: CreateKycFieldDto) {
    return this.configService.addField(dto);
  }
}
