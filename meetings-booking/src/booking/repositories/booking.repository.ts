import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, QueryRunner } from 'typeorm';
import { BookingSeries } from '../entities/booking-series.entity';
import { BookingInstance } from '../entities/booking-instance.entity';
import { RecurrenceService } from '../services/recurrence.service';

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface ConflictInfo {
  id: string;
  start_time: Date;
  end_time: Date;
  series_id?: string;
}

@Injectable()
export class BookingRepository {
  constructor(
    @InjectRepository(BookingSeries)
    private readonly seriesRepository: Repository<BookingSeries>,
    @InjectRepository(BookingInstance)
    private readonly instanceRepository: Repository<BookingInstance>,
    private readonly dataSource: DataSource,
    private readonly recurrenceService: RecurrenceService,
  ) {}

  async findConflicts(
    resourceId: string,
    startTime: Date,
    endTime: Date,
    recurrenceRule?: string,
  ): Promise<ConflictInfo[]> {
    const conflicts: ConflictInfo[] = [];

    if (recurrenceRule) {
      const duration = endTime.getTime() - startTime.getTime();
      const occurrences = this.recurrenceService.parseRRule(
        recurrenceRule,
        startTime,
        endTime,
      );

      for (const occurrenceStart of occurrences) {
        const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
        const occurrenceConflicts = await this.findConflictsForTimeRange(
          resourceId,
          occurrenceStart,
          occurrenceEnd,
        );
        conflicts.push(...occurrenceConflicts);
      }
    } else {
      const singleConflicts = await this.findConflictsForTimeRange(
        resourceId,
        startTime,
        endTime,
      );
      conflicts.push(...singleConflicts);
    }

    const uniqueConflicts = Array.from(
      new Map(
        conflicts.map((c) => [
          `${c.id}-${c.start_time.getTime()}-${c.end_time.getTime()}`,
          c,
        ]),
      ).values(),
    );

    return uniqueConflicts;
  }

