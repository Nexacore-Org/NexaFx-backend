import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { ExternalWalletAddress } from './external-wallet-address.entity';

describe('ExternalWalletAddress entity', () => {
  it('maps wallet ownership and address fields', () => {
    const table = getMetadataArgsStorage().tables.find((entry) => entry.target === ExternalWalletAddress);
    const columns = getMetadataArgsStorage().columns
      .filter((entry) => entry.target === ExternalWalletAddress)
      .map((entry) => entry.propertyName);

    expect(table?.name).toBe('external_wallet_addresses');
    expect(columns).toEqual(expect.arrayContaining([
      'userId', 'networkId', 'address', 'label', 'isVerified', 'verificationMethod',
    ]));
  });
});