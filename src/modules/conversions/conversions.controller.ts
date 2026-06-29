import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversionsService } from './conversions.service';
import { CreateQuoteDto } from './dtos/create-quote.dto';
import { ExecuteConversionDto } from './dtos/execute-conversion.dto';

@ApiTags('Conversions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversions')
export class ConversionsController {
  constructor(private readonly conversionsService: ConversionsService) {}

  private extractUserId(req: any): string {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User is not authenticated');
    }
    return userId;
  }

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create currency conversion quote with 30-second lock' })
  async createQuote(@Req() req: any, @Body() dto: CreateQuoteDto) {
    const userId = this.extractUserId(req);
    return this.conversionsService.createQuote(userId, dto);
  }

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute conversion quote atomically' })
  async executeConversion(@Req() req: any, @Body() dto: ExecuteConversionDto) {
    const userId = this.extractUserId(req);
    return this.conversionsService.executeConversion(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get conversion history for authenticated user' })
  async getConversions(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const userId = this.extractUserId(req);
    return this.conversionsService.getConversions(userId, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversion detail by ID' })
  async getConversionById(@Req() req: any, @Param('id') id: string) {
    const userId = this.extractUserId(req);
    return this.conversionsService.getConversionById(userId, id);
  }
}
