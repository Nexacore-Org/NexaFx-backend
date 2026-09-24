import { Controller, Delete, Post, Get, Body, HttpCode, HttpStatus, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { GdprService } from './gdpr.service';
import { ErasureDto } from './dto/erasure.dto';
import { ConsentDto } from './dto/consent.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('GDPR')
@Controller('gdpr')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class GdprController {
  constructor(private readonly gdprService: GdprService) {}

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request account erasure (Article 17)' })
  @ApiResponse({ status: 200, description: 'Account anonymised successfully' })
  @ApiResponse({ status: 401, description: 'Invalid password or unauthorized' })
  @ApiResponse({ status: 422, description: 'Cannot delete account with pending transactions' })
  async requestErasure(
    @Request() req: { user: { userId: string } },
    @Body() erasureDto: ErasureDto,
  ) {
    const result = await this.gdprService.eraseUser(req.user.userId, erasureDto.password, erasureDto.reason);
    return { message: 'Account erased and anonymised successfully', ...result };
  }

  @Post('export')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request data export (Article 20)' })
  @ApiResponse({ status: 202, description: 'Export job queued successfully' })
  async requestExport(@Request() req: { user: { userId: string } }) {
    const jobId = await this.gdprService.requestExport(req.user.userId);
    return { message: 'Export job queued successfully', jobId };
  }

  @Get('export/status')
  @ApiOperation({ summary: 'Get export job status' })
  @ApiResponse({ status: 200, description: 'Returns the status of the most recent export' })
  async getExportStatus(@Request() req: { user: { userId: string } }) {
    const status = await this.gdprService.getExportStatus(req.user.userId);
    return status;
  }

  @Get('consent/status')
  @ApiOperation({ summary: 'Check if user needs to re-consent to privacy policy' })
  @ApiResponse({ status: 200, description: 'Returns consent status flags' })
  async getConsentStatus(@Request() req: { user: { userId: string } }) {
    return this.gdprService.getConsentStatus(req.user.userId);
  }

  @Post('consent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit consent for updated privacy policy' })
  @ApiResponse({ status: 200, description: 'Consent successfully updated' })
  @ApiResponse({ status: 400, description: 'Must accept consent' })
  async updateConsent(
    @Request() req: any,
    @Body() consentDto: ConsentDto,
  ) {
    const ipAddress = req.ip || req.connection?.remoteAddress || null;
    const userAgent = req.get('User-Agent') || null;
    await this.gdprService.updateConsent(req.user.userId, ipAddress, userAgent);
    return { message: 'Privacy policy consent updated successfully' };
  }
}
