import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { EvidencePackageService } from '../services/evidence-package.service';

@ApiTags('Compliance Evidence')
@ApiBearerAuth('access-token')
@Controller('compliance/evidence')
export class EvidencePackageController {
  constructor(private readonly evidencePackageService: EvidencePackageService) {}

  @Post('package')
  @ApiOperation({ summary: 'Generate a compliance evidence package asynchronously' })
  @ApiResponse({ status: 201, description: 'Evidence package job created' })
  createPackage(@CurrentUser() user: CurrentUserPayload) {
    return this.evidencePackageService.requestPackage(user.userId);
  }

  @Get(':id/verify')
  @ApiOperation({ summary: 'Verify manifest signature and chain-of-custody for an evidence package' })
  @ApiResponse({ status: 200, description: 'Evidence package verification result' })
  verifyPackage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.evidencePackageService.verifyPackage(user.userId, id);
  }

  @Get('packages')
  @ApiOperation({ summary: 'List evidence packages for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Evidence package list' })
  listPackages(@CurrentUser() user: CurrentUserPayload) {
    return this.evidencePackageService.listPackages(user.userId);
  }

  @Get('packages/:id/download')
  @ApiOperation({ summary: 'Download an evidence package ZIP archive' })
  @ApiResponse({ status: 200, description: 'ZIP archive' })
  async downloadPackage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.evidencePackageService.downloadPackage(
      user.userId,
      id,
    );

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="evidence-package-${id}.zip"`,
      'Content-Length': buffer.length.toString(),
    });

    res.send(buffer);
  }
}
