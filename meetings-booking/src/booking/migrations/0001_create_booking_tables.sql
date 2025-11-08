-- Create booking_series table
CREATE TABLE IF NOT EXISTS booking_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id VARCHAR(255) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    recurrence_rule TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create booking_instance table
CREATE TABLE IF NOT EXISTS booking_instance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    series_id UUID REFERENCES booking_series(id) ON DELETE CASCADE,
    resource_id VARCHAR(255) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    is_exception BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_booking_series_resource ON booking_series(resource_id);
CREATE INDEX IF NOT EXISTS idx_booking_series_time_range ON booking_series(resource_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_booking_series_recurrence ON booking_series(recurrence_rule) WHERE recurrence_rule IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_booking_instance_resource ON booking_instance(resource_id);
CREATE INDEX IF NOT EXISTS idx_booking_instance_time_range ON booking_instance(resource_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_booking_instance_series ON booking_instance(series_id) WHERE series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_instance_exceptions ON booking_instance(series_id, start_time) WHERE is_exception = TRUE;

-- GIST index for range queries (requires btree_gist extension)
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE INDEX IF NOT EXISTS idx_booking_instance_time_gist ON booking_instance USING GIST (
    resource_id,
    tstzrange(start_time, end_time, '[]')
) WHERE is_exception = FALSE;

-- Add updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers
CREATE TRIGGER update_booking_series_updated_at
    BEFORE UPDATE ON booking_series
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_booking_instance_updated_at
    BEFORE UPDATE ON booking_instance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
    