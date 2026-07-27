import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { VerifyService } from './verify.service';
import { BatchVerifyDto } from './dto/verify.dto';

@Controller('v2/verify/stellar')
export class VerifyController {
  constructor(private readonly verifyService: VerifyService) {}

  @Get(':txHash')
  verify(@Param('txHash') txHash: string) {
    return this.verifyService.verify(txHash);
  }

  @Post('batch')
  verifyBatch(@Body() dto: BatchVerifyDto) {
    return this.verifyService.verifyBatch(dto.hashes);
  }
}
