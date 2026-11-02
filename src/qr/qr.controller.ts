import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { QrService } from './qr.service';
import { GenerateDynamicQrDto, ScanQrDto } from './dto/qr.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }),
)
@Controller('qr')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Get('static/:merchantId')
  async getStaticQr(@Param('merchantId') merchantId: string) {
    const qrCode = await this.qrService.generateStaticQr(merchantId);
    return {
      qrCode,
      payload: this.qrService.getLastSignedPayload(),
      type: 'STATIC',
    };
  }

  @Post('dynamic')
  async getDynamicQr(@Body() body: GenerateDynamicQrDto) {
    const qrCode = await this.qrService.generateDynamicQr(body);
    return {
      qrCode,
      payload: this.qrService.getLastSignedPayload(),
      type: 'DYNAMIC',
    };
  }

  @Post('scan')
  async scanQr(@Body() body: ScanQrDto) {
    const session = await this.qrService.processScan(body?.payload);
    return {
      message: 'QR Code processed successfully',
      session,
    };
  }
}
