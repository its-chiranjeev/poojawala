import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BlogPostStatus } from '@poojawala/entities';

export class CreateBlogPostDto {
  @IsString()
  @IsNotEmpty({ message: 'Blog title is required' })
  @MinLength(3, { message: 'Blog title must be at least 3 characters long' })
  @MaxLength(255, { message: 'Blog title cannot exceed 255 characters' })
  title!: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsString()
  @IsNotEmpty({ message: 'Blog content is required' })
  content!: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsInt({ message: 'categoryId must be an integer' })
  @Min(1, { message: 'categoryId must be valid' })
  @Type(() => Number)
  categoryId!: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
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
