import { Logger, UnprocessableEntityException } from '@nestjs/common';

const logger = new Logger('VideoDurationScanner');

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_DURATION_SECONDS = Number(process.env.VIDEO_MAX_DURATION_SECONDS ?? 30);

/**
 * Reads the duration from an MP4/MOV `mvhd` box.
 *
 * Returns null when the box is absent, which is the case for WebM and for
 * files that are not MP4 at all - the caller then falls back to the size
 * limit rather than rejecting a file it cannot measure.
 */
export function readMp4DurationSeconds(buffer: Buffer): number | null {
  // mvhd sits inside moov; scan for its type marker rather than walking the
  // full box tree, which is not worth the code for a validation check.
  const marker = Buffer.from('mvhd');
  const index = buffer.indexOf(marker);

  if (index < 0 || index + 20 > buffer.length) {
    return null;
  }

  const boxStart = index + marker.length;
  const version = buffer.readUInt8(boxStart);

  // version(1) flags(3) then creation/modification times and the timescale.
  const timescaleOffset = version === 1 ? boxStart + 20 : boxStart + 12;
  if (timescaleOffset + 8 > buffer.length) {
    return null;
  }

  const timescale = buffer.readUInt32BE(timescaleOffset);
  if (timescale === 0) {
    return null;
  }

  // version 0 uses 32-bit duration, version 1 uses 64-bit.
  const duration = version === 1
    ? Number(buffer.readBigUInt64BE(timescaleOffset + 4))
    : buffer.readUInt32BE(timescaleOffset + 4);

  return duration / timescale;
}

/**
 * Validates a selfie video: size, container duration, and a clear 422 rather
 * than a bare Error (which surfaced as a 500).
 */
export async function validateSelfieVideo(buffer: Buffer): Promise<void> {
  if (buffer.length > MAX_FILE_SIZE) {
    logger.warn(`Video file too large: ${buffer.length} bytes`);
    throw new UnprocessableEntityException(
      'Video file is too large. Must be under 50MB.',
    );
  }

  const duration = readMp4DurationSeconds(buffer);

  if (duration !== null && duration > MAX_DURATION_SECONDS) {
    logger.warn(
      `Video is ${duration.toFixed(1)}s, over the ${MAX_DURATION_SECONDS}s limit`,
    );
    throw new UnprocessableEntityException(
      `Video is too long. Must be under ${MAX_DURATION_SECONDS} seconds.`,
    );
  }
}
