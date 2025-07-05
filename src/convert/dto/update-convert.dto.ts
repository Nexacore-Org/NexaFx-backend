import { PartialType } from '@nestjs/swagger';
import { CreateConvertDto } from './create-convert.dto';

export class UpdateConvertDto extends PartialType(CreateConvertDto) {}
