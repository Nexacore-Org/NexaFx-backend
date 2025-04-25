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
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

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

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('admin')
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

  @Get('pending')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Get all pending KYC submissions (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Pending KYC submissions retrieved successfully',
    type: [KycVerification],
  })
  async getPendingSubmissions(): Promise<KycVerification[]> {
    return this.kycService.getPendingKycSubmissions();
  }
}
