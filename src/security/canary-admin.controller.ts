import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CanaryToken } from '../entities/canary-token.entity';
import { RolesGuard } from '../../auth/guards/roles.guard'; // Adjust paths as needed
import { Roles } from '../../auth/decorators/roles.decorator';

@Controller('admin/security/canary-tokens')
@UseGuards(RolesGuard)
@Roles('SUPER_ADMIN')
export class CanaryAdminController {
  constructor(
    @InjectRepository(CanaryToken)
    private readonly canaryRepo: Repository<CanaryToken>,
  ) {}

  @Get()
  async listAllCanaryTokens() {
    return await this.canaryRepo.find({
      order: { createdAt: 'DESC' },
    });
  }
}