import { Controller, Get, Post, Delete, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { BankAccountsService } from './bank-accounts.service';
import { BankProvider } from './entities/linked-bank-account.entity';

@ApiTags('Bank Accounts')
@ApiBearerAuth()
@Controller({ path: 'bank-accounts', version: '2' })
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Post('/link')
  initiateLink(@Req() req: Request, @Body('provider') provider: BankProvider) {
    const userId = (req.user as any).id;
    return this.bankAccountsService.initiateLink(userId, provider);
  }

  @Get('/link/callback')
  handleCallback(@Query('reference') reference: string, @Query('code') code: string) {
    return this.bankAccountsService.handleCallback(reference, code);
  }

  @Post('/:id/sync')
  syncBalance(@Param('id') id: string) {
    return this.bankAccountsService.syncBalance(id);
  }

  @Get('/')
  listAccounts(@Req() req: Request) {
    const userId = (req.user as any).id;
    return this.bankAccountsService.getUserAccounts(userId);
  }

  @Delete('/:id')
  unlinkAccount(@Param('id') id: string, @Req() req: Request) {
    const userId = (req.user as any).id;
    return this.bankAccountsService.unlinkAccount(id, userId);
  }
}
