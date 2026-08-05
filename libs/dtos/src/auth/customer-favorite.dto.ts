import { IsInt } from 'class-validator';

export class CustomerFavoriteDto {
  @IsInt()
  purohitId!: number;
}