async create(userId: string, createDto: any) {
  const user = await this.usersService.findById(userId);
  const threshold = this.configService.get<number>('SMS_CONFIRMATION_THRESHOLD_USD', 1000);

  if (createDto.amountUsd > threshold && user.isPhoneVerified) {
    const pendingTxn = await this.txnRepository.createPending({ ...createDto, userId, status: 'PENDING_SMS' });
    await this.smsService.sendOtp(user.phoneNumber, 'txn-confirm');
    
    return {
      requiresSmsConfirmation: true,
      transactionId: pendingTxn.id,
    };
  }
  return this.executeTransactionDirectly(createDto, userId);
}

async confirmSmsTransaction(userId: string, txnId: string, otp: string) {
  const user = await this.usersService.findById(userId);
  const txn = await this.txnRepository.findById(txnId);

  if (!txn || txn.userId !== userId || txn.status !== 'PENDING_SMS') {
    throw new UnauthorizedException('Action unauthorized or invalid transaction state.');
  }

  const isValid = await this.smsService.verifyAndConsumeOtp(user.phoneNumber, otp, 'txn-confirm');
  if (!isValid) {
    throw new BadRequestException('Transaction OTP challenge failed or expired.');
  }

  return this.executeTransactionDirectly(txn.data, userId, txnId);
}