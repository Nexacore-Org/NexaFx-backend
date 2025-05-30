import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ExternalWallet } from './entities/external-wallet.entity';
import { AddExternalWalletDto } from './dto/add-external-wallet.dto';
import { UpdateExternalWalletDto } from './dto/update-external-wallet.dto';
import { ExternalWalletResponseDto } from './dto/external-wallet-response.dto';
import { plainToClass } from 'class-transformer';
import { SignatureVerificationUtil } from './utils/signature-verification.utils';

@Injectable()
export class ExternalWalletsService {
  constructor(
    private readonly externalWalletRepository: Repository<ExternalWallet>,
  ) {}

  async addWallet(userId: string, addWalletDto: AddExternalWalletDto): Promise<ExternalWalletResponseDto> {
    const { address, network, walletType, signature, message, label } = addWalletDto;

    // Check if wallet is already linked to this user
    const existingWallet = await this.externalWalletRepository.findOne({
      where: { userId, address: address.toLowerCase() }
    });

    if (existingWallet) {
      throw new ConflictException('Wallet is already linked to your account');
    }

    // Check if wallet is linked to another user
    const walletLinkedToOther = await this.externalWalletRepository.findOne({
      where: { address: address.toLowerCase() }
    });

    if (walletLinkedToOther) {
      throw new ConflictException('Wallet is already linked to another account');
    }

    // Validate message format and timestamp
    if (!SignatureVerificationUtil.validateMessage(message, userId)) {
      throw new BadRequestException('Invalid verification message format or expired timestamp');
    }

    // Verify signature
    const isValidSignature = await SignatureVerificationUtil.verifySignature(
      address,
      message,
      signature
    );

    if (!isValidSignature) {
      throw new BadRequestException('Invalid signature - wallet ownership verification failed');
    }

    // Create and save the wallet
    const wallet = this.externalWalletRepository.create({
      address: address.toLowerCase(),
      network,
      walletType,
      label: label || `${walletType} wallet`,
      verificationSignature: signature,
      verificationMessage: message,
      userId,
      lastUsed: new Date(),
    });

    const savedWallet = await this.externalWalletRepository.save(wallet);
    
    return plainToClass(ExternalWalletResponseDto, savedWallet, {
      excludeExtraneousValues: true,
    });
  }

  async getWallets(userId: string): Promise<ExternalWalletResponseDto[]> {
    const wallets = await this.externalWalletRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return wallets.map(wallet => 
      plainToClass(ExternalWalletResponseDto, wallet, {
        excludeExtraneousValues: true,
      })
    );
  }

  async getWallet(userId: string, walletId: string): Promise<ExternalWalletResponseDto> {
    const wallet = await this.externalWalletRepository.findOne({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return plainToClass(ExternalWalletResponseDto, wallet, {
      excludeExtraneousValues: true,
    });
  }

  async updateWallet(
    userId: string,
    walletId: string,
    updateWalletDto: UpdateExternalWalletDto
  ): Promise<ExternalWalletResponseDto> {
    const wallet = await this.externalWalletRepository.findOne({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    Object.assign(wallet, updateWalletDto);
    const updatedWallet = await this.externalWalletRepository.save(wallet);

    return plainToClass(ExternalWalletResponseDto, updatedWallet, {
      excludeExtraneousValues: true,
    });
  }

  async removeWallet(userId: string, walletId: string): Promise<void> {
    const wallet = await this.externalWalletRepository.findOne({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    await this.externalWalletRepository.remove(wallet);
  }

  async updateLastUsed(userId: string, address: string): Promise<void> {
    await this.externalWalletRepository.update(
      { userId, address: address.toLowerCase() },
      { lastUsed: new Date() }
    );
  }

  async generateVerificationMessage(userId: string): Promise<{ message: string }> {
    const message = SignatureVerificationUtil.generateVerificationMessage(userId);
    return { message };
  }

  async validateWalletOwnership(userId: string, address: string): Promise<boolean> {
    const wallet = await this.externalWalletRepository.findOne({
      where: { userId, address: address.toLowerCase() },
    });

    return !!wallet && wallet.isActive;
  }
}