import { AddressFormatType } from '../entities/blockchain-network.entity';
import { AddressValidationService } from './address-validation.service';

describe('AddressValidationService', () => {
  let service: AddressValidationService;

  beforeEach(() => {
    service = new AddressValidationService();
  });

  it.each([
    [AddressFormatType.STELLAR, `G${'A'.repeat(55)}`],
    [AddressFormatType.EVM, `0x${'a'.repeat(40)}`],
    [AddressFormatType.SOLANA, '123456789ABCDEFGHJKLMNPQRSTUVWXYZ'],
  ])('accepts a valid %s address', (format, address) => {
    expect(service.validate(address, format)).toEqual({
      valid: true,
      format,
    });
  });

  it.each([
    [AddressFormatType.STELLAR, `G${'Z'.repeat(55)}`, 'Invalid Stellar'],
    [AddressFormatType.EVM, '0xnot-a-hex-address', 'Invalid hex'],
    [AddressFormatType.SOLANA, '0'.repeat(32), 'Invalid Base58'],
  ])('rejects a malformed %s address', (format, address, error) => {
    const result = service.validate(address, format);

    expect(result.valid).toBe(false);
    expect(result.format).toBe(format);
    expect(result.error).toContain(error);
  });

  it('rejects an unsupported address format', () => {
    expect(service.validate('address', AddressFormatType.BASE58)).toEqual({
      valid: false,
      format: 'UNKNOWN',
      error: 'Unsupported serialization layout type',
    });
  });
});