import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CurrencyPairService } from '../services/currency-pair.service';
import {
  CreateCurrencyPairDto,
  SuspendPairDto,
  UpdateCurrencyPairDto,
} from '../dto/currency-pair.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Public } from '../../auth/decorators/public.decorator';

@Controller('currencies/pairs')
export class CurrencyPairController {
  constructor(private readonly currencyPairService: CurrencyPairService) {}

  @Public()
  @Get()
  async getPairs(@Query('activeOnly') activeOnly?: string) {
    return this.currencyPairService.findAll(activeOnly !== 'false');
  }

  @Post('/admin')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  async createPair(@Body() data: CreateCurrencyPairDto) {
    return this.currencyPairService.create(data);
  }

  @Patch('/admin/:id')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  async updatePair(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateCurrencyPairDto,
  ) {
    return this.currencyPairService.update(id, data);
  }

  @Post('/admin/:id/suspend')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  async suspendPair(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: SuspendPairDto,
  ) {
    return this.currencyPairService.suspend(id, data);
  }

  @Post('/admin/:id/resume')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  async resumePair(@Param('id', ParseUUIDPipe) id: string) {
    return this.currencyPairService.resume(id);
  }

  @Get('/admin/health')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  async getHealth() {
    return this.currencyPairService.getHealth();
  }
}
