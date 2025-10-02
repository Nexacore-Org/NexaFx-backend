import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, VerificationStatus } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { FindUserByEmail } from './find-user.service';
import { FindUserByPhone } from './find-user-by-phone.service';
import { PasswordHashingService } from 'src/auth/services/passwod.hashing.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { GetProfileResponseDto } from '../dto/get-profile-response.dto';
import { RequiredFieldsResponseDto } from '../dto/required-fields-response.dto';
import { InitiateVerificationDto } from '../dto/initiate-verification.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { ProfileProgressService } from '../services/profile-progress.service';
import { SmsService } from 'src/common/services/sms.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly findUserByEmail: FindUserByEmail,
    private readonly findUserByPhone: FindUserByPhone,
    private readonly passwordService: PasswordHashingService,
    private readonly eventEmitter: EventEmitter2,
    private readonly profileProgressService: ProfileProgressService,
    private readonly smsService: SmsService,
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

  // Profile & Verification APIs

  async getProfile(userId: string): Promise<GetProfileResponseDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.calculateProfileCompletion(user);
    return this.transformUserToDto(user);
  }

  async updateProfile(
    userId: string,
    updateDto: UpdateProfileDto,
  ): Promise<GetProfileResponseDto> {
    if ((updateDto as any).email) {
      throw new BadRequestException('Email cannot be updated. This field is immutable.');
    }
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    Object.assign(user, updateDto);
    await this.calculateProfileCompletion(user);
    const updated = await this.userRepository.save(user);
    this.eventEmitter.emit('profile.updated', { userId: user.id });
    return this.transformUserToDto(updated);
  }

  async calculateProfileCompletion(user: User): Promise<number> {
    const percentage = this.profileProgressService.calculateCompletion(user);
    user.profileCompletionPercentage = percentage;
    user.requiredFieldsCompleted = percentage === 100;
    await this.userRepository.save(user);
    return percentage;
  }

  async getRequiredFields(userId: string): Promise<RequiredFieldsResponseDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const details = this.profileProgressService.getProgressDetails(user);
    return {
      requiredFields: this.profileProgressService.getRequiredFields(),
      missingFields: details.missingFields,
      completionPercentage: details.percentage,
      canInitiateVerification: this.profileProgressService.canInitiateVerification(user),
    };
  }

  async sendPhoneVerificationCode(userId: string, phoneNumber: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Rate limit: max 3 per hour
    const now = new Date();
    if (user.phoneVerificationAttempts >= 3 && user.phoneVerificationCodeExpiry && user.phoneVerificationCodeExpiry > new Date(now.getTime() - 60 * 60 * 1000)) {
      throw new BadRequestException('Too many verification attempts. Please try again later.');
    }

    // Update phone number if changed
    if (user.phoneNumber !== phoneNumber) {
      user.phoneNumber = phoneNumber;
      user.isPhoneVerified = false;
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashed = await bcrypt.hash(code, 10);
    user.phoneVerificationCode = hashed;
    user.phoneVerificationCodeExpiry = new Date(now.getTime() + 10 * 60 * 1000);
    user.phoneVerificationAttempts = (user.phoneVerificationAttempts || 0) + 1;
    await this.userRepository.save(user);

    this.eventEmitter.emit('phone.verification_code.sent', { userId: user.id, phoneNumber });
    void this.smsService.sendVerificationCode(phoneNumber, code);
  }

  async confirmPhoneVerification(userId: string, code: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.phoneVerificationCode || !user.phoneVerificationCodeExpiry) {
      throw new BadRequestException('No active verification code');
    }
    if (user.phoneVerificationCodeExpiry < new Date()) {
      throw new BadRequestException('Verification code has expired');
    }
    const valid = await bcrypt.compare(code, user.phoneVerificationCode);
    if (!valid) {
      throw new UnauthorizedException('Invalid verification code');
    }
    user.isPhoneVerified = true;
    user.phoneVerificationCode = null;
    user.phoneVerificationCodeExpiry = null;
    user.phoneVerificationAttempts = 0;
    await this.userRepository.save(user);
    this.eventEmitter.emit('phone.verified', { userId: user.id });
    return true;
  }

  async initiateVerification(userId: string, dto: InitiateVerificationDto): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.profileCompletionPercentage !== 100 || !user.requiredFieldsCompleted) {
      throw new BadRequestException('Profile is incomplete');
    }
    if (!user.isPhoneVerified) {
      throw new BadRequestException('Phone number not verified');
    }

    user.verificationStatus = VerificationStatus.PENDING;
    user.verificationRequestedAt = new Date();
    user.verificationDocuments = {
      idDocument: { url: dto.idDocumentUrl, uploadedAt: new Date().toISOString(), status: 'submitted' },
      proofOfAddress: { url: dto.proofOfAddressUrl, uploadedAt: new Date().toISOString(), status: 'submitted' },
    };
    await this.userRepository.save(user);
    this.eventEmitter.emit('verification.initiated', { userId: user.id });
  }

  async getVerificationStatus(userId: string): Promise<{
    verificationStatus: VerificationStatus;
    requestedAt: Date | null;
    completedAt: Date | null;
    rejectionReason: string | null;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return {
      verificationStatus: user.verificationStatus,
      requestedAt: user.verificationRequestedAt || null,
      completedAt: user.verificationCompletedAt || null,
      rejectionReason: user.verificationRejectionReason || null,
    };
  }

  // Admin methods
  async getPendingVerifications(page: number, limit: number): Promise<any> {
    const [users, total] = await this.userRepository.findAndCount({
      where: { verificationStatus: VerificationStatus.PENDING },
      order: { verificationRequestedAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: users.map((u) => ({
        id: u.id,
        fullName: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
        email: u.email,
        phoneNumber: u.phoneNumber,
        verificationRequestedAt: u.verificationRequestedAt,
        documents: u.verificationDocuments,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getVerificationDetails(userId: string): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        dateOfBirth: user.dateOfBirth,
        address: user.address,
        isPhoneVerified: user.isPhoneVerified,
      },
      verification: {
        status: user.verificationStatus,
        requestedAt: user.verificationRequestedAt,
        completedAt: user.verificationCompletedAt,
        rejectionReason: user.verificationRejectionReason,
        documents: user.verificationDocuments,
      },
    };
  }

  async approveVerification(userId: string, notes?: string): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.verificationStatus !== VerificationStatus.PENDING) {
      throw new BadRequestException('User is not in pending verification status');
    }
    user.verificationStatus = VerificationStatus.VERIFIED;
    user.isVerified = true;
    user.verificationCompletedAt = new Date();
    await this.userRepository.save(user);
    this.eventEmitter.emit('verification.approved', { userId: user.id });
    if (user.phoneNumber) {
      void this.smsService.sendVerificationCode(user.phoneNumber, '');
    }
    return {
      message: 'User verification approved successfully',
      user: { id: user.id, verificationStatus: user.verificationStatus, isVerified: user.isVerified },
    };
  }

  async rejectVerification(userId: string, reason: string): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.verificationStatus !== VerificationStatus.PENDING) {
      throw new BadRequestException('User is not in pending verification status');
    }
    user.verificationStatus = VerificationStatus.REJECTED;
    user.verificationRejectionReason = reason;
    user.isVerified = false;
    await this.userRepository.save(user);
    this.eventEmitter.emit('verification.rejected', { userId: user.id, reason });
    return {
      message: 'User verification rejected',
      user: { id: user.id, verificationStatus: user.verificationStatus, rejectionReason: reason },
    };
  }

  private transformUserToDto(user: User): GetProfileResponseDto {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isPhoneVerified: user.isPhoneVerified,
      dateOfBirth: user.dateOfBirth,
      address: user.address,
      profilePicture: user.profilePicture,
      bio: user.bio,
      verificationStatus: user.verificationStatus,
      profileCompletionPercentage: user.profileCompletionPercentage,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    };
  }
}
