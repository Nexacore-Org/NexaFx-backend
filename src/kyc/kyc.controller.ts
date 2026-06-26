import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  UsePipes,
} from '@nestjs/common';
import { Audit } from '../common/decorators/audit.decorator';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { KycService } from './kyc.service';
import { SubmitKycDto } from './dtos/kyc-submit';
import { ResubmitKycDto } from './dtos/kyc-resubmit';
import { KycRecord } from './entities/kyc.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';

@ApiTags('KYC')
@Controller('kyc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('submit')
  @ApiOperation({ summary: 'Submit KYC verification' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SubmitKycDto })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'documentFront', maxCount: 1 },
      { name: 'documentBack', maxCount: 1 },
      { name: 'selfie', maxCount: 1 },
    ]),
  )
  @UsePipes()
  @ApiResponse({ status: 201, description: 'KYC submission successful' })
  @ApiResponse({
    status: 400,
    description: 'Invalid data, file type, or existing submission',
  })
  @Audit('kyc.submission')
  @ApiResponse({ status: 422, description: 'File failed virus scan' })
  async submitKyc(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFiles(new FileValidationPipe())
    files: {
      documentFront?: Express.Multer.File[];
      documentBack?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
    },
    @Body() dto: SubmitKycDto,
  ) {
    if (!files?.documentFront?.length) {
      throw new BadRequestException('documentFront file is required');
    }
    if (!files?.selfie?.length) {
      throw new BadRequestException('selfie file is required');
    }

    return this.kycService.submitKyc(user.userId, dto, {
      documentFront: files.documentFront[0],
      documentBack: files.documentBack?.[0],
      selfie: files.selfie[0],
    });
  }

  @Get('status')
  @ApiOperation({ summary: "Get user's KYC status" })
  @ApiResponse({ status: 200, description: 'KYC status retrieved' })
  async getKycStatus(@CurrentUser() user: CurrentUserPayload) {
    return this.kycService.getKycStatus(user.userId);
  }

  @Get('pending')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get pending KYC submissions with signed review URLs (Admin)' })
  @ApiResponse({
    status: 200,
    description:
      'List of pending KYC submissions with temporary signed document URLs',
  })
  async getPendingSubmissions() {
    return this.kycService.listPendingKycWithUrls();
  }

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve or reject a KYC submission (Admin)' })
  @ApiParam({ name: 'id', type: String, description: 'KYC record ID' })
  @ApiBody({ type: ApproveKycDto })
  @ApiResponse({
    status: 201,
    description: 'KYC resubmission successful',
  })
  @ApiResponse({
    status: 400,
    description: 'Not in RESUBMISSION_REQUIRED status, wrong file type/size',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  @Audit('kyc.review')
  async approveKyc(
    @Param('id') id: string,
    @Body() approveKycDto: ApproveKycDto,
  ): Promise<KycRecord> {
    return this.kycService.approveKyc(id, approveKycDto);
  }

  @Patch(':id/review')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Review and decide on a KYC submission (Admin)' })
  @ApiParam({ name: 'id', type: String, description: 'KYC record ID' })
  @ApiBody({ type: ReviewKycDto })
  @ApiResponse({
    status: 200,
    description: 'KYC status retrieved successfully',
    type: 'object',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  @Audit('kyc.review')
  async reviewKyc(@Param('id') id: string, @Body() dto: ReviewKycDto) {
    return this.kycService.reviewKyc(id, dto.decision, dto.reason);
  }
}
