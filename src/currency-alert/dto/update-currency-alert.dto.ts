import { PartialType } from '@nestjs/swagger';
import { CreateCurrencyAlertDto } from './create-currency-alert.dto';

export class UpdateCurrencyAlertDto extends PartialType(CreateCurrencyAlertDto) {}
