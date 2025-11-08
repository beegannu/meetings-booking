import { IsString, IsNotEmpty, IsDateString } from 'class-validator';

export class CancelExceptionDto {
  @IsString()
  @IsNotEmpty()
  booking_id: string;

  @IsDateString()
  @IsNotEmpty()
  instance_date: string;
}
