import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FlagsService } from './flags.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';

@Controller()
export class FlagsController {
  constructor(private readonly flagsService: FlagsService) {}

  @Get('flags')
  @UseGuards(JwtAuthGuard)
  async getUserFlags(@Request() req: any) {
    return this.flagsService.getFlagsForUser(req.user.userId);
  }

  @Get('admin/flags')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async listFlags() {
    return this.flagsService.listFlags();
  }

  @Post('admin/flags')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async createFlag(@Body() body: any) {
    return this.flagsService.createFlag(body);
  }

  @Patch('admin/flags/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateFlag(@Param('id') id: string, @Body() body: any) {
    return this.flagsService.updateFlag(id, body);
  }

  @Delete('admin/flags/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteFlag(@Param('id') id: string) {
    await this.flagsService.deleteFlag(id);
    return { success: true };
  }

  @Get('admin/flags/:id/check')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async checkFlagForUser(
    @Param('id') id: string,
    @Query('userId') targetUserId: string,
  ) {
    const flags = await this.flagsService.listFlags();
    const flag = flags.find((f) => f.id === id);
    if (!flag) return { enabled: false };
    const enabled = await this.flagsService.isEnabled(flag.key, targetUserId);
    return { enabled };
  }
}
