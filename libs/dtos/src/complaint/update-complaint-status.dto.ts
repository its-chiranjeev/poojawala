import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { COMPLAINT_STATUS } from '@likemyproduct/entities';

export class UpdateComplaintStatusDto {
  @IsEnum(COMPLAINT_STATUS)
  status!: COMPLAINT_STATUS;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  resolutionNotes?: string;
}