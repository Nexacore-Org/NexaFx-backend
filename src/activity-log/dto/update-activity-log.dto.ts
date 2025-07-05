import { PartialType } from '@nestjs/swagger';
import { CreateActivityLogDto } from './create-activity-log.dto';

export class UpdateActivityLogDto extends PartialType(CreateActivityLogDto) {}
