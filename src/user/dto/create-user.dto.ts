import { IsString, IsEmail, IsEnum, IsOptional, IsDateString, MinLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountType } from '../entities/user.entity';

export class CreateUserDto {
    @ApiProperty({ example: 'John' })
    @IsOptional()
    @IsString()
    firstName?: string;

    @ApiProperty({ example: 'Doe' })
    @IsOptional()
    @IsString()
    lastName?: string;

    @ApiProperty({ example: 'john.doe@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ enum: AccountType, example: AccountType.PERSONAL })
    @IsOptional()
    @IsEnum(AccountType)
    accountType?: AccountType;

    @ApiProperty({ example: 'StrongPassword123!' })
    @IsString()
    @MinLength(8)
    @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
        message: 'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number or special character',
    })
    password: string;

    @ApiPropertyOptional({ example: '1990-01-01' })
    @IsOptional()
    @IsDateString()
    dateOfBirth?: Date;

    @ApiPropertyOptional({ example: '+1234567890' })
    @IsString()
    phoneNumber?: string;

    @ApiPropertyOptional({ example: '123 Main St, City, Country' })
    @IsOptional()
    @IsString()
    address?: string;

    @ApiPropertyOptional({ example: 'https://example.com/profile.jpg' })
    @IsOptional()
    @IsString()
    profilePicture?: string;

    @ApiPropertyOptional({ example: 'A short bio about the user.' })
    @IsOptional()
    @IsString()
    bio?: string;
}
