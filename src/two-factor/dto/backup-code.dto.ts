import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class BackupCodeDto {
  @ApiProperty({
    example: 'ABCD2345EF',
    description: 'One-time backup code',
  })
  @IsString()
  @Length(8, 32)
  @Matches(/^[A-Z0-9]+$/, {
    message: 'Backup code must be alphanumeric (A-Z, 0-9)',
  })
  backupCode: string;
}
