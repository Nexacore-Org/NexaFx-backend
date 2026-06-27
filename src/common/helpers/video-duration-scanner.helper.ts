import { Logger } from '@nestjs/common';

const logger = new Logger('VideoDurationScanner');

/**
 * Validates that the uploaded video is within the accepted duration and size constraints.
 * In a production environment, this would ideally use ffprobe or an external service.
 * For this implementation, we enforce a strict file size limit (e.g. 20MB) as a proxy
 * for the 15-second duration limit (a 15-second mobile video is typically < 10MB).
 */
export async function validateSelfieVideo(buffer: Buffer): Promise<void> {
  // Enforce a 20MB max file size (20 * 1024 * 1024)
  const MAX_FILE_SIZE = 20 * 1024 * 1024;

  if (buffer.length > MAX_FILE_SIZE) {
    logger.warn(`Video file too large: ${buffer.length} bytes`);
    throw new Error('Video file is too large. Must be under 20MB (approx 15 seconds).');
  }

  // Future enhancement: parse MP4/WebM headers to extract actual duration.
  // For now, size constraint serves as the proxy.
}
