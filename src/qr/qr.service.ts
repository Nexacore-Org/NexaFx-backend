import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { isUUID } from 'class-validator';
import { User } from '../users/user.entity';
import { SUPPORTED_QR_CURRENCIES } from './dto/qr.dto';

export interface QrCodeData {
  merchantId: string;
  amount?: number;
  currency?: string;
  reference?: string;
  ttlSeconds?: number;
}

export interface SignedQrPayload {
  type: 'STATIC' | 'DYNAMIC';
  merchantId: string;
  amount?: number;
  currency?: string;
  reference?: string;
  issuedAt: number;
  expiresAt: number;
  signature: string;
}

const DEFAULT_STATIC_TTL_SECONDS = 86400; // 24 hours
const DEFAULT_DYNAMIC_TTL_SECONDS = 900; // 15 minutes

@Injectable()
export class QrService {
  private readonly generatedQrPayloads = new Map<string, string>();
  private lastSignedPayload: string | null = null;

  constructor(
    @Optional()
    private readonly configService?: ConfigService,
    @Optional()
    @InjectRepository(User)
    private readonly userRepo?: Repository<User>,
  ) {}

  getLastSignedPayload(): string | null {
    return this.lastSignedPayload;
  }

  /**
   * Builds and HMAC-signs a QR payload JSON string.
   */
  createSignedPayload(params: {
    type: 'STATIC' | 'DYNAMIC';
    merchantId: string;
    amount?: number;
    currency?: string;
    reference?: string;
    issuedAt?: number;
    expiresAt?: number;
    ttlSeconds?: number;
  }): string {
    const issuedAt = params.issuedAt ?? Date.now();
    const defaultTtl =
      params.type === 'STATIC'
        ? DEFAULT_STATIC_TTL_SECONDS
        : DEFAULT_DYNAMIC_TTL_SECONDS;
    const ttlMs = (params.ttlSeconds ?? defaultTtl) * 1000;
    const expiresAt = params.expiresAt ?? issuedAt + ttlMs;
    const currency = (params.currency || 'USD').trim().toUpperCase();

    const unsigned = {
      type: params.type,
      merchantId: params.merchantId,
      ...(params.type === 'DYNAMIC'
        ? {
            amount: params.amount,
            currency,
            reference: params.reference,
          }
        : {}),
      issuedAt,
      expiresAt,
    };

    const signature = this.signPayloadData(unsigned);
    const signed: SignedQrPayload = {
      ...unsigned,
      signature,
    };
    return JSON.stringify(signed);
  }

  signPayloadData(data: {
    type: 'STATIC' | 'DYNAMIC';
    merchantId: string;
    amount?: number;
    currency?: string;
    reference?: string;
    issuedAt: number;
    expiresAt: number;
  }): string {
    const canonical = [
      data.type,
      data.merchantId,
      data.amount !== undefined ? String(data.amount) : '',
      (data.currency ?? 'USD').trim().toUpperCase(),
      data.reference ?? '',
      String(data.issuedAt),
      String(data.expiresAt),
    ].join('|');

    return crypto
      .createHmac('sha256', this.getHmacSecret())
      .update(canonical)
      .digest('hex');
  }

  /**
   * Generates a static QR code for a merchant.
   * Useful for counter top standees where the user enters the amount.
   */
  async generateStaticQr(merchantId: string): Promise<string> {
    if (!merchantId || !merchantId.trim()) {
      throw new BadRequestException('Merchant ID is required');
    }

    const trimmedMerchantId = merchantId.trim();
    await this.ensureMerchantExists(trimmedMerchantId);

    const payload = this.createSignedPayload({
      type: 'STATIC',
      merchantId: trimmedMerchantId,
    });
    this.lastSignedPayload = payload;
    return this.generateQrCodeImage(payload);
  }

  /**
   * Generates a dynamic QR code for a specific checkout session.
   * Contains the amount and reference to link the payment.
   */
  async generateDynamicQr(data: QrCodeData): Promise<string> {
    if (
      !data ||
      !data.merchantId ||
      !data.merchantId.trim() ||
      data.amount === undefined ||
      data.amount === null ||
      !data.reference ||
      !data.reference.trim()
    ) {
      throw new BadRequestException(
        'Merchant ID, Amount, and Reference are required for dynamic QR',
      );
    }

    const numericAmount = Number(data.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }

    const currency = (data.currency || 'USD').trim().toUpperCase();
    if (
      !SUPPORTED_QR_CURRENCIES.includes(
        currency as (typeof SUPPORTED_QR_CURRENCIES)[number],
      )
    ) {
      throw new BadRequestException(`Unsupported currency: ${currency}`);
    }

    const trimmedMerchantId = data.merchantId.trim();
    await this.ensureMerchantExists(trimmedMerchantId);

    const payload = this.createSignedPayload({
      type: 'DYNAMIC',
      merchantId: trimmedMerchantId,
      amount: numericAmount,
      currency,
      reference: data.reference.trim(),
      ttlSeconds: data.ttlSeconds,
    });
    this.lastSignedPayload = payload;
    return this.generateQrCodeImage(payload);
  }

