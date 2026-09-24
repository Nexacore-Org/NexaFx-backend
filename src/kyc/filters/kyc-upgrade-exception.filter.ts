import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import { KycUpgradeRequiredException } from '../exceptions/kyc-upgrade-required.exception';

@Catch(KycUpgradeRequiredException)
export class KycUpgradeExceptionFilter implements ExceptionFilter {
  catch(exception: KycUpgradeRequiredException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const resBody = exception.getResponse();

    response
      .status(status)
      .header('X-Retry-After-Upgrade', 'true')
      .json(resBody);
  }
}