import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PLATFORM_SETTING_KEY } from '@poojawala/entities';

export class UpsertPlatformSettingDto {
  @IsEnum(PLATFORM_SETTING_KEY, {
    message: `key must be one of: ${Object.values(PLATFORM_SETTING_KEY).join(', ')}`,
  })
  key!: PLATFORM_SETTING_KEY;

  @IsString({ message: 'value must be a string' })
  @IsNotEmpty({ message: 'value is required' })
  value!: string;

  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @MaxLength(500, { message: 'description cannot exceed 500 characters' })
  description?: string;
}
