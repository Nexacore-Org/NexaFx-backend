import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, Equals } from 'class-validator';

export class ConsentDto {
  @ApiProperty({
    example: true,
    description: 'GDPR consent acknowledgment',
  })
  @IsBoolean()
  @Equals(true, { message: 'You must consent to the privacy policy (GDPR)' })
  consentGdpr: boolean;
}
