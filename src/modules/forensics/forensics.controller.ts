import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ForensicsService } from './forensics.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Admin — Forensics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/forensics')
export class ForensicsController {
  constructor(private readonly forensicsService: ForensicsService) {}

  @Post('verify')
  async verify(
    @Body() body: { fromDate?: string; toDate?: string },
  ) {
    return this.forensicsService.verifyChain(body.fromDate, body.toDate);
  }

  @Post('manifest')
  async manifest(
    @Body() body: { fromDate?: string; toDate?: string },
  ) {
    return this.forensicsService.generateManifest(body.fromDate, body.toDate);
  }

  @Post('backfill')
  async backfill(
    @Body() body: { fromDate?: string; toDate?: string },
  ) {
    return this.forensicsService.backfillHashes(body.fromDate, body.toDate);
  }
}
