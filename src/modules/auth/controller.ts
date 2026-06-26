@Post('2fa/sms-fallback')
@UseGuards(JwtAuthGuard)
async triggerSmsFallback(@Req() req) {
  const user = await this.usersService.findById(req.user.userId);
  if (!user || !user.phoneNumber || !user.isPhoneVerified) {
    throw new BadRequestException('SMS fallback unapproved or verified phone number missing.');
  }
  await this.smsService.sendOtp(user.phoneNumber, '2fa');
  return { message: '2FA authentication challenge code transmitted.' };
}