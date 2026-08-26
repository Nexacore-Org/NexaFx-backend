import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Request } from 'express';
import { TestnetFaucetService, RequestFaucetDto } from './testnet-faucet.service';
import { FaucetResponseDto } from './testnet-faucet.service';

@ApiTags('Testnet Faucet')
@Controller('v2/testnet-faucet')
export class TestnetFaucetController {
  constructor(private readonly faucetService: TestnetFaucetService) {}

  @Post('request')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request testnet XLM from the faucet' })
  @ApiResponse({ status: 201, description: 'Faucet request processed' })
  @ApiResponse({ status: 400, description: 'Invalid input or cooldown active' })
  async requestFaucet(
    @Body() dto: RequestFaucetDto,
    @Req() req: Request & { user?: { userId: string } },
  ): Promise<FaucetResponseDto> {
    const userId = req.user?.userId || null;
    const ipAddress =
      (req.headers['x-forwarded-for'] as string) ||
      req.socket.remoteAddress ||
      'unknown';

    return this.faucetService.requestFaucet(dto, userId, ipAddress);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Check the status of a faucet request' })
  @ApiResponse({ status: 200, description: 'Faucet request status' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async getStatus(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FaucetResponseDto> {
    return this.faucetService.getRequestStatus(id);
  }
}
