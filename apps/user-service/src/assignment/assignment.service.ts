import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Booking, BOOKING_STATUS, PurohitProfile, PurohitServiceArea, PUROHIT_VERIFICATION_STATUS, USER_ROLE, USER_STATUS, } from '@poojawala/entities';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);
  private readonly conflictWindowMinutes = 120;
  private readonly serviceRadiusKm = 10;

  async findEligiblePurohitIds(
    manager: EntityManager,
    booking: Booking,
    excludedPurohitProfileIds: number[] = [],
  ): Promise<number[]> {
    const purohitProfileRepository = manager.getRepository(PurohitProfile);
    const bookingRepository = manager.getRepository(Booking);
    const customerLocation = this.getCustomerCoordinates(booking);

    if (!customerLocation) {
      this.logger.warn(
        `Booking ${booking.id} does not contain valid customer coordinates`,
      );
      return [];
    }

    const { latitude: customerLatitude, longitude: customerLongitude } = customerLocation;

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

      .andWhere('service_area.deletedAt IS NULL')

      .select('profile.id', 'purohitProfileId')

      .addSelect('service_area.latitude', 'latitude')

      .addSelect('service_area.longitude', 'longitude');


    const candidatePurohits = await candidateQueryBuilder.getRawMany<{
      purohitProfileId: string;
      latitude: string;
      longitude: string;
    }>();

    /*
     * Haversine filtering.
     */
    const nearbyPurohitIds = new Set<number>();

    for (const candidate of candidatePurohits) {
      const purohitProfileId = Number(candidate.purohitProfileId);

      if (!Number.isInteger(purohitProfileId) || purohitProfileId <= 0) {
        continue;
      }

      if (excludedPurohitProfileIds.includes(purohitProfileId)) {
        continue;
      }

      const isNearby = this.isWithinServiceRadius(
        candidate.latitude,
        candidate.longitude,
        customerLatitude,
        customerLongitude,
      );

      if (isNearby) {
        nearbyPurohitIds.add(purohitProfileId);
      }
    }

    const matchingPurohitIds = [...nearbyPurohitIds];

    if (!matchingPurohitIds.length) {
      this.logger.log(
        `No Purohits found within ${this.serviceRadiusKm} KM for booking ${booking.id}`,
      );
      return [];
    }

    /*
     * Remove Purohits who have conflicting
     * active bookings.
     */
    const conflictStart = new Date(
      booking.scheduledAt.getTime() - this.conflictWindowMinutes * 60 * 1000,
    );

    const conflictEnd = new Date(
      booking.scheduledAt.getTime() + this.conflictWindowMinutes * 60 * 1000,
    );

    const busyPurohits = await bookingRepository
      .createQueryBuilder('busy_booking')
      .select('busy_booking.purohitId', 'purohitId')
      .where('busy_booking.purohitId IN (:...purohitIds)', {
        purohitIds: matchingPurohitIds,
      })
      .andWhere('busy_booking.id != :currentBookingId', {
        currentBookingId: booking.id,
      })
      .andWhere('busy_booking.status IN (:...busyStatuses)', {
        busyStatuses: [
          BOOKING_STATUS.ACCEPTED,
          BOOKING_STATUS.ENROUTE,
          BOOKING_STATUS.ARRIVED,
          BOOKING_STATUS.ONGOING,
        ],
      })
      .andWhere(
        'busy_booking."scheduledAt" BETWEEN :conflictStart AND :conflictEnd',
        {
          conflictStart,
          conflictEnd,
        },
      )
      .getRawMany<{ purohitId: string }>();


    const busyPurohitIds = new Set(
      busyPurohits
        .map(({ purohitId }) => Number(purohitId))
        .filter(Number.isInteger),
    );

    const availablePurohitIds = matchingPurohitIds.filter(
      (purohitProfileId) => !busyPurohitIds.has(purohitProfileId),
    );

    this.logger.log(
      `Booking ${booking.id}: ` +
      `${matchingPurohitIds.length} nearby Purohits, ` +
      `${availablePurohitIds.length} available.`,
    );

    return availablePurohitIds;
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

    return distanceKm <= this.serviceRadiusKm;
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
