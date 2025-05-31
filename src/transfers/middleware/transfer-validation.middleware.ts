import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { BlacklistService } from 'src/blacklist/blacklist.service';
import { WalletService } from 'src/wallet/wallet.service';
import { RateLockService } from 'src/ratelock/ratelock.service'; 

@Injectable()
export class TransferValidationMiddleware implements NestMiddleware {
  constructor(
    private readonly blacklistService: BlacklistService,
    private readonly walletService: WalletService,
    private readonly rateLockService: RateLockService
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const { senderWallet, recipientWallet, amount, rateLockId } = req.body;

    const isBlacklisted = await this.blacklistService.isBlacklisted(recipientWallet);
    const isFrozen = await this.walletService.isFrozen(recipientWallet);
    if (isBlacklisted || isFrozen) {
      return res.status(403).json({ message: 'Recipient wallet is not eligible to receive transfers.' });
    }

    const balance = await this.walletService.getBalance(senderWallet);
    if (balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance for this transfer.' });
    }

    if (rateLockId) {
      const rateLock = await this.rateLockService.findById(rateLockId);
      if (!rateLock || new Date(rateLock.expiresAt) < new Date()) {
        return res.status(410).json({ message: 'Rate lock has expired. Please retry the transfer.' });
      }
    }

    next();
  }
}
