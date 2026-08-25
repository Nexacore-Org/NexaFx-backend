import { Controller, Get, Post, Delete, Body, Param, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { BridgePrepService } from './bridge-prep.service';

@Controller('v2')
export class BridgePrepController {
  constructor(private readonly bridgePrepService: BridgePrepService) {}

  @Get('networks')
  async getNetworks() {
    return this.bridgePrepService.getAllNetworks();
  }

  @Get('networks/bridge-status')
  async getStatus() {
    return this.bridgePrepService.getBridgeStatus();
  }

  @Post('external-wallets')
  @HttpCode(HttpStatus.CREATED)
  async saveWallet(@Req() req: any, @Body() body: { networkId: string; address: string; label?: string }) {
    return this.bridgePrepService.saveWallet(req.user.id, body.networkId, body.address, body.label);
  }

  @Get('external-wallets')
  async getWallets(@Req() req: any) {
    return this.bridgePrepService.getUserWallets(req.user.id);
  }

  @Delete('external-wallets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeWallet(@Param('id') id: string, @Req() req: any) {
    return this.bridgePrepService.removeWallet(id, req.user.id);
  }

  @Post('external-wallets/:id/verify')
  @HttpCode(HttpStatus.OK)
  async verifyWallet(@Param('id') id: string, @Req() req: any) {
    return this.bridgePrepService.initiateVerification(id, req.user.id);
  }
}