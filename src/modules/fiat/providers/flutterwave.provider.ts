import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import {
  FiatRampProvider,
  DepositInitiationResult,
  WithdrawalInitiationResult,
  BankAccountDetails,
} from './fiat-ramp-provider.interface';

@Injectable()
export class FlutterwaveProvider implements FiatRampProvider {
  private readonly logger = new Logger(FlutterwaveProvider.name);
  private readonly secretKey: string;
  private readonly publicKey: string;
  private readonly baseUrl = 'https://api.flutterwave.com/v3';

  constructor(private readonly configService: ConfigService) {
    this.secretKey = this.configService.get<string>('FLUTTERWAVE_SECRET_KEY') || '';
    this.publicKey = this.configService.get<string>('FLUTTERWAVE_PUBLIC_KEY') || '';
    
    if (!this.secretKey) {
      this.logger.warn('FLUTTERWAVE_SECRET_KEY not configured');
    }
  }

  async initiateDeposit(
    userId: string,
    amount: number,
    currency: string,
  ): Promise<DepositInitiationResult> {
    const reference = `FIAT_DEP_${uuidv4()}`;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    try {
      const response = await axios.post(
        `${this.baseUrl}/payments`,
        {
          tx_ref: reference,
          amount: amount,
          currency: currency,
          customer: {
            email: `user_${userId}@nexafx.local`,
          },
          payment_options: 'banktransfer',
          redirect_url: `${this.configService.get<string>('APP_URL')}/fiat/deposit/confirm`,
          meta: {
            userId,
            type: 'deposit',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.data.status !== 'success') {
        throw new Error(`Flutterwave deposit initiation failed: ${response.data.message}`);
      }

      return {
        reference,
        paymentLink: response.data.data.link,
        expiresAt,
      };
    } catch (error) {
      this.logger.error(`Deposit initiation error: ${error.message}`);
      throw error;
    }
  }

  async initiateWithdrawal(
    userId: string,
    amount: number,
    currency: string,
    bankAccount: BankAccountDetails,
  ): Promise<WithdrawalInitiationResult> {
    const reference = `FIAT_WD_${uuidv4()}`;
    const estimatedArrival = new Date();
    estimatedArrival.setHours(estimatedArrival.getHours() + 24);

    try {
      const response = await axios.post(
        `${this.baseUrl}/transfers`,
        {
          account_bank: bankAccount.bankCode,
          account_number: bankAccount.accountNumber,
          amount: amount,
          currency: currency,
          reference: reference,
          narration: `NexaFx withdrawal for user ${userId}`,
          meta: {
            userId,
            type: 'withdrawal',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.data.status !== 'success') {
        throw new Error(`Flutterwave withdrawal initiation failed: ${response.data.message}`);
      }

      return {
        reference,
        estimatedArrival,
      };
    } catch (error) {
      this.logger.error(`Withdrawal initiation error: ${error.message}`);
      throw error;
    }
  }

  async verifyBankAccount(
    bankCode: string,
    accountNumber: string,
  ): Promise<{ accountName: string }> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/accounts/resolve`,
        {
          params: {
            account_number: accountNumber,
            account_bank: bankCode,
          },
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      if (response.data.status !== 'success') {
        throw new Error(`Bank account verification failed: ${response.data.message}`);
      }

      return {
        accountName: response.data.data.account_name,
      };
    } catch (error) {
      this.logger.error(`Bank account verification error: ${error.message}`);
      throw error;
    }
  }

  verifyWebhookSignature(
    payload: any,
    signature: string,
    secret: string,
  ): boolean {
    if (!signature || !secret) {
      return false;
    }

    const crypto = require('crypto');
    const hash = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return hash === signature;
  }
}
