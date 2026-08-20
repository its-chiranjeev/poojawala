import { IsString,Length,Matches } from 'class-validator';

export class VerifyStartOtpDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, {
    message:
      'OTP must contain exactly 6 digits',
  })
  otp!: string;
}