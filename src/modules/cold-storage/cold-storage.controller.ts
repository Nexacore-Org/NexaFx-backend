import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ColdStorageService } from './cold-storage.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';

@ApiTags('Cold Storage')
@ApiBearerAuth()
@Controller({ path: 'cold-storage', version: '2' })
export class ColdStorageController {
  constructor(private readonly coldStorageService: ColdStorageService) {}

  @Post('setup')
  @ApiOperation({ summary: 'Set up a cold storage account' })
  async setup(
    @Request() req: any,
    @Body() body: { currency: string; stellarPublicKey: string },
  ) {
    return this.coldStorageService.setup(req.user.id, body.currency, body.stellarPublicKey);
  }

  @Post('deposit')
  @ApiOperation({ summary: 'Deposit funds into cold storage' })
  async deposit(
    @Request() req: any,
    @Body() body: { currency: string; amount: string },
  ) {
    return this.coldStorageService.deposit(req.user.id, body.currency, body.amount);
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Request a withdrawal from cold storage' })
  async withdraw(
    @Request() req: any,
    @Body() body: { amount: string },
  ) {
    return this.coldStorageService.requestWithdrawal(req.user.id, body.amount);
  }

  @Post('withdraw/:requestId/confirm')
  @ApiOperation({ summary: 'Confirm a withdrawal after waiting period' })
  async confirmWithdraw(
    @Request() req: any,
    @Param('requestId') requestId: string,
  ) {
    return this.coldStorageService.confirmWithdrawal(req.user.id, requestId);
  }

  @Get('accounts')
  @ApiOperation({ summary: 'Get all cold storage accounts for the user' })
  async getAccounts(@Request() req: any) {
    return this.coldStorageService.getUserAccounts(req.user.id);
  }
}

@ApiTags('Cold Storage Admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/cold-storage')
export class ColdStorageAdminController {
  constructor(private readonly coldStorageService: ColdStorageService) {}

  @Get()
  @ApiOperation({ summary: 'Get all cold storage accounts' })
  async getAllAccounts() {
    return this.coldStorageService.getAllAccounts();
  }

  @Get('withdrawals/pending')
  @ApiOperation({ summary: 'Get all pending withdrawal requests' })
  async getPendingWithdrawals() {
    return this.coldStorageService.getPendingWithdrawals();
  }

  @Post('withdrawals/:id/approve')
  @ApiOperation({ summary: 'Approve a withdrawal request' })
  async approveWithdrawal(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.coldStorageService.approveWithdrawal(id, req.user.id);
  }
}
