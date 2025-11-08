export class TimeSlot {
  start_time: string;
  end_time: string;
}

export class AvailabilityResponseDto {
  resource_id: string;
  start_date: string;
  end_date: string;
  available_slots: TimeSlot[];
}
