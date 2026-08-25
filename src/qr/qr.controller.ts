import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { QrService } from './qr.service';

@Controller('qr')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Get('static/:merchantId')
  async getStaticQr(@Param('merchantId') merchantId: string) {
    const qrCode = await this.qrService.generateStaticQr(merchantId);
    return { qrCode, type: 'STATIC' };
  }

  @Post('dynamic')
  async getDynamicQr(@Body() body: { merchantId: string; amount: number; reference: string; currency?: string }) {
    const qrCode = await this.qrService.generateDynamicQr(body);
    return { qrCode, type: 'DYNAMIC' };
  }

  @Post('scan')
  async scanQr(@Body() body: { payload: string }) {
    const session = await this.qrService.processScan(body.payload);
    return {
      message: 'QR Code processed successfully',
      session,
    };
  }
}
