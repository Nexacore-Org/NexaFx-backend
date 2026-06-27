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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import { UserKycTier } from '../users/user.entity';
import { KYCApplication } from './entities/kyc-application.entity';

// Example DTO, realistically this would be a proper class with validation
export class SubmitKycDto {
  targetTier: UserKycTier.STANDARD | UserKycTier.ENHANCED;
}

@ApiTags('KYC')
@Controller('kyc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('submit')
  @ApiOperation({ summary: 'Submit KYC application' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SubmitKycDto })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'governmentId', maxCount: 1 },
      { name: 'proofOfAddress', maxCount: 1 },
      { name: 'selfieVideo', maxCount: 1 },
    ]),
  )
  @UsePipes()
  @ApiResponse({ status: 201, description: 'KYC submission successful' })
  @ApiResponse({
    status: 400,
    description: 'Invalid data, file type, or existing submission',
  })
  @Audit('kyc.submission')
  @ApiResponse({ status: 422, description: 'File failed validation scan' })
  async submitKyc(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFiles(new FileValidationPipe())
    files: {
      governmentId?: Express.Multer.File[];
      proofOfAddress?: Express.Multer.File[];
      selfieVideo?: Express.Multer.File[];
    },
    @Body() dto: SubmitKycDto,
  ) {
    return this.kycService.submitKyc(user.userId, dto.targetTier, {
      governmentId: files.governmentId?.[0],
      proofOfAddress: files.proofOfAddress?.[0],
      selfieVideo: files.selfieVideo?.[0],
    });
  }

  @Post('resubmit')
  @ApiOperation({ summary: 'Resubmit KYC application' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SubmitKycDto })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'governmentId', maxCount: 1 },
      { name: 'proofOfAddress', maxCount: 1 },
      { name: 'selfieVideo', maxCount: 1 },
    ]),
  )
  @UsePipes()
  @ApiResponse({ status: 201, description: 'KYC resubmission successful' })
  @ApiResponse({
    status: 400,
    description: 'Invalid data, file type, or no pending resubmission required',
  })
  @Audit('kyc.resubmission')
  @ApiResponse({ status: 422, description: 'File failed validation scan' })
  async resubmitKyc(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFiles(new FileValidationPipe())
    files: {
      governmentId?: Express.Multer.File[];
      proofOfAddress?: Express.Multer.File[];
      selfieVideo?: Express.Multer.File[];
    },
    @Body() dto: SubmitKycDto,
  ) {
    return this.kycService.resubmitKyc(user.userId, dto.targetTier, {
      governmentId: files.governmentId?.[0],
      proofOfAddress: files.proofOfAddress?.[0],
      selfieVideo: files.selfieVideo?.[0],
    });
  }

  @Get('status')
  @ApiOperation({ summary: "Get user's KYC status" })
  @ApiResponse({ status: 200, description: 'KYC status retrieved' })
  async getKycStatus(@CurrentUser() user: CurrentUserPayload) {
    return this.kycService.getKycStatus(user.userId);
  }
}
