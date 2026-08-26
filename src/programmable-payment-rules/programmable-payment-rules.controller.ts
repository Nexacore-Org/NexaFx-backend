import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ProgrammablePaymentRulesService } from './programmable-payment-rules.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Programmable Payment Rules')
@ApiBearerAuth('access-token')
@Controller('v2/programmable-payment-rules')
@UseGuards(JwtAuthGuard)
export class ProgrammablePaymentRulesController {
  constructor(private readonly service: ProgrammablePaymentRulesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new programmable payment rule' })
  @ApiResponse({ status: 201, description: 'Payment rule created successfully' })
  async create(@Req() req: any, @Body() body: any) {
    return this.service.create(req.user.userId, body);
  }

  @Get()
  @ApiOperation({ summary: 'Get all payment rules for the authenticated user' })
  async findAll(@Req() req: any) {
    return this.service.findAll(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific payment rule by ID' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.service.findOne(req.user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a specific payment rule' })
  async update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.service.update(req.user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a payment rule' })
  async delete(@Req() req: any, @Param('id') id: string) {
    await this.service.delete(req.user.userId, id);
  }
}
