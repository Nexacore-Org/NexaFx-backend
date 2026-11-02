import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ActivityFeedItem,
  ActivityFeedType,
} from './entities/activity-feed-item.entity';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

export interface DecodedActivityCursor {
  cursorUs: string;
  cursorCreatedAt: Date;
  cursorId: string;
}

@Injectable()
export class UnifiedActivityFeedService {
  constructor(
    @InjectRepository(ActivityFeedItem)
    private readonly activityFeedRepository: Repository<ActivityFeedItem>,
  ) {}

  /**
   * Encode an activity feed item into a microsecond-precision base64 cursor.
   */
  static encodeCursor(
    item: Pick<ActivityFeedItem, 'id' | 'createdAt'> & {
      createdAtUs?: string | number | bigint;
    },
    rawCreatedAtUs?: string | number | bigint,
  ): string {
    const usValue =
      rawCreatedAtUs ??
      item.createdAtUs ??
      BigInt(item.createdAt.getTime()) * 1000n;
    return Buffer.from(`${String(usValue)}|${item.id}`, 'utf8').toString(
      'base64',
    );
  }

  /**
   * Decode and validate a base64 pagination cursor.
   * Throws BadRequestException (HTTP 400) if the cursor is malformed.
   */
  static decodeCursor(cursor: string): DecodedActivityCursor {
    if (
      typeof cursor !== 'string' ||
      cursor.trim().length === 0 ||
      cursor.length % 4 !== 0 ||
      !BASE64_REGEX.test(cursor)
    ) {
      throw new BadRequestException('Malformed pagination cursor');
    }

    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const parts = decoded.split('|');
    if (parts.length !== 2) {
      throw new BadRequestException('Malformed pagination cursor');
    }

    const [rawTimestamp, cursorId] = parts;
    if (!rawTimestamp || !cursorId || !UUID_REGEX.test(cursorId)) {
      throw new BadRequestException('Malformed pagination cursor');
    }

    let cursorUsBigInt: bigint;
    let cursorCreatedAt: Date;

    if (/^\d+$/.test(rawTimestamp)) {
      cursorUsBigInt = BigInt(rawTimestamp);
      if (cursorUsBigInt <= 0n) {
        throw new BadRequestException('Malformed pagination cursor');
      }
      cursorCreatedAt = new Date(Number(cursorUsBigInt / 1000n));
    } else {
      const parsedMs = Date.parse(rawTimestamp);
      if (Number.isNaN(parsedMs)) {
        throw new BadRequestException('Malformed pagination cursor');
      }
      cursorUsBigInt = BigInt(parsedMs) * 1000n;
      cursorCreatedAt = new Date(parsedMs);
    }

    if (Number.isNaN(cursorCreatedAt.getTime())) {
      throw new BadRequestException('Malformed pagination cursor');
    }

    return {
      cursorUs: cursorUsBigInt.toString(),
      cursorCreatedAt,
      cursorId,
    };
  }

  /**
   * Append a new item to the user's activity feed.
   */
  async append(
    userId: string,
    type: ActivityFeedType,
    referenceId?: string | null,
    referenceType?: string | null,
  ): Promise<ActivityFeedItem> {
    const item = this.activityFeedRepository.create({
      userId,
      type,
      referenceId: referenceId ?? null,
      referenceType: referenceType ?? null,
    });
    return this.activityFeedRepository.save(item);
  }

  /**
   * Retrieve the activity feed for a user, using microsecond-precision cursor pagination.
   * Sort order is descending by createdAt, falling back to id to break ties.
   */
  async getFeed(
    userId: string,
    cursor?: string,
    limit = 10,
  ): Promise<{ items: ActivityFeedItem[]; nextCursor: string | null }> {
    const numericLimit = Number(limit);
    if (
      !Number.isInteger(numericLimit) ||
      numericLimit < 1 ||
      numericLimit > 100
    ) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 100',
      );
    }

    const decodedCursor =
      cursor !== undefined && cursor !== ''
        ? UnifiedActivityFeedService.decodeCursor(cursor)
        : null;

    const query = this.activityFeedRepository
      .createQueryBuilder('item')
      .where('item.userId = :userId', { userId })
      .orderBy('item.createdAt', 'DESC')
      .addOrderBy('item.id', 'DESC')
      .limit(numericLimit + 1);

    if (typeof (query as any).addSelect === 'function') {
      (query as any).addSelect(
        '(EXTRACT(EPOCH FROM item.createdAt) * 1000000)::bigint',
        'item_created_at_us',
      );
    }

    if (decodedCursor) {
      query.andWhere(
        '((EXTRACT(EPOCH FROM item.createdAt) * 1000000)::bigint < :cursorUs OR ((EXTRACT(EPOCH FROM item.createdAt) * 1000000)::bigint = :cursorUs AND item.id < :cursorId))',
        {
          cursorUs: decodedCursor.cursorUs,
          cursorCreatedAt: decodedCursor.cursorCreatedAt,
          cursorId: decodedCursor.cursorId,
        },
      );
    }

    let items: ActivityFeedItem[];
    let rawRows: Array<Record<string, any>> = [];

    if (typeof (query as any).getRawAndEntities === 'function') {
      const result = await (query as any).getRawAndEntities();
      items = result.entities;
      rawRows = result.raw ?? [];
    } else {
      items = await query.getMany();
    }

    const hasMore = items.length > numericLimit;
    const feedItems = hasMore ? items.slice(0, numericLimit) : items;

    let nextCursor: string | null = null;
    if (hasMore && feedItems.length > 0) {
      const lastIndex = feedItems.length - 1;
      const lastItem = feedItems[lastIndex];
      const rawCreatedAtUs = rawRows[lastIndex]?.item_created_at_us;
      nextCursor = UnifiedActivityFeedService.encodeCursor(
        lastItem,
        rawCreatedAtUs,
      );
    }

    return {
      items: feedItems,
      nextCursor,
    };
  }
}
