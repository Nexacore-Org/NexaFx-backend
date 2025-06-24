import { TransferValidationMiddleware } from './transfer-validation.middleware';
import { BlacklistService } from 'src/blacklist/blacklist.service'; 
import { WalletService } from '../../wallet/wallet.service';
import { RateLockService } from 'src/ratelock/ratelock.service'; 

describe('TransferValidationMiddleware', () => {
  let middleware: TransferValidationMiddleware;
  let blacklistService: BlacklistService;
  let walletService: WalletService;
  let rateLockService: RateLockService;

  const mockReq: any = {
    body: {
      fromWalletId: 'sender123',
      toWalletId: 'recipient123',
      amount: 50,
      rateLockId: 'rate123',
    },
  };
  const mockRes: any = {};
  const mockNext = jest.fn();

  beforeEach(() => {
    blacklistService = { isBlacklisted: jest.fn() } as any;
    walletService = { isFrozen: jest.fn(), getBalance: jest.fn() } as any;
    rateLockService = { isExpired: jest.fn() } as any;

    middleware = new TransferValidationMiddleware(
      blacklistService,
      walletService,
      rateLockService,
    );
  });

  it('should block if recipient is blacklisted', async () => {
    (blacklistService.isBlacklisted as jest.Mock).mockResolvedValue(true);
    await middleware.use(mockReq, mockRes, mockNext);

    expect(mockRes.statusCode).toBe(403);
    expect(mockRes.json).toBeCalledWith({ message: 'Recipient wallet is blacklisted' });
  });

  it('should block if sender wallet is frozen', async () => {
    (blacklistService.isBlacklisted as jest.Mock).mockResolvedValue(false);
    (walletService.isFrozen as jest.Mock).mockResolvedValue(true);

    mockRes.status = jest.fn().mockReturnThis();
    mockRes.json = jest.fn();

    await middleware.use(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ message: 'Sender wallet is frozen' });
  });

  it('should block if rate lock is expired', async () => {
    (blacklistService.isBlacklisted as jest.Mock).mockResolvedValue(false);
    (walletService.isFrozen as jest.Mock).mockResolvedValue(false);
    (rateLockService.isExpired as jest.Mock).mockResolvedValue(true);

    mockRes.status = jest.fn().mockReturnThis();
    mockRes.json = jest.fn();

    await middleware.use(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ message: 'Rate lock has expired' });
  });

  it('should block if balance is insufficient', async () => {
    (blacklistService.isBlacklisted as jest.Mock).mockResolvedValue(false);
    (walletService.isFrozen as jest.Mock).mockResolvedValue(false);
    (rateLockService.isExpired as jest.Mock).mockResolvedValue(false);
    (walletService.getBalance as jest.Mock).mockResolvedValue(20); // insufficient

    mockRes.status = jest.fn().mockReturnThis();
    mockRes.json = jest.fn();

    await middleware.use(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ message: 'Insufficient balance' });
  });

  it('should pass all validations and call next()', async () => {
    (blacklistService.isBlacklisted as jest.Mock).mockResolvedValue(false);
    (walletService.isFrozen as jest.Mock).mockResolvedValue(false);
    (rateLockService.isExpired as jest.Mock).mockResolvedValue(false);
    (walletService.getBalance as jest.Mock).mockResolvedValue(100);

    await middleware.use(mockReq, mockRes, mockNext);
    expect(mockNext).toBeCalled();
  });
});
