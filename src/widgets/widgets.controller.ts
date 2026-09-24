import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { WidgetsService } from './widgets.service';
import { DashboardWidget } from './entities/dashboard-widget.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';

@ApiTags('Widgets')
@ApiBearerAuth('access-token')
@Controller('v2')
export class WidgetsController {
  constructor(private readonly service: WidgetsService) {}

  @Get('dashboard/widgets')
  @ApiOperation({ summary: 'Load multiple widgets in parallel' })
  @ApiQuery({ name: 'types', description: 'Comma-separated widget types' })
  getWidgets(
    @Request() req: { user: { userId: string } },
    @Query('types') types: string,
  ) {
    const typeList = (types ?? '').split(',').map((t) => t.trim()).filter(Boolean);
    return this.service.getWidgets(req.user.userId, typeList).then((widgets) => ({ widgets }));
  }

  @Get('widgets/balance-summary')
  @ApiOperation({ summary: 'Balance summary widget' })
  balanceSummary(@Request() req: { user: { userId: string } }) {
    return this.service.getWidgetData(req.user.userId, 'balance-summary');
  }

  @Get('widgets/recent-transactions')
  @ApiOperation({ summary: 'Recent transactions widget' })
  recentTransactions(@Request() req: { user: { userId: string } }) {
    return this.service.getWidgetData(req.user.userId, 'recent-transactions');
  }

  @Get('widgets/exchange-rate-ticker')
  @ApiOperation({ summary: 'Exchange rate ticker widget' })
  exchangeRateTicker(@Request() req: { user: { userId: string } }) {
    return this.service.getWidgetData(req.user.userId, 'exchange-rate-ticker');
  }

  @Get('widgets/savings-progress')
  @ApiOperation({ summary: 'Savings progress widget' })
  savingsProgress(@Request() req: { user: { userId: string } }) {
    return this.service.getWidgetData(req.user.userId, 'savings-progress');
  }

  @Get('widgets/rate-alerts')
  @ApiOperation({ summary: 'Rate alerts widget' })
  rateAlerts(@Request() req: { user: { userId: string } }) {
    return this.service.getWidgetData(req.user.userId, 'rate-alerts');
  }

  @Get('widgets/quick-actions')
  @ApiOperation({ summary: 'Quick actions widget' })
  quickActions(@Request() req: { user: { userId: string } }) {
    return this.service.getWidgetData(req.user.userId, 'quick-actions');
  }

  @Get('widgets/loyalty-points')
  @ApiOperation({ summary: 'Loyalty points widget' })
  loyaltyPoints(@Request() req: { user: { userId: string } }) {
    return this.service.getWidgetData(req.user.userId, 'loyalty-points');
  }

  @Get('widgets/spending-goals')
  @ApiOperation({ summary: 'Spending goals widget' })
  spendingGoals(@Request() req: { user: { userId: string } }) {
    return this.service.getWidgetData(req.user.userId, 'spending-goals');
  }

  @Get('admin/widgets/registry')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: list widget registry' })
  listRegistry() {
    return this.service.listRegistry();
  }

  @Post('admin/widgets/registry')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: upsert widget in registry' })
  upsertWidget(@Body() dto: Partial<DashboardWidget>) {
    return this.service.upsertWidget(dto);
  }
}
