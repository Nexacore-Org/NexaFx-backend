import { Controller, Post, Get, Body, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { SandboxService } from './sandbox.service';

@ApiTags('Sandbox')
@ApiBearerAuth()
@Controller({ path: 'sandbox', version: '2' })
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new sandbox environment' })
  async register(@Request() req: any) {
    return this.sandboxService.register(req.user.id);
  }

  @Post('reset')
  @ApiOperation({ summary: 'Reset the sandbox environment' })
  async reset(@Request() req: any) {
    return this.sandboxService.reset(req.user.id);
  }

  @Get('events')
  @ApiOperation({ summary: 'List sandbox events' })
  async getEvents(@Request() req: any) {
    const account = await this.getSandboxAccount(req.user.id);
    return this.sandboxService.getEvents(account.id);
  }

  @Post('trigger-event')
  @ApiOperation({ summary: 'Trigger a custom sandbox event' })
  async triggerEvent(
    @Request() req: any,
    @Body() body: { eventType: string; data: any },
  ) {
    const account = await this.getSandboxAccount(req.user.id);
    return this.sandboxService.triggerEvent(account.id, body.eventType, body.data);
  }

  @Get('request-log')
  @ApiOperation({ summary: 'Get last 100 sandbox API requests' })
  async getRequestLog(@Request() req: any) {
    const account = await this.getSandboxAccount(req.user.id);
    return this.sandboxService.getRequestLog(account.id);
  }

  private async getSandboxAccount(userId: string) {
    const account = await this.sandboxService.findByUserId(userId);
    if (!account) {
      throw new NotFoundException('Sandbox account not found. Please register first.');
    }
    return account;
  }
}
