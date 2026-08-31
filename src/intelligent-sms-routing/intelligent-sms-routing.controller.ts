import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { IntelligentSmsRoutingService } from './intelligent-sms-routing.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Intelligent SMS Routing')
@ApiBearerAuth('access-token')
@Controller('v2/intelligent-sms-routing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class IntelligentSmsRoutingController {
  constructor(private readonly service: IntelligentSmsRoutingService) {}

  @Post('routes')
  @ApiOperation({ summary: 'Create a new SMS provider routing rule (Admin only)' })
  @ApiResponse({ status: 201, description: 'SMS route created successfully' })
  async createRoute(@Body() body: any) {
    return this.service.createRoute(body);
  }

  @Get('routes')
  @ApiOperation({ summary: 'List all SMS provider routing rules (Admin only)' })
  async getRoutes() {
    return this.service.getRoutes();
  }

  @Patch('routes/:id')
  @ApiOperation({ summary: 'Update an existing SMS provider routing rule (Admin only)' })
  async updateRoute(@Param('id') id: string, @Body() body: any) {
    return this.service.updateRoute(id, body);
  }

  @Delete('routes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an SMS provider routing rule (Admin only)' })
  async deleteRoute(@Param('id') id: string) {
    await this.service.deleteRoute(id);
  }
}
