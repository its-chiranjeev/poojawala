import { IsEnum } from 'class-validator';
import { REVIEW_STATUS } from '@poojawala/entities';

export class UpdateReviewStatusDto {
  @IsEnum(REVIEW_STATUS, {
    message: `status must be one of: ${Object.values(REVIEW_STATUS).join(', ')}`,
  })
  status!: REVIEW_STATUS;
}
