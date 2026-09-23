import { IsEnum, IsOptional, IsString } from 'class-validator';
import { USER_ROLE } from '@poojawala/entities';

export class GoogleAuthDto {
  @IsOptional()
  @IsString()
  credential?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(USER_ROLE)
  intent?: USER_ROLE;
}
