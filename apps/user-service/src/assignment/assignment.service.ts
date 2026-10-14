import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  Booking,
  BOOKING_MODE,
  BOOKING_STATUS,
  PurohitProfile,
  PurohitServiceArea,
  PUROHIT_VERIFICATION_STATUS,
  USER_ROLE,
  USER_STATUS,
  CustomerAddress,
} from '@poojawala/entities';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);
  private readonly conflictWindowMinutes = 120;

  async findEligiblePurohitIds(
    manager: EntityManager,
    booking: Booking,
    excludedPurohitProfileIds: number[] = [],
  ): Promise<number[]> {
    const isOnline = booking.bookingMode === BOOKING_MODE.ONLINE || (booking.bookingMode as string) === 'ONLINE';
    const purohitProfileRepository = manager.getRepository(PurohitProfile);

    let customerLatitude: number | undefined;
    let customerLongitude: number | undefined;

    if (!isOnline) {
      let customerLocation = this.getCustomerCoordinates(booking);

      if (!customerLocation && booking.customerAddressId) {
        const address = await manager.getRepository(CustomerAddress).findOne({
          where: { id: booking.customerAddressId },
          select: ['latitude', 'longitude', 'city'],
        });
        if (address && address.latitude != null && address.longitude != null) {
          const lat = Number(address.latitude);
          const lon = Number(address.longitude);
          if (
            Number.isFinite(lat) &&
            Number.isFinite(lon) &&
            lat >= -90 &&
            lat <= 90 &&
            lon >= -180 &&
            lon <= 180
          ) {
            customerLocation = { latitude: lat, longitude: lon };
          }
        }
      }

      if (!customerLocation) {
        this.logger.warn(
          `Booking ${booking.id || 'new'} does not contain valid customer coordinates`,
        );
        return [];
      }

      customerLatitude = customerLocation.latitude;
      customerLongitude = customerLocation.longitude;
    }

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
      .where('profile.verificationStatus = :verificationStatus', {
        verificationStatus: PUROHIT_VERIFICATION_STATUS.APPROVED,
      })
      .andWhere('purohit_user.role = :purohitRole', {
        purohitRole: USER_ROLE.PUROHIT,
      })
      .andWhere('purohit_user.status = :purohitStatus', {
        purohitStatus: USER_STATUS.ACTIVE,
      });

    if (isOnline) {
      candidateQueryBuilder
        .andWhere('profile.isOnlineAvailable = :isOnlineAvailable', {
          isOnlineAvailable: true,
        })
        .andWhere('purohit_service.isOnline = :isOnline', { isOnline: true });
    } else {
      candidateQueryBuilder
        .innerJoin(
          PurohitServiceArea,
          'service_area',
          `
            service_area.purohitId = purohit_user.id
          `,
        )
        .andWhere('profile.isOfflineAvailable = :isOfflineAvailable', {
          isOfflineAvailable: true,
        })
        .andWhere('purohit_service.isOffline = :isOffline', { isOffline: true })
        .andWhere('service_area.latitude IS NOT NULL')
        .andWhere('service_area.longitude IS NOT NULL')
        .andWhere('service_area.deletedAt IS NULL')
        .andWhere(
          `(2 * :earthRadiusKm * ASIN(
            SQRT(
              LEAST(1.0, GREATEST(0.0,
                POWER(SIN(RADIANS(CAST(service_area.latitude AS float) - :customerLat) / 2), 2) +
                COS(RADIANS(:customerLat)) * COS(RADIANS(CAST(service_area.latitude AS float))) *
                POWER(SIN(RADIANS(CAST(service_area.longitude AS float) - :customerLon) / 2), 2)
              ))
            )
          )) <= CAST(COALESCE(service_area."serviceRadiusKm", 10) AS float)`,
          {
            earthRadiusKm,
            customerLat: customerLatitude,
            customerLon: customerLongitude,
          },
        );
    }

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
    candidateQueryBuilder.select('DISTINCT profile.id', 'purohitProfileId');

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
    const latitude = Number(
      snapshot['latitude'] ?? (booking.customerAddress as any)?.latitude,
    );
    const longitude = Number(
      snapshot['longitude'] ?? (booking.customerAddress as any)?.longitude,
    );

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

  public isWithinServiceRadius(
    purohitLatitude: number | string | null | undefined,
    purohitLongitude: number | string | null | undefined,
    customerLatitude: number,
    customerLongitude: number,
    serviceRadiusKm: number = 10,
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

    return distanceKm <= serviceRadiusKm;
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
