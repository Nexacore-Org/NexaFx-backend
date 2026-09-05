import { Test, TestingModule } from '@nestjs/testing';
import { StatementsController } from './statements.controller';
import { StatementService } from './statement.service';

// Prevent loading the real StatementService's transitively-heavy dependency chain.
jest.mock('../../wallets/wallets.service', () => ({
  WalletsService: class {},
}));
jest.mock('../../users/users.service', () => ({ UsersService: class {} }));
jest.mock('../../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));

describe('StatementsController', () => {
  let controller: StatementsController;
  let statementService: any;

  const res = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    set: jest.fn(),
    send: jest.fn(),
  });

  beforeEach(async () => {
    statementService = {
      listStatements: jest.fn(),
      getStatementDetail: jest.fn(),
      generatePDFContent: jest.fn(),
      generateCSVContent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatementsController],
      providers: [{ provide: StatementService, useValue: statementService }],
    }).compile();

    controller = module.get<StatementsController>(StatementsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listStatements', () => {
    it('lists statements for the authenticated user id', async () => {
      statementService.listStatements.mockResolvedValue([{ id: 'stmt-1' }]);

      const result = await controller.listStatements({ userId: 'user-1' });

      expect(statementService.listStatements).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([{ id: 'stmt-1' }]);
    });
  });

  describe('getStatement', () => {
    it('requests the statement detail for the user with an uppercased currency', async () => {
      statementService.getStatementDetail.mockResolvedValue({ id: 'stmt-1' });

      const result = await controller.getStatement(
        { userId: 'user-1' },
        2026,
        4,
        'xlm',
      );

      expect(statementService.getStatementDetail).toHaveBeenCalledWith(
        'user-1',
        2026,
        4,
        'XLM',
      );
      expect(result).toEqual({ id: 'stmt-1' });
    });
  });

  describe('downloadPDF', () => {
    it('sends 404 when the statement does not belong to the user', async () => {
      statementService.listStatements.mockResolvedValue([{ id: 'other' }]);
      const mockRes = res();

      await controller.downloadPDF({ userId: 'user-1' }, 'stmt-1', mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Statement not found',
      });
      expect(mockRes.send).not.toHaveBeenCalled();
    });

    it('renders and sends the PDF text for an owned statement', async () => {
      statementService.listStatements.mockResolvedValue([
        { id: 'stmt-1', year: 2026, month: 4, currency: 'XLM' },
      ]);
      statementService.getStatementDetail.mockResolvedValue({ id: 'stmt-1' });
      statementService.generatePDFContent.mockReturnValue('statement text');
      const mockRes = res();

      await controller.downloadPDF({ userId: 'user-1' }, 'stmt-1', mockRes);

      expect(statementService.getStatementDetail).toHaveBeenCalledWith(
        'user-1',
        2026,
        4,
        'XLM',
      );
      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'text/plain',
          'Content-Disposition': expect.stringContaining(
            'statement-2026-4-XLM.txt',
          ),
        }),
      );
      expect(mockRes.send).toHaveBeenCalledWith('statement text');
    });
  });

  describe('downloadCSV', () => {
    it('sends 404 when the statement does not belong to the user', async () => {
      statementService.listStatements.mockResolvedValue([]);
      const mockRes = res();

      await controller.downloadCSV({ userId: 'user-1' }, 'stmt-1', mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('renders and sends the CSV content for an owned statement', async () => {
      statementService.listStatements.mockResolvedValue([
        { id: 'stmt-1', year: 2026, month: 4, currency: 'XLM' },
      ]);
      statementService.getStatementDetail.mockResolvedValue({ id: 'stmt-1' });
      statementService.generateCSVContent.mockReturnValue('csv content');
      const mockRes = res();

      await controller.downloadCSV({ userId: 'user-1' }, 'stmt-1', mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'text/csv',
        }),
      );
      expect(mockRes.send).toHaveBeenCalledWith('csv content');
    });
  });
});
