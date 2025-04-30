import { Controller, Post, Get, Body, Param, UseGuards, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReferralsService } from './referrals.service';
import { CreateReferralDto } from './dto/create-referral.dto';
import { UseReferralDto } from './dto/use-referral.dto';
import { Referral } from './entities/referral.entity';
import { GetUser } from '../users/decorators/get-user.decorator';

@ApiTags('referrals')
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a referral code' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Referral code generated successfully' })
  async generateReferralCode(@GetUser('id') userId: string): Promise<{ code: string }> {
    const dto = new CreateReferralDto();
    dto.referrerUserId = userId;
    
    const referral = await this.referralsService.generateReferralCode(dto);
    return { code: referral.code };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all referrals made by the current user' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Returns list of referred users' })
  async getMyReferrals(@GetUser('id') userId: string): Promise<Referral[]> {
    return this.referralsService.getReferralsByUser(userId);
  }

  @Post('use')
  @ApiOperation({ summary: 'Use a referral code' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Referral code used successfully' })
  async useReferralCode(@Body() useReferralDto: UseReferralDto): Promise<{ success: boolean }> {
    await this.referralsService.useReferralCode(useReferralDto);
    return { success: true };
  }

  @Get('validate/:code')
  @ApiOperation({ summary: 'Validate a referral code' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Returns validity of the code' })
  async validateReferralCode(@Param('code') code: string): Promise<{ valid: boolean }> {
    const valid = await this.referralsService.isValidReferralCode(code);
    return { valid };
  }
}