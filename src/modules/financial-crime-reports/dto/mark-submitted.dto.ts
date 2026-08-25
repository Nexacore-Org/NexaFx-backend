import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MarkSubmittedDto {
  @ApiProperty({
    description:
      'Reference the regulator returned on receipt of the submission.',
    example: 'NFIU-STR-2026-004182',
  })
  @IsString()
  @Length(1, 255)
  submissionReference: string;
}
