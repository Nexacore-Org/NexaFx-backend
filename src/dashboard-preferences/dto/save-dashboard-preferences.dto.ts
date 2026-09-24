import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WidgetPlacementDto {
  @ApiProperty({
    description: 'Stable widget identifier, e.g. `balance-summary`.',
    example: 'balance-summary',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description:
      'Zero-based column/grid position. The layout is sorted by this value.',
    example: 0,
  })
  @IsInt()
  @Min(0)
  position: number;

  @ApiProperty({
    description: 'Whether the widget is shown on the dashboard.',
    example: true,
  })
  @IsBoolean()
  visible: boolean;

  @ApiPropertyOptional({
    description: 'Per-widget configuration, e.g. chart period or target asset.',
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class SaveDashboardPreferencesDto {
  @ApiProperty({
    description:
      'Full dashboard layout. Replaces the stored layout; pass every widget ' +
      'you want to keep, not just the changed one.',
    type: [WidgetPlacementDto],
    example: [
      { id: 'balance-summary', position: 0, visible: true },
      { id: 'notifications', position: 1, visible: false },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WidgetPlacementDto)
  layout: WidgetPlacementDto[];
}