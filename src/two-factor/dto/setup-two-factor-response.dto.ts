import { ApiProperty } from '@nestjs/swagger';

export class SetupTwoFactorResponseDto {
  @ApiProperty({
    description: 'otpauth:// URI used by authenticator apps',
    example:
      'otpauth://totp/NexaFX:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=NexaFX',
  })
  otpauthUrl: string;

  @ApiProperty({
    description: 'Base64 QR code image data URL for authenticator apps',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  })
  qrCodeDataUrl: string;

  @ApiProperty({
    description: 'Manual key for users who cannot scan the QR code',
    example: 'JBSWY3DPEHPK3PXP',
  })
  manualEntryKey: string;
}
