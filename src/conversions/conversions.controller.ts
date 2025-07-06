import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { ConversionsService } from './conversions.service';

class ConversionPreviewRequestDto {
  sourceCurrencyId: string;
  targetCurrencyId: string;
  amount: number;
  rateLockId?: string;
}

class ConversionPreviewResponseDto {
  sourceCurrencyId: string;
  targetCurrencyId: string;
  amount: number;
  rate: number;
  fee: number;
  netAmount: number;
  rateLockExpiresAt: Date;
  feeBreakdown: {
    type: string;
    value: number;
  }[];
}

@ApiTags('Conversions')
@Controller('conversions')
export class ConversionsController {
  constructor(private readonly conversionsService: ConversionsService) {}

  @Post('preview')
  @ApiOperation({ summary: 'Preview a currency conversion with locked rate and fee breakdown' })
  @ApiBody({ type: ConversionPreviewRequestDto })
  @ApiResponse({ status: 200, description: 'Detailed conversion preview', type: ConversionPreviewResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input or expired rate lock' })
  preview(@Body() dto: ConversionPreviewRequestDto): ConversionPreviewResponseDto {
    return this.conversionsService.preview(dto);
  }
} 