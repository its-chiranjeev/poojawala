import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PLATFORM_SETTING_KEY } from '@likemyproduct/entities';

export class UpsertPlatformSettingDto {
  @IsEnum(PLATFORM_SETTING_KEY)
  key!: PLATFORM_SETTING_KEY;

  @IsString()
  @IsNotEmpty()
  value!: string;

  @IsOptional()
  @IsString()
  description?: string;
}