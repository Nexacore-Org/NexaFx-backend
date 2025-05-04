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
  import { FeeRule } from './fee.entity';
  import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
  import { RolesGuard } from '../../auth/guards/roles.guard';
  import { Roles } from '../../auth/decorators/roles.decorator';
  
  @Controller('fees')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  export class FeeController {
    constructor(private readonly feeService: FeeService) {}
  
    @Get()
    findAll(): Promise<FeeRule[]> {
      return this.feeService.findAll();
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
    update(@Param('id') id: string, @Body() data: Partial<FeeRule>): Promise<FeeRule> {
      return this.feeService.update(id, data);
    }
  
    @Delete(':id')
    remove(@Param('id') id: string): Promise<void> {
      return this.feeService.remove(id);
    }
  }