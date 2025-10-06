import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import contractConfig from '../config/contract.config';
import {
  ContractTransaction,
  TransactionStatus,
  TransactionType,
} from '../entities/contract-transaction.entity';
import { DeployContractDto } from '../dto/deploy-contract.dto';
import { ExecuteContractDto } from '../dto/execute-contract.dto';

@Injectable()
export class ContractService {
  private readonly logger = new Logger(ContractService.name);
  private server: StellarSdk.Horizon.Server;
  private sorobanServer: any;
  private networkPassphrase: string;

  constructor(
    @Inject(contractConfig.KEY)
    private config: ConfigType<typeof contractConfig>,
    @InjectRepository(ContractTransaction)
    private contractTxRepo: Repository<ContractTransaction>,
  ) {
    this.initializeNetwork();
  }

  private initializeNetwork() {
    try {
      if (!this.config.horizonUrl) {
        throw new Error('Horizon URL is not configured');
      }
      if (!this.config.networkPassphrase) {
        throw new Error('Network passphrase is not configured');
      }

      this.server = new StellarSdk.Horizon.Server(this.config.horizonUrl);
      this.networkPassphrase = this.config.networkPassphrase;

      // Initialize Soroban RPC if needed
      // this.sorobanServer = new SorobanClient.Server(this.config.sorobanRpcUrl);

      this.logger.log(`Initialized Stellar network: ${this.config.network}`);
    } catch (error) {
      this.logger.error('Failed to initialize Stellar network', error);
      throw error;
    }
  }

  async getContractInfo() {
    return {
      contractId: this.config.contractId || 'Not configured',
      network: this.config.network,
      status: 'active',
      horizonUrl: this.config.horizonUrl,
      sorobanRpcUrl: this.config.sorobanRpcUrl,
    };
  }

  async deployContract(deployDto: DeployContractDto, sourceSecret: string) {
    try {
      this.logger.log('Deploying smart contract...');

      const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecret);
      const sourceAccount = await this.server.loadAccount(
        sourceKeypair.publicKey(),
      );

      // Note: Actual Soroban contract deployment requires soroban-client
      // This is a placeholder for the deployment logic

      const transaction = await this.contractTxRepo.save({
        txHash: 'deployment_' + Date.now(),
        type: TransactionType.DEPLOY,
        status: TransactionStatus.PROCESSING,
        fromAddress: sourceKeypair.publicKey(),
        metadata: { wasmHash: deployDto.wasmHash },
      });

      return {
        success: true,
        transactionId: transaction.id,
        message: 'Contract deployment initiated',
      };
    } catch (error) {
      this.logger.error('Contract deployment failed', error);
      throw error;
    }
  }

  async executeContractFunction(executeDto: ExecuteContractDto) {
    try {
      this.logger.log(
        `Executing contract function: ${executeDto.functionName}`,
      );

      const sourceKeypair = StellarSdk.Keypair.fromSecret(
        executeDto.sourceSecret,
      );
      const sourceAccount = await this.server.loadAccount(
        sourceKeypair.publicKey(),
      );

      // Create transaction record
      const transaction = await this.contractTxRepo.save({
        txHash: 'exec_' + Date.now(),
        type: TransactionType.CONTRACT_CALL,
        status: TransactionStatus.PROCESSING,
        fromAddress: sourceKeypair.publicKey(),
        memo: executeDto.memo,
        metadata: {
          functionName: executeDto.functionName,
          params: executeDto.params,
        },
      });

      // Note: Actual contract execution requires soroban-client
      // This is placeholder logic

      return {
        success: true,
        transactionId: transaction.id,
        txHash: transaction.txHash,
      };
    } catch (error) {
      this.logger.error('Contract execution failed', error);
      throw error;
    }
  }

  async getTransactionStatus(txId: string) {
    const transaction = await this.contractTxRepo.findOne({
      where: { id: txId },
    });

    if (!transaction) {
      return null;
    }

    return {
      id: transaction.id,
      txHash: transaction.txHash,
      status: transaction.status,
      type: transaction.type,
      createdAt: transaction.createdAt,
      confirmedAt: transaction.confirmedAt,
      errorMessage: transaction.errorMessage,
    };
  }

  async getTransactionByHash(txHash: string) {
    try {
      // First check our database
      const localTx = await this.contractTxRepo.findOne({
        where: { txHash },
      });

      // Then check Stellar network
      const stellarTx = await this.server
        .transactions()
        .transaction(txHash)
        .call();

      return {
        local: localTx,
        stellar: stellarTx,
      };
    } catch (error) {
      this.logger.error(`Failed to get transaction ${txHash}`, error);
      return null;
    }
  }

  async retryFailedTransaction(txId: string) {
    const transaction = await this.contractTxRepo.findOne({
      where: { id: txId },
    });

    if (!transaction || transaction.status !== TransactionStatus.FAILED) {
      throw new Error('Transaction not found or not in failed state');
    }

    if (transaction.retryCount >= 3) {
      throw new Error('Maximum retry attempts reached');
    }

    transaction.status = TransactionStatus.PENDING;
    transaction.retryCount += 1;
    transaction.errorMessage = undefined; // Use undefined instead of null

    await this.contractTxRepo.save(transaction);

    return {
      success: true,
      message: 'Transaction queued for retry',
      transactionId: transaction.id,
    };
  }
}
