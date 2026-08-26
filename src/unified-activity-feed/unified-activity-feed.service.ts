import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityFeedItem, ActivityFeedType } from './entities/activity-feed-item.entity';

@Injectable()
export class UnifiedActivityFeedService {
  constructor(
    @InjectRepository(ActivityFeedItem)
    private readonly activityFeedRepository: Repository<ActivityFeedItem>,
  ) {}

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
   * Retrieve the activity feed for a user, using cursor pagination.
   * Sort order is descending by createdAt, falling back to id to break ties.
   */
  async getFeed(
    userId: string,
    cursor?: string,
    limit = 10,
  ): Promise<{ items: ActivityFeedItem[]; nextCursor: string | null }> {
    const query = this.activityFeedRepository
      .createQueryBuilder('item')
      .where('item.userId = :userId', { userId })
      .orderBy('item.createdAt', 'DESC')
      .addOrderBy('item.id', 'DESC')
      .limit(limit + 1);

    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('ascii');
        const [cursorCreatedAt, cursorId] = decoded.split('|');
        if (cursorCreatedAt && cursorId) {
          query.andWhere(
            '(item.createdAt < :cursorCreatedAt OR (item.createdAt = :cursorCreatedAt AND item.id < :cursorId))',
            { cursorCreatedAt: new Date(cursorCreatedAt), cursorId },
          );
        }
      } catch (e) {
        // Fallback to no-cursor if parsing fails
      }
    }

    const items = await query.getMany();
    const hasMore = items.length > limit;
    const feedItems = hasMore ? items.slice(0, limit) : items;

    let nextCursor: string | null = null;
    if (hasMore && feedItems.length > 0) {
      const lastItem = feedItems[feedItems.length - 1];
      nextCursor = Buffer.from(
        `${lastItem.createdAt.toISOString()}|${lastItem.id}`,
      ).toString('base64');
    }

    return {
      items: feedItems,
      nextCursor,
    };
  }
}
