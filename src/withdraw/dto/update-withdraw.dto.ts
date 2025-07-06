import { PartialType } from '@nestjs/swagger';
import { CreateWithdrawalDto } from './create-withdraw.dto';

export class UpdateWithdrawDto extends PartialType(CreateWithdrawalDto) {}
