import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { BridgeTransaction } from './bridge-transaction.entity';

describe('BridgeTransaction entity', () => {
  it('maps source, destination, asset, amount, and status fields', () => {
    const table = getMetadataArgsStorage().tables.find((entry) => entry.target === BridgeTransaction);
    const columns = getMetadataArgsStorage().columns
      .filter((entry) => entry.target === BridgeTransaction)
      .map((entry) => entry.propertyName);

    expect(table?.name).toBe('bridge_transactions');
    expect(columns).toEqual(expect.arrayContaining([
      'userId', 'sourceNetworkId', 'destinationNetworkId', 'sourceAddress',
      'destinationAddress', 'assetCode', 'amount', 'status', 'feeAmount',
    ]));
  });
});