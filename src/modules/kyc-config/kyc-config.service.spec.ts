import { Test, TestingModule } from '@nestjs/testing';
import { KycConfigService } from './kyc-config.service';
import { NotFoundException } from '@nestjs/common';

describe('KycConfigService', () => {
  let service: KycConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KycConfigService],
    }).compile();

    service = module.get<KycConfigService>(KycConfigService);
  });

  it('should return default US configuration', () => {
    const config = service.getConfig({ jurisdiction: 'US' });
    expect(config.length).toBeGreaterThan(0);
    expect(config[0].fieldName).toBe('ssn');
  });

  it('should throw NotFoundException for unknown jurisdiction', () => {
    expect(() => service.getConfig({ jurisdiction: 'UNKNOWN' })).toThrow(NotFoundException);
  });

  it('should allow adding new fields to a jurisdiction', () => {
    service.addField({
      jurisdiction: 'UK',
      fieldName: 'ni_number',
      fieldType: 'string',
      isRequired: true
    });
    
    const config = service.getConfig({ jurisdiction: 'UK' });
    expect(config.length).toBe(1);
    expect(config[0].fieldName).toBe('ni_number');
  });
});
