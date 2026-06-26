@UseGuards(JwtAuthGuard)
@Post('me/phone')
async registerPhone(@Req() req, @Body() dto: RegisterPhoneDto) {
  await this.usersService.update(req.user.userId, { phoneNumber: dto.phoneNumber, isPhoneVerified: false });
  await this.smsService.sendOtp(dto.phoneNumber, 'phone-verify');
  return { message: 'Verification OTP dispatched successfully via SMS.' };
}

@UseGuards(JwtAuthGuard)
@Post('me/phone/verify')
async verifyPhone(@Req() req, @Body() dto: VerifyOtpDto) {
  const user = await this.usersService.findById(req.user.userId);
  if (!user || !user.phoneNumber) {
    throw new BadRequestException('No active phone registry found for this user.');
  }

  const isValid = await this.smsService.verifyAndConsumeOtp(user.phoneNumber, dto.otp, 'phone-verify');
  if (!isValid) {
    throw new BadRequestException('The OTP provided is invalid or has expired.');
  }

  await this.usersService.update(user.userId, { isPhoneVerified: true });
  return { success: true, message: 'Phone verification cleared successfully.' };
}