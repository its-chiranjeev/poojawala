import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BOOKING_MODE } from '@poojawala/entities';

export class CheckServiceAvailabilityDto {
  @IsNotEmpty({ message: 'mode is required' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsEnum(BOOKING_MODE, { message: 'mode must be either ONLINE or OFFLINE' })
  mode!: BOOKING_MODE;

  @ValidateIf((o: CheckServiceAvailabilityDto) => o.mode === BOOKING_MODE.OFFLINE)
  @IsNotEmpty({ message: 'city is required for offline booking' })
  @IsString({ message: 'city must be a string' })
  @MaxLength(100, { message: 'city cannot exceed 100 characters' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  city?: string;

  @IsOptional()
  @IsString({ message: 'state must be a string' })
  @MaxLength(100, { message: 'state cannot exceed 100 characters' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  state?: string;
}
