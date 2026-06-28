import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EvidenceSide } from '../entities/dispute-evidence.entity';

/**
 * Validated fields from the multipart form for evidence submission.
 * File attachment keys are populated by the DisputesService after
 * the file has been stored (not sent in this DTO directly).
 */
export class AddEvidenceDto {
  @ApiProperty({ enum: EvidenceSide, description: 'Which party is submitting' })
  @IsEnum(EvidenceSide)
  side: EvidenceSide;

  @ApiProperty({
    description: 'Text description of the evidence',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;
}
