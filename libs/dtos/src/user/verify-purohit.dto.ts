import { IsEnum, IsNotEmpty, IsString, MaxLength, NotEquals, ValidateIf } from 'class-validator';
import { PUROHIT_VERIFICATION_STATUS } from '@likemyproduct/entities';

export class VerifyPurohitDto {
  @IsEnum(PUROHIT_VERIFICATION_STATUS, {
    message: 'Status must be APPROVED or REJECTED',
  })
  @NotEquals(PUROHIT_VERIFICATION_STATUS.PENDING, {
    message: 'You cannot change verification status to PENDING',
  })
  status!: PUROHIT_VERIFICATION_STATUS;

  @ValidateIf(
    (dto: VerifyPurohitDto) =>
      dto.status === PUROHIT_VERIFICATION_STATUS.REJECTED,
  )
  @IsString()
  @IsNotEmpty({
    message: 'Rejection reason is required when rejecting a Purohit',
  })
  @MaxLength(1000, {
    message: 'Rejection reason cannot exceed 1000 characters',
  })
  rejectionReason?: string;
}