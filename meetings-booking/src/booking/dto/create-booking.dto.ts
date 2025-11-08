import { IsString, IsNotEmpty, IsDateString, IsOptional, ValidateIf } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  resource_id: string;

  @IsDateString()
  @IsNotEmpty()
  start_time: string;

  @IsDateString()
  @IsNotEmpty()
  end_time: string;

  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.recurrence_rule !== undefined && o.recurrence_rule !== null)
  recurrence_rule?: string;
}
