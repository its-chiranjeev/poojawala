import { USER_ROLE, QUALIFICATION, PUROHIT_PAYMENT_METHOD } from '@poojawala/entities';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength, registerDecorator, ValidationOptions, ValidationArguments, ValidateIf, IsNumber } from 'class-validator';

export class OtpDto {
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @MaxLength(15)
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  countryCode?: string;

  @IsEnum(USER_ROLE)
  @IsNotEmpty()
  @Transform(({ value }) => value.toUpperCase())
  role!: USER_ROLE;
}

export class RegisterUserDto extends OtpDto { }

export class RegisterNormalUserDto {
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => value ? Number(value) : undefined)
  id?: number;

  @ValidateIf(o => !o.id)
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @MaxLength(15)
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  countryCode?: string;

  // @IsOptional()
  // @IsString()
  // @IsNotEmpty()
  // @Transform(({ value }) => value?.trim())
  // otp!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  username?: string;

  @ValidateIf(o => !o.id)
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  firstName!: string;

  @ValidateIf(o => !o.id)
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  lastName!: string;

  @ValidateIf(o => !o.id)
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  password!: string;

  @ValidateIf(o => !o.id)
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  @Match('password', { message: 'Passwords do not match' })
  confirmPassword!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  bio?: string;

  @IsOptional()
  @IsEnum(QUALIFICATION)
  qualification?: QUALIFICATION;

  @IsOptional()
  experienceYears?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  aadhaarNumber?: string;

  @IsOptional()
  @IsString()
  aadhaarDoc?: string;

  @IsOptional()
  @IsString()
  panDoc?: string;

  @IsOptional()
  @IsString()
  certificate?: string;

  @IsOptional()
  @IsString()
  templeAffiliationProof?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  city?: string;

  @IsOptional()
  languages?: string[];

  @IsOptional()
  isOnlineAvailable?: string;

  @IsOptional()
  isOfflineAvailable?: string;

  @IsOptional()
  specializations?: string[];

  @ValidateIf(o => !o.id)
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  birthPlace?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  accountHolderName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  ifscCode?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  bankName?: string;

  @IsOptional()
  @IsEnum(PUROHIT_PAYMENT_METHOD)
  paymentMethod?: PUROHIT_PAYMENT_METHOD;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  upiId?: string;
}

export class GenerateOtpDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  countryCode?: string;

  @IsEnum(USER_ROLE)
  role!: USER_ROLE;
}

export class resetPasswordDto {
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @MaxLength(15)
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  countryCode?: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  otp!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  password!: string;


}

export class forgotPasswordDto {
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @MaxLength(15)
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  countryCode?: string;
}

export function Match(property: string, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'match',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as any)[relatedPropertyName];
          return value === relatedValue;
        },
        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          return `${args.property} must match ${relatedPropertyName}`;
        },
      },
    });
  };
}
