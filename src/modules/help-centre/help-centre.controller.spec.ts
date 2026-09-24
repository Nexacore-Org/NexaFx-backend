import { HelpCentreController } from './help-centre.controller';
import { HelpCentreService } from './help-centre.service';
import { HelpArticle } from './entities/help-article.entity';

describe('HelpCentreController', () => {
  let controller: HelpCentreController;
  let service: {
    listPublished: jest.Mock;
    findBySlug: jest.Mock;
    listAll: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  const sample = (overrides: Partial<HelpArticle> = {}): HelpArticle =>
    ({
      id: 'a1',
      slug: 'how-to-send',
      title: 'How to send money',
      body: 'Body',
      category: 'payments',
      tags: [],
      isPublished: true,
      viewCount: 0,
      helpfulCount: 0,
      notHelpfulCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as HelpArticle;

  beforeEach(() => {
    service = {
      listPublished: jest.fn(),
      findBySlug: jest.fn(),
      listAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as unknown as HelpCentreService;

    controller = new HelpCentreController(
      service as unknown as HelpCentreService,
    );
  });

  it('lists published articles, forwarding the category query', async () => {
    service.listPublished.mockResolvedValue([sample()]);

    await controller.listPublished('payments');

    expect(service.listPublished).toHaveBeenCalledWith('payments');
    await controller.listPublished(undefined);
    expect(service.listPublished).toHaveBeenLastCalledWith(undefined);
  });

  it('fetches a published article by slug', async () => {
    service.findBySlug.mockResolvedValue(sample());

    const result = await controller.findBySlug('how-to-send');

    expect(service.findBySlug).toHaveBeenCalledWith('how-to-send');
    expect(result.slug).toBe('how-to-send');
  });

  it('lists all articles for admins', async () => {
    service.listAll.mockResolvedValue([sample()]);

    const result = await controller.listAll();

    expect(service.listAll).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('creates an article through the service', async () => {
    const dto = { title: 'T', body: 'B', category: 'payments' };
    service.create.mockResolvedValue(sample({ title: 'T' }));

    const result = await controller.create(dto as any);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result.title).toBe('T');
  });

  it('updates an article through the service', async () => {
    const dto = { isPublished: false };
    service.update.mockResolvedValue(sample({ isPublished: false }));

    const result = await controller.update('a1', dto as any);

    expect(service.update).toHaveBeenCalledWith('a1', dto);
    expect(result.isPublished).toBe(false);
  });
});