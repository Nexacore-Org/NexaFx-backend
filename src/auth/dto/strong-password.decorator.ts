import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') {
            return false;
          }
          if (value.length < 12 || value.length > 128) {
            return false;
          }
          return Buffer.byteLength(value, 'utf8') <= 72;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be 12-128 characters and at most 72 UTF-8 bytes`;
        },
      },
    });
  };
}
