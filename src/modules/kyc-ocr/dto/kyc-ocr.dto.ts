export interface OcrExtraction {
  fullName?: string;
  documentNumber?: string;
  dateOfBirth?: string;
  expiryDate?: string;
  nationality?: string;
  confidence: number;
}

export interface OcrProvider {
  extract(imageKey: string): Promise<OcrExtraction>;
}

export class SubmitKycDocumentDto {
  kycApplicationId: string;
  imageKey: string;
  submittedDocumentNumber?: string;
}
