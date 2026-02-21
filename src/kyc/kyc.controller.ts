import {
  Controller,
  Post,
  Body,
  Param,
  Patch,
  Get,
  UseGuards,
  Request,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { KycService } from './kyc.service';
import { SubmitKycDto } from './dtos/kyc-submit';
import { ApproveKycDto } from './dtos/kyc-approve';
import { KycRecord} from './entities/kyc.entity';
import { JwtAuthGuard } from 'src/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/users//user.entity';
import { RolesGuard } from 'src/auth/guards/roles.guard';

import { ReviewKycDto } from './dtos/kyc-review';

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
    type: KycRecord,
  })
  async submitKyc(@Req() req, @Body() dto: SubmitKycDto) {
    return this.kycService.submitKyc(req.user.id, dto);
  }
  // TODO: Implement role-based authentication for admin access
  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve or reject KYC verification (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'KYC status updated successfully',
    type: KycRecord,
  })
  async approveKyc(
    @Param('id') id: string,
    @Body() approveKycDto: ApproveKycDto,
  ): Promise<KycRecord> {
    // TODO: Add role verification to ensure only admins can approve/reject KYC
    return this.kycService.approveKyc(id, approveKycDto);
  }

  @Get('status')
  @ApiOperation({ summary: "Get user's KYC status" })
  @ApiResponse({
    status: 200,
    description: 'KYC status retrieved successfully',
    type: KycRecord,
  })
  async getKycStatus(@Request() req) {
    return this.kycService.getKycStatus(req.user.id);
  }

  // TODO: Implement role-based authentication for admin access
  @Get('pending')
  @ApiOperation({ summary: 'Get all pending KYC submissions (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Pending KYC submissions retrieved successfully',
    type: [KycRecord],
  })
  async getPendingSubmissions(): Promise<KycRecord[]> {
    // TODO: Add role verification to ensure only admins can view pending submissions
    return this.kycService.getPendingKycSubmissions();
  }
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Get('admin/pending')
async listPending() {
  return this.kycService.listPendingKyc();
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Post('admin/review/:id')
async review(
  @Param('id') id: string,
  @Body() dto: ReviewKycDto,
) {
  return this.kycService.reviewKyc(
    id,
    dto.decision,
    dto.reason,
  );
}
}
