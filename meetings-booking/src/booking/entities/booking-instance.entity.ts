import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BookingSeries } from './booking-series.entity';

@Entity('booking_instance')
@Index(['resource_id'])
@Index(['resource_id', 'start_time', 'end_time'])
@Index(['series_id'], { where: 'series_id IS NOT NULL' })
@Index(['series_id', 'start_time'], { where: 'is_exception = TRUE' })
export class BookingInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  series_id?: string;

  @ManyToOne(() => BookingSeries, (series) => series.instances, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'series_id' })
  series?: BookingSeries;

  @Column({ type: 'varchar', length: 255 })
  resource_id: string;

  @Column({ type: 'timestamptz' })
  start_time: Date;

  @Column({ type: 'timestamptz' })
  end_time: Date;

  @Column({ type: 'boolean', default: false })
  is_exception: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
