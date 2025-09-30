import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { isSupportedCurrency } from '../constants/supported-currencies';

@ValidatorConstraint({ async: false })
export class IsSupportedCurrencyConstraint implements ValidatorConstraintInterface {
  validate(currency: string, args: ValidationArguments) {
    return isSupportedCurrency(currency);
  }

  defaultMessage(args: ValidationArguments) {
    return 'Only NGN and USD currencies are supported';
  }
}

export function IsSupportedCurrency(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSupportedCurrencyConstraint,
    });
  };
}
