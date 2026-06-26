import {
  Controller,
  Get,
  Delete,
  Patch,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SessionsService } from './sessions.service';

@ApiTags('Sessions')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @ApiOperation({ summary: 'List all active sessions' })
  @ApiResponse({ status: 200, description: 'List of active sessions' })
  async getSessions(@Req() req: any) {
    const userId = req.user.userId;
    const currentJti = req.user.jti;
    return this.sessionsService.getActiveSessions(userId, currentJti);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiResponse({ status: 204, description: 'Session revoked successfully' })
  async revokeSession(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.userId;
    return this.sessionsService.revokeSession(userId, id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke all sessions except the current one' })
  @ApiResponse({ status: 204, description: 'All other sessions revoked' })
  async revokeAllOtherSessions(@Req() req: any) {
    const userId = req.user.userId;
    const currentJti = req.user.jti;
    return this.sessionsService.revokeAllOtherSessions(userId, currentJti);
  }

  @Patch(':id/trust')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a device as trusted' })
  @ApiResponse({ status: 200, description: 'Device trusted successfully' })
  async trustDevice(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.userId;
    return this.sessionsService.trustDevice(userId, id);
  }
}
