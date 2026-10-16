import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StrKey } from '@stellar/stellar-sdk';
import {
  BeneficiaryNetwork,
} from '../entities/beneficiary.entity';
import { CreateBeneficiaryDto } from './create-beneficiary.dto';

describe('CreateBeneficiaryDto', () => {
  const validPublicKey = StrKey.encodeEd25519PublicKey(Buffer.alloc(32));
  const validDto = {
    nickname: 'Savings',
    walletAddress: validPublicKey,
    currency: 'XLM',
  };

  it('accepts a valid Stellar public key by default', async () => {
    const dto = plainToInstance(CreateBeneficiaryDto, validDto);

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    ['invalid checksum', `G${'A'.repeat(55)}`],
    ['non-base32 characters', `G${'0'.repeat(55)}`],
  ])('rejects a Stellar address with %s', async (_reason, walletAddress) => {
    const dto = plainToInstance(CreateBeneficiaryDto, {
      ...validDto,
      walletAddress,
      network: BeneficiaryNetwork.STELLAR,
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain(
      'stellarWalletAddressForValidation',
    );
  });

  it('does not apply Stellar address validation to OTHER beneficiaries', async () => {
    const dto = plainToInstance(CreateBeneficiaryDto, {
      ...validDto,
      walletAddress: 'not-a-stellar-address',
      network: BeneficiaryNetwork.OTHER,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('still requires a wallet address for OTHER beneficiaries', async () => {
    const dto = plainToInstance(CreateBeneficiaryDto, {
      ...validDto,
      walletAddress: '',
      network: BeneficiaryNetwork.OTHER,
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('walletAddress');
  });
});
