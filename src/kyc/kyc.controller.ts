import {
  Controller,
  Post,
  Body,
  Param,
  Patch,
  Get,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { KycService } from './kyc.service';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { ApproveKycDto } from './dto/approve-kyc.dto';
import { KycVerification } from './entities/kyc.entity';
import { JwtAuthGuard } from '../auth/guard/jwt.auth.guard';

@ApiTags('KYC')
@Controller('kyc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('submit')
  @ApiOperation({ summary: 'Submit KYC verification' })
  @ApiResponse({
    status: 201,
    description: 'KYC submission successful',
    type: KycVerification,
  })
  async submitKyc(
    @Request() req,
    @Body() submitKycDto: SubmitKycDto,
  ): Promise<KycVerification> {
    return this.kycService.submitKyc(req.user.id, submitKycDto);
  }

  // TODO: Implement role-based authentication for admin access
  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve or reject KYC verification (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'KYC status updated successfully',
    type: KycVerification,
  })
  async approveKyc(
    @Param('id') id: string,
    @Body() approveKycDto: ApproveKycDto,
  ): Promise<KycVerification> {
    // TODO: Add role verification to ensure only admins can approve/reject KYC
    return this.kycService.approveKyc(id, approveKycDto);
  }

  @Get('status')
  @ApiOperation({ summary: "Get user's KYC status" })
  @ApiResponse({
    status: 200,
    description: 'KYC status retrieved successfully',
    type: KycVerification,
  })
  async getKycStatus(@Request() req): Promise<KycVerification> {
    return this.kycService.getKycStatus(req.user.id);
  }

  // TODO: Implement role-based authentication for admin access
  @Get('pending')
  @ApiOperation({ summary: 'Get all pending KYC submissions (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Pending KYC submissions retrieved successfully',
    type: [KycVerification],
  })
  async getPendingSubmissions(): Promise<KycVerification[]> {
    // TODO: Add role verification to ensure only admins can view pending submissions
    return this.kycService.getPendingKycSubmissions();
  }
}
