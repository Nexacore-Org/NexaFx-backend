// src/modules/fees/fee.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { FeeService } from './fee.service';

import { JwtAuthGuard } from 'src/auth/guard/jwt.auth.guard';
import { Roles } from 'src/common/decorators/roles.decorators';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/user/entities/user.entity';
import { FeeRule } from './entities/fee.entity';

@ApiTags('Fees')
@Controller('fees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FeeController {
  constructor(private readonly feeService: FeeService) {}

  @Get()
  @ApiOperation({ summary: 'Get all fee rules' })
  @ApiResponse({ status: 200, description: 'List of fee rules', type: [FeeRule] })
  async findAll(): Promise<FeeRule[]> {
    return await this.feeService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a fee rule by ID' })
  @ApiParam({ name: 'id', description: 'Fee rule ID' })
  @ApiResponse({ status: 200, description: 'Fee rule details', type: FeeRule })
  findOne(@Param('id') id: string): Promise<FeeRule> {
    return this.feeService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new fee rule' })
  @ApiBody({ type: Object, examples: { default: { value: { name: 'Standard Fee', rate: 0.02, isActive: true } } } })
  @ApiResponse({ status: 201, description: 'Fee rule created', type: FeeRule })
  create(@Body() data: Partial<FeeRule>): Promise<FeeRule> {
    return this.feeService.create(data);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a fee rule' })
  @ApiParam({ name: 'id', description: 'Fee rule ID' })
  @ApiBody({ type: Object, examples: { default: { value: { name: 'Updated Fee', rate: 0.03, isActive: false } } } })
  @ApiResponse({ status: 200, description: 'Fee rule updated', type: FeeRule })
  update(
    @Param('id') id: string,
    @Body() data: Partial<FeeRule>,
  ): Promise<FeeRule> {
    return this.feeService.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a fee rule' })
  @ApiParam({ name: 'id', description: 'Fee rule ID' })
  @ApiResponse({ status: 204, description: 'Fee rule deleted' })
  remove(@Param('id') id: string): Promise<void> {
    return this.feeService.remove(id);
  }
}
