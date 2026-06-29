import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AmlService } from './aml.service';
import { ComplianceFlagService } from './compliance-flag.service';
import { SarService } from './sar.service';
import { ComplianceConfigService } from './compliance-config.service';
import { Sar } from './entities/sar.entity';
import { AmlConfig } from './entities/aml-config.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../users/user.entity';
import { ComplianceFlagQueryDto } from './dto/compliance-flag-query.dto';
import { UpdateFlagStatusDto } from './dto/update-flag-status.dto';
import { FileSarDto } from './dto/file-sar.dto';
import { UpdateAmlConfigDto } from './dto/update-aml-config.dto';
import { ExportQueryDto } from './dto/export-query.dto';

@ApiTags('Admin Compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/compliance')
export class ComplianceController {
  constructor(
    private readonly amlService: AmlService,
    private readonly flagService: ComplianceFlagService,
    private readonly sarService: SarService,
    private readonly configService: ComplianceConfigService,
  ) {}

  @Get('flags')
  @ApiOperation({
    summary: 'List compliance flags with filters and pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated list of compliance flags',
  })
  async listFlags(@Query() query: ComplianceFlagQueryDto) {
    return this.flagService.findFlags(query);
  }

  @Patch('flags/:id')
  @ApiOperation({ summary: 'Update flag status and assign reviewer' })
  @ApiParam({ name: 'id', type: String, description: 'Flag UUID' })
  @ApiResponse({ status: 200, description: 'Flag updated successfully' })
  async updateFlagStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFlagStatusDto,
    @CurrentUser() admin: { userId: string },
  ) {
    return this.flagService.updateStatus(
      id,
      dto.status,
      dto.reviewerId ?? admin.userId,
    );
  }

  @Post('flags/:id/sar')
  @ApiOperation({ summary: 'File a Suspicious Activity Report for a flag' })
  @ApiParam({ name: 'id', type: String, description: 'Flag UUID' })
  @ApiResponse({ status: 201, description: 'SAR filed successfully' })
  async fileSar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FileSarDto,
    @CurrentUser() admin: { userId: string },
  ): Promise<Sar> {
    return this.flagService.fileSar(
      id,
      admin.userId,
      dto.narrative,
      dto.reportReference,
    );
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Compliance dashboard summary' })
  @ApiResponse({
    status: 200,
    description: 'Returns compliance dashboard statistics',
  })
  async dashboard() {
    return this.flagService.getDashboard();
  }

  @Get('export')
  @ApiOperation({
    summary: 'Export compliance data (flags and SARs) for a date range',
  })
  @ApiResponse({ status: 200, description: 'Returns CSV export' })
  async export(@Query() query: ExportQueryDto, @Res() res: Response) {
    const csv = await this.flagService.exportCsv(
      new Date(query.from),
      new Date(query.to),
    );
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename=compliance-export-${query.from}-${query.to}.csv`,
    });
    res.send(csv);
  }

  @Get('config')
  @ApiOperation({ summary: 'Get current AML threshold configuration' })
  @ApiResponse({ status: 200, description: 'Returns AML configuration' })
  async getConfig(): Promise<AmlConfig> {
    return this.configService.getConfig();
  }

  @Patch('config')
  @ApiOperation({ summary: 'Update AML threshold configuration' })
  @ApiResponse({ status: 200, description: 'Configuration updated' })
  async updateConfig(@Body() dto: UpdateAmlConfigDto): Promise<AmlConfig> {
    return this.configService.updateConfig(dto);
  }
}
