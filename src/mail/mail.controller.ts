import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MailService } from './mail.service';

@ApiTags('Mail')
@Controller('mail')
export class MailController {
  // No endpoints defined yet. Add Swagger decorators to all future endpoints.

  constructor(private readonly mailService: MailService) {}

  @Get()
  async testSend() {
    const success = await this.mailService.sendOtpEmail({
      to: 'nexacore.org@gmail.com',
      otp: '123475',
      userName: 'Test User for thelasttime',
    });
    return { success };
  }
}
