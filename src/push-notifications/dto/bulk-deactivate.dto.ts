import { IsArray, IsUUID, IsNotEmpty, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeactivateDto {
  @ApiProperty({
    description: 'Array of broadcast IDs to deactivate',
    example: [
      '550e8400-e29b-41d4-a716-446655440000',
      '660e8400-e29b-41d4-a716-446655440000',
    ],
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  ids: string[];
}
