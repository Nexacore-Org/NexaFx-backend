import {
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { IdType } from '../entities/kyc.entity';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitKycDto {
  @ApiProperty({ description: 'Full legal name of the user' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  fullName: string;

  @ApiProperty({ enum: IdType, description: 'Type of ID document' })
  @IsEnum(IdType)
  idType: IdType;

  @ApiProperty({ description: 'ID document number' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'ID number must contain only alphanumeric characters',
  })
  idNumber: string;

  @ApiProperty({ description: 'Base64 encoded selfie image or image URL' })
  @IsString()
  @IsNotEmpty()
  selfieImage: string;
}
