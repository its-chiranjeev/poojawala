import { IsEnum } from 'class-validator';
import { REVIEW_STATUS } from '@poojawala/entities';

export class UpdateReviewStatusDto {
  @IsEnum(REVIEW_STATUS)
  status!: REVIEW_STATUS;
}