import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StrKey } from '@stellar/stellar-sdk';
import { ImportWalletDto } from './wallet.dto';

describe('ImportWalletDto', () => {
  const validPublicKey = StrKey.encodeEd25519PublicKey(Buffer.alloc(32));

  it('accepts a valid Stellar public key', async () => {
    const dto = plainToInstance(ImportWalletDto, { publicKey: validPublicKey });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    ['invalid checksum', `G${'A'.repeat(55)}`],
    ['non-base32 characters', `G${'0'.repeat(55)}`],
  ])('rejects a Stellar address with %s', async (_reason, publicKey) => {
    const dto = plainToInstance(ImportWalletDto, { publicKey });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('publicKey');
  });
});
