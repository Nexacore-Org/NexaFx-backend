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
  Patch,
  Param,
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
import { SubmitKycDto } from './dtos/kyc-submit';
import { ResubmitKycDto } from './dtos/kyc-resubmit';
import { RejectKycDto } from './dtos/kyc-reject';
import { KycRecord } from './entities/kyc.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
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
  @ApiOperation({ summary: 'Approve a KYC submission (Admin)' })
  @ApiParam({ name: 'id', type: String, description: 'KYC record ID' })
  @ApiResponse({
    status: 200,
    description: 'KYC approved successfully',
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
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.kycService.approveKyc(id, user.userId);
  }

  @Post('resubmit')
  @ApiOperation({ summary: 'Resubmit KYC verification' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ResubmitKycDto })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'documentFront', maxCount: 1 },
      { name: 'documentBack', maxCount: 1 },
      { name: 'selfie', maxCount: 1 },
    ]),
  )
  @Audit('kyc.resubmission')
  async resubmitKyc(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFiles(new FileValidationPipe())
    files: {
      documentFront?: Express.Multer.File[];
      documentBack?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
    },
    @Body() dto: ResubmitKycDto,
    req?: any,
  ) {
    if (!files?.documentFront?.length) {
      throw new BadRequestException('documentFront file is required');
    }
    if (!files?.selfie?.length) {
      throw new BadRequestException('selfie file is required');
    }

    const version = req?.kycUploadVersion || Date.now().toString();
    const basePath = `uploads/kyc/${user.userId}/${version}`;

    const documentFrontUrl = `${basePath}/${files.documentFront![0].filename}`;
    const documentBackUrl = files.documentBack?.length
      ? `${basePath}/${files.documentBack![0].filename}`
      : undefined;
    const selfieUrl = `${basePath}/${files.selfie![0].filename}`;

    return this.kycService.resubmitKyc(user.userId, {
      ...dto,
      documentFrontUrl,
      documentBackUrl,
      selfieUrl,
    });
  }

  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reject a KYC submission (Admin)' })
  @ApiParam({ name: 'id', type: String, description: 'KYC record ID' })
  @ApiBody({ type: RejectKycDto })
  @ApiResponse({
    status: 200,
    description: 'KYC rejected successfully',
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
  async rejectKyc(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RejectKycDto,
  ) {
    return this.kycService.rejectKyc(
      id,
      user.userId,
      dto.reason,
      dto.requireResubmission ?? false,
    );
  }
}
