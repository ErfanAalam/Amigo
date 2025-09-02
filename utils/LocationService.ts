import * as Location from 'expo-location';
import { FieldValue, firebaseFirestore as firestore } from '../firebaseConfig';

export interface UserLocation {
  latitude: number;
  longitude: number;
  country: string;
  state: string;
  city: string;
  address?: string;
  ipAddress?: string;
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

  async getUserIPAddress(): Promise<string | null> {
    try {
      // Try multiple IP geolocation services for redundancy
      const services = [
        'https://api.ipify.org?format=json',
        'https://api64.ipify.org?format=json',
        'https://httpbin.org/ip',
        'https://ipapi.co/json/',
        'https://ipinfo.io/json'
      ];

      for (const service of services) {
        try {
          const response = await fetch(service, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'AmigoApp/1.0',
            },
          });

          if (response.ok) {
            const data = await response.json();
            
            // Handle different response formats
            if (data.ip) {
              console.log('IP address fetched successfully from:', service);
              return data.ip;
            } else if (data.origin) {
              // httpbin.org returns {origin: "ip"}
              console.log('IP address fetched successfully from:', service);
              return data.origin;
            } else if (data.query) {
              // ipapi.co returns {query: "ip"}
              console.log('IP address fetched successfully from:', service);
              return data.query;
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.log(`Failed to get IP from ${service}:`, errorMessage);
          continue; // Try next service
        }
      }

      console.log('All IP services failed, returning null');
      return null;
    } catch (error) {
      console.error('Error getting user IP address:', error);
      return null;
    }
  }

  async getIPLocationData(ipAddress: string): Promise<{
    country: string;
    state: string;
    city: string;
    latitude?: number;
    longitude?: number;
  } | null> {
    try {
      // Use ip-api.com (free tier, no API key required)
      const response = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,message,country,regionName,city,lat,lon`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.status === 'success') {
          return {
            country: data.country || 'Unknown',
            state: data.regionName || 'Unknown',
            city: data.city || 'Unknown',
            latitude: data.lat,
            longitude: data.lon,
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting IP location data:', error);
      return null;
    }
  }

  async getCurrentLocation(): Promise<UserLocation | null> {
    try {
      // Get IP address first
      const ipAddress = await this.getUserIPAddress();
      let ipLocationData = null;
      
      if (ipAddress) {
        ipLocationData = await this.getIPLocationData(ipAddress);
      }

      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        // If no GPS permission, return IP-based location
        if (ipLocationData) {
          return {
            latitude: ipLocationData.latitude || 0,
            longitude: ipLocationData.longitude || 0,
            country: ipLocationData.country,
            state: ipLocationData.state,
            city: ipLocationData.city,
            ipAddress: ipAddress || undefined,
            timestamp: new Date(),
          };
        }
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
          country: address.country || ipLocationData?.country || 'Unknown',
          state: address.region || address.subregion || ipLocationData?.state || 'Unknown',
          city: address.city || address.district || ipLocationData?.city || 'Unknown',
          address: `${address.street || ''} ${address.name || ''}`.trim(),
          ipAddress: ipAddress || undefined,
          timestamp: new Date(),
        };
      }

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        country: ipLocationData?.country || 'Unknown',
        state: ipLocationData?.state || 'Unknown',
        city: ipLocationData?.city || 'Unknown',
        ipAddress: ipAddress || undefined,
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
          // Get IP address for tracking updates
          const ipAddress = await this.getUserIPAddress();
          
          const userLocation: UserLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            country: 'Unknown',
            state: 'Unknown',
            city: 'Unknown',
            ipAddress: ipAddress || undefined,
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
          ipAddress: location.ipAddress,
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
