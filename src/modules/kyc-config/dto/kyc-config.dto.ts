export class GetKycConfigDto {
  jurisdiction: string;
}

export class CreateKycFieldDto {
  jurisdiction: string;
  fieldName: string;
  fieldType: 'string' | 'number' | 'date' | 'file';
  isRequired: boolean;
  validationRegex?: string;
}
