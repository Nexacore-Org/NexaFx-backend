import { Controller, Get, Post, Param, UseGuards, Request, Res } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Response } from 'express';

@Controller('v2/invoices')
export class InvoicePublicController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly pdfService: PdfGeneratorService,
  ) {}

  @Get(':id/pay')
  async getPublicInvoiceDetails(@Param('id') id: string) {
    // Unauthenticated landing details lookup validation block
    return await this.invoiceService.getInvoicePublicSnapshot(id);
  }

  @Post(':id/pay')
  @UseGuards(JwtAuthGuard)
  async settleInvoicePayment(@Param('id') id: string, @Request() req) {
    return await this.invoiceService.executePayment(id, req.user.id.toString());
  }

  @Get(':id/pdf')
  async downloadBrandedPdf(@Param('id') id: string, @Res() res: Response) {
    const pdfBuffer = await this.pdfService.renderBrandedInvoiceBuffer(id);
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=Invoice-${id}.pdf`,
      'Content-Length': pdfBuffer.length,
    });
    
    res.end(pdfBuffer);
  }
}