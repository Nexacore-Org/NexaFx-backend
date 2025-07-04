import { IsString, IsEmail, IsEnum, IsOptional, IsDateString, MinLength, Matches } from 'class-validator';
import { AccountType } from '../entities/user.entity';

export class CreateUserDto {
    @IsOptional()
    @IsString()
    firstName?: string;

    @IsOptional()
    @IsString()
    lastName?: string;

    @IsEmail()
    email: string;

    @IsOptional()
    @IsEnum(AccountType)
    accountType?: AccountType;

    @IsString()
    @MinLength(8)
    @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
        message: 'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number or special character',
    })
    password: string;

    @IsOptional()
    @IsDateString()
    dateOfBirth?: Date;

    @IsOptional()
    @IsString()
    phoneNumber?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    profilePicture?: string;

    @IsOptional()
    @IsString()
    bio?: string;
}
