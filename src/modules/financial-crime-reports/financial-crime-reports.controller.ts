import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../users/user.entity';
import { FinancialCrimeReportService } from './financial-crime-report.service';
import { FinancialCrimeReportFormat } from './entities/financial-crime-report.entity';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ListReportsDto } from './dto/list-reports.dto';
import { MarkSubmittedDto } from './dto/mark-submitted.dto';

/**
 * Financial crime reporting is SUPER_ADMIN-only across every route: the payloads
 * carry a named individual's identity documents and transaction history
 * alongside the suspicion narrative.
 */
@ApiTags('Admin - Financial Crime Reports')
@ApiBearerAuth()
@ApiResponse({ status: 403, description: 'Caller is not a SUPER_ADMIN' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/financial-crime-reports')
export class FinancialCrimeReportsController {
  constructor(private readonly reportService: FinancialCrimeReportService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Generate a regulator-format report from a filed SAR',
    description:
      'Builds the XML, validates it against the format schema, and stores it as a DRAFT report.',
  })
  @ApiResponse({ status: 201, description: 'Report generated and stored' })
  @ApiResponse({ status: 404, description: 'SAR not found' })
  @ApiResponse({
    status: 422,
    description:
      'The SAR cannot be expressed in the requested format, or the document failed schema validation',
  })
  async generate(
    @Body() dto: GenerateReportDto,
    @CurrentUser() admin: { userId: string },
  ) {
    return this.reportService.generate(dto, admin.userId);
  }

  @Get()
  @ApiOperation({
    summary: 'List generated reports with their submission status',
    description: 'The XML body is omitted; use the download route to fetch it.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of reports' })
  async list(@Query() query: ListReportsDto) {
    return this.reportService.list(query);
  }

  @Get('schema/:format')
  @ApiOperation({
    summary: 'Download the XSD a format is validated against',
    description:
      'Rendered from the same schema model the generator validates with, so it can be handed to a regulator or an external validator such as xmllint.',
  })
  @ApiParam({ name: 'format', enum: FinancialCrimeReportFormat })
  @ApiProduces('application/xml')
  @ApiResponse({ status: 422, description: 'Unknown format' })
  schema(
    @Param('format', new ParseEnumPipe(FinancialCrimeReportFormat))
    format: FinancialCrimeReportFormat,
    @Res() res: Response,
  ): void {
    const xsd = this.reportService.schema(format);

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${format.toLowerCase()}.xsd"`,
    });
    res.send(xsd);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download the generated XML document' })
  @ApiParam({ name: 'id', type: String, description: 'Report UUID' })
  @ApiProduces('application/xml')
  @ApiResponse({ status: 200, description: 'The XML document as an attachment' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, xmlContent } = await this.reportService.download(id);

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(Buffer.byteLength(xmlContent, 'utf8')),
    });
    res.send(xmlContent);
  }

  @Patch(':id/mark-submitted')
  @ApiOperation({
    summary: 'Record that a report was submitted to the regulator',
    description:
      'Stores the regulator reference and moves the report from DRAFT to SUBMITTED.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Report UUID' })
  @ApiResponse({ status: 200, description: 'Submission recorded' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  @ApiResponse({ status: 409, description: 'Report is not in DRAFT status' })
  async markSubmitted(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkSubmittedDto,
    @CurrentUser() admin: { userId: string },
  ) {
    return this.reportService.markSubmitted(id, dto, admin.userId);
  }
}
