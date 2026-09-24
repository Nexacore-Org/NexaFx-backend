import * as net from 'net';
import { Logger, UnprocessableEntityException } from '@nestjs/common';

const logger = new Logger('VirusScannerHelper');

export async function scanBuffer(buffer: Buffer): Promise<void> {
  const host = process.env.CLAMAV_HOST;
  if (!host) {
    logger.warn('CLAMAV_HOST is not configured. Skipping virus scan.');
    return;
  }

  const port = parseInt(process.env.CLAMAV_PORT || '3310', 10);
  logger.log(`Scanning buffer with ClamAV at ${host}:${port}...`);

  return new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let response = '';

    // Set connection timeout (e.g. 5 seconds)
    socket.setTimeout(5000);

    socket.on('connect', () => {
      // Send INSTREAM command
      socket.write('nINSTREAM\n');
      
      // Send buffer chunk by chunk
      // ClamAV INSTREAM format: [4 byte big-endian length][chunk data]
      const chunkSize = 8192;
      let offset = 0;
      
      while (offset < buffer.length) {
        const chunk = buffer.subarray(offset, offset + chunkSize);
        const sizeBuf = Buffer.alloc(4);
        sizeBuf.writeUInt32BE(chunk.length, 0);
        socket.write(sizeBuf);
        socket.write(chunk);
        offset += chunkSize;
      }
      
      // Terminate stream with 4-byte 0
      const zeroBuf = Buffer.alloc(4);
      zeroBuf.writeUInt32BE(0, 0);
      socket.write(zeroBuf);
    });

    socket.on('data', (data) => {
      response += data.toString();
    });

    socket.on('end', () => {
      socket.destroy();
      if (response.includes('FOUND')) {
        logger.warn(`Virus detected! ClamAV response: ${response.trim()}`);
        reject(new UnprocessableEntityException('File failed virus scan'));
      } else {
        logger.log('ClamAV scan completed. File is clean.');
        resolve();
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      logger.error('ClamAV scan request timed out.');
      resolve(); // Proceed to avoid blocking service
    });

    socket.on('error', (err) => {
      socket.destroy();
      logger.error(`ClamAV scan connection error: ${err.message}`);
      resolve(); // Proceed to avoid blocking service
    });
  });
}
