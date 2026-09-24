import { readFileSync } from 'fs';
import { join } from 'path';

describe('BridgePrepModule', () => {
  it('registers the controller and bridge-prep providers', () => {
    const moduleSource = readFileSync(
      join(__dirname, 'bridge-prep.module.ts'),
      'utf8',
    );

    expect(moduleSource).toContain('controllers: [BridgePrepController]');
    expect(moduleSource).toContain(
      'providers: [BridgePrepService, AddressValidationService]',
    );
    expect(moduleSource).toContain(
      'TypeOrmModule.forFeature([BlockchainNetwork, ExternalWalletAddress, BridgeTransaction])',
    );
  });
});