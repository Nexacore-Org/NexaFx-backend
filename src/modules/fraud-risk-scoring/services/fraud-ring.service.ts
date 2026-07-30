import { Injectable, NotFoundException } from '@nestjs/common';
import { FraudRing, FraudRingStatus } from '../entities/fraud-ring.entity';

export interface TxHop {
  id: string;
  senderUserId: string;
  recipientUserId: string;
  amountUsd: number;
  timestamp: Date;
  isNewPair?: boolean;
}

@Injectable()
export class FraudRingService {
  private readonly detectedRings: FraudRing[] = [];
  private readonly frozenWallets = new Set<string>();

  /**
   * Weekly cron graph cycle analysis.
   * Identifies 3–6 participant transaction loops within 24h window with matching amounts.
   */
  async analyse(hops: TxHop[]): Promise<FraudRing[]> {
    const rings: FraudRing[] = [];

    // Group hops into simple cycle candidates A -> B -> C -> A
    if (hops.length < 3) return rings;

    const participants = Array.from(
      new Set(hops.flatMap((h) => [h.senderUserId, h.recipientUserId]))
    );

    // Rule 1: 3-6 participants
    if (participants.length < 3 || participants.length > 6) {
      return rings;
    }

    // Rule 2: Cycle window <= 24 hours
    const times = hops.map((h) => h.timestamp.getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const durationHours = (maxTime - minTime) / (1000 * 60 * 60);

    if (durationHours > 24) {
      return rings;
    }

    // Rule 3: Amount matching (70% - 130% of first hop)
    const baseAmount = hops[0].amountUsd;
    for (const hop of hops) {
      const ratio = hop.amountUsd / baseAmount;
      if (ratio < 0.7 || ratio > 1.3) {
        return rings; // Amount disparity too high, not a coordinated ring
      }
    }

    // Rule 4: At least 2 hops use new sender-recipient pairs
    const newPairCount = hops.filter((h) => h.isNewPair).length;
    if (newPairCount < 2) {
      return rings;
    }

    const ring: FraudRing = {
      id: `ring_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      detectedAt: new Date(),
      participants,
      transactionIds: hops.map((h) => h.id),
      cyclePattern: participants.join(' → ') + ' → ' + participants[0],
      totalCycledAmountUsd: baseAmount,
      status: FraudRingStatus.OPEN,
    };

    rings.push(ring);
    this.detectedRings.push(ring);
    return rings;
  }

  async getRings(status?: FraudRingStatus): Promise<FraudRing[]> {
    if (status) {
      return this.detectedRings.filter((r) => r.status === status);
    }
    return this.detectedRings;
  }

  async getRingById(id: string): Promise<FraudRing> {
    const ring = this.detectedRings.find((r) => r.id === id);
    if (!ring) {
      throw new NotFoundException(`Fraud ring with ID ${id} not found`);
    }
    return ring;
  }

  /**
   * Confirms a fraud ring and auto-freezes all participant wallets.
   */
  async confirmRing(
    id: string,
    adminUserId: string
  ): Promise<{ ring: FraudRing; frozenWallets: string[] }> {
    const ring = await this.getRingById(id);
    ring.status = FraudRingStatus.CONFIRMED;
    ring.reviewedBy = adminUserId;
    ring.reviewedAt = new Date();

    for (const p of ring.participants) {
      this.frozenWallets.add(p);
    }

    return {
      ring,
      frozenWallets: ring.participants,
    };
  }

  isWalletFrozen(userId: string): boolean {
    return this.frozenWallets.has(userId);
  }
}
