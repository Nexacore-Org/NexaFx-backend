import * as net from 'net';
import {
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

const logger = new Logger('VirusScannerHelper');

/**
 * Whether an unavailable or erroring scanner may pass a file through.
 *
 * Production fails closed: a KYC upload nobody scanned is worse than one that
 * is rejected. Development keeps the permissive behaviour so a machine
 * without ClamAV can still run the suite, and CLAMAV_FAIL_OPEN=true|false
 * overrides the default either way.
 */
function isFailOpenAllowed(): boolean {
  const override = process.env.CLAMAV_FAIL_OPEN;
  if (override === 'true') return true;
  if (override === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

function scannerUnavailable(reason: string): void {
  if (isFailOpenAllowed()) {
    logger.warn(`${reason} Allowing the file through (fail-open).`);
    return;
  }
  throw new ServiceUnavailableException(
    'Malware scanning is unavailable, the upload was rejected',
  );
}

export async function scanBuffer(buffer: Buffer): Promise<void> {
  const host = process.env.CLAMAV_HOST;
  if (!host) {
    scannerUnavailable('CLAMAV_HOST is not configured.');
    return;
  }

  const port = parseInt(process.env.CLAMAV_PORT || '3310', 10);
  logger.log(`Scanning buffer with ClamAV at ${host}:${port}...`);

  return new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let response = '';
    let settled = false;

    const settle = (reason: string): void => {
      if (settled) return;
      settled = true;
      if (isFailOpenAllowed()) {
        logger.error(`${reason} Allowing the file through (fail-open).`);
        resolve();
        return;
      }
      reject(
        new ServiceUnavailableException(
          'Malware scanning is unavailable, the upload was rejected',
        ),
      );
    };

    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      socket.write(`${Buffer.byteLength(buffer)}\0`);
      socket.write(buffer);
      socket.write('\0');
      socket.end();
    });

    socket.on('data', (data) => {
      response += data.toString();
    });

    socket.on('end', () => {
      socket.destroy();
      if (settled) return;
      settled = true;

      if (response.includes('FOUND')) {
        logger.warn(`Virus detected! ClamAV response: ${response.trim()}`);
        reject(new UnprocessableEntityException('File failed virus scan'));
        return;
      }

      // Anything other than a clean reply is not a clean result. "ERROR"
      // covers the size limit, a truncated stream and a daemon that gave up -
      // all of which used to be treated as "no virus".
      if (response.includes('ERROR')) {
        logger.error(`ClamAV error reply: ${response.trim()}`);
        reject(
          new UnprocessableEntityException(
            'File could not be scanned and was rejected',
          ),
        );
        return;
      }

      logger.log('ClamAV scan completed. File is clean.');
      resolve();
    });

    socket.on('timeout', () => {
      socket.destroy();
      settle('ClamAV scan request timed out.');
    });

    socket.on('error', (err) => {
      socket.destroy();
      settle(`ClamAV scan connection error: ${err.message}`);
    });
  });
}
