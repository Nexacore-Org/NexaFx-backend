import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { SplitsService } from './splits.service';
import { CreateSplitDto } from './dto/create-split.dto';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard'; // Point to your shared guards directory

@Controller('v2/splits')
@UseGuards(JwtAuthGuard)
export class SplitsController {
  constructor(private readonly splitsService: SplitsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: any, @Body() dto: CreateSplitDto) {
    return this.splitsService.createSplit(req.user.id, req.user.email, dto);
  }

  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  async pay(@Param('id') id: string, @Req() req: any) {
    await this.splitsService.payShare(id, req.user.id, req.user.email);
    return { success: true, message: 'Share processed successfully' };
  }

  @Post(':id/remind')
  @HttpCode(HttpStatus.OK)
  async remind(@Param('id') id: string, @Req() req: any) {
    await this.splitsService.remindParticipants(id, req.user.id);
    return { success: true };
  }

  @Post(':id/participants/:pid/waive')
  @HttpCode(HttpStatus.OK)
  async waive(@Param('id') id: string, @Param('pid') pid: string, @Req() req: any) {
    await this.splitsService.waiveShare(id, req.user.id, pid);
    return { success: true };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@Param('id') id: string, @Req() req: any) {
    await this.splitsService.cancelSplit(id, req.user.id);
  }

  @Get()
  async getInitiated(@Req() req: any) {
    return this.splitsService.getInitiated(req.user.id);
  }

  @Get('incoming')
  async getIncoming(@Req() req: any) {
    return this.splitsService.getIncoming(req.user.email, req.user.id);
  }
}