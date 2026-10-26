import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTempleDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Temple name must be a string' })
  @IsNotEmpty({ message: 'Temple name is required and cannot be empty' })
  @MaxLength(255, { message: 'Temple name cannot exceed 255 characters' })
  name!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'metaTitle must be a string' })
  @MaxLength(255, { message: 'metaTitle cannot exceed 255 characters' })
  metaTitle?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'metaDescription must be a string' })
  metaDescription?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.trim() === '' ? undefined : value.trim();
    }
    return undefined;
  })
  @IsString({ message: 'Image URL must be a string' })
  @MaxLength(255, { message: 'Image URL cannot exceed 255 characters' })
  imageUrl?: string;

  @IsOptional()
  image?: any;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'Address must be a string' })
  address?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'City must be a string' })
  @MaxLength(100, { message: 'City cannot exceed 100 characters' })
  city?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'State must be a string' })
  @MaxLength(100, { message: 'State cannot exceed 100 characters' })
  state?: string;

  @IsOptional()
  @Transform(({ obj, value }) => {
    const raw = obj?.isActive !== undefined ? obj.isActive : value;
    if (raw === undefined || raw === null || raw === '') return true;
    return raw === 'true' || raw === true;
  })
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}
