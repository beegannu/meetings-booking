import { IsString, IsNotEmpty } from 'class-validator';

export class AvailabilityQueryDto {
  @IsString()
  @IsNotEmpty()
  resource_id: string;

  @IsString()
  @IsNotEmpty()
  start_date: string;

  @IsString()
  @IsNotEmpty()
  end_date: string;
}
