import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { CurrencyPairService } from '../services/currency-pair.service';
import {
  CreateCurrencyPairDto,
  UpdateCurrencyPairDto,
  SuspendPairDto,
} from '../dto/currency-pair.dto';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Public } from '../../auth/decorators/public.decorator';

const strictValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

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
  @UsePipes(strictValidationPipe)
  async createPair(@Body() data: CreateCurrencyPairDto) {
    return this.currencyPairService.create(data);
  }

  @Patch('/admin/:id')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @UsePipes(strictValidationPipe)
  async updatePair(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() data: UpdateCurrencyPairDto,
  ) {
    if (!isUUID(id)) {
      throw new BadRequestException('Validation failed (uuid is expected)');
    }
    return this.currencyPairService.update(id, data);
  }

  @Post('/admin/:id/suspend')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @UsePipes(strictValidationPipe)
  async suspendPair(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() bodyOrReason: SuspendPairDto | string,
    durationArg?: string,
  ) {
    if (!isUUID(id)) {
      throw new BadRequestException('Validation failed (uuid is expected)');
    }
    if (typeof bodyOrReason === 'string') {
      return this.currencyPairService.suspend(
        id,
        bodyOrReason,
        durationArg ?? '',
      );
    }
    if (
      !bodyOrReason ||
      typeof bodyOrReason !== 'object' ||
      typeof bodyOrReason.reason !== 'string' ||
      !bodyOrReason.reason.trim() ||
      typeof bodyOrReason.duration !== 'string' ||
      !bodyOrReason.duration.trim()
    ) {
      throw new BadRequestException('reason and duration are required');
    }
    return this.currencyPairService.suspend(
      id,
      bodyOrReason.reason,
      bodyOrReason.duration,
    );
  }

  @Post('/admin/:id/resume')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  async resumePair(@Param('id', new ParseUUIDPipe()) id: string) {
    if (!isUUID(id)) {
      throw new BadRequestException('Validation failed (uuid is expected)');
    }
    return this.currencyPairService.resume(id);
  }

  @Get('/admin/health')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  async getHealth() {
    return this.currencyPairService.getHealth();
  }
}
