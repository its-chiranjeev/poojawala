import {
  Service,
  BOOKING_MODE,
  TEMPLE_VERIFICATION_STATUS,
} from '@poojawala/entities';
import { isCityMatch } from './city.util';

export interface ServiceAvailabilityParams {
  mode: BOOKING_MODE | 'ONLINE' | 'OFFLINE';
  city?: string | null;
  state?: string | null;
}

export interface ServiceAvailabilityResult {
  isAvailable: boolean;
  reason?: string;
}

/**
 * Normalizes state name for deterministic comparison:
 * - Trims leading/trailing whitespace
 * - Converts to lowercase
 * - Normalizes consecutive whitespace into a single space
 */
export function normalizeStateName(stateName?: string | null): string {
  if (!stateName) return '';
  return stateName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Pure reusable validation utility for service availability.
 * Used identically by both ServiceService (guest availability check)
 * and BookingService (createBooking / createBookingByAdmin).
 *
 * Rules:
 * 1. Reject inactive services.
 * 2. Validate temple restrictions if service is bound to a temple.
 * 3. Reject ONLINE mode if service.isOnline is false.
 * 4. Reject OFFLINE mode if service.isOffline is false.
 * 5. For ONLINE, skip location validation (worldwide virtual delivery).
 * 6. For OFFLINE:
 *    - Require a valid city.
 *    - If service.isGlobal is true, accept (nationwide offline coverage).
 *    - If service.isGlobal is false, match city using isCityMatch().
 *    - If both configured and requested states exist, validate state compatibility.
 *    - A city match with conflicting states is rejected.
 *    - State match alone without city match is never accepted.
 */
export function validateServiceAvailability(
  service: Service,
  params: ServiceAvailabilityParams,
): ServiceAvailabilityResult {
  // 1. Inactive service validation
  if (!service.isActive) {
    return {
      isAvailable: false,
      reason: 'Service is currently inactive',
    };
  }

  // 2. Temple validation (if service is linked to a temple)
  if (service.templeId) {
    if (
      !service.temple ||
      service.temple.deletedAt ||
      !service.temple.isActive ||
      (service.temple.verificationStatus &&
        service.temple.verificationStatus !== TEMPLE_VERIFICATION_STATUS.APPROVED)
    ) {
      return {
        isAvailable: false,
        reason: 'The temple associated with this service is not approved or available for booking',
      };
    }
  }

  // 3. Fulfillment mode validation
  const requestedMode =
    typeof params.mode === 'string'
      ? (params.mode.trim().toUpperCase() as BOOKING_MODE)
      : params.mode;

  if (requestedMode !== BOOKING_MODE.ONLINE && requestedMode !== BOOKING_MODE.OFFLINE) {
    return {
      isAvailable: false,
      reason: 'Invalid booking mode',
    };
  }

  if (requestedMode === BOOKING_MODE.ONLINE && !service.isOnline) {
    return {
      isAvailable: false,
      reason: 'This service is not available for online booking',
    };
  }

  if (requestedMode === BOOKING_MODE.OFFLINE && !service.isOffline) {
    return {
      isAvailable: false,
      reason: 'This service is not available for offline booking',
    };
  }

  // 4. Online bookings skip location checks (virtual delivery worldwide)
  if (requestedMode === BOOKING_MODE.ONLINE) {
    return {
      isAvailable: true,
    };
  }

  // 5. Offline bookings require city
  const requestedCity = params.city?.trim();
  if (!requestedCity) {
    return {
      isAvailable: false,
      reason: 'City is required for offline booking',
    };
  }

  // 6. Global offline coverage (nationwide)
  if (service.isGlobal) {
    return {
      isAvailable: true,
    };
  }

  // 7. City-specific offline coverage validation
  const serviceCities = Array.isArray(service.cities) ? service.cities : [];
  const requestedStateNorm = normalizeStateName(params.state);

  let matchedCityFound = false;
  let stateConflict = false;

  for (const c of serviceCities) {
    const cityName = typeof c === 'string' ? c : c?.name;
    if (!cityName) continue;

    if (isCityMatch(cityName, requestedCity)) {
      matchedCityFound = true;
      const configuredState = typeof c === 'object' && c !== null ? c.state : undefined;
      const configuredStateNorm = normalizeStateName(configuredState);

      // If both configured state and requested state exist, verify compatibility
      if (configuredStateNorm && requestedStateNorm) {
        if (configuredStateNorm === requestedStateNorm) {
          return { isAvailable: true };
        } else {
          stateConflict = true;
        }
      } else {
        // State omitted by either service configuration or customer -> accept city match
        return { isAvailable: true };
      }
    }
  }

  if (matchedCityFound && stateConflict) {
    return {
      isAvailable: false,
      reason: 'Selected service is not available in the requested city and state',
    };
  }

  return {
    isAvailable: false,
    reason: 'Selected service is not available in the booking city.',
  };
}
