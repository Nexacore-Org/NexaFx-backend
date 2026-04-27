import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { DocumentType } from '../entities/kyc.entity';
import { ApiProperty } from '@nestjs/swagger';

/**
 * SubmitKycDto now contains only form fields. File uploads are handled
 * separately via multipart/form-data and saved to disk by Multer. The
 * controller will map uploaded files to the entity URL fields.
 */
export class SubmitKycDto {
  @ApiProperty({ description: 'Full legal name of the user' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  fullName: string;

  @ApiProperty({ enum: DocumentType, description: 'Type of ID document' })
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @ApiProperty({ description: 'ID document number' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'ID number must contain only alphanumeric characters',
  })
  documentNumber: string;

  @IsDateString()
  dateOfBirth: string;

  @IsString()
  nationality: string;
}
