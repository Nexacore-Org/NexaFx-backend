import { Injectable } from '@nestjs/common';
import { PaginationDto, PaginatedResult, PaginationMeta } from '../dto/pagination.dto';

@Injectable()
export class PaginationService {
  /**
   * Paginate an array of items
   */
  paginate<T>(
    items: T[],
    paginationDto: PaginationDto,
  ): PaginatedResult<T> {
    const { page = 1, limit = 10 } = paginationDto;
    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / limit);
    const skip = (page - 1) * limit;

    const paginatedItems = items.slice(skip, skip + limit);

    const meta: PaginationMeta = {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };

    return {
      data: paginatedItems,
      meta,
    };
  }

  /**
   * Calculate skip and take for database queries
   */
  getSkipTake(paginationDto: PaginationDto): { skip: number; take: number } {
    const { page = 1, limit = 10 } = paginationDto;
    return {
      skip: (page - 1) * limit,
      take: limit,
    };
  }

  /**
   * Create pagination metadata
   */
  createMeta(
    paginationDto: PaginationDto,
    totalItems: number,
  ): PaginationMeta {
    const { page = 1, limit = 10 } = paginationDto;
    const totalPages = Math.ceil(totalItems / limit);

    return {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }
}
