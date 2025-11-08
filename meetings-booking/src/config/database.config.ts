import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { BookingSeries } from '../booking/entities/booking-series.entity';
import { BookingInstance } from '../booking/entities/booking-instance.entity';

export const databaseConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'meetings-booking',
  entities: [BookingSeries, BookingInstance],
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
  logging: process.env.DB_LOGGING === 'true',
  migrations: [__dirname + '/../migrations/**/*{.ts,.js}'],
  migrationsRun: false,
  extra: {
    // Connection pool settings (node-postgres/pg pool options)
    max: parseInt(process.env.DB_POOL_MAX || '200', 10), // Maximum connections in pool
    min: parseInt(process.env.DB_POOL_MIN || '20', 10), // Minimum connections to maintain
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10), // Close idle connections after 30s
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '15000', 10), // Wait up to 15s for a connection
    // AllowExitOnIdle: false, // Keep pool alive even when idle (default: false)
  },
};
