import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
  BadRequestException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { SanctionsService, UserScreeningStatus } from './sanctions.service';
import { OverrideScreeningDto } from './dto/override-screening.dto';
import { ListScreeningsQueryDto } from './dto/list-screenings-query.dto';
import { ScreeningStatus } from './entities/kyc-screening.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';

@ApiTags('Sanctions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: [VERSION_NEUTRAL, '1'] })
export class SanctionsController {
  constructor(private readonly sanctionsService: SanctionsService) {}

  @Get('v2/sanctions/me')
  @ApiOperation({ summary: 'Get your latest screening status' })
  async getMyScreening(
    @CurrentUser()
    user: CurrentUserPayload | { user?: CurrentUserPayload },
  ): Promise<{ status: UserScreeningStatus; updatedAt: Date | null }> {
    const userId = this.resolveUserId(user);
    const screening = await this.sanctionsService.getLatestScreening(userId);
    return SanctionsService.toUserFacingScreening(screening);
  }

  @Get('admin/sanctions/screenings')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  @ApiOperation({ summary: 'List all screenings (Admin)' })
  @ApiQuery({ name: 'status', enum: ScreeningStatus, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async listScreenings(
    @Query() query: ListScreeningsQueryDto = new ListScreeningsQueryDto(),
    pageArg?: number,
    limitArg?: number,
  ) {
    let status: ScreeningStatus | undefined;
    let page = 1;
    let limit = 20;

    if (
      typeof query === 'string' ||
      pageArg !== undefined ||
      limitArg !== undefined
    ) {
      status = query as unknown as ScreeningStatus | undefined;
      page = pageArg ?? 1;
      limit = limitArg ?? 20;
    } else if (query && typeof query === 'object') {
      status = query.status;
      page = query.page !== undefined ? Number(query.page) : 1;
      limit = query.limit !== undefined ? Number(query.limit) : 20;
    }

    if (
      status !== undefined &&
      !Object.values(ScreeningStatus).includes(status)
    ) {
      throw new BadRequestException(`Invalid screening status: ${status}`);
    }
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('page must be an integer >= 1');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 100',
      );
    }

    return this.sanctionsService.listScreenings(status, page, limit);
  }

  @Patch('admin/sanctions/screenings/:id/override')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({
    summary: 'Override a WARNING/BLOCKED screening result (Super Admin)',
  })
  @ApiParam({ name: 'id', type: String })
  async overrideScreening(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: OverrideScreeningDto,
    @CurrentUser()
    user: CurrentUserPayload | { user?: CurrentUserPayload },
  ) {
    if (!isUUID(id)) {
      throw new BadRequestException('Validation failed (uuid is expected)');
    }
    const adminUserId = this.resolveUserId(user);
    return this.sanctionsService.overrideScreening(id, adminUserId, dto.reason);
  }

  @Post('admin/sanctions/screen/:userId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Trigger a manual screening for a user (Admin)' })
  @ApiParam({ name: 'userId', type: String })
  async screenUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentUser()
    user?: CurrentUserPayload | { user?: CurrentUserPayload },
  ) {
    if (!isUUID(userId)) {
      throw new BadRequestException('Validation failed (uuid is expected)');
    }
    const adminUserId = user ? this.resolveUserId(user) : '';
    return adminUserId
      ? this.sanctionsService.screenUser(userId, adminUserId)
      : this.sanctionsService.screenUser(userId);
  }

  @Post('admin/sanctions/sync-ofac')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Trigger a manual OFAC SDN list sync (Super Admin)',
  })
  async syncOfac() {
    const count = await this.sanctionsService.syncOfacList();
    return { synced: count };
  }

  private resolveUserId(
    userOrReq: CurrentUserPayload | { user?: CurrentUserPayload } | undefined,
  ): string {
    if (!userOrReq) return '';
    if ('userId' in userOrReq && typeof userOrReq.userId === 'string') {
      return userOrReq.userId;
    }
    if ('user' in userOrReq && userOrReq.user?.userId) {
      return userOrReq.user.userId;
    }
    return '';
  }
}
