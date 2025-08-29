import * as Location from 'expo-location';
import { FieldValue, firebaseFirestore as firestore } from '../firebaseConfig';

export interface UserLocation {
  latitude: number;
  longitude: number;
  country: string;
  state: string;
  city: string;
  address?: string;
  timestamp: Date;
}

export class LocationService {
  private static instance: LocationService;
  private locationSubscription: Location.LocationSubscription | null = null;
  private isTracking = false;

  static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error requesting location permissions:', error);
      return false;
    }
  }

  async getCurrentLocation(): Promise<UserLocation | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return null;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
      });

      // Reverse geocoding to get address details
      const addressResponse = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (addressResponse.length > 0) {
        const address = addressResponse[0];
        return {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          country: address.country || 'Unknown',
          state: address.region || address.subregion || 'Unknown',
          city: address.city || address.district || 'Unknown',
          address: `${address.street || ''} ${address.name || ''}`.trim(),
          timestamp: new Date(),
        };
      }

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        country: 'Unknown',
        state: 'Unknown',
        city: 'Unknown',
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error getting current location:', error);
      return null;
    }
  }

  async startLocationTracking(userId: string): Promise<void> {
    if (this.isTracking) return;

    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return;

      this.isTracking = true;

      // Get initial location
      const initialLocation = await this.getCurrentLocation();
      if (initialLocation) {
        await this.updateUserLocation(userId, initialLocation);
      }

      // Start watching location changes
      this.locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3600000, // Update every 1 hour
          distanceInterval: 1000, // Update if moved more than 1000 meters
        },
        async (location) => {
          const userLocation: UserLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            country: 'Unknown',
            state: 'Unknown',
            city: 'Unknown',
            timestamp: new Date(),
          };

          // Reverse geocoding for address details
          try {
            const addressResponse = await Location.reverseGeocodeAsync({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });

            if (addressResponse.length > 0) {
              const address = addressResponse[0];
              userLocation.country = address.country || 'Unknown';
              userLocation.state = address.region || address.subregion || 'Unknown';
              userLocation.city = address.city || address.district || 'Unknown';
              userLocation.address = `${address.street || ''} ${address.name || ''}`.trim();
            }
          } catch (error) {
            console.error('Error in reverse geocoding:', error);
          }

          await this.updateUserLocation(userId, userLocation);
        }
      );
    } catch (error) {
      console.error('Error starting location tracking:', error);
      this.isTracking = false;
    }
  }

  async stopLocationTracking(): Promise<void> {
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }
    this.isTracking = false;
  }

  private async updateUserLocation(userId: string, location: UserLocation): Promise<void> {
    try {
      // Update user's current location
      await firestore.collection('users').doc(userId).update({
        currentLocation: {
          latitude: location.latitude,
          longitude: location.longitude,
          country: location.country,
          state: location.state,
          city: location.city,
          address: location.address,
          timestamp: FieldValue.serverTimestamp(),
        },
        lastLocationUpdate: FieldValue.serverTimestamp(),
      });

      // Add to location history
      await firestore
        .collection('users')
        .doc(userId)
        .collection('locationHistory')
        .add({
          ...location,
          timestamp: FieldValue.serverTimestamp(),
        });

      console.log('Location updated for user:', userId);
    } catch (error) {
      console.error('Error updating user location:', error);
    }
  }

  async getLocationHistory(userId: string, limit: number = 100): Promise<UserLocation[]> {
    try {
      const snapshot = await firestore
        .collection('users')
        .doc(userId)
        .collection('locationHistory')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map(doc => ({
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date(),
      })) as UserLocation[];
    } catch (error) {
      console.error('Error getting location history:', error);
      return [];
    }
  }
}

export default LocationService.getInstance();
