import { ApiProperty } from '@nestjs/swagger';

export class SetupTwoFactorResponseDto {
  @ApiProperty({
    description: 'Base64 QR code image data URL for authenticator apps',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  })
  qrCodeDataUrl: string;

  @ApiProperty({
    description: 'otpauth:// URI for authenticator apps',
    example: 'otpauth://totp/NexaFX:email@example.com?secret=...',
  })
  otpauthUrl: string;

  @ApiProperty({
    description: 'Base64-encoded PNG (no data URL prefix)',
    example: 'iVBORw0KGgoAAAANSUhEUgAA...',
  })
  qrCodePngBase64: string;

  @ApiProperty({
    description: 'Manual key for users who cannot scan the QR code',
    example: 'JBSWY3DPEHPK3PXP',
  })
  manualEntryKey: string;
}
