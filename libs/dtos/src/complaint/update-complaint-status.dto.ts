import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { COMPLAINT_STATUS } from '@poojawala/entities';

export class UpdateComplaintStatusDto {
  @IsEnum(COMPLAINT_STATUS, {
    message: `status must be one of: ${Object.values(COMPLAINT_STATUS).join(', ')}`,
  })
  status!: COMPLAINT_STATUS;

  @IsOptional()
  @IsString({ message: 'resolutionNotes must be a string' })
  @MinLength(5, { message: 'resolutionNotes must be at least 5 characters long' })
  @MaxLength(5000, { message: 'resolutionNotes cannot exceed 5000 characters' })
  resolutionNotes?: string;
}
