import { Test, type TestingModule } from "@nestjs/testing"
import { getRepositoryToken } from "@nestjs/typeorm"
import type { Repository } from "typeorm"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common"
import { ScheduledTransfersService } from "./transfers.service"
import { ScheduledTransfer, ScheduledTransferStatus } from "../entities/scheduled-transfer.entity"
import { TransactionsService } from "src/transactions/transactions.service"
import { CurrenciesService } from "src/currencies/currencies.service"
import { FeeService } from "src/fees/fee.service"
import { UserService } from "src/user/providers/user.service"
import { AccountType } from "src/user/entities/user.entity"

describe("ScheduledTransfersService", () => {
  let service: ScheduledTransfersService
  let repository: Repository<ScheduledTransfer>
  let transactionsService: TransactionsService
  let currenciesService: CurrenciesService
  let feeService: FeeService
  let userService: UserService
  let eventEmitter: EventEmitter2

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    })),
  }

  const mockTransactionsService = {
    createTransaction: jest.fn(),
  }

  const mockCurrenciesService = {
    findOne: jest.fn(),
  }

  const mockFeeService = {
    calculateFee: jest.fn(),
  }

  const mockUserService = {
    findOne: jest.fn(),
  }

  const mockEventEmitter = {
    emit: jest.fn(),
  }

  const mockUser = {
    id: "user-123",
    accountType: AccountType.PERSONAL,
  }

  const mockCurrency = {
    id: "currency-123",
    code: "BTC",
    name: "Bitcoin",
  }

  const mockScheduledTransfer = {
    id: "transfer-123",
    userId: "user-123",
    fromCurrencyId: "currency-123",
    toCurrencyId: "currency-456",
    amount: 100,
    scheduledAt: new Date(Date.now() + 86400000), // tomorrow
    status: ScheduledTransferStatus.PENDING,
    fromCurrency: { code: "BTC" },
    toCurrency: { code: "ETH" },
    metadata: {},
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledTransfersService,
        {
          provide: getRepositoryToken(ScheduledTransfer),
          useValue: mockRepository,
        },
        {
          provide: TransactionsService,
          useValue: mockTransactionsService,
        },
        {
          provide: CurrenciesService,
          useValue: mockCurrenciesService,
        },
        {
          provide: FeeService,
          useValue: mockFeeService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile()

    service = module.get<ScheduledTransfersService>(ScheduledTransfersService)
    repository = module.get<Repository<ScheduledTransfer>>(getRepositoryToken(ScheduledTransfer))
    transactionsService = module.get<TransactionsService>(TransactionsService)
    currenciesService = module.get<CurrenciesService>(CurrenciesService)
    feeService = module.get<FeeService>(FeeService)
    userService = module.get<UserService>(UserService)
    eventEmitter = module.get<EventEmitter2>(EventEmitter2)

    // Default mock implementations
    mockCurrenciesService.findOne.mockResolvedValue(mockCurrency)
    mockUserService.findOne.mockResolvedValue(mockUser)
    mockFeeService.calculateFee.mockResolvedValue({ feeAmount: 5, feePercent: 0.05 })
    mockRepository.create.mockReturnValue(mockScheduledTransfer)
    mockRepository.save.mockResolvedValue(mockScheduledTransfer)
    mockRepository.findOne.mockResolvedValue(mockScheduledTransfer)
  })

  it("should be defined", () => {
    expect(service).toBeDefined()
  })

  describe("create", () => {
    it("should create a scheduled transfer", async () => {
      const createDto = {
        fromCurrencyId: "currency-123",
        toCurrencyId: "currency-456",
        amount: 100,
        scheduledAt: new Date(Date.now() + 86400000), // tomorrow
      }

      const result = await service.create("user-123", createDto)

      expect(currenciesService.findOne).toHaveBeenCalledTimes(2)
      expect(userService.findOne).toHaveBeenCalledWith("user-123")
      expect(feeService.calculateFee).toHaveBeenCalled()
      expect(repository.create).toHaveBeenCalled()
      expect(repository.save).toHaveBeenCalled()
      expect(result).toEqual(mockScheduledTransfer)
    })

    it("should throw BadRequestException if scheduled date is in the past", async () => {
      const createDto = {
        fromCurrencyId: "currency-123",
        toCurrencyId: "currency-456",
        amount: 100,
        scheduledAt: new Date(Date.now() - 86400000), // yesterday
      }

      await expect(service.create("user-123", createDto)).rejects.toThrow(BadRequestException)
    })
  })

  describe("findAllForUser", () => {
    it("should return all scheduled transfers for a user", async () => {
      mockRepository.find.mockResolvedValue([mockScheduledTransfer])

      const result = await service.findAllForUser("user-123")

      expect(repository.find).toHaveBeenCalledWith({
        where: { userId: "user-123" },
        order: { scheduledAt: "ASC" },
      })
      expect(result).toEqual([mockScheduledTransfer])
    })
  })

  describe("findOne", () => {
    it("should return a scheduled transfer by ID", async () => {
      const result = await service.findOne("transfer-123")

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: "transfer-123" },
      })
      expect(result).toEqual(mockScheduledTransfer)
    })

    it("should throw NotFoundException if transfer not found", async () => {
      mockRepository.findOne.mockResolvedValue(null)

      await expect(service.findOne("non-existent")).rejects.toThrow(NotFoundException)
    })

    it("should verify ownership if userId is provided", async () => {
      await expect(service.findOne("transfer-123", "wrong-user")).rejects.toThrow()

      const result = await service.findOne("transfer-123", "user-123")
      expect(result).toEqual(mockScheduledTransfer)
    })
  })

  describe("update", () => {
    it("should update a scheduled transfer", async () => {
      const updateDto = {
        amount: 200,
        scheduledAt: new Date(Date.now() + 172800000), // day after tomorrow
      }

      const result = await service.update("transfer-123", "user-123", updateDto)

      expect(repository.save).toHaveBeenCalled()
      expect(result).toEqual(mockScheduledTransfer)
    })

    it("should throw ConflictException if transfer is already executed", async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockScheduledTransfer,
        status: ScheduledTransferStatus.EXECUTED,
      })

      await expect(service.update("transfer-123", "user-123", { amount: 200 })).rejects.toThrow(ConflictException)
    })

    it("should handle cancellation if status is set to CANCELLED", async () => {
      const updateDto = {
        status: ScheduledTransferStatus.CANCELLED,
      }

      await service.update("transfer-123", "user-123", updateDto)

      expect(repository.save).toHaveBeenCalledWith({
        ...mockScheduledTransfer,
        status: ScheduledTransferStatus.CANCELLED,
      })
    })
  })

  describe("executeTransfer", () => {
    it("should execute a scheduled transfer successfully", async () => {
      const mockTransaction = { id: "tx-123" }
      mockTransactionsService.createTransaction.mockResolvedValue(mockTransaction)

      const result = await service.executeTransfer(mockScheduledTransfer as any)

      expect(transactionsService.createTransaction).toHaveBeenCalled()
      expect(repository.save).toHaveBeenCalled()
      expect(eventEmitter.emit).toHaveBeenCalledWith("scheduled-transfer.executed", expect.any(Object))
      expect(result.status).toBe(ScheduledTransferStatus.EXECUTED)
      expect(result.transactionId).toBe("tx-123")
    })

    it("should handle execution failure", async () => {
      mockTransactionsService.createTransaction.mockRejectedValue(new Error("Insufficient funds"))

      const result = await service.executeTransfer(mockScheduledTransfer as any)

      expect(repository.save).toHaveBeenCalled()
      expect(eventEmitter.emit).toHaveBeenCalledWith("scheduled-transfer.failed", expect.any(Object))
      expect(result.status).toBe(ScheduledTransferStatus.FAILED)
      expect(result.failureReason).toBe("Insufficient funds")
    })
  })

  describe("processScheduledTransfers", () => {
    it("should process due transfers", async () => {
      const dueTransfers = [
        { ...mockScheduledTransfer, id: "transfer-1" },
        { ...mockScheduledTransfer, id: "transfer-2" },
      ]

      mockRepository.find.mockResolvedValue(dueTransfers)

      const executeSpy = jest.spyOn(service, "executeTransfer").mockResolvedValue()

      await service.processScheduledTransfers()

      expect(repository.find).toHaveBeenCalled()
      expect(executeSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe("cancelScheduledTransfer", () => {
    it("should throw NotFoundException if transfer does not exist", async () => {
      mockRepository.findOne.mockResolvedValueOnce(null)
      await expect(service.cancelScheduledTransfer("non-existent", "user-123")).rejects.toThrow(NotFoundException)
    })

    it("should throw ConflictException if status is not pending", async () => {
      mockRepository.findOne.mockResolvedValueOnce({
        ...mockScheduledTransfer,
        status: ScheduledTransferStatus.EXECUTED,
      })
      await expect(service.cancelScheduledTransfer("transfer-123", "user-123")).rejects.toThrow(ConflictException)
    })

    it("should cancel a pending transfer and set status to cancelled", async () => {
      mockRepository.findOne.mockResolvedValueOnce({
        ...mockScheduledTransfer,
        status: ScheduledTransferStatus.PENDING,
      })
      mockRepository.save.mockImplementationOnce(async (transfer) => transfer)
      const result = await service.cancelScheduledTransfer("transfer-123", "user-123", "User requested cancellation")
      expect(result.status).toBe(ScheduledTransferStatus.CANCELLED)
      expect(result.failureReason).toBe("User requested cancellation")
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ScheduledTransferStatus.CANCELLED,
          failureReason: "User requested cancellation",
        })
      )
    })
  })
})
