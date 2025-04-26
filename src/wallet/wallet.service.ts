import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';

@Injectable()
export class WalletService {
    constructor(
        @InjectRepository(Wallet)
        private readonly walletRepository: Repository<Wallet>,
    ) {}

    async create(userId: string, createWalletDto: CreateWalletDto): Promise<Wallet> {
        // Check if user already has a wallet
        const existingWallet = await this.walletRepository.findOne({ where: { userId } });
        if (existingWallet) {
            throw new ConflictException('User already has a wallet');
        }

        const wallet = this.walletRepository.create({
            userId,
            ...createWalletDto,
        });

        return this.walletRepository.save(wallet);
    }

    async findAll(userId: string): Promise<Wallet[]> {
        return this.walletRepository.find({ where: { userId } });
    }

    async findOne(id: string, userId: string): Promise<Wallet> {
        const wallet = await this.walletRepository.findOne({ where: { id, userId } });
        if (!wallet) {
            throw new NotFoundException('Wallet not found');
        }
        return wallet;
    }

    async update(id: string, userId: string, updateWalletDto: UpdateWalletDto): Promise<Wallet> {
        const wallet = await this.findOne(id, userId);

        // If setting as primary, unset any other primary wallets
        if (updateWalletDto.isPrimary) {
            await this.walletRepository.update(
                { userId, isPrimary: true },
                { isPrimary: false }
            );
        }

        Object.assign(wallet, updateWalletDto);
        return this.walletRepository.save(wallet);
    }

    async remove(id: string, userId: string): Promise<void> {
        const wallet = await this.findOne(id, userId);
        await this.walletRepository.remove(wallet);
    }
} 