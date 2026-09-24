import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SigningService } from './signing.service';

@ApiTags('Transaction Signing Keys')
@Controller({ path: 'signing-keys', version: '2' })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SigningController {
  constructor(private readonly signingService: SigningService) {}

  @Post()
  @ApiOperation({ summary: 'Setup a new TOTP signing key' })
  async setupKey(
    @Request() req: any,
    @Body() dto: { keyName: string; minAmountUsd?: string },
  ) {
    return this.signingService.setupKey(req.user.id, dto.keyName, dto.minAmountUsd || '0');
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm key setup with TOTP code' })
  async confirmKey(@Param('id') id: string, @Body() body: { totpCode: string }) {
    return this.signingService.confirmSetup(id, body.totpCode);
  }

  @Get()
  @ApiOperation({ summary: 'List signing keys' })
  async listKeys(@Request() req: any) {
    return this.signingService.listKeys(req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke a signing key' })
  async revokeKey(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { totpCode: string },
  ) {
    await this.signingService.revokeKey(id, req.user.id, body.totpCode);
    return { message: 'Key revoked successfully' };
  }
}
