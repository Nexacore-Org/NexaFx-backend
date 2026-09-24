import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HelpArticle } from './entities/help-article.entity';
import { CreateHelpArticleDto, UpdateHelpArticleDto } from './dto/help-article.dto';

/**
 * In-app help center / knowledge base.
 *
 * Public consumers see only published articles; admins manage the full set
 * (drafts included) through create/update/unpublish flows. The `slug` is the
 * stable public URL identifier, so it is fixed at creation time and never
 * mutated by an update.
 */
@Injectable()
export class HelpCentreService {
  constructor(
    @InjectRepository(HelpArticle)
    private readonly articlesRepo: Repository<HelpArticle>,
  ) {}

  /** Public: list published articles, optionally narrowed to one category. */
  async listPublished(category?: string): Promise<HelpArticle[]> {
    const where: Record<string, unknown> = { isPublished: true };
    if (category !== undefined && category.length > 0) {
      where.category = category;
    }
    return this.articlesRepo.find({
      where,
      order: { category: 'ASC', title: 'ASC' },
    });
  }

  /** Public: fetch one published article by its slug, counting the view. */
  async findBySlug(slug: string): Promise<HelpArticle> {
    const article = await this.articlesRepo.findOne({
      where: { slug, isPublished: true },
    });
    if (!article) {
      throw new NotFoundException('Help article not found');
    }
    article.viewCount += 1;
    await this.articlesRepo.save(article);
    return article;
  }

  /** Admin: list every article, drafts included, newest first. */
  async listAll(): Promise<HelpArticle[]> {
    return this.articlesRepo.find({ order: { createdAt: 'DESC' } });
  }

  /** Admin: create an article (draft by default). */
  async create(dto: CreateHelpArticleDto): Promise<HelpArticle> {
    const slug = await this.uniqueSlug(dto.slug ?? this.slugify(dto.title));

    const article = this.articlesRepo.create({
      title: dto.title,
      body: dto.body,
      category: dto.category,
      tags: dto.tags ?? [],
      slug,
      isPublished: dto.isPublished ?? false,
    });
    return this.articlesRepo.save(article);
  }

  /** Admin: partially update an article, including publish/unpublish. */
  async update(id: string, dto: UpdateHelpArticleDto): Promise<HelpArticle> {
    const article = await this.articlesRepo.findOne({ where: { id } });
    if (!article) {
      throw new NotFoundException('Help article not found');
    }

    if (dto.title !== undefined) {
      article.title = dto.title;
    }
    if (dto.body !== undefined) {
      article.body = dto.body;
    }
    if (dto.category !== undefined) {
      article.category = dto.category;
    }
    if (dto.tags !== undefined) {
      article.tags = dto.tags;
    }
    if (dto.isPublished !== undefined) {
      article.isPublished = dto.isPublished;
    }

    return this.articlesRepo.save(article);
  }

  /**
   * Derive a URL slug from a title and ensure it does not collide with an
   * existing article, appending a numeric suffix until it is free.
   */
  private async uniqueSlug(base: string): Promise<string> {
    if (!base || base.length === 0) {
      throw new BadRequestException('Unable to derive a slug from the title');
    }

    let candidate = base;
    let suffix = 1;
    // Guard against unbounded queries on a pathological title.
    while (suffix <= 1000) {
      const existing = await this.articlesRepo.findOne({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
      suffix += 1;
      candidate = base.length < 196 ? `${base}-${suffix}` : `${base.slice(0, 196)}-${suffix}`;
    }
    throw new BadRequestException('Could not generate a unique article slug');
  }

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 200);
  }
}