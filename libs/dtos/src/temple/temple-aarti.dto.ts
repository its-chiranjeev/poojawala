import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateTempleAartiDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Aarti name must be a string' })
  @IsNotEmpty({ message: 'Aarti name is required and cannot be empty' })
  @MaxLength(255, { message: 'Aarti name cannot exceed 255 characters' })
  name!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'Aarti slug must be a string' })
  @MaxLength(255, { message: 'Aarti slug cannot exceed 255 characters' })
  slug?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'Aarti time must be a string' })
  @IsNotEmpty({ message: 'Aarti time is required and cannot be empty' })
  @Matches(/^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, {
    message: 'Time must be a valid time in HH:mm or HH:mm:ss format (00:00 to 23:59)',
  })
  time!: string;

  @IsOptional()
  @Transform(({ obj, value }) => {
    const raw = obj?.isActive !== undefined ? obj.isActive : value;
    if (raw === undefined || raw === null || raw === '') return true;
    return raw === 'true' || raw === true;
  })
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}

export class UpdateTempleAartiDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Aarti ID must be an integer' })
  @Min(1, { message: 'Aarti ID must be greater than 0' })
  id?: number;

  @ValidateIf((o) => !o.isDeleted && !o.delete)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Aarti name must be a string' })
  @IsNotEmpty({ message: 'Aarti name is required and cannot be empty' })
  @MaxLength(255, { message: 'Aarti name cannot exceed 255 characters' })
  name!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'Aarti slug must be a string' })
  @MaxLength(255, { message: 'Aarti slug cannot exceed 255 characters' })
  slug?: string;

  @ValidateIf((o) => !o.isDeleted && !o.delete)
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'Aarti time must be a string' })
  @IsNotEmpty({ message: 'Aarti time is required and cannot be empty' })
  @Matches(/^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, {
    message: 'Time must be a valid time in HH:mm or HH:mm:ss format (00:00 to 23:59)',
  })
  time!: string;


  @IsOptional()
  @Transform(({ obj, value }) => {
    const raw = obj?.isActive !== undefined ? obj.isActive : value;
    if (raw === undefined || raw === null || raw === '') return undefined;
    return raw === 'true' || raw === true;
  })
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    return value === 'true' || value === true;
  })
  @IsBoolean({ message: 'isDeleted must be a boolean' })
  isDeleted?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    return value === 'true' || value === true;
  })
  @IsBoolean({ message: 'delete must be a boolean' })
  delete?: boolean;
}
