import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsString,
  IsArray,
  ArrayNotEmpty,
} from 'class-validator';
import { ReportEntityTarget } from '../entities/custom-report-definition.entity';

export class CreateReportDefinitionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(ReportEntityTarget)
  entity: ReportEntityTarget;

  @IsObject()
  filters: Record<string, any>;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  columns: string[];
}
