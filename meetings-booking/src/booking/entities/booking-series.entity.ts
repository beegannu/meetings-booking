import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { BookingInstance } from './booking-instance.entity';

@Entity('booking_series')
@Index(['resource_id'])
@Index(['resource_id', 'start_time', 'end_time'])
export class BookingSeries {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  resource_id: string;

  @Column({ type: 'timestamptz' })
  start_time: Date;

  @Column({ type: 'timestamptz' })
  end_time: Date;

  @Column({ type: 'text', nullable: true })
  recurrence_rule?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => BookingInstance, (instance) => instance.series, {
    cascade: true,
  })
  instances: BookingInstance[];
}
