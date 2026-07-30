import { Controller, Get, Patch, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from './config.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Admin - Config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get('/')
  @ApiOperation({ summary: 'List all platform configurations' })
  async getAllConfigs(@Query('category') category?: string) {
    return this.configService.getAllConfigs(category);
  }

  @Get('/:key')
  @ApiOperation({ summary: 'Get a single configuration by key' })
  async getConfig(@Param('key') key: string) {
    return this.configService.getConfig(key);
  }

  @Patch('/:key')
  @ApiOperation({ summary: 'Update a configuration value' })
  async updateConfig(
    @Param('key') key: string,
    @Body() body: { value: { type: string; data: any }; reason?: string },
    @Query('adminId') adminId?: string,
  ) {
    return this.configService.setConfig(
      key,
      body.value,
      adminId || '00000000-0000-0000-0000-000000000000',
      body.reason,
    );
  }

  @Get('/:key/history')
  @ApiOperation({ summary: 'Get configuration change history' })
  async getConfigHistory(@Param('key') key: string) {
    return this.configService.getConfigHistory(key);
  }

  @Post('/:key/rollback')
  @ApiOperation({ summary: 'Rollback configuration to a previous version' })
  async rollbackConfig(
    @Param('key') key: string,
    @Body() body: { versionId: string },
    @Query('adminId') adminId?: string,
  ) {
    return this.configService.rollbackConfig(
      body.versionId,
      adminId || '00000000-0000-0000-0000-000000000000',
    );
  }
}
