import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateContactUsDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(150)
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  subject!: string;

  @IsNotEmpty()
  @IsString()
  message!: string;
}
