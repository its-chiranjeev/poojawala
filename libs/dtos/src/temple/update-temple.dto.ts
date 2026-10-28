import { Transform, Type, plainToInstance } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { UpdateTempleAartiDto } from './temple-aarti.dto';

export class UpdateTempleDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Temple name must be a string' })
  @IsNotEmpty({ message: 'Temple name cannot be empty' })
  @MaxLength(255, { message: 'Temple name cannot exceed 255 characters' })
  name?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'Slug must be a string' })
  @MaxLength(255, { message: 'Slug cannot exceed 255 characters' })
  slug?: string;

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
  image?: unknown;

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
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'Primary deity must be a string' })
  @MaxLength(255, { message: 'Primary deity cannot exceed 255 characters' })
  primaryDeity?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'Trust name must be a string' })
  @MaxLength(255, { message: 'Trust name cannot exceed 255 characters' })
  trustName?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'Contact name must be a string' })
  @MaxLength(255, { message: 'Contact name cannot exceed 255 characters' })
  contactName?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'Phone must be a string' })
  @MaxLength(50, { message: 'Phone cannot exceed 50 characters' })
  phone?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim().toLowerCase()) : value,
  )
  @ValidateIf((o) => o.email !== null && o.email !== undefined && o.email !== '')
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @MaxLength(255, { message: 'Email cannot exceed 255 characters' })
  email?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @ValidateIf((o) => o.openingTime !== null && o.openingTime !== undefined && o.openingTime !== '')
  @Matches(/^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, {
    message: 'Opening time must be a valid time in HH:mm or HH:mm:ss format',
  })
  openingTime?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @ValidateIf((o) => o.closingTime !== null && o.closingTime !== undefined && o.closingTime !== '')
  @Matches(/^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, {
    message: 'Closing time must be a valid time in HH:mm or HH:mm:ss format',
  })
  closingTime?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'Trust registration number must be a string' })
  @MaxLength(100, { message: 'Trust registration number cannot exceed 100 characters' })
  trustRegNo?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'Trust document URL must be a string' })
  trustDocUrl?: string;

  @IsOptional()
  trustDoc?: unknown;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString({ message: 'Deity photo URL must be a string' })
  deityPhotoUrl?: string;

  @IsOptional()
  deityPhoto?: unknown;

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
    let parsed = value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return undefined;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
    if (Array.isArray(parsed)) {
      return parsed.map((item) => {
        if (item && typeof item === 'object') {
          const itemObj = { ...(item as Record<string, unknown>) };
          delete itemObj.description;
          return !(item instanceof UpdateTempleAartiDto)
            ? plainToInstance(UpdateTempleAartiDto, itemObj)
            : item;
        }
        return item;
      });
    }
    return parsed;
  })
  @IsArray({ message: 'aartis must be an array' })
  @ValidateNested({ each: true })
  @Type(() => UpdateTempleAartiDto)
  aartis?: UpdateTempleAartiDto[];
}
