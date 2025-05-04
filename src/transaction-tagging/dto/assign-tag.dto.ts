import { IsUUID, IsArray } from 'class-validator';

export class AssignTagDto {
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds: string[];
}