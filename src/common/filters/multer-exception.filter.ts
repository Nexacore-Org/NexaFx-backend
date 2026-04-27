import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
} from '@nestjs/common';
import type { MulterError } from 'multer';
import type { Response } from 'express';

@Catch()
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    const maybeError = exception;
    if (
      typeof maybeError === 'object' &&
      maybeError !== null &&
      'name' in maybeError &&
      (maybeError as { name: unknown }).name === 'MulterError'
    ) {
      const err = maybeError as MulterError;
      // Map Multer errors (like LIMIT_FILE_SIZE) to a 400 Bad Request
      const message = err.message || 'File upload error';
      const bad = new BadRequestException(message);
      res
        .status(bad.getStatus())
        .json({ statusCode: bad.getStatus(), message: bad.message });
      return;
    }

    // Not a Multer error - rethrow so other global filters handle it
    throw exception;
  }
}
