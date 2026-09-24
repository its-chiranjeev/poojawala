import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Booking, BOOKING_STATUS, PurohitProfile, PurohitServiceArea, PUROHIT_VERIFICATION_STATUS, USER_ROLE, USER_STATUS, CustomerAddress } from '@poojawala/entities';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);
  private readonly conflictWindowMinutes = 120;

  async findEligiblePurohitIds(
    manager: EntityManager,
    booking: Booking,
    excludedPurohitProfileIds: number[] = [],
  ): Promise<number[]> {
    const purohitProfileRepository = manager.getRepository(PurohitProfile);
    const customerLocation = this.getCustomerCoordinates(booking);

    if (!customerLocation) {
      this.logger.warn(
        `Booking ${booking.id || 'new'} does not contain valid customer coordinates`,
      );
      return [];
    }

    let bookingCity = (
      booking.customerAddress?.city ||
      (booking.addressSnapshot as any)?.city ||
      ''
    ).trim();

    if (!bookingCity && booking.customerAddressId) {
      const address = await manager.getRepository(CustomerAddress).findOne({
        where: { id: booking.customerAddressId },
        select: ['city'],
      });
      bookingCity = address?.city?.trim() || '';
    }

    const { latitude: customerLatitude, longitude: customerLongitude } = customerLocation;

    const conflictStart = new Date(
      booking.scheduledAt.getTime() - this.conflictWindowMinutes * 60 * 1000,
    );
    const conflictEnd = new Date(
      booking.scheduledAt.getTime() + this.conflictWindowMinutes * 60 * 1000,
    );
    const earthRadiusKm = 6371;

    const candidateQueryBuilder = purohitProfileRepository
      .createQueryBuilder('profile')
      .innerJoin('profile.user', 'purohit_user')
      .innerJoin(
        'profile.purohitServices',
        'purohit_service',
        `
          purohit_service.serviceId = :serviceId
          AND purohit_service.isActive = :isServiceActive
        `,
        {
          serviceId: booking.serviceId,
          isServiceActive: true,
        },
      )
      .innerJoin(
        PurohitServiceArea,
        'service_area',
        `
          service_area.purohitId = purohit_user.id
        `,
      )
      .where('profile.verificationStatus = :verificationStatus', {
        verificationStatus: PUROHIT_VERIFICATION_STATUS.APPROVED,
      })
      .andWhere('profile.isOfflineAvailable = :isOfflineAvailable', {
        isOfflineAvailable: true,
      })
      .andWhere('purohit_user.role = :purohitRole', {
        purohitRole: USER_ROLE.PUROHIT,
      })
      .andWhere('purohit_user.status = :purohitStatus', {
        purohitStatus: USER_STATUS.ACTIVE,
      })
      .andWhere('service_area.latitude IS NOT NULL')
      .andWhere('service_area.longitude IS NOT NULL')
      .andWhere('service_area.deletedAt IS NULL');

    if (bookingCity) {
      candidateQueryBuilder.andWhere(
        'LOWER(TRIM(service_area.city)) = LOWER(TRIM(:bookingCity))',
        { bookingCity },
      );
    }

    // Haversine filtering in SQL
    candidateQueryBuilder.andWhere(
      `(${earthRadiusKm} * ACOS(
        LEAST(1.0, GREATEST(-1.0,
          COS(RADIANS(:customerLat)) * COS(RADIANS(CAST(service_area.latitude AS float))) *
          COS(RADIANS(CAST(service_area.longitude AS float)) - RADIANS(:customerLon)) +
          SIN(RADIANS(:customerLat)) * SIN(RADIANS(CAST(service_area.latitude AS float)))
        ))
      )) <= service_area."serviceRadiusKm"`,
      {
        customerLat: customerLatitude,
        customerLon: customerLongitude,
      },
    );

    if (excludedPurohitProfileIds.length > 0) {
      candidateQueryBuilder.andWhere('profile.id NOT IN (:...excludedIds)', {
        excludedIds: excludedPurohitProfileIds,
      });
    }

    // Busy booking filtering in SQL using NOT EXISTS
    const queryParams: Record<string, any> = {
      conflictStart,
      conflictEnd,
      busyStatuses: [
        BOOKING_STATUS.ACCEPTED,
        BOOKING_STATUS.ENROUTE,
        BOOKING_STATUS.ARRIVED,
        BOOKING_STATUS.ONGOING,
      ],
    };

    let excludeCurrentBookingCondition = '';
    if (booking.id) {
      excludeCurrentBookingCondition = 'AND busy_booking.id != :currentBookingId';
      queryParams.currentBookingId = booking.id;
    }

    candidateQueryBuilder.andWhere(
      `NOT EXISTS (
        SELECT 1 FROM bookings busy_booking
        WHERE busy_booking."purohitId" = profile.id
        ${excludeCurrentBookingCondition}
        AND busy_booking.status IN (:...busyStatuses)
        AND busy_booking."scheduledAt" BETWEEN :conflictStart AND :conflictEnd
      )`,
    );
    candidateQueryBuilder.setParameters(queryParams);
    candidateQueryBuilder.select('profile.id', 'purohitProfileId');

    const availablePurohits = await candidateQueryBuilder.getRawMany<{
      purohitProfileId: string;
    }>();

    const availablePurohitIds = availablePurohits
      .map(({ purohitProfileId }) => Number(purohitProfileId))
      .filter(Number.isInteger);

    this.logger.log(
      `Booking ${booking.id || 'new'}: ${availablePurohitIds.length} available Purohits found via optimized SQL.`,
    );

    return availablePurohitIds;
  }

  async hasOverlappingBooking(
    manager: EntityManager,
    purohitId: number,
    scheduledAt: Date,
    excludeBookingId?: number,
  ): Promise<boolean> {
    const conflictStart = new Date(
      scheduledAt.getTime() - this.conflictWindowMinutes * 60 * 1000,
    );
    const conflictEnd = new Date(
      scheduledAt.getTime() + this.conflictWindowMinutes * 60 * 1000,
    );

    const busyStatuses = [
      BOOKING_STATUS.ACCEPTED,
      BOOKING_STATUS.ENROUTE,
      BOOKING_STATUS.ARRIVED,
      BOOKING_STATUS.ONGOING,
    ];

    const queryBuilder = manager.getRepository(Booking)
      .createQueryBuilder('booking')
      .where('booking.purohitId = :purohitId', { purohitId })
      .andWhere('booking.status IN (:...busyStatuses)', { busyStatuses })
      .andWhere('booking.scheduledAt BETWEEN :conflictStart AND :conflictEnd', {
        conflictStart,
        conflictEnd,
      });

    if (excludeBookingId) {
      queryBuilder.andWhere('booking.id != :excludeBookingId', { excludeBookingId });
    }

    const count = await queryBuilder.getCount();
    return count > 0;
  }

  private getCustomerCoordinates(booking: Booking): {
    latitude: number;
    longitude: number;
  } | null {
    const snapshot = (booking.addressSnapshot ?? {}) as Record<string, unknown>;
    const latitude = Number(snapshot['latitude']);
    const longitude = Number(snapshot['longitude']);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return null;
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return null;
    }

    return {
      latitude,
      longitude,
    };
  }

  private isWithinServiceRadius(
    purohitLatitude: number | string | null | undefined,
    purohitLongitude: number | string | null | undefined,
    customerLatitude: number,
    customerLongitude: number,
  ): boolean {
    const latitude = Number(purohitLatitude);
    const longitude = Number(purohitLongitude);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return false;
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return false;
    }

    const distanceKm = this.calculateHaversineDistance(
      latitude,
      longitude,
      customerLatitude,
      customerLongitude,
    );

    return false; // isWithinServiceRadius is deprecated/unused, returning false to satisfy compiler
  }

  private calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const earthRadiusKm = 6371;
    const toRadians = (degree: number): number => degree * (Math.PI / 180);
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const latitude1 = toRadians(lat1);
    const latitude2 = toRadians(lat2);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusKm * c;
  }
}
