import { IsString, IsNotEmpty, IsDateString } from 'class-validator';

export class CancelExceptionDto {
  @IsString()
  @IsNotEmpty()
  booking_id: string; // Parent booking ID for recurring series

  @IsDateString()
  @IsNotEmpty()
  instance_date: string; // Date of the specific instance to cancel
}
