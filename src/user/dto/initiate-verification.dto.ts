import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitiateVerificationDto {
  @ApiProperty({ example: 'ID_DOCUMENT_URL' })
  @IsNotEmpty()
  @IsString()
  idDocumentUrl: string;

  @ApiProperty({ example: 'PROOF_OF_ADDRESS_URL' })
  @IsNotEmpty()
  @IsString()
  proofOfAddressUrl: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  additionalNotes?: string;
}


