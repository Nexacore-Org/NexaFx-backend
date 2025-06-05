// import {
//   Controller,
//   Post,
//   Body,
//   Logger,
//   UnauthorizedException,
//   ConflictException,
//   HttpCode,
//   Headers,
// } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { Transaction } from '../../transactions/entities/transaction.entity';
// import { TransactionStatus } from '../../transactions/enums/transaction-status.enum';

// @Controller('blockchain/webhook')
// export class WebhookController {
//   private readonly logger = new Logger(WebhookController.name);
//   private webhookSecret: string;

//   constructor(
//     private configService: ConfigService,
//     @InjectRepository(Transaction)
//     private readonly transactionRepository: Repository<Transaction>,
//   ) {
//     const secret = this.configService.get<string>('WEBHOOK_SECRET_KEY');
//     if (!secret) {
//       throw new Error(
//         'WEBHOOK_SECRET_KEY is not defined in environment variables',
//       );
//     }
//     this.webhookSecret = secret;
//   }

//   @Post('payment')
//   @HttpCode(200)
//   async handlePaymentWebhook(
//     @Body() payload: any,
//     @Headers('x-webhook-auth') authHeader: string,
//   ) {
//     if (this.webhookSecret && authHeader !== this.webhookSecret) {
//       this.logger.warn('Unauthorized webhook attempt');
//       throw new UnauthorizedException('Invalid webhook authentication');
//     }

//     try {
//       if (!payload || !payload.transaction_hash) {
//         return { success: false, message: 'Invalid payload' };
//       }

//       const transactionHash = payload.transaction_hash;

//       const existingTransaction = await this.transactionRepository.findOne({
//         where: { txHash: transactionHash, status: TransactionStatus.COMPLETED },
//       });

//       if (existingTransaction) {
//         throw new ConflictException(
//           `Transaction ${transactionHash} already completed`,
//         );
//       }

//       const transaction = await this.transactionRepository.findOne({
//         where: { txHash: transactionHash, status: TransactionStatus.PENDING },
//       });

//       if (!transaction) {
//         this.logger.warn(`Transaction with hash ${transactionHash} not found`);
//         return { success: false, message: 'Transaction not found' };
//       }

//       transaction.status = TransactionStatus.COMPLETED;
//       transaction.updatedAt = new Date();

//       if (payload.ledger) {
//         transaction.metadata = {
//           ...transaction.metadata,
//           ledger: payload.ledger,
//           confirmed_at: new Date().toISOString(),
//         };
//       }

//       await this.transactionRepository.save(transaction);

//       this.logger.log(`Transaction ${transactionHash} completed successfully`);
//       return { success: true, message: 'Transaction completed' };
//     } catch (error: any) {
//       if (error instanceof ConflictException) {
//         return { success: false, message: error.message };
//       }

//       this.logger.error(
//         `Error processing payment webhook: ${error?.message || 'Unknown error'}`,
//         error?.stack || 'No stack trace available',
//       );
//       return { success: false, message: 'Error processing webhook' };
//     }
//   }
// }
import {
  Controller,
  Post,
  Body,
  Logger,
  UnauthorizedException,
  ConflictException,
  HttpCode,
  Headers,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { TransactionStatus } from '../../transactions/enums/transaction-status.enum';

@Controller('blockchain/webhook')
export class WebhookController implements OnModuleInit {
  private readonly logger = new Logger(WebhookController.name);
  private webhookSecret: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  onModuleInit() {
    const secret = this.configService.get<string>('WEBHOOK_SECRET_KEY');
    if (!secret) {
      throw new Error(
        'WEBHOOK_SECRET_KEY is not defined in environment variables',
      );
    }
    this.webhookSecret = secret;
  }

  @Post('payment')
  @HttpCode(200)
  async handlePaymentWebhook(
    @Body() payload: any,
    @Headers('x-webhook-auth') authHeader: string,
  ) {
    if (this.webhookSecret && authHeader !== this.webhookSecret) {
      this.logger.warn('Unauthorized webhook attempt');
      throw new UnauthorizedException('Invalid webhook authentication');
    }

    try {
      if (!payload || !payload.transaction_hash) {
        return { success: false, message: 'Invalid payload' };
      }

      const transactionHash = payload.transaction_hash;

      const existingTransaction = await this.transactionRepository.findOne({
        where: { txHash: transactionHash, status: TransactionStatus.COMPLETED },
      });

      if (existingTransaction) {
        throw new ConflictException(
          `Transaction ${transactionHash} already completed`,
        );
      }

      const transaction = await this.transactionRepository.findOne({
        where: { txHash: transactionHash, status: TransactionStatus.PENDING },
      });

      if (!transaction) {
        this.logger.warn(`Transaction with hash ${transactionHash} not found`);
        return { success: false, message: 'Transaction not found' };
      }

      transaction.status = TransactionStatus.COMPLETED;
      transaction.updatedAt = new Date();

      if (payload.ledger) {
        transaction.metadata = {
          ...transaction.metadata,
          ledger: payload.ledger,
          confirmed_at: new Date().toISOString(),
        };
      }

      await this.transactionRepository.save(transaction);

      this.logger.log(`Transaction ${transactionHash} completed successfully`);
      return { success: true, message: 'Transaction completed' };
    } catch (error: any) {
      if (error instanceof ConflictException) {
        return { success: false, message: error.message };
      }

      this.logger.error(
        `Error processing payment webhook: ${error?.message || 'Unknown error'}`,
        error?.stack || 'No stack trace available',
      );
      return { success: false, message: 'Error processing webhook' };
    }
  }
}
