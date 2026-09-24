import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LendingService } from './lending.service';

@ApiTags('P2P Lending')
@Controller({ path: 'lending', version: '2' })
export class LendingController {
  constructor(private readonly lendingService: LendingService) {}

  @Get('offers')
  @ApiOperation({ summary: 'List open lending offers' })
  @ApiQuery({ name: 'maxRate', required: false, type: Number })
  @ApiQuery({ name: 'minAmount', required: false, type: Number })
  @ApiQuery({ name: 'maxTerm', required: false, type: Number })
  async listOffers(
    @Query('maxRate') maxRate?: number,
    @Query('minAmount') minAmount?: number,
    @Query('maxTerm') maxTerm?: number,
  ) {
    return this.lendingService.listOffers({ maxRate, minAmount, maxTerm });
  }

  @Post('offers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a lending offer' })
  async createOffer(
    @Request() req: any,
    @Body() dto: { amount: string; currency?: string; annualInterestRate: string; termDays: number; minBorrowerScore?: number },
  ) {
    return this.lendingService.createOffer(req.user.id, dto);
  }

  @Post('offers/:id/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept a lending offer' })
  async acceptOffer(@Param('id') id: string, @Request() req: any) {
    return this.lendingService.acceptOffer(id, req.user.id);
  }

  @Post('agreements/:id/repay')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Repay a loan' })
  async repayLoan(@Param('id') id: string) {
    return this.lendingService.repayLoan(id);
  }

  @Get('my/offers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my lending offers' })
  async getMyOffers(@Request() req: any) {
    return this.lendingService.getMyOffers(req.user.id);
  }

  @Get('my/agreements')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my lending agreements' })
  async getMyAgreements(@Request() req: any) {
    return this.lendingService.getMyAgreements(req.user.id);
  }
}
