import { Injectable } from '@nestjs/common';

@Injectable()
export class GeofenceService {
  /**
   * Haversine formula — distance in meters between two GPS coordinates.
   */
  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  isWithinGeofence(
    userLat: number,
    userLng: number,
    orgLat: number,
    orgLng: number,
    radiusMeters: number,
  ): { valid: boolean; distance: number } {
    const distance = this.calculateDistance(userLat, userLng, orgLat, orgLng);
    return { valid: distance <= radiusMeters, distance: Math.round(distance) };
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
