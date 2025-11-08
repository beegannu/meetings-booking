export class ConflictInfo {
  booking_id: string;
  start_time: string;
  end_time: string;
}

export class NextAvailableSlot {
  start_time: string;
  end_time: string;
}

export class BookingResponseDto {
  booking_id?: string;
  resource_id: string;
  start_time: string;
  end_time: string;
  recurrence_rule?: string;
  has_conflict?: boolean;
  conflicts?: ConflictInfo[];
  next_available_slots?: NextAvailableSlot[];
  message?: string;
}
