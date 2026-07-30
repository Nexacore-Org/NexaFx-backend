import { Injectable, NotFoundException } from '@nestjs/common';
import { GetKycConfigDto, CreateKycFieldDto } from './dto/kyc-config.dto';

@Injectable()
export class KycConfigService {
  private configs = new Map<string, CreateKycFieldDto[]>();

  constructor() {
    // Seed default US configuration
    this.configs.set('US', [
      {
        jurisdiction: 'US',
        fieldName: 'ssn',
        fieldType: 'string',
        isRequired: true,
        validationRegex: '^\\d{3}-\\d{2}-\\d{4}$'
      }
    ]);
  }

  /**
   * Gets the KYC requirements for a specific jurisdiction.
   */
  public getConfig(dto: GetKycConfigDto): CreateKycFieldDto[] {
    const config = this.configs.get(dto.jurisdiction.toUpperCase());
    if (!config) {
      throw new NotFoundException(`No KYC config found for jurisdiction: ${dto.jurisdiction}`);
    }
    return config;
  }

  /**
   * Adds a new KYC field requirement for a jurisdiction.
   */
  public addField(dto: CreateKycFieldDto): CreateKycFieldDto {
    const key = dto.jurisdiction.toUpperCase();
    const existing = this.configs.get(key) || [];
    
    // Check if field already exists
    if (existing.some(f => f.fieldName === dto.fieldName)) {
      throw new Error(`Field ${dto.fieldName} already exists in ${key}`);
    }
    
    existing.push(dto);
    this.configs.set(key, existing);
    
    return dto;
  }
}
