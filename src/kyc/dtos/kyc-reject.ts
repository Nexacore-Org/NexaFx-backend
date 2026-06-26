import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectKycDto {
  @ApiProperty({
    description:
      'Reason for rejection. This will be sent to the user via email.',
    example: 'Document image is blurry. Please upload a clearer photo.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  reason: string;

  @ApiProperty({
    description:
      'If true, sets status to RESUBMISSION_REQUIRED instead of REJECTED. Defaults to false.',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  requireResubmission?: boolean;
}
