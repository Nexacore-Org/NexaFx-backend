@Column({ type: 'varchar', nullable: true, unique: true })
phoneNumber: string | null;

@Column({ type: 'boolean', default: false })
isPhoneVerified: boolean;