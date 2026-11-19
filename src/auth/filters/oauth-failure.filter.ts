import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

@Catch()
export class OAuthFailureFilter implements ExceptionFilter {
  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const failureUrl = this.configService.get<string>(
      'OAUTH_FAILURE_REDIRECT',
      'http://localhost:3001/login?error=oauth_failed',
    );

    response.redirect(failureUrl);
  }
}
