import { IsString, Length, Matches } from 'class-validator';

export class VerifyStartOtpDto {
  @IsString({ message: 'OTP must be a string' })
  @Length(6, 6, { message: 'OTP must be exactly 6 characters' })
  @Matches(/^\d{6}$/, {
    message: 'OTP must contain exactly 6 digits',
  })
  otp!: string;
}
