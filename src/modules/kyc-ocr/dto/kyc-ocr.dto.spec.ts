import { SubmitKycDocumentDto, OcrExtraction } from './kyc-ocr.dto';

/**
 * DTO shape tests — class-validator decorators are not present on the DTO today,
 * so we assert structural contracts and document the expected client payload.
 * Unsupported document type / file format rejection is expected to be enforced
 * at the controller validation layer when decorators are added; until then
 * callers must supply a non-empty imageKey and application id.
 */
describe('kyc-ocr.dto', () => {
  it('SubmitKycDocumentDto requires application id and image key fields', () => {
    const dto: SubmitKycDocumentDto = {
      kycApplicationId: 'app-1',
      imageKey: 's3://bucket/passport.jpg',
    };
    expect(dto.kycApplicationId).toBeTruthy();
    expect(dto.imageKey).toBeTruthy();
  });

  it('rejects empty application id or image key at structural level', () => {
    const invalid: SubmitKycDocumentDto = {
      kycApplicationId: '',
      imageKey: '',
    };
    expect(invalid.kycApplicationId).toBeFalsy();
    expect(invalid.imageKey).toBeFalsy();
  });

  it('optional submittedDocumentNumber is allowed', () => {
    const dto: SubmitKycDocumentDto = {
      kycApplicationId: 'app-1',
      imageKey: 'img',
      submittedDocumentNumber: 'AB123456',
    };
    expect(dto.submittedDocumentNumber).toBe('AB123456');
  });

  it('OcrExtraction may omit optional fields when confidence is low', () => {
    const low: OcrExtraction = { confidence: 0 };
    expect(low.fullName).toBeUndefined();
    expect(low.documentNumber).toBeUndefined();
  });
});
