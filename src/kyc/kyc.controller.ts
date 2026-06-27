import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Req,
  BadRequestException,
  ConflictException,
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
import { ApplyKycDto } from './dtos/apply-kyc';
import { KYCApplication } from './entities/kyc-application.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { join } from 'path';
import * as fs from 'fs';

@ApiTags('KYC')
@Controller('kyc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('apply')
  @ApiOperation({ summary: 'Apply for KYC tier upgrade' })
  @ApiBody({ type: ApplyKycDto })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'governmentIdFront', maxCount: 1 },
        { name: 'governmentIdBack', maxCount: 1 },
        { name: 'selfie', maxCount: 1 },
        { name: 'proofOfAddress', maxCount: 1 },
        { name: 'videoSelfie', maxCount: 1 },
      ],
    ),
  )
  @ApiResponse({
    status: 201,
    description: 'KYC application submitted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid data or missing required documents',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'Already has an application under review',
  })
  async applyForKyc(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFiles()
    files: Record<
      string,
      Express.Multer.File[] | undefined
    >,
    @Body() dto: ApplyKycDto,
    @Req() req: Request,
  ) {
    const anyReq = req as unknown as Record<string, unknown> & {
      fileValidationError?: string;
      kycUploadVersion?: string;
    };

    if (anyReq.fileValidationError) {
      throw new BadRequestException(anyReq.fileValidationError);
    }

    const version = anyReq.kycUploadVersion ?? '';
    const userId = user.userId;
    const base = join('uploads', 'kyc', userId, version);

    const processedFiles: Record<string, Express.Multer.File[] | undefined> = {
      governmentIdFront: files.governmentIdFront,
      governmentIdBack: files.governmentIdBack,
      selfie: files.selfie,
      proofOfAddress: files.proofOfAddress,
      videoSelfie: files.videoSelfie,
    };

    for (const key of Object.keys(processedFiles)) {
      const fileArray = processedFiles[key];
      if (fileArray && fileArray.length > 0) {
        const originalPath = fileArray[0].path;
        const newPath = join(base, fileArray[0].filename);
        fs.renameSync(originalPath, newPath);
        processedFiles[key] = [
          {
            ...fileArray[0],
            path: newPath,
          },
        ];
      }
    }

    return this.kycService.applyForTier(
      user.userId,
      dto.targetTier,
      processedFiles,
    );
  }

  @Post('resubmit/:applicationId')
  @ApiOperation({ summary: 'Resubmit KYC documents after rejection' })
  @ApiParam({
    name: 'applicationId',
    type: String,
    description: 'KYC application ID',
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'governmentIdFront', maxCount: 1 },
        { name: 'governmentIdBack', maxCount: 1 },
        { name: 'selfie', maxCount: 1 },
        { name: 'proofOfAddress', maxCount: 1 },
        { name: 'videoSelfie', maxCount: 1 },
      ],
    ),
  )
  @ApiResponse({
    status: 200,
    description: 'KYC documents resubmitted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid data or application not awaiting resubmission',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'Application not found',
  })
  async resubmitKyc(
    @CurrentUser() user: CurrentUserPayload,
    @Param('applicationId') applicationId: string,
    @UploadedFiles()
    files: Record<
      string,
      Express.Multer.File[] | undefined
    >,
    @Req() req: Request,
  ) {
    const anyReq = req as unknown as Record<string, unknown> & {
      fileValidationError?: string;
      kycUploadVersion?: string;
    };

    if (anyReq.fileValidationError) {
      throw new BadRequestException(anyReq.fileValidationError);
    }

    const version = anyReq.kycUploadVersion ?? '';
    const userId = user.userId;
    const base = join('uploads', 'kyc', userId, version);

    const processedFiles: Record<string, Express.Multer.File[] | undefined> = {
      governmentIdFront: files.governmentIdFront,
      governmentIdBack: files.governmentIdBack,
      selfie: files.selfie,
      proofOfAddress: files.proofOfAddress,
      videoSelfie: files.videoSelfie,
    };

    for (const key of Object.keys(processedFiles)) {
      const fileArray = processedFiles[key];
      if (fileArray && fileArray.length > 0) {
        const originalPath = fileArray[0].path;
        const newPath = join(base, fileArray[0].filename);
        fs.renameSync(originalPath, newPath);
        processedFiles[key] = [
          {
            ...fileArray[0],
            path: newPath,
          },
        ];
      }
    }

    return this.kycService.resubmitApplication(
      applicationId,
      user.userId,
      processedFiles,
    );
  }

  @Get('status')
  @ApiOperation({ summary: "Get user's KYC status and requirements" })
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
    description: 'User not found',
  })
  async getKycStatus(@CurrentUser() user: CurrentUserPayload) {
    return this.kycService.getUserKycStatus(user.userId);
  }
}
