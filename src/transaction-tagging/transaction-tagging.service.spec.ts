// src/transaction-tags/transaction-tags.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionTagsService } from './transaction-tags.service';
import { TransactionTag } from './entities/transaction-tag.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '../users/enums/role.enum';

const mockUserId = 'user-123';
const mockAdminId = 'admin-123';
const mockTagId = 'tag-123';
const mockTransactionId = 'transaction-123';

const mockPersonalTag = {
  id: mockTagId,
  name: 'Personal Tag',
  color: '#FF5733',
  userId: mockUserId,
  isGlobal: false,
};

const mockGlobalTag = {
  id: 'global-tag-123',
  name: 'Global Tag',
  color: '#3355FF',
  userId: null,
  isGlobal: true,
};

const mockTransaction = {
  id: mockTransactionId,
  userId: mockUserId,
  tags: [mockPersonalTag],
};

describe('TransactionTagsService', () => {
  let service: TransactionTagsService;
  let tagRepository: Repository<TransactionTag>;
  let transactionRepository: Repository<Transaction>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionTagsService,
        {
          provide: getRepositoryToken(TransactionTag),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findByIds: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              where: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getMany: jest.fn(),
            })),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionTagsService>(TransactionTagsService);
    tagRepository = module.get<Repository<TransactionTag>>(getRepositoryToken(TransactionTag));
    transactionRepository = module.get<Repository<Transaction>>(getRepositoryToken(Transaction));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should allow a user to create a personal tag', async () => {
      const createDto = {
        name: 'Test Tag',
        color: '#FF5733',
      };

      const expectedTag = {
        ...createDto,
        userId: mockUserId,
        isGlobal: false,
      };

      jest.spyOn(tagRepository, 'create').mockReturnValue(expectedTag as TransactionTag);
      jest.spyOn(tagRepository, 'save').mockResolvedValue(expectedTag as TransactionTag);

      const result = await service.create(mockUserId, createDto, []);
      
      expect(tagRepository.create).toHaveBeenCalledWith({
        ...createDto,
        userId: mockUserId,
      });
      expect(result).toEqual(expectedTag);
    });

    it('should allow an admin to create a global tag', async () => {
      const createDto = {
        name: 'Global Tag',
        color: '#3355FF',
        isGlobal: true,
      };

      const expectedTag = {
        ...createDto,
        userId: null,
      };

      jest.spyOn(tagRepository, 'create').mockReturnValue(expectedTag as TransactionTag);
      jest.spyOn(tagRepository, 'save').mockResolvedValue(expectedTag as TransactionTag);

      const result = await service.create(mockAdminId, createDto, [Role.ADMIN]);
      
      expect(tagRepository.create).toHaveBeenCalledWith({
        ...createDto,
        userId: null,
      });
      expect(result).toEqual(expectedTag);
    });

    it('should not allow a regular user to create a global tag', async () => {
      const createDto = {
        name: 'Attempted Global Tag',
        color: '#3355FF',
        isGlobal: true,
      };

      await expect(service.create(mockUserId, createDto, [])).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('should return all tags for admin users', async () => {
      const mockTags = [mockPersonalTag, mockGlobalTag];
      const queryBuilder = tagRepository.createQueryBuilder();
      jest.spyOn(queryBuilder, 'getMany').mockResolvedValue(mockTags);

      const result = await service.findAll(mockAdminId, [Role.ADMIN]);
      
      expect(result).toEqual(mockTags);
      expect(queryBuilder.where).not.toHaveBeenCalled();
    });

    it('should return only global and personal tags for regular users', async () => {
      const mockTags = [mockPersonalTag, mockGlobalTag];
      const queryBuilder = tagRepository.createQueryBuilder();
      jest.spyOn(queryBuilder, 'getMany').mockResolvedValue(mockTags);

      const result = await service.findAll(mockUserId, []);
      
      expect(result).toEqual(mockTags);
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'tag.isGlobal = :isGlobal OR tag.userId = :userId',
        { isGlobal: true, userId: mockUserId }
      );
    });
  });

  describe('findOne', () => {
    it('should return a tag if it belongs to the user', async () => {
      jest.spyOn(tagRepository, 'findOne').mockResolvedValue(mockPersonalTag as TransactionTag);
      
      const result = await service.findOne(mockTagId, mockUserId, []);
      
      expect(result).toEqual(mockPersonalTag);
    });

    it('should return a global tag for any user', async () => {
      jest.spyOn(tagRepository, 'findOne').mockResolvedValue(mockGlobalTag as TransactionTag);
      
      const result = await service.findOne('global-tag-123', mockUserId, []);
      
      expect(result).toEqual(mockGlobalTag);
    });

    it('should not allow a user to access another user\'s personal tag', async () => {
      const otherUserTag = {
        ...mockPersonalTag,
        userId: 'other-user',
      };
      
      jest.spyOn(tagRepository, 'findOne').mockResolvedValue(otherUserTag as TransactionTag);
      
      await expect(service.findOne(mockTagId, mockUserId, [])).rejects.toThrow(ForbiddenException);
    });

    it('should allow an admin to access any tag', async () => {
      const otherUserTag = {
        ...mockPersonalTag,
        userId: 'other-user',
      };
      
      jest.spyOn(tagRepository, 'findOne').mockResolvedValue(otherUserTag as TransactionTag);
      
      const result = await service.findOne(mockTagId, mockAdminId, [Role.ADMIN]);
      
      expect(result).toEqual(otherUserTag);
    });

    it('should throw NotFoundException if tag does not exist', async () => {
      jest.spyOn(tagRepository, 'findOne').mockResolvedValue(null);
      
      await expect(service.findOne('non-existent', mockUserId, [])).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should allow a user to update their personal tag', async () => {
      const updateDto = {
        name: 'Updated Tag',
        color: '#FF9900',
      };
      
      jest.spyOn(service, 'findOne').mockResolvedValue(mockPersonalTag as TransactionTag);
      jest.spyOn(tagRepository, 'save').mockImplementation(async (entity) => entity as TransactionTag);
      
      const result = await service.update(mockTagId, updateDto, mockUserId, []);
      
      expect(result).toEqual({
        ...mockPersonalTag,
        ...updateDto,
      });
    });

    it('should not allow a user to update another user\'s personal tag', async () => {
      const otherUserTag = {
        ...mockPersonalTag,
        userId: 'other-user',
      };
      
      jest.spyOn(service, 'findOne').mockResolvedValue(otherUserTag as TransactionTag);
      
      await expect(service.update(mockTagId, { name: 'Hack Attempt' }, mockUserId, [])).rejects.toThrow(ForbiddenException);
    });

    it('should not allow a regular user to update a global tag', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockGlobalTag as TransactionTag);
      
      await expect(service.update('global-tag-123', { name: 'Hack Attempt' }, mockUserId, [])).rejects.toThrow(ForbiddenException);
    });

    it('should allow an admin to update any tag', async () => {
      const updateDto = {
        name: 'Admin Updated',
      };
      
      jest.spyOn(service, 'findOne').mockResolvedValue(mockGlobalTag as TransactionTag);
      jest.spyOn(tagRepository, 'save').mockImplementation(async (entity) => entity as TransactionTag);
      
      const result = await service.update('global-tag-123', updateDto, mockAdminId, [Role.ADMIN]);
      
      expect(result).toEqual({
        ...mockGlobalTag,
        ...updateDto,
      });
    });

    it('should not allow a regular user to change isGlobal status', async () => {
      const updateDto = {
        isGlobal: true,
      };
      
      jest.spyOn(service, 'findOne').mockResolvedValue(mockPersonalTag as TransactionTag);
      
      await expect(service.update(mockTagId, updateDto, mockUserId, [])).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assignTagsToTransaction', () => {
    beforeEach(() => {
      jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(mockTransaction as Transaction);
      jest.spyOn(tagRepository, 'findByIds').mockResolvedValue([mockPersonalTag, mockGlobalTag] as TransactionTag[]);
      jest.spyOn(transactionRepository, 'save').mockImplementation(async (entity) => entity as Transaction);
    });

    it('should assign tags to a transaction', async () => {
      const assignTagDto = {
        tagIds: [mockTagId, 'global-tag-123'],
      };
      
      const result = await service.assignTagsToTransaction(mockTransactionId, assignTagDto, mockUserId, []);
      
      expect(transactionRepository.save).toHaveBeenCalledWith({
        ...mockTransaction,
        tags: [mockPersonalTag, mockGlobalTag],
      });
      expect(result.tags).toEqual([mockPersonalTag, mockGlobalTag]);
    });

    it('should not allow assigning tags to another user\'s transaction', async () => {
      const otherUserTransaction = {
        ...mockTransaction,
        userId: 'other-user',
      };
      
      jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(otherUserTransaction as Transaction);
      
      const assignTagDto = {
        tagIds: [mockTagId],
      };
      
      await expect(service.assignTagsToTransaction(mockTransactionId, assignTagDto, mockUserId, [])).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if transaction does not exist', async () => {
      jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(null);
      
      const assignTagDto = {
        tagIds: [mockTagId],
      };
      
      await expect(service.assignTagsToTransaction('non-existent', assignTagDto, mockUserId, [])).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if any tag does not exist', async () => {
      // Mock that only one tag is found when two were requested
      jest.spyOn(tagRepository, 'findByIds').mockResolvedValue([mockPersonalTag] as TransactionTag[]);
      
      const assignTagDto = {
        tagIds: [mockTagId, 'non-existent'],
      };
      
      await expect(service.assignTagsToTransaction(mockTransactionId, assignTagDto, mockUserId, [])).rejects.toThrow(NotFoundException);
    });

    it('should not allow using another user\'s personal tag', async () => {
      const otherUserTag = {
        ...mockPersonalTag,
        userId: 'other-user',
      };
      
      jest.spyOn(tagRepository, 'findByIds').mockResolvedValue([otherUserTag, mockGlobalTag] as TransactionTag[]);
      
      const assignTagDto = {
        tagIds: ['other-user-tag', 'global-tag-123'],
      };
      
      await expect(service.assignTagsToTransaction(mockTransactionId, assignTagDto, mockUserId, [])).rejects.toThrow(ForbiddenException);
    });

    it('should allow an admin to assign tags to any transaction', async () => {
      const otherUserTransaction = {
        ...mockTransaction,
        userId: 'other-user',
      };
      
      jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(otherUserTransaction as Transaction);
      
      const assignTagDto = {
        tagIds: [mockTagId, 'global-tag-123'],
      };
      
      const result = await service.assignTagsToTransaction(mockTransactionId, assignTagDto, mockAdminId, [Role.ADMIN]);
      
      expect(result.tags).toEqual([mockPersonalTag, mockGlobalTag]);
    });
  });

  describe('getTransactionTags', () => {
    it('should return tags associated with a transaction', async () => {
      jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(mockTransaction as Transaction);
      
      const result = await service.getTransactionTags(mockTransactionId, mockUserId, []);
      
      expect(result).toEqual([mockPersonalTag]);
    });

    it('should not allow viewing tags of another user\'s transaction', async () => {
      const otherUserTransaction = {
        ...mockTransaction,
        userId: 'other-user',
      };
      
      jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(otherUserTransaction as Transaction);
      
      await expect(service.getTransactionTags(mockTransactionId, mockUserId, [])).rejects.toThrow(