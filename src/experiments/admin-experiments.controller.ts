import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import { ExperimentsService } from './experiments.service';
import { CreateExperimentDto } from './dto/create-experiment.dto';
import { UpdateExperimentDto } from './dto/update-experiment.dto';

@ApiTags('Admin Experiments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/experiments')
export class AdminExperimentsController {
  constructor(private readonly experimentsService: ExperimentsService) {}

  @Get()
  @ApiOperation({ summary: 'List all experiments' })
  async listExperiments() {
    return this.experimentsService.listExperiments();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new experiment with variants' })
  async createExperiment(@Body() dto: CreateExperimentDto) {
    return this.experimentsService.createExperiment(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update experiment status, dates, traffic percent' })
  async updateExperiment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExperimentDto,
  ) {
    return this.experimentsService.updateExperiment(id, dto);
  }

  @Get(':id/results')
  @ApiOperation({
    summary: 'Get per-variant metrics with statistical significance',
  })
  async getResults(@Param('id', ParseUUIDPipe) id: string) {
    return this.experimentsService.getExperimentResults(id);
  }
}
