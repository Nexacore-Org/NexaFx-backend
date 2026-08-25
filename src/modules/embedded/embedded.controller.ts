import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { EmbeddedService } from './embedded.service';

@ApiTags('Embedded Finance')
export class EmbeddedAdminController {
  constructor(private readonly embeddedService: EmbeddedService) {}

  @Post('admin/embedded-partners')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create embedded partner' })
  async createPartner(
    @Body() dto: {
      name: string;
      webhookUrl: string;
      allowedScopes?: string[];
      brandColour?: string;
      logoUrl?: string;
    },
  ) {
    return this.embeddedService.createPartner(dto);
  }

  @Get('admin/embedded-partners')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List embedded partners' })
  async listPartners() {
    return this.embeddedService.listPartners();
  }

  @Patch('admin/embedded-partners/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update embedded partner' })
  async updatePartner(
    @Param('id') id: string,
    @Body() dto: Partial<{
      name: string;
      webhookUrl: string;
      allowedScopes: string[];
      isActive: boolean;
      brandColour: string | null;
      logoUrl: string | null;
    }>,
  ) {
    return this.embeddedService.updatePartner(id, dto);
  }
}

@ApiTags('Embedded Finance')
@Controller({ path: 'embedded', version: '2' })
export class EmbeddedPublicController {
  constructor(private readonly embeddedService: EmbeddedService) {}

  @Post('auth/token')
  @ApiOperation({ summary: 'Authenticate partner and get JWT' })
  async authenticate(
    @Body() body: { clientId: string; clientSecret: string; partnerUserId: string },
  ) {
    return this.embeddedService.authenticatePartner(
      body.clientId,
      body.clientSecret,
      body.partnerUserId,
    );
  }
}
