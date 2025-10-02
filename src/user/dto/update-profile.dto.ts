import { IsString, IsOptional, IsDateString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  @Length(2, 50)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @Length(2, 50)
  lastName?: string;

  @ApiPropertyOptional({ example: '1990-01-01' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: '123 Main St, Lagos, Nigeria' })
  @IsOptional()
  @IsString()
  @Length(10, 200)
  address?: string;

  @ApiPropertyOptional({ example: 'Software developer passionate about fintech' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  bio?: string;
}


