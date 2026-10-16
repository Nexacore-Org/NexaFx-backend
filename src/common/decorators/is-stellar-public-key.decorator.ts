import { StrKey } from '@stellar/stellar-sdk';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export function isStellarPublicKey(value: unknown): value is string {
  return (
    typeof value === 'string' && StrKey.isValidEd25519PublicKey(value)
  );
}

@ValidatorConstraint({ name: 'isStellarPublicKey', async: false })
class IsStellarPublicKeyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isStellarPublicKey(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid Stellar public key`;
  }
}

export function IsStellarPublicKey(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isStellarPublicKey',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: IsStellarPublicKeyConstraint,
    });
  };
}
