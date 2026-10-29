import { IsEnum } from 'class-validator';
import { USER_ROLE } from '@poojawala/entities';

export class SwitchIntentDto {
  @IsEnum(USER_ROLE, {
    message: `intent must be one of: ${Object.values(USER_ROLE).join(', ')}`,
  })
  intent!: USER_ROLE;
}
