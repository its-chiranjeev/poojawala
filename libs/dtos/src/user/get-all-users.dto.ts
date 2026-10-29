import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { USER_ROLE, USER_STATUS, PUROHIT_VERIFICATION_STATUS } from '@poojawala/entities';

export class GetAllUsersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit: number = 10;

  @IsOptional()
  @IsString({ message: 'Search must be a string' })
  @MaxLength(100, { message: 'Search cannot exceed 100 characters' })
  search?: string;

  @IsOptional()
  @IsEnum(USER_ROLE, { message: `role must be one of: ${Object.values(USER_ROLE).join(', ')}` })
  role?: USER_ROLE;

  @IsOptional()
  @IsEnum(USER_STATUS, { message: `status must be one of: ${Object.values(USER_STATUS).join(', ')}` })
  status?: USER_STATUS;

  @IsOptional()
  @IsEnum(PUROHIT_VERIFICATION_STATUS, {
    message: `verificationStatus must be one of: ${Object.values(PUROHIT_VERIFICATION_STATUS).join(', ')}`,
  })
  verificationStatus?: PUROHIT_VERIFICATION_STATUS;

  @IsOptional()
  @Transform(({ value }) => value === undefined ? undefined : (value === 'true' || value === true))
  isOfflineAvailable?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === undefined ? undefined : (value === 'true' || value === true))
  isOnlineAvailable?: boolean;

  @IsOptional()
  @IsString({ message: 'City must be a string' })
  @MaxLength(100, { message: 'City cannot exceed 100 characters' })
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'serviceId must be an integer' })
  @Min(1, { message: 'serviceId must be at least 1' })
  @Max(2147483647, { message: 'serviceId cannot exceed 2147483647' })
  serviceId?: number;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'username', 'email'], {
    message: 'sortBy must be createdAt, updatedAt, username, or email',
  })
  sortBy: string = 'createdAt';

  @IsOptional()
  @IsIn(['ASC', 'DESC'], { message: 'order must be ASC or DESC' })
  order: 'ASC' | 'DESC' = 'DESC';
}
