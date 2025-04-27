import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,OneToMany } from 'typeorm';
import { Token } from '../../auth/entities/token.entity';

export enum AccountType {
    PERSONAL = 'Personal',
    BUSINESS = 'Business',
}

export enum UserRole {
    USER = 'User',
    ADMIN = 'Admin',
    AUDITOR ='Auditor'
}

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    firstName: string;

    @Column()
    lastName: string;

    @Column({ unique: true })
    email: string;

    @Column({
        type: 'enum',
        enum: AccountType,
        default: AccountType.PERSONAL,
    })
    accountType: AccountType;

    @Column()
    password: string;

    @Column({ nullable: true })
    dateOfBirth: Date;

    @Column({ nullable: true })
    phoneNumber: string;

    @Column({ nullable: true })
    address: string;

    @Column({ nullable: true })
    profilePicture: string;

    @Column({ nullable: true })
    bio: string;

    @Column({ default: false })
    isVerified: boolean;

    @Column({ nullable: true })
    passwordResetToken: string; 

    @Column({ nullable: true })
    passwordResetExpires: Date;

    @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
    role: UserRole; 

    @Column({ nullable: true })
    lastLogin: Date; 

    @OneToMany(() => Token, (token) => token.user, { cascade: true })
    tokens: Token[]; 

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
 
