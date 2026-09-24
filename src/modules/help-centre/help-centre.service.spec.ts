import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HelpCentreService } from './help-centre.service';
import { HelpArticle } from './entities/help-article.entity';

const article = (overrides: Partial<HelpArticle> = {}): HelpArticle =>
  ({
    id: 'a1',
    slug: 'how-to-send',
    title: 'How to send money',
    body: 'Body text',
    category: 'payments',
    tags: ['send'],
    isPublished: true,
    viewCount: 3,
    helpfulCount: 1,
    notHelpfulCount: 0,
    createdAt: new Date('2026-09-24T10:00:00Z'),
    updatedAt: new Date('2026-09-24T10:00:00Z'),
    ...overrides,
  }) as HelpArticle;

describe('HelpCentreService', () => {
  let service: HelpCentreService;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ ...v, id: v.id ?? 'a1' })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HelpCentreService,
        { provide: getRepositoryToken(HelpArticle), useValue: repo },
      ],
    }).compile();

    service = module.get(HelpCentreService);
  });

  describe('listPublished', () => {
    it('returns only published articles', async () => {
      repo.find.mockResolvedValue([article()]);

      const result = await service.listPublished();

      expect(repo.find).toHaveBeenCalledWith({
        where: { isPublished: true },
        order: { category: 'ASC', title: 'ASC' },
      });
      expect(result).toHaveLength(1);
    });

    it('narrows by category when supplied', async () => {
      repo.find.mockResolvedValue([]);

      await service.listPublished('security');

      expect(repo.find).toHaveBeenCalledWith({
        where: { isPublished: true, category: 'security' },
        order: { category: 'ASC', title: 'ASC' },
      });
    });
  });

  describe('findBySlug', () => {
    it('increments the view count for a published article', async () => {
      const existing = article({ viewCount: 3 });
      repo.findOne.mockResolvedValue(existing);

      const result = await service.findBySlug('how-to-send');

      expect(existing.viewCount).toBe(4);
      expect(repo.save).toHaveBeenCalledWith(existing);
      expect(result.viewCount).toBe(4);
    });

    it('throws NotFound when the slug is unpublished', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findBySlug('draft-article')).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('listAll', () => {
    it('returns all articles newest-first', async () => {
      repo.find.mockResolvedValue([article(), article({ id: 'a2' })]);

      const result = await service.listAll();

      expect(repo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
      expect(result).toHaveLength(2);
    });
  });

  describe('create', () => {
    it('derives a unique slug from the title and defaults to a draft', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.create({
        title: 'How to Send Money',
        body: 'x',
        category: 'payments',
      });

      expect(repo.create).toHaveBeenCalledWith({
        title: 'How to Send Money',
        body: 'x',
        category: 'payments',
        tags: [],
        slug: 'how-to-send-money',
        isPublished: false,
      });
      expect(result.slug).toBe('how-to-send-money');
    });

    it('uses a caller-supplied slug verbatim', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.create({
        title: 'Anything',
        body: 'x',
        category: 'payments',
        slug: 'custom/custom-slug',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'custom/custom-slug' }),
      );
    });

    it('disambiguates a colliding slug with a numeric suffix', async () => {
      repo.findOne
        .mockResolvedValueOnce({ id: 'existing' })
        .mockResolvedValue(null);

      const result = await service.create({
        title: 'How to Send',
        body: 'x',
        category: 'payments',
      });

      expect(repo.findOne).toHaveBeenNthCalledWith(1, {
        where: { slug: 'how-to-send' },
        select: { id: true },
      });
      expect(result.slug).toBe('how-to-send-2');
    });

    it('rejects a title that cannot yield a slug', async () => {
      await expect(
        service.create({ title: '!!!', body: 'x', category: 'payments' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('throws NotFound for a missing article', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update('nope', { body: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('applies the provided fields and leaves the slug untouched', async () => {
      const existing = article();
      repo.findOne.mockResolvedValue(existing);

      const result = await service.update('a1', {
        title: 'Renamed',
        isPublished: false,
        tags: [],
      });

      expect(existing.title).toBe('Renamed');
      expect(existing.isPublished).toBe(false);
      expect(existing.tags).toEqual([]);
      expect(existing.slug).toBe('how-to-send');
      expect(repo.save).toHaveBeenCalledWith(existing);
    });

    it('unpublishes when isPublished is set to false', async () => {
      const existing = article({ isPublished: true });
      repo.findOne.mockResolvedValue(existing);

      await service.update('a1', { isPublished: false });

      expect(existing.isPublished).toBe(false);
    });
  });
});