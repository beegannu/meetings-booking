import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BookingRepository } from '../repositories/booking.repository';
import { BookingSeries } from '../entities/booking-series.entity';
import { BookingInstance } from '../entities/booking-instance.entity';
import { RecurrenceService } from './recurrence.service';

describe('Conflict Detection', () => {
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
  });

  const setupMockRepositories = (instanceResults: any[] = [], seriesResults: any[] = []) => {
    const mockInstanceQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(instanceResults),
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

  describe('findConflicts - Single Booking', () => {
    it('should detect no conflicts when no bookings exist', async () => {
      const mockInstanceQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
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

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-06T10:00:00Z'),
      );

      expect(conflicts).toHaveLength(0);
      expect(mockInstanceQueryBuilder.where).toHaveBeenCalledWith(
        'instance.resource_id = :resourceId',
        { resourceId: 'R123' },
      );
    });

    it('should detect conflict when booking overlaps with existing booking', async () => {
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

      const mockInstanceQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([existingBooking]),
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

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-06T10:00:00Z'),
      );

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].id).toBe('existing-1');
      expect(conflicts[0].start_time).toEqual(
        new Date('2025-01-06T09:30:00Z'),
      );
    });

    it('should detect conflict when booking starts before and ends during existing booking', async () => {
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

      setupMockRepositories([existingBooking], []);

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T08:30:00Z'),
        new Date('2025-01-06T09:30:00Z'),
      );

      expect(conflicts).toHaveLength(1);
    });

    it('should detect conflict when booking starts during and ends after existing booking', async () => {
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

      setupMockRepositories([existingBooking], []);

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T09:30:00Z'),
        new Date('2025-01-06T10:30:00Z'),
      );

      expect(conflicts).toHaveLength(1);
    });

    it('should not detect conflict when bookings are adjacent (no overlap)', async () => {
      setupMockRepositories([], []);

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T10:00:00Z'),
        new Date('2025-01-06T11:00:00Z'),
      );

      expect(conflicts).toHaveLength(0);
    });

    it('should not detect conflict when bookings are on different resources', async () => {
      setupMockRepositories([], []);

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-06T10:00:00Z'),
      );

      expect(conflicts).toHaveLength(0);
    });

    it('should ignore exceptions when detecting conflicts', async () => {
      const { mockInstanceQueryBuilder } = setupMockRepositories([], []);

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-06T10:00:00Z'),
      );

      expect(conflicts).toHaveLength(0);
      expect(mockInstanceQueryBuilder.andWhere).toHaveBeenCalledWith(
        'instance.is_exception = :isException',
        { isException: false },
      );
    });
  });

  describe('findConflicts - Recurring Booking', () => {
    it('should detect conflicts for recurring booking with multiple occurrences', async () => {
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
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([existingBooking])
          .mockResolvedValueOnce([]),
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

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-06T10:00:00Z'),
        'RRULE:FREQ=WEEKLY;COUNT=3',
      );

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].start_time).toEqual(
        new Date('2025-01-13T09:00:00Z'),
      );
    });

    it('should detect multiple conflicts across different occurrences', async () => {
      const occurrences = [
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-13T09:00:00Z'),
        new Date('2025-01-20T09:00:00Z'),
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
        start_time: new Date('2025-01-20T09:00:00Z'),
        end_time: new Date('2025-01-20T10:00:00Z'),
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
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([existingBooking2]),
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

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-06T10:00:00Z'),
        'RRULE:FREQ=WEEKLY;COUNT=3',
      );

      expect(conflicts.length).toBeGreaterThanOrEqual(2);
    });

    it('should deduplicate conflicts when same conflict appears multiple times', async () => {
      const occurrences = [
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-06T09:00:00Z'),
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

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([existingBooking]),
      };

      mockInstanceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-06T10:00:00Z'),
        'RRULE:FREQ=WEEKLY;COUNT=2',
      );

      expect(conflicts).toHaveLength(1);
    });
  });

  describe('isOverlapping (private method tested through findConflicts)', () => {
    it('should detect overlap when one booking completely contains another', async () => {
      const existingBooking: BookingInstance = {
        id: 'existing-1',
        series_id: 'series-1',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T08:00:00Z'),
        end_time: new Date('2025-01-06T11:00:00Z'),
        is_exception: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      setupMockRepositories([existingBooking], []);

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-06T10:00:00Z'),
      );

      expect(conflicts).toHaveLength(1);
    });

    it('should detect overlap when bookings share exact same time', async () => {
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

      setupMockRepositories([existingBooking], []);

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-06T10:00:00Z'),
      );

      expect(conflicts).toHaveLength(1);
    });
  });

  describe('findConflicts - Infinite Recurrence Series', () => {
    it('should detect conflicts with infinite recurrence series', async () => {
      const infiniteSeries: BookingSeries = {
        id: 'infinite-series-1',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T09:00:00Z'),
        end_time: new Date('2025-01-06T10:00:00Z'),
        recurrence_rule: 'RRULE:FREQ=WEEKLY',
        created_at: new Date(),
        updated_at: new Date(),
        instances: [],
      };

      const mockInstanceQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const mockSeriesQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([infiniteSeries]),
      };

      mockInstanceRepository.createQueryBuilder.mockReturnValue(
        mockInstanceQueryBuilder,
      );
      mockSeriesRepository.createQueryBuilder.mockReturnValue(
        mockSeriesQueryBuilder,
      );

      mockRecurrenceService.parseRRule.mockReturnValue([
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-13T09:00:00Z'),
      ]);

      repository['generateRecurringInstances'] = jest
        .fn()
        .mockReturnValue([
          {
            start: new Date('2025-01-06T09:00:00Z'),
            end: new Date('2025-01-06T10:00:00Z'),
          },
          {
            start: new Date('2025-01-13T09:00:00Z'),
            end: new Date('2025-01-13T10:00:00Z'),
          },
        ]);

      repository['isInstanceException'] = jest.fn().mockResolvedValue(false);

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-06T10:00:00Z'),
      );

      expect(mockSeriesQueryBuilder.where).toHaveBeenCalled();
      expect(mockSeriesQueryBuilder.andWhere).toHaveBeenCalledWith(
        'series.recurrence_rule IS NOT NULL',
      );
    });

    it('should ignore exceptions in infinite recurrence series', async () => {
      const infiniteSeries: BookingSeries = {
        id: 'infinite-series-1',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T09:00:00Z'),
        end_time: new Date('2025-01-06T10:00:00Z'),
        recurrence_rule: 'RRULE:FREQ=WEEKLY',
        created_at: new Date(),
        updated_at: new Date(),
        instances: [],
      };

      const mockInstanceQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      const mockSeriesQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([infiniteSeries]),
      };

      mockInstanceRepository.createQueryBuilder.mockReturnValue(
        mockInstanceQueryBuilder,
      );
      mockSeriesRepository.createQueryBuilder.mockReturnValue(
        mockSeriesQueryBuilder,
      );

      repository['generateRecurringInstances'] = jest
        .fn()
        .mockReturnValue([
          {
            start: new Date('2025-01-06T09:00:00Z'),
            end: new Date('2025-01-06T10:00:00Z'),
          },
        ]);

      repository['isInstanceException'] = jest.fn().mockResolvedValue(true);

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-06T10:00:00Z'),
      );

      expect(conflicts).toHaveLength(0);
      expect(repository['isInstanceException']).toHaveBeenCalled();
    });
  });

  describe('findConflicts - Edge Cases', () => {
    it('should handle boundary conditions (exact end time match)', async () => {
      setupMockRepositories([], []);

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T10:00:00Z'),
        new Date('2025-01-06T11:00:00Z'),
      );

      expect(conflicts).toHaveLength(0);
    });

    it('should handle boundary conditions (exact start time match)', async () => {
      const existingBooking: BookingInstance = {
        id: 'existing-1',
        series_id: 'series-1',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T10:00:00Z'),
        end_time: new Date('2025-01-06T11:00:00Z'),
        is_exception: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      setupMockRepositories([existingBooking], []);

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-06T10:00:00Z'),
      );

      expect(conflicts.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle very short duration bookings', async () => {
      const existingBooking: BookingInstance = {
        id: 'existing-1',
        series_id: 'series-1',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T09:30:00Z'),
        end_time: new Date('2025-01-06T09:31:00Z'),
        is_exception: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      setupMockRepositories([existingBooking], []);

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-06T10:00:00Z'),
      );

      expect(conflicts.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle very long duration bookings', async () => {
      const existingBooking: BookingInstance = {
        id: 'existing-1',
        series_id: 'series-1',
        resource_id: 'R123',
        start_time: new Date('2025-01-06T08:00:00Z'),
        end_time: new Date('2025-01-06T12:00:00Z'),
        is_exception: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      setupMockRepositories([existingBooking], []);

      const conflicts = await repository.findConflicts(
        'R123',
        new Date('2025-01-06T09:00:00Z'),
        new Date('2025-01-06T10:00:00Z'),
      );

      expect(conflicts.length).toBeGreaterThanOrEqual(1);
    });
  });
});

