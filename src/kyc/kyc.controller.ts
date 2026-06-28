import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  UsePipes,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Audit } from '../common/decorators/audit.decorator';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiConsumes,
  ApiParam,
} from '@nestjs/swagger';
import { KycService } from './kyc.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import { UserKycTier } from '../users/user.entity';

// DTO for KYC application
export class ApplyKycDto {
  targetTier: UserKycTier.STANDARD | UserKycTier.ENHANCED;
}

@ApiTags('KYC')
@Controller('kyc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Get('status')
  @ApiOperation({ summary: "Get user's KYC status" })
  @ApiResponse({
    status: 200,
    description: 'KYC status retrieved',
    schema: {
      type: 'object',
      properties: {
        currentTier: { type: 'string' },
        application: { type: 'object', nullable: true },
        nextTier: { type: 'string', nullable: true },
        requiredDocuments: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async getKycStatus(@CurrentUser() user: CurrentUserPayload) {
    return this.kycService.getKycStatus(user.userId);
  }

  @Post('apply')
  @ApiOperation({ summary: 'Submit KYC application' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ApplyKycDto })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'governmentIdFront', maxCount: 1 },
      { name: 'governmentIdBack', maxCount: 1 },
      { name: 'selfie', maxCount: 1 },
      { name: 'proofOfAddress', maxCount: 1 },
      { name: 'videoSelfie', maxCount: 1 },
    ]),
  )
  @UsePipes(FileValidationPipe)
  @ApiResponse({ status: 201, description: 'KYC submission successful' })
  @ApiResponse({
    status: 400,
    description: 'Invalid data, file type, or existing submission',
  })
  @Audit('kyc.submission')
  @ApiResponse({ status: 422, description: 'File failed validation scan' })
  async applyKyc(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFiles()
    files: {
      governmentIdFront?: Express.Multer.File[];
      governmentIdBack?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
      proofOfAddress?: Express.Multer.File[];
      videoSelfie?: Express.Multer.File[];
    },
    @Body() dto: ApplyKycDto,
  ) {
    return this.kycService.applyForKyc(user.userId, dto.targetTier, {
      governmentIdFront: files.governmentIdFront?.[0],
      governmentIdBack: files.governmentIdBack?.[0],
      selfie: files.selfie?.[0],
      proofOfAddress: files.proofOfAddress?.[0],
      videoSelfie: files.videoSelfie?.[0],
    });
  }

  @Post('resubmit/:applicationId')
  @ApiOperation({ summary: 'Resubmit KYC application after rejection' })
  @ApiParam({ name: 'applicationId', description: 'KYC application UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ApplyKycDto })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'governmentIdFront', maxCount: 1 },
      { name: 'governmentIdBack', maxCount: 1 },
      { name: 'selfie', maxCount: 1 },
      { name: 'proofOfAddress', maxCount: 1 },
      { name: 'videoSelfie', maxCount: 1 },
    ]),
  )
  @UsePipes(FileValidationPipe)
  @ApiResponse({ status: 201, description: 'KYC resubmission successful' })
  @ApiResponse({
    status: 400,
    description: 'Invalid data, file type, or no pending resubmission required',
  })
  @Audit('kyc.resubmission')
  @ApiResponse({ status: 422, description: 'File failed validation scan' })
  async resubmitKyc(
    @CurrentUser() user: CurrentUserPayload,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @UploadedFiles()
    files: {
      governmentIdFront?: Express.Multer.File[];
      governmentIdBack?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
      proofOfAddress?: Express.Multer.File[];
      videoSelfie?: Express.Multer.File[];
    },
    @Body() dto: ApplyKycDto,
  ) {
    return this.kycService.resubmitKyc(
      applicationId,
      user.userId,
      dto.targetTier,
      {
        governmentIdFront: files.governmentIdFront?.[0],
        governmentIdBack: files.governmentIdBack?.[0],
        selfie: files.selfie?.[0],
        proofOfAddress: files.proofOfAddress?.[0],
        videoSelfie: files.videoSelfie?.[0],
      },
    );
  }
}
