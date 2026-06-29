import { Controller, Get, Post, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { Response } from 'express';

// Simulated standard app Auth/Roles guards setup matching structural architecture rules
// Replace these paths with your real corporate RBAC guard implementations
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';

@Controller('admin/compliance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('COMPLIANCE', 'SUPER_ADMIN')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('dashboard')
  async getDashboard() {
    return this.complianceService.getDashboardData();
  }

  @Get('alerts')
  async getAlerts() {
    return this.complianceService.getPriorityAlerts();
  }

  @Post('alerts/:id/acknowledge')
  async acknowledgeAlert(@Param('id') id: string) {
    await this.complianceService.acknowledgeAlert(id);
    return { success: true, acknowledgedId: id };
  }

  @Get('metrics-history')
  async getHistory(@Query('days') days = 30) {
    return this.complianceService.getHistoricalTrends(Number(days));
  }

  @Get('dashboard/export')
  async exportPdf(@Query('format') format: string, @Res() res: Response) {
    if (format !== 'pdf') return res.status(400).json({ error: 'Only PDF format is supported' });
    
    // Explicit stream pipe scaffolding setup for binary file data transfers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=compliance-report.pdf');
    
    // Stand-in layout buffer payload representing the structural 08:00 UTC artifact pipeline
    const blankPdfBuffer = Buffer.from('%PDF-1.4 ... compliance report structural matrix ...');
    return res.send(blankPdfBuffer);
  }
}