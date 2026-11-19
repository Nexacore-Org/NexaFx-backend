import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';
import { SignupDto } from './signup.dto';
import { ResetPasswordDto } from './reset-password.dto';
import { SetPasswordDto } from './set-password.dto';

describe('Strong password DTO validation', () => {
  it('rejects passwords shorter than 12 chars', async () => {
    const dto = plainToInstance(ChangePasswordDto, {
      oldPassword: 'OldPassword123!',
      newPassword: 'Short1!',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects passwords longer than 72 UTF-8 bytes', async () => {
    const dto = plainToInstance(SignupDto, {
      email: 'trader@nexafx.com',
      password: 'A'.repeat(70) + '😀😀',
      consentGdpr: true,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('accepts valid strong passwords for all DTOs', async () => {
    const valid = 'StrongPass123!';
    const c = await validate(
      plainToInstance(ChangePasswordDto, { oldPassword: 'old', newPassword: valid }),
    );
    const s = await validate(
      plainToInstance(SignupDto, { email: 'a@b.com', password: valid, consentGdpr: true }),
    );
    const r = await validate(
      plainToInstance(ResetPasswordDto, { email: 'a@b.com', otp: '123456', newPassword: valid }),
    );
    const p = await validate(
      plainToInstance(SetPasswordDto, { otp: '123456', newPassword: valid }),
    );
    expect(c.filter((e) => e.property === 'newPassword')).toHaveLength(0);
    expect(s.filter((e) => e.property === 'password')).toHaveLength(0);
    expect(r.filter((e) => e.property === 'newPassword')).toHaveLength(0);
    expect(p.filter((e) => e.property === 'newPassword')).toHaveLength(0);
  });
});
