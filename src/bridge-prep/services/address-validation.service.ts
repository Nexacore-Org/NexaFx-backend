import { Injectable, BadRequestException } from '@nestjs/common';
import { AddressFormatType } from '../entities/blockchain-network.entity';

@Injectable()
export class AddressValidationService {
  /**
   * Router evaluating layout structure without calling unrelated validation segments
   */
  public validate(address: string, format: AddressFormatType): { valid: boolean; format: string; error?: string } {
    switch (format) {
      case AddressFormatType.STELLAR:
        return this.validateStellar(address);
      case AddressFormatType.EVM:
        return this.validateEvm(address);
      case AddressFormatType.SOLANA:
        return this.validateSolana(address);
      default:
        return { valid: false, format: 'UNKNOWN', error: 'Unsupported serialization layout type' };
    }
  }

  private validateStellar(address: string) {
    // Stellar addresses: 56 characters, alphanumeric base32 starting explicitly with 'G'
    const stellarRegex = /^G[A-D2-7]{55}$/;
    if (!stellarRegex.test(address)) {
      return { valid: false, format: 'STELLAR', error: 'Invalid Stellar public address pattern' };
    }
    return { valid: true, format: 'STELLAR' };
  }

  private validateEvm(address: string) {
    // EVM: 42 characters starting with '0x'
    const evmRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!evmRegex.test(address)) {
      return { valid: false, format: 'EVM', error: 'Invalid hex configuration parameters for EVM target' };
    }
    return { valid: true, format: 'EVM' };
  }

  private validateSolana(address: string) {
    // Solana base58 lookup ranges: 32 to 44 characters
    const solRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!solRegex.test(address)) {
      return { valid: false, format: 'SOLANA', error: 'Invalid Base58 layout parameter for Solana target' };
    }
    return { valid: true, format: 'SOLANA' };
  }
}