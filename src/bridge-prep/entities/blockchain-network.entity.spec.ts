import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { BlockchainNetwork } from './blockchain-network.entity';

describe('BlockchainNetwork entity', () => {
  it('maps the network registry to the expected table and fields', () => {
    const table = getMetadataArgsStorage().tables.find((entry) => entry.target === BlockchainNetwork);
    const columns = getMetadataArgsStorage().columns
      .filter((entry) => entry.target === BlockchainNetwork)
      .map((entry) => entry.propertyName);

    expect(table?.name).toBe('blockchain_networks');
    expect(columns).toEqual(expect.arrayContaining([
      'name', 'chainId', 'symbol', 'isSupported', 'explorerUrl',
      'avgConfirmationSeconds', 'addressFormat', 'isActive',
    ]));
  });
});