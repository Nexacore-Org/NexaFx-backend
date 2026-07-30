import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { KycOcrService } from './kyc-ocr.service';
import { SubmitKycDocumentDto } from './dto/kyc-ocr.dto';

@Controller()
export class KycOcrController {
  constructor(private readonly kycOcrService: KycOcrService) {}

  @Post('kyc/ocr')
  extract(@Body() dto: SubmitKycDocumentDto) {
    return this.kycOcrService.extractForApplication(
      dto.kycApplicationId,
      dto.imageKey,
      dto.submittedDocumentNumber,
    );
  }

  @Get('admin/kyc/:id/ocr')
  getResult(@Param('id') id: string) {
    return this.kycOcrService.getResult(id);
  }
}
