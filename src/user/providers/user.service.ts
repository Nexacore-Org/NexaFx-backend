import {
  Injectable,
  // ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { FindUserByEmail } from './find-user.service';
import { FindUserByPhone } from './find-user-by-phone.service';
import { PasswordHashingService } from 'src/auth/services/passwod.hashing.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly findUserByEmail: FindUserByEmail,
    private readonly findUserByPhone: FindUserByPhone,
    private readonly passwordService: PasswordHashingService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      if (!existingUser.isVerified) {
        // Update user with new password
        existingUser.password = createUserDto.password;
        existingUser.isVerified = true;
        return this.userRepository.save(existingUser);
      } else {
        throw new BadRequestException('Email already exists and is verified');
      }
    }

    const user = this.userRepository.create(createUserDto);

    const savedUser = await this.userRepository.save(user);

    return savedUser;
  }

  findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findOneByEmail(email: string): Promise<User> {
    return await this.findUserByEmail.FindByEmail(email);
  }

  async findOneByPhone(phoneNumber: string): Promise<User> {
    return await this.findUserByPhone.FindByPhone(phoneNumber);
  }

  async findOneByEmailOptional(email: string): Promise<User | null> {
    return this.findUserByEmail.FindByEmailOptional(email);
  }

  async findOneByPhoneOptional(phone: string): Promise<User | null> {
    return this.findUserByPhone.FindByPhoneOptional(phone);
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (
      updateUserDto.password &&
      !updateUserDto.password.startsWith('$2b$') &&
      !updateUserDto.password.startsWith('$2a$')
    ) {
      updateUserDto.password = await this.passwordService.hashPassword(
        updateUserDto.password,
      );
    }

    Object.assign(user, updateUserDto);
    return this.userRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const result = await this.userRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
  }

  async updateRefreshToken(userId: string, hashedToken: string): Promise<void> {
    await this.userRepository.update(userId, {
      tokens: [{ refreshToken: hashedToken, isRevoked: false }],
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async updateUserLoginInfo(
    userId: string,
    data: { refreshToken: string; lastLogin: Date },
  ): Promise<void> {
    await this.userRepository.update(userId, {
      tokens: [{ refreshToken: data.refreshToken }],
      lastLogin: data.lastLogin,
    });
  }
}
