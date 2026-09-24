import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';

@ApiTags('Search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('v2/search')
  @ApiOperation({ summary: 'Global search across user-owned results' })
  @ApiResponse({ status: 200, description: 'Returns grouped search results' })
  async search(
    @CurrentUser() user: { userId: string },
    @Query('q') q: string,
    @Query('types') types?: string,
  ) {
    if (!q?.trim()) {
      return { transactions: [], notifications: [], tickets: [] };
    }

    const requestedTypes = (types || 'transactions,notifications,tickets')
      .split(',')
      .map((type) => type.trim())
      .filter(Boolean);

    await this.searchService.trackAnalytics(q);
    return this.searchService.searchAll(user.userId, q, requestedTypes);
  }

  @Get('admin/search')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin global search' })
  @ApiResponse({ status: 200, description: 'Returns admin search results' })
  async adminSearch(
    @Query('q') q: string,
    @Query('types') types?: string,
  ) {
    if (!q?.trim()) {
      return { users: [], transactions: [], auditLogs: [] };
    }

    const requestedTypes = (types || 'users,transactions')
      .split(',')
      .map((type) => type.trim())
      .filter(Boolean);

    return this.searchService.searchAdmin(q, q, requestedTypes);
  }
}
