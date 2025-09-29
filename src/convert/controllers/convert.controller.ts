import {
  Controller,
  Post,
  Get,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guard/jwt.auth.guard';
import { ConvertService } from '../providers/convert.service';
import {
  ConversionQuoteDto,
  ConversionQuoteResponseDto,
} from '../dto/conversion-quote.dto';
import { ConvertResponseDto } from '../dto/convert-response.dto';
import { CreateConvertDto } from '../dto/create-convert.dto';

@ApiTags('Convert')
@Controller('convert')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConvertController {
  constructor(private readonly convertService: ConvertService) {}

  @Post('quote')
  @ApiOperation({ summary: 'Get conversion quote with current rates' })
  @ApiResponse({
    status: 200,
    description: 'Conversion quote retrieved successfully',
    type: ConversionQuoteResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid conversion parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getConversionQuote(
    quoteDto: ConversionQuoteDto,
  ): Promise<ConversionQuoteResponseDto> {
    return this.convertService.getConversionQuote(quoteDto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Convert currency' })
  @ApiResponse({
    status: 201,
    description: 'Currency converted successfully',
    type: ConvertResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid conversion data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 422,
    description: 'Insufficient balance or invalid conversion',
  })
  async convertCurrency(
    req: any,
    createConvertDto: CreateConvertDto,
  ): Promise<ConvertResponseDto> {
    const userId = req.user.sub;
    return this.convertService.convertCurrency(userId, createConvertDto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get user conversion history' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
  })
  @ApiQuery({
    name: 'fromCurrency',
    required: false,
    type: String,
    description: 'Filter by source currency',
  })
  @ApiQuery({
    name: 'toCurrency',
    required: false,
    type: String,
    description: 'Filter by target currency',
  })
  @ApiResponse({
    status: 200,
    description: 'Conversion history retrieved successfully',
    type: [ConvertResponseDto],
  })
  async getConversionHistory(
    req: any,
    page = 1,
    limit = 10,
    fromCurrency?: string,
    toCurrency?: string,
  ) {
    const userId = req.user.sub;
    return this.convertService.getConversionHistory(userId, {
      page,
      limit,
      fromCurrency,
      toCurrency,
    });
  }

  @Get('supported-currencies')
  @ApiOperation({ summary: 'Get list of supported currencies for conversion' })
  @ApiResponse({
    status: 200,
    description: 'Supported currencies retrieved successfully',
  })
  async getSupportedCurrencies() {
    return this.convertService.getSupportedCurrencies();
  }

  @Get('rates')
  @ApiOperation({ summary: 'Get current exchange rates' })
  @ApiQuery({
    name: 'base',
    required: false,
    type: String,
    description: 'Base currency',
  })
  @ApiResponse({
    status: 200,
    description: 'Exchange rates retrieved successfully',
  })
  async getExchangeRates(base?: string) {
    return this.convertService.getExchangeRates(base);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversion details by ID' })
  @ApiResponse({
    status: 200,
    description: 'Conversion details retrieved successfully',
    type: ConvertResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Conversion not found' })
  async getConversionById(req: any, id: string): Promise<ConvertResponseDto> {
    const userId = req.user.sub;
    return this.convertService.getConversionById(userId, id);
  }
}
