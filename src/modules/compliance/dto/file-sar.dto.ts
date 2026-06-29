import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FileSarDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  narrative: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reportReference: string;
}
