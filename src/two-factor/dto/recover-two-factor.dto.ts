import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { BackupCodeDto } from './backup-code.dto';

export class RecoverTwoFactorDto extends BackupCodeDto {
  @ApiProperty({
    description:
      'PARTIAL_AUTH token returned during login when 2FA is required',
  })
  @IsString()
  twoFactorToken: string;
}
