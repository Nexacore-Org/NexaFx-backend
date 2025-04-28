import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as stellarSdk from 'stellar-sdk';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private readonly server: stellarSdk.Horizon.Server;
  private readonly networkPassphrase: string;
  private readonly sourceSecretKey: string;
  private readonly sourceKeypair: stellarSdk.Keypair;
  private readonly sourcePublicKey: string;

  constructor(private configService: ConfigService) {
    // Initialize Stellar configuration
    const horizonUrl = this.configService.get<string>('STELLAR_HORIZON_URL') || 'https://horizon-testnet.stellar.org';
    const isTestnet = this.configService.get<string>('STELLAR_NETWORK') !== 'public';
    
    this.networkPassphrase = isTestnet 
      ? stellarSdk.Networks.TESTNET 
      : stellarSdk.Networks.PUBLIC;
    
    // Create the server instance correctly using the Horizon namespace
    this.server = new stellarSdk.Horizon.Server(horizonUrl);
    
    // Load source account (platform wallet) from environment
    const secretKey = this.configService.get<string>('STELLAR_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STELLAR_SECRET_KEY is not defined in environment variables');
    }
    this.sourceSecretKey = secretKey;
    
    this.sourceKeypair = stellarSdk.Keypair.fromSecret(this.sourceSecretKey);
    this.sourcePublicKey = this.sourceKeypair.publicKey();
    
    this.logger.log(`Stellar service initialized with network: ${isTestnet ? 'TESTNET' : 'PUBLIC'}`);
  }

  /**
   * Build and sign a Stellar transaction
   * @param params Transaction parameters
   * @returns Signed transaction XDR
   */
  async buildAndSignTransaction(params: StellarTransactionParams): Promise<string> {
    try {
      const {
        destinationAddress,
        amount,
        asset,
        memo = '',
        timeout = 180
      } = params;

      // Validate destination address
      if (!stellarSdk.StrKey.isValidEd25519PublicKey(destinationAddress)) {
        throw new Error('Invalid destination stellar address');
      }

      // Load source account to get the current sequence number
      const sourceAccount = await this.server.loadAccount(this.sourcePublicKey);
      this.logger.debug(`Loaded source account: ${this.sourcePublicKey}`);

      // Build the asset object
      let stellarAsset: stellarSdk.Asset;
      if (asset === 'XLM') {
        stellarAsset = stellarSdk.Asset.native();
      } else {
        const [code, issuer] = asset.split(':');
        if (!code || !issuer || !stellarSdk.StrKey.isValidEd25519PublicKey(issuer)) {
          throw new Error('Invalid asset format. Expected "CODE:ISSUER"');
        }
        stellarAsset = new stellarSdk.Asset(code, issuer);
      }

      // Create transaction builder
      const builder = new stellarSdk.TransactionBuilder(sourceAccount, {
        fee: stellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase,
        timebounds: {
          minTime: 0,
          maxTime: Math.floor(Date.now() / 1000) + timeout,
        },
      });

      // Add payment operation
      builder.addOperation(
        stellarSdk.Operation.payment({
          destination: destinationAddress,
          asset: stellarAsset,
          amount: amount.toString(),
        })
      );

      // Add memo if provided
      if (memo) {
        builder.addMemo(stellarSdk.Memo.text(memo));
      }

      // Build and sign the transaction
      const transaction = builder.build();
      transaction.sign(this.sourceKeypair);

      this.logger.debug('Transaction built and signed successfully');
      return transaction.toXDR();
    } catch (error) {
      this.logger.error(`Error building transaction: ${error.message}`, error.stack);
      throw new Error(`Failed to build Stellar transaction: ${error.message}`);
    }
  }

  /**
   * Submit a signed transaction to the Stellar network
   * @param signedTransactionXdr The signed transaction in XDR format
   * @returns Transaction result
   */
  async submitTransaction(signedTransactionXdr: string): Promise<StellarTransactionResult> {
    try {
      const transaction = stellarSdk.TransactionBuilder.fromXDR(
        signedTransactionXdr,
        this.networkPassphrase
      );
  
      this.logger.debug('Submitting transaction to Stellar network');
      const result = await this.server.submitTransaction(transaction);
      
      this.logger.log(`Transaction submitted successfully: ${result.hash}`);
      return {
        successful: true,
        transactionHash: result.hash,
        ledger: result.ledger,
        // Remove the reference to result.created_at since it doesn't exist
        createdAt: new Date().toISOString(),
        resultXdr: result.result_xdr,
      };
    } catch (error) {
      // Handle Stellar-specific errors
      let errorMessage = 'Unknown error';
      let errorCode = 'TRANSACTION_FAILED';
      
      if (error.response?.data?.extras?.result_codes) {
        const resultCodes = error.response.data.extras.result_codes;
        errorMessage = resultCodes.transaction || resultCodes.operations?.join(', ');
        errorCode = errorMessage;
      } else if (error.message) {
        errorMessage = error.message;
      }
  
      this.logger.error(`Transaction submission failed: ${errorMessage}`, error.stack);
      
      return {
        successful: false,
        errorCode,
        errorMessage,
        resultXdr: error.response?.data?.extras?.result_xdr || '',
      };
    }
  }
  /**
   * Send a complete Stellar transaction in one call
   * @param params Transaction parameters
   * @returns Transaction result
   */
  async sendTransaction(params: StellarTransactionParams): Promise<StellarTransactionResult> {
    try {
      const signedXdr = await this.buildAndSignTransaction(params);
      return this.submitTransaction(signedXdr);
    } catch (error) {
      this.logger.error(`Failed to send transaction: ${error.message}`, error.stack);
      return {
        successful: false,
        errorCode: 'TRANSACTION_CREATION_FAILED',
        errorMessage: error.message,
      };
    }
  }

  /**
   * Check if a Stellar account exists
   * @param address The Stellar account address to check
   * @returns Whether the account exists
   */
  async accountExists(address: string): Promise<boolean> {
    try {
      await this.server.loadAccount(address);
      return true;
    } catch (error) {
      if (error.response?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get account balance information
   * @param address The Stellar account address
   * @returns Account balances
   */
  async getAccountBalances(address: string): Promise<AssetBalance[]> {
    try {
      const account = await this.server.loadAccount(address);
      
      return account.balances.map(balance => {
        // Handle native XLM asset
        if (balance.asset_type === 'native') {
          return {
            asset: 'XLM',
            balance: balance.balance,
            // Native XLM doesn't have a limit
            limit: undefined,
          };
        }
        
        // Handle other assets
        if ('asset_code' in balance && 'asset_issuer' in balance) {
          return {
            asset: `${balance.asset_code}:${balance.asset_issuer}`,
            balance: balance.balance,
            limit: balance.limit,
          };
        }
        
        // Handle liquidity pool shares or other balance types
        return {
          asset: balance.asset_type,
          balance: balance.balance,
          limit: 'limit' in balance ? balance.limit : undefined,
        };
      });
    } catch (error) {
      this.logger.error(`Failed to get account balances: ${error.message}`, error.stack);
      throw new Error(`Unable to fetch account balances: ${error.message}`);
    }
  }
}

// DTOs and Types
export interface StellarTransactionParams {
  destinationAddress: string;
  amount: string | number;
  asset: string; // 'XLM' for native token or 'CODE:ISSUER' for other assets
  memo?: string;
  timeout?: number; // Transaction timeout in seconds
}

export interface StellarTransactionResult {
  successful: boolean;
  transactionHash?: string;
  ledger?: number;
  createdAt?: string;
  resultXdr?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface AssetBalance {
  asset: string;
  balance: string;
  limit?: string;
}