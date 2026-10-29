import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateTempleServiceDto {
  @Type(() => Number)
  @IsInt({ message: 'Service ID must be an integer' })
  @Min(1, { message: 'Service ID must be greater than 0' })
  id!: number;

  @IsOptional()
  @Transform(({ obj, value }) => {
    const raw = obj?.delete !== undefined ? obj.delete : value;
    if (raw === undefined || raw === null || raw === '') return undefined;
    return raw === 'true' || raw === true;
  })
  @IsBoolean({ message: 'delete must be a boolean' })
  delete?: boolean; //Softdelete Service

  @IsOptional()
  @Transform(({ obj, value }) => {
    const raw = obj?.remove !== undefined ? obj.remove : value;
    if (raw === undefined || raw === null || raw === '') return undefined;
    return raw === 'true' || raw === true;
  })
  @IsBoolean({ message: 'remove must be a boolean' })
  remove?: boolean; //Remove Service (Set Service TempleId Null)
}
