import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { USER_ROLE, USER_STATUS, PUROHIT_VERIFICATION_STATUS } from '@poojawala/entities';

export class GetAllUsersDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(USER_ROLE)
  role?: USER_ROLE;

  @IsOptional()
  @IsEnum(USER_STATUS)
  status?: USER_STATUS;

  @IsOptional()
  @IsEnum(PUROHIT_VERIFICATION_STATUS)
  verificationStatus?: PUROHIT_VERIFICATION_STATUS;

  @IsOptional()
  @Transform(({ value }) => value === undefined ? undefined : (value === 'true' || value === true))
  isOfflineAvailable?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === undefined ? undefined : (value === 'true' || value === true))
  isOnlineAvailable?: boolean;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  serviceId?: number;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'username', 'email'])
  sortBy: string = 'createdAt';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order: 'ASC' | 'DESC' = 'DESC';
}
