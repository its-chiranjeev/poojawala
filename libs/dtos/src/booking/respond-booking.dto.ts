import { IsEnum } from 'class-validator';

export enum PUROHIT_BOOKING_ACTION {
  ACCEPT = 'ACCEPT',
  DISMISS = 'DISMISS',
}

export class RespondBookingDto {
  @IsEnum(PUROHIT_BOOKING_ACTION, {
    message: 'Action must be either ACCEPT or DISMISS',
  })
  action!: PUROHIT_BOOKING_ACTION;
}