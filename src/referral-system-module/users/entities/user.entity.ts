// In src/users/entities/user.entity.ts

import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';

@Entity('users')
export class User {
  // ... existing user fields
  
  @Column({ name: 'referred_by_id', nullable: true })
  referredById: string;
  
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'referred_by_id' })
  referredBy: User;
}


// ## Integration with User Registration

// Here's how to integrate the referral system with your existing user registration:


// In your user service or auth service:

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private referralsService: ReferralsService,
    // ... other dependencies
  ) {}
  
  async register(registerDto: RegisterDto): Promise<User> {
    // Create the user first
    const user = await this.usersService.create({
      email: registerDto.email,
      password: registerDto.password,
      // ... other user fields
    });
    
    // If there's a referral code, process it
    if (registerDto.referralCode) {
      try {
        // Validate and use the referral code
        const useReferralDto = new UseReferralDto();
        useReferralDto.code = registerDto.referralCode;
        useReferralDto.referredUserId = user.id;
        
        const referral = await this.referralsService.useReferralCode(useReferralDto);
        
        // Update the user with the referrer information
        user.referredById = referral.referrerUserId;
        await this.usersService.update(user.id, { referredById: referral.referrerUserId });
      } catch (error) {
        // Log the error but don't fail the registration
        console.error('Failed to process referral code:', error.message);
      }
    }
    
    return user;
  }
}


// ## Update RegisterDto


// In your auth/dto/register.dto.ts

import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongP@ssw0rd' })
  @IsString()
  @MinLength(8)
  password: string;
  
  // ... other fields
  
  @ApiProperty({ 
    example: 'abc123', 
    description: 'Optional referral code',
    required: false 
  })
  @IsOptional()
  @IsString()
  referralCode?: string;
}