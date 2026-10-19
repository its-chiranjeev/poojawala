import { Test, TestingModule } from '@nestjs/testing';
import { ReviewService } from './review.service';
import {
  BookingRepository,
  PurohitProfileRepository,
  UserRepository,
  AstrologerProfileRepository,
} from '@poojawala/repositories';
import { AuditLogService } from '@poojawala/common';
import { DataSource } from 'typeorm';
import {
  BOOKING_STATUS,
  BOOKING_TYPE,
  REVIEW_STATUS,
  USER_ROLE,
  User,
} from '@poojawala/entities';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ReviewService', () => {
  let service: ReviewService;
  let mockBookingRepository: any;
  let mockUserRepository: any;
  let mockPurohitProfileRepository: any;
  let mockAstrologerProfileRepository: any;
  let mockAuditLogService: any;
  let mockDataSource: any;

  beforeEach(async () => {
    mockBookingRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      createQueryBuilder: jest.fn(),
    };

    mockUserRepository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockPurohitProfileRepository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockAstrologerProfileRepository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findByUserId: jest.fn(),
    };

    mockAuditLogService = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    };

    mockDataSource = {
      getRepository: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewService,
        { provide: BookingRepository, useValue: mockBookingRepository },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: PurohitProfileRepository, useValue: mockPurohitProfileRepository },
        { provide: AstrologerProfileRepository, useValue: mockAstrologerProfileRepository },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ReviewService>(ReviewService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Customer reviews Astrologer', () => {
    it('allows a customer to review an astrology booking and sets customer rating/review', async () => {
      const customerUser = { id: 10, role: USER_ROLE.CUSTOMER } as User;
      const completedBooking: any = {
        id: 100,
        bookingType: BOOKING_TYPE.ASTROLOGY,
        status: BOOKING_STATUS.COMPLETED,
        customerId: 10,
        astrologerId: 20,
        customerRating: null,
        customerReview: null,
        purohitRating: null,
        purohitReview: null,
      };

      mockBookingRepository.findOne.mockResolvedValue(completedBooking);

      const result = await service.create(customerUser, 100, {
        rating: 5,
        review: 'Excellent astrology consultation!',
      });

      expect(result).toEqual({ message: 'Review submitted successfully' });
      expect(completedBooking.customerRating).toBe(5);
      expect(completedBooking.customerReview).toBe('Excellent astrology consultation!');
      expect(completedBooking.reviewStatus).toBe(REVIEW_STATUS.DRAFT);
      expect(mockBookingRepository.save).toHaveBeenCalledWith(completedBooking);
      expect(mockAuditLogService.createAuditLog).toHaveBeenCalled();
    });

    it('rejects customer review if booking is not completed', async () => {
      const customerUser = { id: 10, role: USER_ROLE.CUSTOMER } as User;
      const pendingBooking: any = {
        id: 100,
        bookingType: BOOKING_TYPE.ASTROLOGY,
        status: BOOKING_STATUS.PENDING,
        customerId: 10,
        astrologerId: 20,
      };

      mockBookingRepository.findOne.mockResolvedValue(pendingBooking);

      await expect(
        service.create(customerUser, 100, { rating: 5, review: 'Good' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects customer review if customer is not the booking owner', async () => {
      const strangerUser = { id: 99, role: USER_ROLE.CUSTOMER } as User;
      const completedBooking: any = {
        id: 100,
        bookingType: BOOKING_TYPE.ASTROLOGY,
        status: BOOKING_STATUS.COMPLETED,
        customerId: 10,
        astrologerId: 20,
      };

      mockBookingRepository.findOne.mockResolvedValue(completedBooking);

      await expect(
        service.create(strangerUser, 100, { rating: 5, review: 'Good' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects customer review if customer already reviewed', async () => {
      const customerUser = { id: 10, role: USER_ROLE.CUSTOMER } as User;
      const alreadyReviewedBooking: any = {
        id: 100,
        bookingType: BOOKING_TYPE.ASTROLOGY,
        status: BOOKING_STATUS.COMPLETED,
        customerId: 10,
        astrologerId: 20,
        customerRating: 4,
        customerReview: 'Already submitted',
      };

      mockBookingRepository.findOne.mockResolvedValue(alreadyReviewedBooking);

      await expect(
        service.create(customerUser, 100, { rating: 5, review: 'Good' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Astrologer reviews Customer', () => {
    it('allows an astrologer to review the customer on an astrology booking', async () => {
      const astrologerUser = { id: 20, role: USER_ROLE.ASTROLOGER } as User;
      const completedBooking: any = {
        id: 100,
        bookingType: BOOKING_TYPE.ASTROLOGY,
        status: BOOKING_STATUS.COMPLETED,
        customerId: 10,
        astrologerId: 20,
        customerRating: 5,
        customerReview: 'Great',
        purohitRating: null,
        purohitReview: null,
      };

      mockBookingRepository.findOne.mockResolvedValue(completedBooking);

      const result = await service.create(astrologerUser, 100, {
        rating: 4.5,
        review: 'Polite and attentive customer.',
      });

      expect(result).toEqual({ message: 'Review submitted successfully' });
      expect(completedBooking.purohitRating).toBe(4.5);
      expect(completedBooking.purohitReview).toBe('Polite and attentive customer.');
      expect(mockBookingRepository.save).toHaveBeenCalledWith(completedBooking);
    });

    it('rejects astrologer review if user is not the assigned astrologer', async () => {
      const strangerAstrologer = { id: 77, role: USER_ROLE.ASTROLOGER } as User;
      const completedBooking: any = {
        id: 100,
        bookingType: BOOKING_TYPE.ASTROLOGY,
        status: BOOKING_STATUS.COMPLETED,
        customerId: 10,
        astrologerId: 20,
      };

      mockBookingRepository.findOne.mockResolvedValue(completedBooking);

      await expect(
        service.create(strangerAstrologer, 100, { rating: 4, review: 'Nice' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects astrologer review if astrologer already reviewed', async () => {
      const astrologerUser = { id: 20, role: USER_ROLE.ASTROLOGER } as User;
      const alreadyReviewedBooking: any = {
        id: 100,
        bookingType: BOOKING_TYPE.ASTROLOGY,
        status: BOOKING_STATUS.COMPLETED,
        customerId: 10,
        astrologerId: 20,
        purohitRating: 5,
        purohitReview: 'Already done',
      };

      mockBookingRepository.findOne.mockResolvedValue(alreadyReviewedBooking);

      await expect(
        service.create(astrologerUser, 100, { rating: 4, review: 'Nice' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Rating recalculation for Astrologer', () => {
    it('recalculates both User and AstrologerProfile avgRating on review approval', async () => {
      const booking: any = {
        id: 100,
        bookingType: BOOKING_TYPE.ASTROLOGY,
        customerId: 10,
        astrologerId: 20,
        customerRating: 4.8,
        purohitRating: 5.0,
      };

      mockBookingRepository.findOne.mockResolvedValue(booking);

      const qbMock: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ average: '4.8', count: '5' }),
      };
      mockBookingRepository.createQueryBuilder.mockReturnValue(qbMock);

      mockAstrologerProfileRepository.findOne.mockResolvedValue({ id: 5, userId: 20 });

      await service.updateStatus(100, { status: REVIEW_STATUS.PUBLISHED }, 1);

      expect(mockUserRepository.update).toHaveBeenCalledWith(20, { avgRating: 4.8 });
      expect(mockAstrologerProfileRepository.update).toHaveBeenCalledWith(5, { avgRating: 4.8 });
    });
  });

  describe('BookingType filtering in findAll and getAllCustomerReviews', () => {
    let qbMock: any;

    beforeEach(() => {
      qbMock = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 10,
            bookingType: BOOKING_TYPE.ASTROLOGY,
            customerRating: 5,
            customerReview: 'Great astrology reading',
            reviewStatus: REVIEW_STATUS.PUBLISHED,
            customer: { id: 1, firstName: 'Aarav' },
            astrologer: { id: 2, firstName: 'Acharya' },
          },
        ]),
      };
      mockBookingRepository.createQueryBuilder = jest.fn().mockReturnValue(qbMock);
    });

    it('filters by ASTROLOGY bookingType in findAll', async () => {
      const adminUser = { id: 1, role: USER_ROLE.ADMIN } as User;
      const res = await service.findAll(adminUser, {
        page: 1,
        limit: 10,
        bookingType: BOOKING_TYPE.ASTROLOGY,
      });

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'booking.bookingType = :bookingType',
        { bookingType: BOOKING_TYPE.ASTROLOGY },
      );
      expect(res.data).toHaveLength(1);
      expect(res.data[0].bookingType).toBe(BOOKING_TYPE.ASTROLOGY);
    });

    it('filters by POOJA bookingType in findAll (including null fallback)', async () => {
      const adminUser = { id: 1, role: USER_ROLE.ADMIN } as User;
      await service.findAll(adminUser, {
        page: 1,
        limit: 10,
        bookingType: BOOKING_TYPE.POOJA,
      });

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        '(booking.bookingType = :bookingType OR booking.bookingType IS NULL)',
        { bookingType: BOOKING_TYPE.POOJA },
      );
    });

    it('filters by array of bookingTypes in findAll', async () => {
      const adminUser = { id: 1, role: USER_ROLE.ADMIN } as User;
      await service.findAll(adminUser, {
        page: 1,
        limit: 10,
        bookingType: [BOOKING_TYPE.POOJA, BOOKING_TYPE.ASTROLOGY],
      });

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        '(booking.bookingType IN (:...bookingTypes) OR booking.bookingType IS NULL)',
        { bookingTypes: [BOOKING_TYPE.POOJA, BOOKING_TYPE.ASTROLOGY] },
      );
    });

    it('filters by ASTROLOGY bookingType in getAllCustomerReviews', async () => {
      const res = await service.getAllCustomerReviews({
        page: 1,
        limit: 10,
        bookingType: BOOKING_TYPE.ASTROLOGY,
      });

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'booking.bookingType = :custBookingType',
        { custBookingType: BOOKING_TYPE.ASTROLOGY },
      );
      expect(res.data).toHaveLength(1);
    });
  });
});