  private async findConflictsForTimeRange(
    resourceId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<ConflictInfo[]> {
    const conflicts: ConflictInfo[] = [];

    const instanceConflicts = await this.instanceRepository
      .createQueryBuilder('instance')
      .where('instance.resource_id = :resourceId', { resourceId })
      .andWhere('instance.is_exception = :isException', { isException: false })
      .andWhere('instance.start_time < :endTime', { endTime })
      .andWhere('instance.end_time > :startTime', { startTime })
      .getMany();

    conflicts.push(
      ...instanceConflicts.map((instance) => ({
        id: instance.id,
        start_time: instance.start_time,
        end_time: instance.end_time,
        series_id: instance.series_id,
      })),
    );

    const infiniteSeries = await this.seriesRepository
      .createQueryBuilder('series')
      .where('series.resource_id = :resourceId', { resourceId })
      .andWhere('series.recurrence_rule IS NOT NULL')
      .andWhere(
        "(series.recurrence_rule NOT LIKE '%COUNT%' AND series.recurrence_rule NOT LIKE '%UNTIL%')",
      )
      .getMany();

    for (const series of infiniteSeries) {
      const extendedStart = new Date(startTime);
      extendedStart.setDate(extendedStart.getDate() - 7);
      const extendedEnd = new Date(endTime);
      extendedEnd.setDate(extendedEnd.getDate() + 7);

      const generatedInstances = this.generateRecurringInstances(
        series,
        extendedStart,
        extendedEnd,
      );

      for (const instance of generatedInstances) {
        const isException = await this.isInstanceException(
          series.id,
          instance.start,
        );

        if (
          !isException &&
          this.isOverlapping(instance.start, instance.end, startTime, endTime)
        ) {
          conflicts.push({
            id: series.id,
            start_time: instance.start,
            end_time: instance.end,
            series_id: series.id,
          });
        }
      }
    }

    return conflicts;
  }

  async findBookedSlots(
    resourceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<TimeSlot[]> {
    try {
      const bookedSlots: TimeSlot[] = [];

      if (!resourceId || !startDate || !endDate) {
        throw new Error('Invalid parameters for findBookedSlots');
      }

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Invalid date parameters');
      }

      let instances;
      try {
        instances = await this.instanceRepository
          .createQueryBuilder('instance')
          .where('instance.resource_id = :resourceId', { resourceId })
          .andWhere('instance.is_exception = :isException', { isException: false })
          .andWhere('instance.start_time < :endDate', { endDate })
          .andWhere('instance.end_time > :startDate', { startDate })
          .orderBy('instance.start_time', 'ASC')
          .getMany();
      } catch (dbError) {
        console.error(`Database error in findBookedSlots (instances):`, dbError);
        throw new Error(`Failed to query booked instances: ${dbError.message}`);
      }

      bookedSlots.push(
        ...instances.map((instance) => ({
          start: instance.start_time,
          end: instance.end_time,
        })),
      );

      let infiniteSeries;
      try {
        infiniteSeries = await this.seriesRepository
          .createQueryBuilder('series')
          .where('series.resource_id = :resourceId', { resourceId })
          .andWhere('series.recurrence_rule IS NOT NULL')
          .andWhere(
            "(series.recurrence_rule NOT LIKE '%COUNT%' AND series.recurrence_rule NOT LIKE '%UNTIL%')",
          )
          .getMany();
      } catch (dbError) {
        console.error(`Database error in findBookedSlots (infinite series):`, dbError);
        throw new Error(`Failed to query infinite series: ${dbError.message}`);
      }

      for (const series of infiniteSeries) {
        const generatedInstances = this.generateRecurringInstances(
          series,
          startDate,
          endDate,
        );

        for (const instance of generatedInstances) {
          const isException = await this.isInstanceException(
            series.id,
            instance.start,
          );

          if (!isException) {
            bookedSlots.push(instance);
          }
        }
      }

      bookedSlots.sort((a, b) => a.start.getTime() - b.start.getTime());

      const uniqueSlots = Array.from(
        new Map(
          bookedSlots.map((slot) => [
            `${slot.start.getTime()}-${slot.end.getTime()}`,
            slot,
          ]),
        ).values(),
      );

      return uniqueSlots;
    } catch (error) {
      console.error('Error in findBookedSlots:', error);
      throw error;
    }
  }

  async createBookingSeries(
    resourceId: string,
    startTime: Date,
    endTime: Date,
    recurrenceRule?: string,
  ): Promise<{ series: BookingSeries; instances: BookingInstance[] }> {
    const queryRunner = this.dataSource.createQueryRunner();
    let transactionStarted = false;

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      transactionStarted = true;

      const conflicts = await this.findConflictsWithLock(
        queryRunner,
        resourceId,
        startTime,
        endTime,
        recurrenceRule,
      );

      if (conflicts.length > 0) {
        if (transactionStarted) {
          await queryRunner.rollbackTransaction();
        }
        throw new ConflictException(
          `Booking conflicts with ${conflicts.length} existing booking(s)`,
        );
      }

      const series = queryRunner.manager.create(BookingSeries, {
        resource_id: resourceId,
        start_time: startTime,
        end_time: endTime,
        ...(recurrenceRule && { recurrence_rule: recurrenceRule }),
      });

      const savedSeries = await queryRunner.manager.save(BookingSeries, series);

      const instances: BookingInstance[] = [];

      if (
        recurrenceRule &&
        !this.recurrenceService.isInfiniteRecurrence(recurrenceRule)
      ) {
        const duration = endTime.getTime() - startTime.getTime();
        const occurrences = this.recurrenceService.parseRRule(
          recurrenceRule,
          startTime,
          endTime,
        );

        const instanceEntities = occurrences.map((occurrenceStart) => {
          const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
          return queryRunner.manager.create(BookingInstance, {
            series_id: savedSeries.id,
            resource_id: resourceId,
            start_time: occurrenceStart,
            end_time: occurrenceEnd,
            is_exception: false,
          });
        });

        const savedInstances = await queryRunner.manager.save(
          BookingInstance,
          instanceEntities,
        );
        instances.push(...savedInstances);
      } else if (!recurrenceRule) {
        const instance = queryRunner.manager.create(BookingInstance, {
          series_id: savedSeries.id,
          resource_id: resourceId,
          start_time: startTime,
          end_time: endTime,
          is_exception: false,
        });

        const savedInstance = await queryRunner.manager.save(
          BookingInstance,
          instance,
        );
        instances.push(savedInstance);
      }

      await queryRunner.commitTransaction();
      transactionStarted = false;

      return { series: savedSeries, instances };
    } catch (error) {
      if (transactionStarted) {
        try {
          await queryRunner.rollbackTransaction();
        } catch (rollbackError) {
          console.error('Error during transaction rollback:', rollbackError);
        }
      }
      
      if (error instanceof ConflictException) {
        throw error;
      }
      
      if (
        error.code === '23505' ||
        error.code === '23P01' ||
        error.message?.includes('duplicate key') ||
        error.message?.includes('violates unique constraint') ||
        error.message?.includes('violates exclusion constraint') ||
        error.message?.includes('exclusion constraint')
      ) {
        throw new ConflictException(
          'Booking conflicts with existing booking (database constraint violation)',
        );
      }
      
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async findConflictsWithLock(
    queryRunner: QueryRunner,
    resourceId: string,
    startTime: Date,
    endTime: Date,
    recurrenceRule?: string,
  ): Promise<ConflictInfo[]> {
    const conflicts: ConflictInfo[] = [];

    if (recurrenceRule) {
      const duration = endTime.getTime() - startTime.getTime();
      const occurrences = this.recurrenceService.parseRRule(
        recurrenceRule,
        startTime,
        endTime,
      );

      for (const occurrenceStart of occurrences) {
        const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
        const occurrenceConflicts = await this.findConflictsForTimeRangeWithLock(
          queryRunner,
          resourceId,
          occurrenceStart,
          occurrenceEnd,
        );
        conflicts.push(...occurrenceConflicts);
      }
    } else {
      const singleConflicts = await this.findConflictsForTimeRangeWithLock(
        queryRunner,
        resourceId,
        startTime,
        endTime,
      );
      conflicts.push(...singleConflicts);
    }

    const uniqueConflicts = Array.from(
      new Map(
        conflicts.map((c) => [
          `${c.id}-${c.start_time.getTime()}-${c.end_time.getTime()}`,
          c,
        ]),
      ).values(),
    );

    return uniqueConflicts;
  }

  private async findConflictsForTimeRangeWithLock(
    queryRunner: QueryRunner,
    resourceId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<ConflictInfo[]> {
    const conflicts: ConflictInfo[] = [];

    const instanceConflicts = await queryRunner.manager
      .createQueryBuilder(BookingInstance, 'instance')
      .setLock('pessimistic_write')
      .where('instance.resource_id = :resourceId', { resourceId })
      .andWhere('instance.is_exception = :isException', { isException: false })
      .andWhere('instance.start_time < :endTime', { endTime })
      .andWhere('instance.end_time > :startTime', { startTime })
      .getMany();

    conflicts.push(
      ...instanceConflicts.map((instance) => ({
        id: instance.id,
        start_time: instance.start_time,
        end_time: instance.end_time,
        series_id: instance.series_id,
      })),
    );

    const infiniteSeries = await queryRunner.manager
      .createQueryBuilder(BookingSeries, 'series')
      .setLock('pessimistic_read')
      .where('series.resource_id = :resourceId', { resourceId })
      .andWhere('series.recurrence_rule IS NOT NULL')
      .andWhere(
        "(series.recurrence_rule NOT LIKE '%COUNT%' AND series.recurrence_rule NOT LIKE '%UNTIL%')",
      )
      .getMany();

    for (const series of infiniteSeries) {
      const extendedStart = new Date(startTime);
      extendedStart.setDate(extendedStart.getDate() - 7);
      const extendedEnd = new Date(endTime);
      extendedEnd.setDate(extendedEnd.getDate() + 7);

      const generatedInstances = this.generateRecurringInstances(
        series,
        extendedStart,
        extendedEnd,
      );

      for (const instance of generatedInstances) {
        const isException = await this.isInstanceExceptionWithLock(
          queryRunner,
          series.id,
          instance.start,
        );

        if (
          !isException &&
          this.isOverlapping(instance.start, instance.end, startTime, endTime)
        ) {
          conflicts.push({
            id: series.id,
            start_time: instance.start,
            end_time: instance.end,
            series_id: series.id,
          });
        }
      }
    }

    return conflicts;
  }

  private async isInstanceExceptionWithLock(
    queryRunner: QueryRunner,
    seriesId: string,
    instanceStartTime: Date,
  ): Promise<boolean> {
    const startOfDay = new Date(instanceStartTime);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(instanceStartTime);
    endOfDay.setHours(23, 59, 59, 999);

    const exception = await queryRunner.manager
      .createQueryBuilder(BookingInstance, 'instance')
      .setLock('pessimistic_read')
      .where('instance.series_id = :seriesId', { seriesId })
      .andWhere('instance.start_time >= :startOfDay', { startOfDay })
      .andWhere('instance.start_time <= :endOfDay', { endOfDay })
      .andWhere('instance.is_exception = :isException', { isException: true })
      .getOne();

    return !!exception;
  }

  async cancelException(
    seriesId: string,
    instanceDate: Date,
  ): Promise<BookingInstance> {
    const series = await this.seriesRepository.findOne({
      where: { id: seriesId },
    });

    if (!series) {
      throw new Error('Recurring booking series not found');
    }

    const startOfDay = new Date(instanceDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(instanceDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingInstance = await this.instanceRepository.findOne({
      where: {
        series_id: seriesId,
        start_time: Between(startOfDay, endOfDay),
        is_exception: false,
      },
    });

    if (existingInstance) {
      existingInstance.is_exception = true;
      return await this.instanceRepository.save(existingInstance);
    }

    const duration = series.end_time.getTime() - series.start_time.getTime();
    const instanceStart = new Date(instanceDate);
    instanceStart.setHours(
      series.start_time.getHours(),
      series.start_time.getMinutes(),
      series.start_time.getSeconds(),
      0,
    );
    const instanceEnd = new Date(instanceStart.getTime() + duration);

    const exception = this.instanceRepository.create({
      series_id: seriesId,
      resource_id: series.resource_id,
      start_time: instanceStart,
      end_time: instanceEnd,
      is_exception: true,
    });

    return await this.instanceRepository.save(exception);
  }

  generateRecurringInstances(
    series: BookingSeries,
    startDate: Date,
    endDate: Date,
  ): TimeSlot[] {
    if (!series.recurrence_rule) {
      if (series.start_time >= startDate && series.start_time < endDate) {
        return [
          {
            start: series.start_time,
            end: series.end_time,
          },
        ];
      }
      return [];
    }

    const duration = series.end_time.getTime() - series.start_time.getTime();
    const occurrences = this.recurrenceService.parseRRule(
      series.recurrence_rule,
      series.start_time,
      series.end_time,
    );

    const instancesInRange: TimeSlot[] = [];
    for (const occurrenceStart of occurrences) {
      if (occurrenceStart >= startDate && occurrenceStart < endDate) {
        const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
        instancesInRange.push({
          start: occurrenceStart,
          end: occurrenceEnd,
        });
      }
    }

    return instancesInRange;
  }

  async isInstanceException(
    seriesId: string,
    instanceStartTime: Date,
  ): Promise<boolean> {
    const startOfDay = new Date(instanceStartTime);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(instanceStartTime);
    endOfDay.setHours(23, 59, 59, 999);

    const exception = await this.instanceRepository.findOne({
      where: {
        series_id: seriesId,
        start_time: Between(startOfDay, endOfDay),
        is_exception: true,
      },
    });

    return !!exception;
  }

  async findSeriesById(seriesId: string): Promise<BookingSeries | null> {
    return await this.seriesRepository.findOne({
      where: { id: seriesId },
      relations: ['instances'],
    });
  }

  async findInstancesBySeriesId(seriesId: string): Promise<BookingInstance[]> {
    return await this.instanceRepository.find({
      where: { series_id: seriesId },
      order: { start_time: 'ASC' },
    });
  }

  private isOverlapping(
    start1: Date,
    end1: Date,
    start2: Date,
    end2: Date,
  ): boolean {
    return start1 < end2 && start2 < end1;
  }

  async findNextAvailableSlots(
    resourceId: string,
    startTime: Date,
    duration: number,
    recurrenceRule?: string,
    maxSlots: number = 5,
  ): Promise<TimeSlot[]> {
    const slots: TimeSlot[] = [];
    const searchEndDate = new Date();
    searchEndDate.setDate(searchEndDate.getDate() + 90);

    let currentTime = new Date(Math.max(startTime.getTime(), Date.now()));

    if (recurrenceRule) {
      try {
        const occurrences = this.recurrenceService.parseRRule(
          recurrenceRule,
          currentTime,
          new Date(currentTime.getTime() + duration),
        );

        for (const occurrenceStart of occurrences) {
          if (slots.length >= maxSlots) break;

          const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
          const conflicts = await this.findConflictsForTimeRange(
            resourceId,
            occurrenceStart,
            occurrenceEnd,
          );

          if (conflicts.length === 0) {
            slots.push({
              start: occurrenceStart,
              end: occurrenceEnd,
            });
          }
        }
      } catch (error) {
        // If recurrence parsing fails, fall back to single slot search
      }
    } else {
      while (currentTime < searchEndDate && slots.length < maxSlots) {
        const slotEnd = new Date(currentTime.getTime() + duration);
        const conflicts = await this.findConflictsForTimeRange(
          resourceId,
          currentTime,
          slotEnd,
        );

        if (conflicts.length === 0) {
          slots.push({
            start: currentTime,
            end: slotEnd,
          });
          break;
        }

        currentTime = new Date(currentTime.getTime() + 60 * 60 * 1000);
      }
    }

    return slots;
  }
}
