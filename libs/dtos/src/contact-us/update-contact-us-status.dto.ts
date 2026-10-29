import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { CONTACT_US_STATUS } from '@poojawala/entities';

export class UpdateContactUsStatusDto {
  @IsNotEmpty({ message: 'status is required' })
  @IsEnum(CONTACT_US_STATUS, {
    message: `status must be one of: ${Object.values(CONTACT_US_STATUS).join(', ')}`,
  })
  status!: CONTACT_US_STATUS;

  @IsNotEmpty({ message: 'Message is required' })
  @IsString({ message: 'Message must be a string' })
  message!: string;
}
