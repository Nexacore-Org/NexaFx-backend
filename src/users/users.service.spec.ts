import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AccountType } from './entities/user.entity';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('UsersService', () => {
  let service: UsersService;
  let repository: Repository<User>;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
  };

  const mockUser = {
    id: '123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    accountType: AccountType.PERSONAL,
    password: 'hashedPassword',
    dateOfBirth: new Date(),
    phoneNumber: '+1234567890',
    address: '123 Main St',
    profilePicture: 'profile.jpg',
    bio: 'Test bio',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createUserDto = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      accountType: AccountType.PERSONAL,
      password: 'Password123!',
      dateOfBirth: new Date(),
      phoneNumber: '+1234567890',
      address: '123 Main St',
      profilePicture: 'profile.jpg',
      bio: 'Test bio',
    };

    it('should create a new user successfully', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockUser);
      mockRepository.save.mockResolvedValue(mockUser);
      (bcrypt.genSalt as jest.Mock).mockResolvedValue('salt');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');

      const result = await service.create(createUserDto);

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email: createUserDto.email },
      });
      expect(mockRepository.create).toHaveBeenCalledWith({
        ...createUserDto,
        password: 'hashedPassword',
      });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(bcrypt.genSalt).toHaveBeenCalled();
      expect(bcrypt.hash).toHaveBeenCalledWith(createUserDto.password, 'salt');
    });

    it('should throw ConflictException if email already exists', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.create(createUserDto)).rejects.toThrow(ConflictException);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email: createUserDto.email },
      });
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      const users = [mockUser];
      mockRepository.find.mockResolvedValue(users);

      const result = await service.findAll();

      expect(result).toEqual(users);
      expect(mockRepository.find).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne('123');

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: '123' },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('123')).rejects.toThrow(NotFoundException);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: '123' },
      });
    });
  });

  describe('findByEmail', () => {
    it('should return a user by email', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail('john@example.com');

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'john@example.com' },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findByEmail('john@example.com')).rejects.toThrow(NotFoundException);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'john@example.com' },
      });
    });
  });

  describe('update', () => {
    const updateUserDto = {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      accountType: AccountType.BUSINESS,
      password: 'NewPassword123!',
      dateOfBirth: new Date(),
      phoneNumber: '+1987654321',
      address: '456 Oak St',
      profilePicture: 'new-profile.jpg',
      bio: 'Updated bio',
    };

    it('should update a user successfully', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(mockUser) // First call for findOne
        .mockResolvedValueOnce(null); // Second call for email check
      mockRepository.save.mockResolvedValue({ ...mockUser, ...updateUserDto, password: 'newHashedPassword' });
      (bcrypt.genSalt as jest.Mock).mockResolvedValue('salt');
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPassword');

      const result = await service.update('123', updateUserDto);

      expect(result).toEqual({ ...mockUser, ...updateUserDto, password: 'newHashedPassword' });
      expect(mockRepository.findOne).toHaveBeenCalledTimes(2);
      expect(mockRepository.save).toHaveBeenCalled();
      expect(bcrypt.genSalt).toHaveBeenCalled();
      expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword123!', 'salt');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update('123', updateUserDto)).rejects.toThrow(NotFoundException);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: '123' },
      });
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if new email already exists', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(mockUser) // First call for findOne
        .mockResolvedValueOnce({ ...mockUser, id: '456' }); // Second call for email check

      await expect(service.update('123', { email: 'existing@example.com' })).rejects.toThrow(ConflictException);
      expect(mockRepository.findOne).toHaveBeenCalledTimes(2);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should not hash password if not provided in update', async () => {
      const { password, ...updateWithoutPassword } = updateUserDto;

      mockRepository.findOne
        .mockResolvedValueOnce(mockUser) // First call for findOne
        .mockResolvedValueOnce(null); // Second call for email check
      mockRepository.save.mockResolvedValue({ ...mockUser, ...updateWithoutPassword });

      const result = await service.update('123', updateWithoutPassword);

      expect(result).toEqual({ ...mockUser, ...updateWithoutPassword });
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: '123' } });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(bcrypt.genSalt).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove a user successfully', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      await service.remove('123');

      expect(mockRepository.delete).toHaveBeenCalledWith('123');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove('123')).rejects.toThrow(NotFoundException);
      expect(mockRepository.delete).toHaveBeenCalledWith('123');
    });
  });
});
