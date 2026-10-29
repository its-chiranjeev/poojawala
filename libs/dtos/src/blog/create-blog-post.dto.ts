import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { Transform, Type, plainToInstance } from 'class-transformer';
import { BlogPostStatus } from '@poojawala/entities';

export class BlogPostSectionDto {
  @IsString({ message: 'Section title must be a string' })
  @IsNotEmpty({ message: 'Section title cannot be empty' })
  title!: string;

  @IsString({ message: 'Section description must be a string' })
  @IsNotEmpty({ message: 'Section description cannot be empty' })
  description!: string;
}

export class CreateBlogPostDto {
  @IsString()
  @IsNotEmpty({ message: 'Blog title is required' })
  @MinLength(3, { message: 'Blog title must be at least 3 characters long' })
  @MaxLength(255, { message: 'Blog title cannot exceed 255 characters' })
  title!: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  // TODO: BLOG_POST_SECTIONS_MIGRATION
  // Legacy content field made optional. sections[] is now the primary source of truth for the blog body.
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === 'null' || value === '') return null;
    if (value === undefined || value === 'undefined') return undefined;
    const num = Number(value);
    return isNaN(num) ? value : num;
  })
  @ValidateIf((object, value) => value !== null && value !== undefined)
  @IsInt({ message: 'categoryId must be an integer' })
  @Min(1, { message: 'categoryId must be valid' })
  @Max(2147483647, { message: 'categoryId cannot exceed 2147483647' })
  categoryId?: number | null;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Author name must be a string' })
  @IsNotEmpty({ message: 'Author name cannot be empty' })
  @MaxLength(150, { message: 'Author name cannot exceed 150 characters' })
  authorName!: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === 'null') return null;
    if (value === undefined || value === 'undefined') return undefined;
    return typeof value === 'string' ? value.trim() : value;
  })
  @ValidateIf((object, value) => value !== null && value !== undefined)
  @IsString({ message: 'category must be a string' })
  @MaxLength(100, { message: 'category cannot exceed 100 characters' })
  category?: string | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === 'null' || value === '') return null;
    if (value === undefined || value === 'undefined') return undefined;
    const num = Number(value);
    return isNaN(num) ? value : num;
  })
  @ValidateIf((object, value) => value !== null && value !== undefined)
  @IsInt({ message: 'readTime must be an integer' })
  @Min(1, { message: 'readTime must be at least 1 minute' })
  @Max(10080, { message: 'readTime cannot exceed 10080 minutes' })
  readTime?: number | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === 'undefined') return undefined;
    if (value === null || value === '' || value === 'null') return [];
    let parsed = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new BadRequestException('Invalid JSON format for sections');
      }
    }
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('sections must be an array');
    }
    return parsed.map((item: unknown) =>
      typeof item === 'object' && item !== null
        ? plainToInstance(BlogPostSectionDto, item)
        : item,
    );
  })
  @IsArray({ message: 'sections must be an array' })
  @ValidateNested({ each: true })
  @Type(() => BlogPostSectionDto)
  sections?: BlogPostSectionDto[];

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === 'undefined') return undefined;
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value;
  })
  @IsBoolean({ message: 'isFeatured must be a boolean' })
  isFeatured?: boolean;

  @IsOptional()
  @IsEnum(BlogPostStatus, { message: 'status must be either DRAFT or PUBLISHED' })
  status?: BlogPostStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'metaTitle cannot exceed 255 characters' })
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;
}
