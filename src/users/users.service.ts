import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './user.entity';
import { UpdateProfileDto, ProfileResponseDto } from './dto';

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

  async findByPhone(phone: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { phone },
    });
  }

  async findByReferralCode(referralCode: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { referralCode: referralCode.toUpperCase().trim() },
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.userRepository.delete(id);
  }

  async updateByUserId(
    userId: string,
    updateData: Partial<User>,
  ): Promise<void> {
    await this.userRepository.update(userId, updateData);
  }

  async createUser(params: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    walletPublicKey: string;
    walletSecretKeyEncrypted: string;
    referralCode: string;
    referredBy?: string | null;
    role?: UserRole;
  }): Promise<Omit<User, 'password' | 'walletSecretKeyEncrypted'>> {
    const normalizedEmail = params.email.toLowerCase().trim();

    const existingUser = await this.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    if (params.phone) {
      const existingPhone = await this.findByPhone(params.phone);
      if (existingPhone) {
        throw new ConflictException('User with this phone already exists');
      }
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(params.password, saltRounds);

    const user = this.userRepository.create({
      email: normalizedEmail,
      password: hashedPassword,
      firstName: params.firstName || null,
      lastName: params.lastName || null,
      phone: params.phone || null,
      walletPublicKey: params.walletPublicKey,
      walletSecretKeyEncrypted: params.walletSecretKeyEncrypted,
      referralCode: params.referralCode.toUpperCase().trim(),
      referredBy: params.referredBy ?? null,
      role: params.role || UserRole.USER,
      isVerified: false,
    });

    const savedUser = await this.userRepository.save(user);

    const {
      password: _,
      walletSecretKeyEncrypted: __,
      ...userWithoutSecrets
    } = savedUser;
    return userWithoutSecrets;
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

  async update(userId: string, data: Partial<User>): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.update(userId, data);
  }

  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.excludeSecrets(user);
  }

  private excludeSecrets(user: User): ProfileResponseDto {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, walletSecretKeyEncrypted, ...profile } = user;
    return profile as ProfileResponseDto;
  }

  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: Partial<User> = {};

    if (updateProfileDto.firstName !== undefined) {
      updateData.firstName = updateProfileDto.firstName.trim();
    }

    if (updateProfileDto.lastName !== undefined) {
      updateData.lastName = updateProfileDto.lastName.trim();
    }

    if (Object.keys(updateData).length > 0) {
      await this.userRepository.update(userId, updateData);
    }

    const updatedUser = await this.findById(userId);
    return this.excludeSecrets(updatedUser!);
  }

  async deleteProfile(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.delete(userId);
  }
}
