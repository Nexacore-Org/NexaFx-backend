import { Controller, Post, Get, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalPolicy } from '../entities/approval-policy.entity';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@Controller('v2/organisations/:id/approval-policies')
@UseGuards(RolesGuard)
@Roles('ORG_ADMIN') // Scope configuration mutations strictly to organization administrators
export class PolicyAdminController {
  constructor(
    @InjectRepository(ApprovalPolicy)
    private readonly policyRepo: Repository<ApprovalPolicy>,
  ) {}

  @Post()
  async createPolicy(@Param('id') organisationId: string, @Body() body: any) {
    const policy = this.policyRepo.create({ ...body, organisationId });
    return await this.policyRepo.save(policy);
  }

  @Get()
  async getOrgPolicies(@Param('id') organisationId: string) {
    return await this.policyRepo.find({ where: { organisationId } });
  }

  @Delete(':policyId')
  async removePolicy(@Param('policyId') id: string) {
    await this.policyRepo.delete({ id });
    return { success: true };
  }
}