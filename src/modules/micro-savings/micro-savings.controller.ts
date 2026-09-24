import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MicroSavingsService } from './micro-savings.service';
import { CreateMicroSavingsRuleDto, UpdateMicroSavingsRuleDto } from './dto/micro-savings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Micro Savings')
@Controller('micro-savings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class MicroSavingsController {
  constructor(private readonly microSavingsService: MicroSavingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a micro-savings rule' })
  async create(@Request() req: { user: { userId: string } }, @Body() dto: CreateMicroSavingsRuleDto) {
    return this.microSavingsService.createRule(req.user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List active micro-savings rules with daily contribution' })
  async list(@Request() req: { user: { userId: string } }) {
    return this.microSavingsService.listActiveRules(req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a micro-savings rule' })
  async update(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMicroSavingsRuleDto,
  ) {
    return this.microSavingsService.updateRule(req.user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a micro-savings rule' })
  async remove(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.microSavingsService.deleteRule(req.user.userId, id);
    return { deleted: true };
  }

  @Get('history')
  @ApiOperation({ summary: 'Get micro-savings contribution history' })
  async history(
    @Request() req: { user: { userId: string } },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.microSavingsService.getHistory(req.user.userId, page ?? 1, limit ?? 50);
  }
}
