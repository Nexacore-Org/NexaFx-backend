import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
    });
  }

  async createUser(
    email: string,
    password: string,
    role: UserRole = UserRole.USER,
  ): Promise<Omit<User, 'password'>> {
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await this.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = this.userRepository.create({
      email: normalizedEmail,
      password: hashedPassword,
      role,
      isVerified: false,
    });

    const savedUser = await this.userRepository.save(user);

    const { password: _, ...userWithoutPassword } = savedUser;
    return userWithoutPassword;
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await this.userRepository.update(userId, {
      password: hashedPassword,
    });
  }

  async verifyUser(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.update(userId, {
      isVerified: true,
    });
  }

  async updateRole(userId: string, role: UserRole): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.update(userId, { role });
  }
}
