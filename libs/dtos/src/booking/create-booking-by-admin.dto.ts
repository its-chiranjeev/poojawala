import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { CreateBookingDto } from './create-booking.dto';

export class CreateBookingByAdminDto extends CreateBookingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  purohitId!: number;
}
