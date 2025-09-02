import messaging from '@react-native-firebase/messaging';
import { Alert, Platform } from 'react-native';
import { firebaseFirestore } from '../firebaseConfig';

export class NotificationService {
  private static instance: NotificationService;
  private fcmToken: string | null = null;

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Request notification permissions and get FCM token
   */
  async requestPermissionsAndGetToken(userId: string): Promise<string | null> {
    try {
      console.log('🔐 Starting notification permission request for user:', userId);
      
      // Check current permission status
      const authStatus = await messaging().hasPermission();
      console.log('📱 Current permission status:', authStatus);

      let finalStatus = authStatus;

      // If permission is not granted, request it
      if (authStatus === messaging.AuthorizationStatus.DENIED) {
        console.log('📝 Requesting notification permission...');
        const requestResult = await messaging().requestPermission();
        finalStatus = requestResult;
        console.log('📱 Permission request result:', requestResult);
      }

      // Check if permission was granted
      if (finalStatus === messaging.AuthorizationStatus.AUTHORIZED || 
          finalStatus === messaging.AuthorizationStatus.PROVISIONAL) {
        
        console.log('✅ Permission granted, getting FCM token...');
        
        // Get the token
        const token = await messaging().getToken();
        this.fcmToken = token;
        
        console.log('🔑 FCM Token received, length:', token.length);
        console.log('🔑 FCM Token preview:', token.substring(0, 20) + '...');
        
        // Save token to user's document in Firestore
        await this.saveTokenToFirestore(userId, token);
        
        return token;
      } else {
        console.log('❌ Permission denied or not determined');
        
        // Show alert to guide user to settings
        if (Platform.OS === 'ios') {
          Alert.alert(
            'Permission Required',
            'Please enable notifications in Settings > Notifications > Amigo',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => this.openSettings() }
            ]
          );
        } else {
          Alert.alert(
            'Permission Required',
            'Please enable notifications in your device settings to receive notifications.',
            [{ text: 'OK' }]
          );
        }
        
        return null;
      }
    } catch (error) {
      console.error('❌ Error getting FCM token:', error);
      
      // Show error alert
      Alert.alert(
        'Error',
        'Failed to get notification permissions. Please try again.',
        [{ text: 'OK' }]
      );
      
      return null;
    }
  }

  /**
   * Open device settings (iOS only)
   */
  private openSettings() {
    if (Platform.OS === 'ios') {
      // For iOS, we can't programmatically open settings
      // The user will need to do it manually
      console.log('Please open Settings > Notifications > Amigo manually');
    }
  }

  /**
   * Save FCM token to user's Firestore document
   */
  private async saveTokenToFirestore(userId: string, token: string): Promise<void> {
    try {
      console.log('💾 Saving FCM token to Firestore...');
      console.log('👤 User ID:', userId);
      console.log('🔑 Token length:', token.length);
      console.log('🔑 Token preview:', token.substring(0, 20) + '...');
      
      await firebaseFirestore.collection('users').doc(userId).update({
        fcmToken: token,
        pushTokenUpdatedAt: new Date(),
      });
      console.log('✅ FCM token saved to Firestore successfully');
      
      // Verify the token was saved
      const userDoc = await firebaseFirestore.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        console.log('🔍 Verification - FCM token in Firestore:', !!userData?.fcmToken);
        console.log('🔍 Verification - Token length in Firestore:', userData?.fcmToken?.length || 0);
      }
    } catch (error) {
      console.error('❌ Error saving FCM token to Firestore:', error);
      throw error; // Re-throw to handle in calling function
    }
  }

  /**
   * Remove FCM token when user logs out
   */
  async removeToken(userId: string): Promise<void> {
    try {
      await firebaseFirestore.collection('users').doc(userId).update({
        fcmToken: null,
        pushTokenUpdatedAt: new Date(),
      });
      this.fcmToken = null;
      console.log('FCM token removed from Firestore');
    } catch (error) {
      console.error('Error removing FCM token from Firestore:', error);
    }
  }

  /**
   * Send local notification (for testing)
   */
  async sendLocalNotification(title: string, body: string, data?: any): Promise<void> {
    try {
      // For local notifications, we'll use a simple approach
      // You can implement this using react-native-toast-message or similar
      console.log('Local notification:', { title, body, data });
      
      // Show a simple alert for testing
      Alert.alert(title, body, [{ text: 'OK' }]);
    } catch (error) {
      console.error('Error sending local notification:', error);
    }
  }

  /**
   * Get current FCM token
   */
  getCurrentToken(): string | null {
    return this.fcmToken;
  }

  /**
   * Check if notifications are enabled
   */
  async areNotificationsEnabled(): Promise<boolean> {
    try {
      const authStatus = await messaging().hasPermission();
      const enabled = authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
                     authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      
      console.log('Checking notification permissions:', authStatus, 'Enabled:', enabled);
      return enabled;
    } catch (error) {
      console.error('Error checking notification permissions:', error);
      return false;
    }
  }

  /**
   * Set up notification listeners
   */
  setupNotificationListeners() {
    // Handle background messages
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      console.log('Message handled in the background!', remoteMessage);
    });

    // Handle foreground messages
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      console.log('A new FCM message arrived!', remoteMessage);
      // You can show a local notification here
    });

    return unsubscribe;
  }

  /**
   * Get initial notification when app is opened from notification
   */
  async getInitialNotification() {
    try {
      const remoteMessage = await messaging().getInitialNotification();
      if (remoteMessage) {
        console.log('Notification caused app to open:', remoteMessage);
        
        // Extract navigation data from notification
        const navigationData = this.extractNavigationData(remoteMessage);
        
        return {
          ...remoteMessage,
          navigationData
        };
      }
    } catch (error) {
      console.error('Error getting initial notification:', error);
    }
    return null;
  }

  /**
   * Extract navigation data from notification message
   */
  private extractNavigationData(remoteMessage: any) {
    const data = remoteMessage.data || {};
    
    switch (data.type) {
      case 'message':
        return {
          screen: 'chat',
          params: {
            chatId: data.chatId,
            userId: data.senderId,
            userName: data.senderName,
            userPhone: data.userPhone || '',
          }
        };
      case 'call':
        return {
          screen: 'call',
          params: {
            callId: data.callId,
            callerId: data.callerId,
            callerName: data.callerName,
            callType: data.callType,
          }
        };
      case 'admin':
        return {
          screen: 'admin',
          params: {
            notificationId: data.notificationId,
            title: data.title,
          }
        };
      default:
        return null;
    }
  }

  /**
   * Handle notification response (when user taps notification)
   */
  async handleNotificationResponse(remoteMessage: any) {
    try {
      const navigationData = this.extractNavigationData(remoteMessage);
      
      if (navigationData) {
        console.log('Navigation data extracted:', navigationData);
        // You can emit an event here or use a callback to handle navigation
        // For now, we'll just log it
        return navigationData;
      }
    } catch (error) {
      console.error('Error handling notification response:', error);
    }
    return null;
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();
