
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE booking_instance 
ADD CONSTRAINT no_overlapping_bookings 
EXCLUDE USING GIST (
  resource_id WITH =,
  tstzrange(start_time, end_time, '[]') WITH &&
) WHERE (is_exception = FALSE);