  /**
   * Helper method to generate base64 image of the QR code.
   * Surfaces a 503 ServiceUnavailableException if QR generation fails instead of returning a mock string.
   */
  private async generateQrCodeImage(text: string): Promise<string> {
    try {
      const dataUrl = await QRCode.toDataURL(text);
      if (!dataUrl || typeof dataUrl !== 'string') {
        throw new Error('Empty QR data URL');
      }
      this.generatedQrPayloads.set(dataUrl, text);
      return dataUrl;
    } catch {
      throw new ServiceUnavailableException('Failed to generate QR code image');
    }
  }

  /**
   * Processes a scanned QR code payload, verifying its HMAC signature and expiry.
   */
  async processScan(payload: string): Promise<any> {
    if (!payload || typeof payload !== 'string') {
      throw new BadRequestException('Invalid QR code data format');
    }

    let rawJson = payload;
    if (payload.startsWith('data:image/png;base64,')) {
      const mapped = this.generatedQrPayloads.get(payload);
      if (!mapped) {
        throw new BadRequestException('Invalid QR code data format');
      }
      rawJson = mapped;
    }

    let data: SignedQrPayload;
    try {
      data = JSON.parse(rawJson);
    } catch {
      throw new BadRequestException('Invalid QR code data format');
    }

    if (
      !data ||
      typeof data !== 'object' ||
      (data.type !== 'STATIC' && data.type !== 'DYNAMIC')
    ) {
      throw new BadRequestException('Invalid QR code data format');
    }

    if (!data.merchantId || typeof data.merchantId !== 'string') {
      throw new BadRequestException('Invalid QR code merchant ID');
    }

    if (
      typeof data.issuedAt !== 'number' ||
      !Number.isFinite(data.issuedAt) ||
      typeof data.expiresAt !== 'number' ||
      !Number.isFinite(data.expiresAt) ||
      typeof data.signature !== 'string' ||
      !data.signature
    ) {
      throw new BadRequestException('Unsigned or invalid QR payload');
    }

    const expectedSignature = this.signPayloadData({
      type: data.type,
      merchantId: data.merchantId,
      amount: data.amount,
      currency: data.currency,
      reference: data.reference,
      issuedAt: data.issuedAt,
      expiresAt: data.expiresAt,
    });

    const sigBuffer = Buffer.from(data.signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new BadRequestException('Invalid QR payload signature');
    }

    if (Date.now() > data.expiresAt || data.expiresAt <= data.issuedAt) {
      throw new BadRequestException('QR code has expired');
    }

    await this.ensureMerchantExists(data.merchantId);

    if (data.type === 'STATIC') {
      return {
        status: 'pending',
        merchantId: data.merchantId,
        requiresAmount: true,
      };
    }

    const numericAmount = Number(data.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new BadRequestException('Invalid QR payment amount');
    }

    const currency = (data.currency || 'USD').trim().toUpperCase();
    if (
      !SUPPORTED_QR_CURRENCIES.includes(
        currency as (typeof SUPPORTED_QR_CURRENCIES)[number],
      )
    ) {
      throw new BadRequestException(`Unsupported currency: ${currency}`);
    }

    if (!data.reference || typeof data.reference !== 'string') {
      throw new BadRequestException('Invalid QR payment reference');
    }

    return {
      status: 'ready',
      merchantId: data.merchantId,
      amount: numericAmount,
      currency,
      reference: data.reference,
      requiresAmount: false,
    };
  }

  private getHmacSecret(): string {
    return (
      this.configService?.get<string>('QR_HMAC_SECRET') ||
      this.configService?.get<string>('JWT_SECRET') ||
      process.env.QR_HMAC_SECRET ||
      process.env.JWT_SECRET ||
      'nexafx-qr-hmac-default-secret'
    );
  }

  private async ensureMerchantExists(merchantId: string): Promise<void> {
    if (!this.userRepo) {
      return;
    }
    if (!isUUID(merchantId)) {
      throw new BadRequestException('Merchant not found');
    }
    const merchant = await this.userRepo.findOne({
      where: { id: merchantId },
    });
    if (!merchant || merchant.isDeleted || merchant.isSuspended) {
      throw new BadRequestException('Merchant not found');
    }
  }
}
