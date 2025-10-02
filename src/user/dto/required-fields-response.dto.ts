import { ApiProperty } from '@nestjs/swagger';

export class RequiredFieldsResponseDto {
  @ApiProperty({ type: [String] })
  requiredFields: string[];

  @ApiProperty({ type: [String] })
  missingFields: string[];

  @ApiProperty()
  completionPercentage: number;

  @ApiProperty()
  canInitiateVerification: boolean;
}


