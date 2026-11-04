import { IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { LOGIN_PAGE } from '@poojawala/entities';

export class AuthPageQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const normalized = value.trim().replace(/-/g, '_').toUpperCase();
      if (normalized in LOGIN_PAGE) {
        return normalized as LOGIN_PAGE;
      }
    }
    return value;
  })
  @IsEnum(LOGIN_PAGE, {
    message: 'loginPage must be either HOME_PAGE or ADMIN_PAGE',
  })
  loginPage?: LOGIN_PAGE;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const normalized = value.trim().replace(/-/g, '_').toUpperCase();
      if (normalized in LOGIN_PAGE) {
        return normalized as LOGIN_PAGE;
      }
    }
    return value;
  })
  @IsEnum(LOGIN_PAGE, {
    message: 'page must be either HOME_PAGE or ADMIN_PAGE',
  })
  page?: LOGIN_PAGE;
}

