import { Type } from 'class-transformer';
import { IsInt, Min, Max } from 'class-validator';

export class CustomerFavoriteDto {
  @Type(() => Number)
  @IsInt({ message: 'purohitId must be an integer' })
  @Min(1, { message: 'purohitId must be at least 1' })
  @Max(2147483647, { message: 'purohitId cannot exceed 2147483647' })
  purohitId!: number;
}
