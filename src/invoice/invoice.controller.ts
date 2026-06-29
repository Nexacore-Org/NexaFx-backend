import { Controller, Post, Get, Patch, Delete, Param, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('v2/invoices')
@UseGuards(JwtAuthGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post()
  async create(@Request() req, @Body() body: any) {
    return await this.invoiceService.createInvoice(req.user.id.toString(), body);
  }

  @Get()
  async listForUser(@Request() req) {
    // Returns complete history entries matching user id parameter maps
    return { data: await this.invoiceService.listInvoicesByUser(req.user.id.toString()) };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Request() req, @Body() body: any) {
    return await this.invoiceService.updateInvoice(id, req.user.id.toString(), body);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  async send(@Param('id') id: string, @Request() req) {
    return await this.invoiceService.sendInvoice(id, req.user.id.toString());
  }
}