import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { CONTACT_US_STATUS } from '@poojawala/entities';

export class UpdateContactUsStatusDto {
  @IsNotEmpty()
  @IsEnum(CONTACT_US_STATUS)
  status!: CONTACT_US_STATUS;

  @IsNotEmpty({ message: 'Message is required' })
  @IsString({ message: 'Message must be a string' })
  message!: string;
}
