import { Type } from 'class-transformer';
import { IsInt, Min, Max, IsOptional } from 'class-validator';
import { CreateBookingDto } from './create-booking.dto';

export class CreateBookingByAdminDto extends CreateBookingDto {
  @Type(() => Number)
  @IsInt({ message: 'customerId must be an integer' })
  @Min(1, { message: 'customerId must be at least 1' })
  @Max(2147483647, { message: 'customerId cannot exceed 2147483647' })
  customerId!: number;

  // TODO: Previously purohitId was mandatory for manual assignment on admin booking creation:
  // @Type(() => Number)
  // @IsInt()
  // @Min(1)
  // purohitId!: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'purohitId must be an integer' })
  @Min(1, { message: 'purohitId must be at least 1' })
  @Max(2147483647, { message: 'purohitId cannot exceed 2147483647' })
  purohitId?: number;
}
