import { PartialType } from '@nestjs/swagger';
import { CreateBlacklistDto } from './create-blacklist.dto';

export class UpdateBlacklistDto extends PartialType(CreateBlacklistDto) {}
