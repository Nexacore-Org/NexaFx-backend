import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { CorridorsService } from './corridors.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Corridors v2')
@Controller({ path: 'corridors', version: '2' })
export class CorridorsPublicController {
  constructor(private readonly corridorsService: CorridorsService) {}

  @Get('/')
  @ApiOperation({ summary: 'Discover available payment corridors' })
  async discoverCorridors(
    @Query('sourceCurrency') sourceCurrency: string,
    @Query('destCurrency') destCurrency: string,
    @Query('amount') amount: string,
    @Query('country') country?: string,
  ) {
    return this.corridorsService.discoverCorridors(
      sourceCurrency,
      destCurrency,
      parseFloat(amount),
      country,
    );
  }
}

@ApiTags('Admin - Corridors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/corridors')
export class CorridorsAdminController {
  constructor(private readonly corridorsService: CorridorsService) {}

  @Post('/')
  @ApiOperation({ summary: 'Create a new payment corridor' })
  async createCorridor(@Body() body: any) {
    return this.corridorsService.createCorridor(body);
  }

  @Get('/')
  @ApiOperation({ summary: 'List all payment corridors' })
  async listCorridors() {
    return this.corridorsService.listCorridors();
  }

  @Patch('/:id')
  @ApiOperation({ summary: 'Update a payment corridor' })
  async updateCorridor(@Param('id') id: string, @Body() body: any) {
    return this.corridorsService.updateCorridor(id, body);
  }
}
