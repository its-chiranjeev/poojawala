import { IsEnum } from 'class-validator';
import { BOOKING_STATUS } from '@poojawala/entities';

export class UpdateBookingStatusDto {
  @IsEnum(BOOKING_STATUS)
  status!: BOOKING_STATUS;
}