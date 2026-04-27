import {
  Controller,
  Post,
  Body,
  Param,
  Patch,
  Get,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Req,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { KycService } from './kyc.service';
import { SubmitKycDto } from './dtos/kyc-submit';
import { ApproveKycDto } from './dtos/kyc-approve';
import { ReviewKycDto } from './dtos/kyc-review';
import { KycRecord } from './entities/kyc.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { join } from 'path';

@ApiTags('KYC')
@Controller('kyc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('submit')
  @ApiOperation({ summary: 'Submit KYC verification' })
  @ApiBody({ type: SubmitKycDto })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'documentFront', maxCount: 1 },
        { name: 'documentBack', maxCount: 1 },
        { name: 'selfie', maxCount: 1 },
      ],
      // Multer options are configured at module level via MulterModule.register
    ),
  )
  @ApiResponse({
    status: 201,
    description: 'KYC submission successful',
    type: KycRecord,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid data or existing submission under review',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async submitKyc(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFiles()
    files: Partial<
      Record<
        'documentFront' | 'documentBack' | 'selfie',
        { filename: string }[]
      >
    >,
    @Body() dto: SubmitKycDto,
    @Req() req: Request,
  ) {
    // check multer provided error via request if any
    const anyReq = req as unknown as Record<string, unknown> & {
      fileValidationError?: string;
      kycUploadVersion?: string;
    };
    if (anyReq.fileValidationError) {
      throw new BadRequestException(anyReq.fileValidationError);
    }

    // Required files
    if (!files?.documentFront || files.documentFront.length === 0) {
      throw new BadRequestException('documentFront file is required');
    }

    if (!files?.selfie || files.selfie.length === 0) {
      throw new BadRequestException('selfie file is required');
    }

    // compute stored relative paths (uploads/kyc/:userId/:version/:filename)
    const version = anyReq.kycUploadVersion ?? '';
    const userId = user.userId;
    const base = join('uploads', 'kyc', userId, version);

    const documentFrontUrl: string | undefined =
      files.documentFront && files.documentFront[0]
        ? join(base, files.documentFront[0].filename)
        : undefined;

    const documentBackUrl: string | undefined =
      files.documentBack && files.documentBack[0]
        ? join(base, files.documentBack[0].filename)
        : undefined;

    const selfieUrl: string | undefined =
      files.selfie && files.selfie[0]
        ? join(base, files.selfie[0].filename)
        : undefined;

    const payload: SubmitKycDto & {
      documentFrontUrl?: string;
      documentBackUrl?: string;
      selfieUrl?: string;
    } = {
      ...dto,
      documentFrontUrl,
      documentBackUrl,
      selfieUrl,
    };

    return this.kycService.submitKyc(user.userId, payload);
  }

  @Get('status')
  @ApiOperation({ summary: "Get user's KYC status" })
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
    status: 404,
    description: 'KYC record not found',
  })
  async getKycStatus(@CurrentUser() user: CurrentUserPayload) {
    return this.kycService.getKycStatus(user.userId);
  }

  @Get('pending')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get all pending KYC submissions (Admin only)',
    description:
      'Retrieves a list of all pending KYC submissions for admin review',
  })
  @ApiResponse({
    status: 200,
    description: 'Pending KYC submissions retrieved successfully',
    type: [KycRecord],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  async getPendingSubmissions(): Promise<KycRecord[]> {
    return this.kycService.getPendingKycSubmissions();
  }

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Approve or reject a KYC submission (Admin only)',
    description:
      'Updates the status of a KYC submission to approved or rejected',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'KYC record ID',
  })
  @ApiBody({ type: ApproveKycDto })
  @ApiResponse({
    status: 200,
    description: 'KYC status updated successfully',
    type: KycRecord,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid KYC data or already processed',
  })
  @ApiResponse({
    status: 404,
    description: 'KYC record not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  async approveKyc(
    @Param('id') id: string,
    @Body() approveKycDto: ApproveKycDto,
  ): Promise<KycRecord> {
    return this.kycService.approveKyc(id, approveKycDto);
  }

  @Patch(':id/review')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Review and make a decision on a KYC submission (Admin only)',
    description:
      'Reviews a KYC submission and approves or rejects it with optional reason',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'KYC record ID',
  })
  @ApiBody({ type: ReviewKycDto })
  @ApiResponse({
    status: 200,
    description: 'KYC reviewed successfully',
    schema: { example: { message: 'KYC approved successfully' } },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid decision or KYC already reviewed',
  })
  @ApiResponse({
    status: 404,
    description: 'KYC record or user not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  async reviewKyc(@Param('id') id: string, @Body() dto: ReviewKycDto) {
    return this.kycService.reviewKyc(id, dto.decision, dto.reason);
  }
}
