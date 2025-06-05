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
import { FeeService } from './fee.service';

import { JwtAuthGuard } from 'src/auth/guard/jwt.auth.guard';
import { Roles } from 'src/common/decorators/roles.decorators';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/user/entities/user.entity';
import { FeeRule } from './entities/fee.entity';

@Controller('fees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FeeController {
  constructor(private readonly feeService: FeeService) {}

  @Get()
  async findAll(): Promise<FeeRule[]> {
    return await this.feeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<FeeRule> {
    return this.feeService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<FeeRule>): Promise<FeeRule> {
    return this.feeService.create(data);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() data: Partial<FeeRule>,
  ): Promise<FeeRule> {
    return this.feeService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.feeService.remove(id);
  }
}
