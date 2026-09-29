import { Type } from 'class-transformer';
import { IsInt, Min, IsOptional } from 'class-validator';
import { CreateBookingDto } from './create-booking.dto';

export class CreateBookingByAdminDto extends CreateBookingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId!: number;

  // TODO: Previously purohitId was mandatory for manual assignment on admin booking creation:
  // @Type(() => Number)
  // @IsInt()
  // @Min(1)
  // purohitId!: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  purohitId?: number;
}
