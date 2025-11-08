import { IsString, IsNotEmpty, IsDateString } from 'class-validator';

export class AvailabilityQueryDto {
  @IsString()
  @IsNotEmpty()
  resource_id: string;

  @IsDateString()
  @IsNotEmpty()
  start_date: string;

  @IsDateString()
  @IsNotEmpty()
  end_date: string;
}
