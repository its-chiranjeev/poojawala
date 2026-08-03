import { USER_ROLE, QUALIFICATION } from '@likemyproduct/entities';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength, registerDecorator, ValidationOptions, ValidationArguments, } from 'class-validator';

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

  @IsEnum(USER_ROLE)
  @IsNotEmpty()
  @Transform(({ value }) => value.toUpperCase())
  role!: USER_ROLE;
}

export class RegisterUserDto extends OtpDto {}

export class RegisterNormalUserDto {
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @MaxLength(15)
  phone?: string;
  
  // @IsOptional()
  // @IsString()
  // @IsNotEmpty()
  // @Transform(({ value }) => value?.trim())
  // otp!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  username!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  lastName!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  password!: string;
  
  @IsOptional()
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

  @IsDateString()
  dob?: string;

  @IsString()
  birthPlace!: string;
}

export class GenerateOtpDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

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
