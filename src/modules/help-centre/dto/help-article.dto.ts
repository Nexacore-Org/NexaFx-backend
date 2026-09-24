import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHelpArticleDto {
  @ApiProperty({ description: 'Article title.', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Article body, in Markdown.' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiProperty({ description: 'Category, e.g. `payments` or `security`.', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category: string;

  @ApiPropertyOptional({
    description: 'Search tags. Defaults to an empty list.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description:
      'Optional URL slug. When omitted, one is derived from the title and ' +
      'made unique against existing articles.',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  slug?: string;

  @ApiPropertyOptional({
    description:
      'Publish immediately. Defaults to `false`, so articles are created ' +
      'as drafts and must be published explicitly.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateHelpArticleDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Article body, in Markdown.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  body?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({
    description: 'Full replacement tags list (may be empty).',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Set `false` to unpublish (hide from the public lists).',
  })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}