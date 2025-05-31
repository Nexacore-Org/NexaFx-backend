import { PartialType } from '@nestjs/swagger';
import { CreateRatelockDto } from './create-ratelock.dto';

export class UpdateRatelockDto extends PartialType(CreateRatelockDto) {}
