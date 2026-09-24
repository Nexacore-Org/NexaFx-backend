import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AdminCreateMessageDto {
  @IsString()
  @IsNotEmpty()
  body: string;

  @IsBoolean()
  @IsOptional()
  isInternal?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  attachmentKeys?: string[];
}
