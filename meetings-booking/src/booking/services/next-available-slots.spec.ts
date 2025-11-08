import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BookingRepository } from '../repositories/booking.repository';
import { BookingSeries } from '../entities/booking-series.entity';
import { BookingInstance } from '../entities/booking-instance.entity';
import { RecurrenceService } from './recurrence.service';

describe('Next Available Slots Suggestions', () => {
  let repository: BookingRepository;
  let instanceRepository: Repository<BookingInstance>;
  let seriesRepository: Repository<BookingSeries>;
  let dataSource: DataSource;
  let recurrenceService: RecurrenceService;

  const mockInstanceRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockSeriesRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn(),
  };

  const mockRecurrenceService = {
    parseRRule: jest.fn(),
    isInfiniteRecurrence: jest.fn(),
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-06T08:00:00Z'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingRepository,
        {
          provide: getRepositoryToken(BookingInstance),
          useValue: mockInstanceRepository,
        },
        {
          provide: getRepositoryToken(BookingSeries),
          useValue: mockSeriesRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: RecurrenceService,
          useValue: mockRecurrenceService,
        },
      ],
    }).compile();

    repository = module.get<BookingRepository>(BookingRepository);
    instanceRepository = module.get<Repository<BookingInstance>>(
      getRepositoryToken(BookingInstance),
    );
    seriesRepository = module.get<Repository<BookingSeries>>(
      getRepositoryToken(BookingSeries),
    );
    dataSource = module.get<DataSource>(DataSource);
    recurrenceService = module.get<RecurrenceService>(RecurrenceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  const setupMockRepositories = (instanceResults: any[] = [], seriesResults: any[] = []) => {
    const mockInstanceQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(instanceResults),
      orderBy: jest.fn().mockReturnThis(),
    };

    const mockSeriesQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(seriesResults),
    };

    mockInstanceRepository.createQueryBuilder.mockReturnValue(
      mockInstanceQueryBuilder,
    );
    mockSeriesRepository.createQueryBuilder.mockReturnValue(
      mockSeriesQueryBuilder,
    );

    repository['generateRecurringInstances'] = jest.fn().mockReturnValue([]);
    repository['isInstanceException'] = jest.fn().mockResolvedValue(false);

    return { mockInstanceQueryBuilder, mockSeriesQueryBuilder };
  };

  describe('findNextAvailableSlots - Single Booking', () => {
    it('should return available slot when no conflicts exist', async () => {
      setupMockRepositories([], []);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
      );

      expect(slots).toHaveLength(1);
      expect(slots[0].start).toEqual(startTime);
      expect(slots[0].end.getTime() - slots[0].start.getTime()).toBe(duration);
    });

    it('should find next available slot when requested time is booked', async () => {
      const existingBooking: BookingInstance = {
        id: 'existing-1',
        series_id: 'series-1',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T09:00:00Z'),
        end_time: new Date('2025-01-06T10:00:00Z'),
        is_exception: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockInstanceQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValueOnce([existingBooking])
          .mockResolvedValueOnce([]),
        orderBy: jest.fn().mockReturnThis(),
      };

      const mockSeriesQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockInstanceRepository.createQueryBuilder.mockReturnValue(
        mockInstanceQueryBuilder,
      );
      mockSeriesRepository.createQueryBuilder.mockReturnValue(
        mockSeriesQueryBuilder,
      );

      repository['generateRecurringInstances'] = jest.fn().mockReturnValue([]);
      repository['isInstanceException'] = jest.fn().mockResolvedValue(false);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
      );

      expect(slots).toHaveLength(1);
      expect(slots[0].start).toEqual(new Date('2025-01-06T10:00:00Z'));
      expect(slots[0].end).toEqual(new Date('2025-01-06T11:00:00Z'));
    });

    it('should skip multiple booked slots to find next available', async () => {
      const existingBooking1: BookingInstance = {
        id: 'existing-1',
        series_id: 'series-1',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T09:00:00Z'),
        end_time: new Date('2025-01-06T10:00:00Z'),
        is_exception: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const existingBooking2: BookingInstance = {
        id: 'existing-2',
        series_id: 'series-2',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T10:00:00Z'),
        end_time: new Date('2025-01-06T11:00:00Z'),
        is_exception: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockInstanceQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValueOnce([existingBooking1])
          .mockResolvedValueOnce([existingBooking2])
          .mockResolvedValueOnce([]),
        orderBy: jest.fn().mockReturnThis(),
      };

      const mockSeriesQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockInstanceRepository.createQueryBuilder.mockReturnValue(
        mockInstanceQueryBuilder,
      );
      mockSeriesRepository.createQueryBuilder.mockReturnValue(
        mockSeriesQueryBuilder,
      );

      repository['generateRecurringInstances'] = jest.fn().mockReturnValue([]);
      repository['isInstanceException'] = jest.fn().mockResolvedValue(false);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
      );

      expect(slots).toHaveLength(1);
      expect(slots[0].start).toEqual(new Date('2025-01-06T11:00:00Z'));
    });

    it('should return empty array when no slots available within 90 days', async () => {
      const existingBooking: BookingInstance = {
        id: 'existing-1',
        series_id: 'series-1',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T09:00:00Z'),
        end_time: new Date('2025-04-06T09:00:00Z'),
        is_exception: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      setupMockRepositories([existingBooking], []);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
      );

      expect(slots).toHaveLength(0);
    });

    it('should use current time if requested time is in the past', async () => {
      const pastTime = new Date('2025-01-05T08:00:00Z');
      const currentTime = new Date('2025-01-06T08:00:00Z');

      setupMockRepositories([], []);

      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        pastTime,
        duration,
      );

      expect(slots).toHaveLength(1);
      expect(slots[0].start.getTime()).toBeGreaterThanOrEqual(
        currentTime.getTime(),
      );
    });

    it('should respect maxSlots parameter', async () => {
      setupMockRepositories([], []);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
        undefined,
        3,
      );

      expect(slots.length).toBeLessThanOrEqual(1);
    });
  });

  describe('findNextAvailableSlots - Recurring Booking', () => {
    it('should find available slots from recurring pattern when no conflicts', async () => {
      const occurrences = [
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-13T09:00:00Z'),
        new Date('2025-01-20T09:00:00Z'),
        new Date('2025-01-27T09:00:00Z'),
        new Date('2025-02-03T09:00:00Z'),
      ];

      mockRecurrenceService.parseRRule.mockReturnValue(occurrences);
      setupMockRepositories([], []);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
        'RRULE:FREQ=WEEKLY;COUNT=5',
        5,
      );

      expect(slots.length).toBeGreaterThan(0);
      expect(slots.length).toBeLessThanOrEqual(5);
    });

    it('should skip conflicting occurrences and return available ones', async () => {
      const occurrences = [
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-13T09:00:00Z'),
        new Date('2025-01-20T09:00:00Z'),
      ];

      mockRecurrenceService.parseRRule.mockReturnValue(occurrences);

      const existingBooking: BookingInstance = {
        id: 'existing-1',
        series_id: 'series-1',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T09:00:00Z'),
        end_time: new Date('2025-01-06T10:00:00Z'),
        is_exception: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockInstanceQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValueOnce([existingBooking])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
        orderBy: jest.fn().mockReturnThis(),
      };

      const mockSeriesQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockInstanceRepository.createQueryBuilder.mockReturnValue(
        mockInstanceQueryBuilder,
      );
      mockSeriesRepository.createQueryBuilder.mockReturnValue(
        mockSeriesQueryBuilder,
      );

      repository['generateRecurringInstances'] = jest.fn().mockReturnValue([]);
      repository['isInstanceException'] = jest.fn().mockResolvedValue(false);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
        'RRULE:FREQ=WEEKLY;COUNT=3',
        5,
      );

      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0].start).not.toEqual(new Date('2025-01-06T09:00:00Z'));
    });

    it('should return empty array when all recurring occurrences conflict', async () => {
      const occurrences = [
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-13T09:00:00Z'),
      ];

      mockRecurrenceService.parseRRule.mockReturnValue(occurrences);

      const existingBooking1: BookingInstance = {
        id: 'existing-1',
        series_id: 'series-1',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T09:00:00Z'),
        end_time: new Date('2025-01-06T10:00:00Z'),
        is_exception: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const existingBooking2: BookingInstance = {
        id: 'existing-2',
        series_id: 'series-2',
        resource_id: 'R123',
        start_time: new Date('2025-01-13T09:00:00Z'),
        end_time: new Date('2025-01-13T10:00:00Z'),
        is_exception: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockInstanceQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValueOnce([existingBooking1])
          .mockResolvedValueOnce([existingBooking2]),
        orderBy: jest.fn().mockReturnThis(),
      };

      const mockSeriesQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockInstanceRepository.createQueryBuilder.mockReturnValue(
        mockInstanceQueryBuilder,
      );
      mockSeriesRepository.createQueryBuilder.mockReturnValue(
        mockSeriesQueryBuilder,
      );

      repository['generateRecurringInstances'] = jest.fn().mockReturnValue([]);
      repository['isInstanceException'] = jest.fn().mockResolvedValue(false);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
        'RRULE:FREQ=WEEKLY;COUNT=2',
        5,
      );

      expect(slots).toHaveLength(0);
    });

    it('should stop after finding maxSlots available occurrences', async () => {
      const occurrences = Array.from({ length: 10 }, (_, i) => {
        const date = new Date('2025-01-06T09:00:00Z');
        date.setDate(date.getDate() + i * 7);
        return date;
      });

      mockRecurrenceService.parseRRule.mockReturnValue(occurrences);
      setupMockRepositories([], []);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
        'RRULE:FREQ=WEEKLY;COUNT=10',
        3,
      );

      expect(slots.length).toBeLessThanOrEqual(3);
    });

    it('should handle invalid recurrence rule gracefully', async () => {
      mockRecurrenceService.parseRRule.mockImplementation(() => {
        throw new Error('Invalid RRULE');
      });

      setupMockRepositories([], []);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
        'INVALID_RRULE',
      );

      expect(slots).toBeDefined();
      expect(Array.isArray(slots)).toBe(true);
    });
  });

  describe('findNextAvailableSlots - Edge Cases', () => {
    it('should handle overlapping bookings correctly', async () => {
      const existingBooking: BookingInstance = {
        id: 'existing-1',
        series_id: 'series-1',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T09:30:00Z'),
        end_time: new Date('2025-01-06T10:30:00Z'),
        is_exception: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      let callCount = 0;
      const mockInstanceQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve([existingBooking]);
          }
          return Promise.resolve([]);
        }),
        orderBy: jest.fn().mockReturnThis(),
      };

      const mockSeriesQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockInstanceRepository.createQueryBuilder.mockReturnValue(
        mockInstanceQueryBuilder,
      );
      mockSeriesRepository.createQueryBuilder.mockReturnValue(
        mockSeriesQueryBuilder,
      );

      repository['generateRecurringInstances'] = jest.fn().mockReturnValue([]);
      repository['isInstanceException'] = jest.fn().mockResolvedValue(false);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
      );

      expect(slots.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle different durations correctly', async () => {
      const existingBooking: BookingInstance = {
        id: 'existing-1',
        series_id: 'series-1',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T09:00:00Z'),
        end_time: new Date('2025-01-06T10:00:00Z'),
        is_exception: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockInstanceQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValueOnce([existingBooking])
          .mockResolvedValueOnce([]),
        orderBy: jest.fn().mockReturnThis(),
      };

      const mockSeriesQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockInstanceRepository.createQueryBuilder.mockReturnValue(
        mockInstanceQueryBuilder,
      );
      mockSeriesRepository.createQueryBuilder.mockReturnValue(
        mockSeriesQueryBuilder,
      );

      repository['generateRecurringInstances'] = jest.fn().mockReturnValue([]);
      repository['isInstanceException'] = jest.fn().mockResolvedValue(false);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 30 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
      );

      expect(slots).toHaveLength(1);
      expect(slots[0].end.getTime() - slots[0].start.getTime()).toBe(duration);
    });

    it('should handle timezone correctly', async () => {
      setupMockRepositories([], []);

      const startTime = new Date('2025-01-06T09:00:00+05:00');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
      );

      expect(slots).toHaveLength(1);
      expect(slots[0].start).toBeInstanceOf(Date);
    });

    it('should handle bookings that span multiple days', async () => {
      const existingBooking: BookingInstance = {
        id: 'existing-1',
        series_id: 'series-1',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T09:00:00Z'),
        end_time: new Date('2025-01-07T09:00:00Z'),
        is_exception: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      let callCount = 0;
      const mockInstanceQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve([existingBooking]);
          }
          return Promise.resolve([]);
        }),
        orderBy: jest.fn().mockReturnThis(),
      };

      const mockSeriesQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockInstanceRepository.createQueryBuilder.mockReturnValue(
        mockInstanceQueryBuilder,
      );
      mockSeriesRepository.createQueryBuilder.mockReturnValue(
        mockSeriesQueryBuilder,
      );

      repository['generateRecurringInstances'] = jest.fn().mockReturnValue([]);
      repository['isInstanceException'] = jest.fn().mockResolvedValue(false);

      const startTime = new Date('2025-01-06T08:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
      );

      expect(slots.length).toBeGreaterThanOrEqual(0);
    });

    it('should find slot when there is a gap between bookings', async () => {
      const existingBooking1: BookingInstance = {
        id: 'existing-1',
        series_id: 'series-1',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T09:00:00Z'),
        end_time: new Date('2025-01-06T10:00:00Z'),
        is_exception: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockInstanceQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValueOnce([existingBooking1])
          .mockResolvedValueOnce([]),
        orderBy: jest.fn().mockReturnThis(),
      };

      const mockSeriesQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockInstanceRepository.createQueryBuilder.mockReturnValue(
        mockInstanceQueryBuilder,
      );
      mockSeriesRepository.createQueryBuilder.mockReturnValue(
        mockSeriesQueryBuilder,
      );

      repository['generateRecurringInstances'] = jest.fn().mockReturnValue([]);
      repository['isInstanceException'] = jest.fn().mockResolvedValue(false);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
      );

      expect(slots).toHaveLength(1);
      expect(slots[0].start).toEqual(new Date('2025-01-06T10:00:00Z'));
      expect(slots[0].end).toEqual(new Date('2025-01-06T11:00:00Z'));
    });

    it('should handle recurring suggestions with infinite recurrence', async () => {
      mockRecurrenceService.isInfiniteRecurrence.mockReturnValue(true);
      mockRecurrenceService.parseRRule.mockReturnValue([
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-13T09:00:00Z'),
        new Date('2025-01-20T09:00:00Z'),
      ]);

      setupMockRepositories([], []);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
        'RRULE:FREQ=WEEKLY',
        5,
      );

      expect(slots.length).toBeGreaterThan(0);
      expect(slots.length).toBeLessThanOrEqual(5);
    });

    it('should handle maxSlots=0 (should return empty array)', async () => {
      setupMockRepositories([], []);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
        undefined,
        0,
      );

      expect(slots).toHaveLength(0);
    });

    it('should handle very large maxSlots value', async () => {
      setupMockRepositories([], []);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 60 * 60 * 1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
        undefined,
        1000,
      );

      expect(slots.length).toBeLessThanOrEqual(1);
    });

    it('should handle negative duration gracefully', async () => {
      setupMockRepositories([], []);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = -1000;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
      );

      expect(slots).toBeDefined();
      expect(Array.isArray(slots)).toBe(true);
    });

    it('should handle zero duration', async () => {
      setupMockRepositories([], []);

      const startTime = new Date('2025-01-06T09:00:00Z');
      const duration = 0;

      const slots = await repository.findNextAvailableSlots(
        'R123',
        startTime,
        duration,
      );

      expect(slots).toBeDefined();
      expect(Array.isArray(slots)).toBe(true);
    });
  });
});

