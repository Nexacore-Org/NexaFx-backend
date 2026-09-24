import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { WalletConnectService } from './walletconnect.service';

@ApiTags('WalletConnect')
@Controller({ path: 'walletconnect', version: '2' })
export class WalletConnectController {
  constructor(private readonly walletConnectService: WalletConnectService) {}

  @Post('init')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Initialize WalletConnect pairing',
    description:
      'Returns a pairing URI that the Stellar wallet app can scan to establish a connection.',
  })
  @ApiResponse({
    status: 201,
    description: 'Pairing URI generated',
    schema: {
      type: 'object',
      properties: {
        pairingUri: { type: 'string', example: 'wc:abc123@2?relay-protocol=irn&symKey=...' },
        sessionTopic: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.CREATED)
  async initPairing(@Request() req: any) {
    return this.walletConnectService.initPairing(req.user.userId);
  }

  @Get('sessions')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List active WalletConnect sessions',
    description: 'Returns all active WalletConnect sessions for the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active sessions',
  })
  async getSessions(@Request() req: any) {
    return this.walletConnectService.getActiveSessions(req.user.userId);
  }

  @Delete('sessions/:topic')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Disconnect a WalletConnect session',
  })
  @ApiParam({
    name: 'topic',
    description: 'Session topic to disconnect',
  })
  @ApiResponse({
    status: 200,
    description: 'Session disconnected',
  })
  async disconnectSession(
    @Request() req: any,
    @Param('topic') topic: string,
  ) {
    await this.walletConnectService.disconnectSession(req.user.userId, topic);
    return { message: 'Session disconnected' };
  }

  @Post('sign')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Sign a Stellar transaction via WalletConnect',
    description:
      'Builds a Stellar XDR transaction and sends it to the connected wallet for signing.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sessionTopic: { type: 'string' },
        operationType: {
          type: 'string',
          enum: ['payment', 'path_payment', 'manage_offer'],
        },
        params: { type: 'object' },
      },
      required: ['sessionTopic', 'operationType', 'params'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction XDR built and ready for signing',
  })
  async signTransaction(
    @Request() req: any,
    @Body() body: {
      sessionTopic: string;
      operationType: 'payment' | 'path_payment' | 'manage_offer';
      params: Record<string, unknown>;
    },
  ) {
    return this.walletConnectService.signTransaction(
      req.user.userId,
      body.sessionTopic,
      body.operationType,
      body.params,
    );
  }

  @Post('submit')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Submit a signed Stellar transaction',
    description:
      'Submits an XDR transaction signed by an external wallet to the Stellar network.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        signedXdr: { type: 'string', description: 'Base64-encoded signed XDR' },
      },
      required: ['signedXdr'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction submitted',
  })
  async submitTransaction(@Body() body: { signedXdr: string }) {
    return this.walletConnectService.submitSignedTransaction(body.signedXdr);
  }

  @Get('balance/:publicKey')
  @Public()
  @ApiOperation({
    summary: 'Get Stellar wallet balance (guest, no auth)',
    description:
      'Returns the balance for a Stellar public key. No authentication required.',
  })
  @ApiParam({
    name: 'publicKey',
    description: 'Stellar public key (G...)',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet balances',
  })
  async getGuestBalance(@Param('publicKey') publicKey: string) {
    return this.walletConnectService.getGuestBalance(publicKey);
  }

  @Post('link-account')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Link Stellar wallet to NexaFX account',
    description:
      'Links the connected Stellar wallet public key to the authenticated user\'s NexaFX account.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        stellarPublicKey: {
          type: 'string',
          description: 'Stellar public key to link',
        },
      },
      required: ['stellarPublicKey'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Account linked',
  })
  async linkAccount(
    @Request() req: any,
    @Body() body: { stellarPublicKey: string },
  ) {
    return this.walletConnectService.linkAccount(
      req.user.userId,
      body.stellarPublicKey,
    );
  }
}
