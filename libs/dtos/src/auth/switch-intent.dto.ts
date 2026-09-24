import { IsEnum } from 'class-validator';
import { USER_ROLE } from '@poojawala/entities';

export class SwitchIntentDto {
  @IsEnum(USER_ROLE)
  intent!: USER_ROLE;
}
