import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ImpersonationService } from './impersonation.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ImpersonationResponseDto,
  ActiveImpersonationSessionsDto,
} from './dto/impersonation.dto';

@ApiTags('Admin Impersonation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class ImpersonationController {
  constructor(private readonly impersonationService: ImpersonationService) {}

  // Declared before `impersonate/:userId`: Express matches in declaration
  // order, so the parameterised route used to swallow /impersonate/end as
  // userId='end' and fail ParseUUIDPipe — the session could never be ended.
  @Post('impersonate/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End the current impersonation session' })
  @ApiResponse({
    status: 200,
    description: 'Impersonation ended successfully',
  })
  async endImpersonate(
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: any,
  ): Promise<{ message: string }> {
    if (!user?.isImpersonation || !user.jti || !user.impersonatedBy) {
      throw new BadRequestException(
        'Cannot end impersonation: current token is not an impersonation session',
      );
    }

    return this.impersonationService.endImpersonation(
      user.userId,
      user.jti,
      user.impersonatedBy,
      req,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('impersonate/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start impersonating a user (Admin/Super-Admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Impersonation token generated successfully',
    type: ImpersonationResponseDto,
  })
  async impersonate(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: any,
  ): Promise<ImpersonationResponseDto> {
    return this.impersonationService.startImpersonation(
      admin.userId,
      userId,
      req,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('impersonation/active')
  @ApiOperation({
    summary: 'List active impersonation sessions created by the admin',
  })
  @ApiResponse({
    status: 200,
    description: 'Active impersonation sessions retrieved successfully',
    type: ActiveImpersonationSessionsDto,
  })
  async getActiveSessions(
    @CurrentUser() admin: CurrentUserPayload,
  ): Promise<ActiveImpersonationSessionsDto> {
    return this.impersonationService.getActiveSessions(admin.userId);
  }
}
