import { IsEnum } from 'class-validator';
import { BOOKING_STATUS } from '@poojawala/entities';

export class UpdateBookingStatusDto {
  @IsEnum(BOOKING_STATUS, {
    message: `status must be one of: ${Object.values(BOOKING_STATUS).join(', ')}`,
  })
  status!: BOOKING_STATUS;
}
