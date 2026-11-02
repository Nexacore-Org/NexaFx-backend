import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { FlagsService } from './flags.service';
import { CreateFeatureFlagDto, UpdateFeatureFlagDto } from './dto';
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
  async createFlag(@Body() body: CreateFeatureFlagDto, @Request() req?: any) {
    if (
      body &&
      body.rolloutPercent !== undefined &&
      (typeof body.rolloutPercent !== 'number' ||
        !Number.isInteger(body.rolloutPercent) ||
        body.rolloutPercent < 0 ||
        body.rolloutPercent > 100)
    ) {
      throw new BadRequestException(
        'rolloutPercent must be an integer between 0 and 100',
      );
    }
    const actorId = req?.user?.userId;
    return actorId
      ? this.flagsService.createFlag(body, actorId)
      : this.flagsService.createFlag(body);
  }

  @Patch('admin/flags/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateFlag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateFeatureFlagDto,
    @Request() req?: any,
  ) {
    if (
      body &&
      body.rolloutPercent !== undefined &&
      (typeof body.rolloutPercent !== 'number' ||
        !Number.isInteger(body.rolloutPercent) ||
        body.rolloutPercent < 0 ||
        body.rolloutPercent > 100)
    ) {
      throw new BadRequestException(
        'rolloutPercent must be an integer between 0 and 100',
      );
    }
    const actorId = req?.user?.userId;
    return actorId
      ? this.flagsService.updateFlag(id, body, actorId)
      : this.flagsService.updateFlag(id, body);
  }

  @Delete('admin/flags/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteFlag(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req?: any,
  ) {
    const actorId = req?.user?.userId;
    if (actorId) {
      await this.flagsService.deleteFlag(id, actorId);
    } else {
      await this.flagsService.deleteFlag(id);
    }
    return { success: true };
  }

  @Get('admin/flags/:id/check')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async checkFlagForUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('userId') targetUserId: string,
  ) {
    if (typeof this.flagsService.checkFlagForUser === 'function') {
      return this.flagsService.checkFlagForUser(id, targetUserId);
    }
    if (typeof this.flagsService.findById === 'function') {
      const flag = await this.flagsService.findById(id);
      if (!flag) return { enabled: false };
      const enabled = await this.flagsService.isEnabled(flag.key, targetUserId);
      return { enabled };
    }
    const flags = await this.flagsService.listFlags();
    const flag = flags.find((f) => f.id === id);
    if (!flag) return { enabled: false };
    const enabled = await this.flagsService.isEnabled(flag.key, targetUserId);
    return { enabled };
  }
}
