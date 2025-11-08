export class Booking {
  id: string;
  resource_id: string;
  start_time: Date;
  end_time: Date;
  recurrence_rule?: string;
  parent_booking_id?: string; // For recurring series, links instances to parent
  is_exception?: boolean; // True if this instance was skipped/cancelled
  created_at: Date;
  updated_at: Date;
}
