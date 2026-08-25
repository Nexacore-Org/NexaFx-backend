import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SpendingGoalsService } from './spending-goals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Spending Goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'spending-goals', version: '2' })
export class SpendingGoalsController {
  constructor(private readonly goalsService: SpendingGoalsService) {}

  @Post()
  async create(
    @Req() req: { user: { id: string } },
    @Body()
    dto: {
      categoryId?: string;
      name: string;
      targetAmount: string;
      currency: string;
    },
  ) {
    return this.goalsService.create(req.user.id, dto);
  }

  @Get()
  async list(@Req() req: { user: { id: string } }) {
    return this.goalsService.getAllWithProgress(req.user.id);
  }

  @Patch(':id')
  async update(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body()
    dto: Partial<{
      name: string;
      targetAmount: string;
      currency: string;
      categoryId: string;
      isActive: boolean;
    }>,
  ) {
    return this.goalsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  async remove(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    await this.goalsService.delete(id, req.user.id);
    return { deleted: true };
  }
}
