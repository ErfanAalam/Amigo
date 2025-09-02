import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { notificationService } from '../utils/NotificationService';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  fcmToken: string | null;
  notification: any | null;
  isNotificationsEnabled: boolean;
  requestPermissions: () => Promise<void>;
  sendTestNotification: () => Promise<void>;
  clearNotifications: () => Promise<void>;
  refreshNotificationStatus: () => Promise<void>;
  handleNotificationTap: (notification: any) => void;
  navigationData: any | null;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<any | null>(null);
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(false);
  const [navigationData, setNavigationData] = useState<any | null>(null);
  
  const { userData } = useAuth();

  // Request notification permissions and get token
  const requestPermissions = async () => {
    if (userData?.uid) {
      try {
        console.log('Requesting notification permissions...');
        const token = await notificationService.requestPermissionsAndGetToken(userData.uid);
        setFcmToken(token);
        
        // Refresh the notification status after requesting permissions
        const enabled = await notificationService.areNotificationsEnabled();
        setIsNotificationsEnabled(enabled);
        
        // Set up notification listeners
        notificationService.setupNotificationListeners();
        
        console.log('FCM token:', token, 'Notifications enabled:', enabled);
        
        // Show success message
        // if (token) {
        //   Alert.alert(
        //     'Success', 
        //     'Notification permissions granted! You will now receive notifications.',
        //     [{ text: 'OK' }]
        //   );
        // }
      } catch (error) {
        console.error('Error requesting notification permissions:', error);
        Alert.alert(
          'Error', 
          'Failed to get notification permissions. Please try again.',
          [{ text: 'OK' }]
        );
      }
    }
  };

  // Send test notification
  const sendTestNotification = async () => {
    try {
      await notificationService.sendLocalNotification(
        'Test Notification',
        'This is a test notification from your app!',
        { type: 'test' }
      );
    } catch (error) {
      console.error('Error sending test notification:', error);
    }
  };

  // Clear all notifications
  const clearNotifications = async () => {
    try {
      // For FCM, we can't clear notifications like with expo-notifications
      // But we can reset local state
      setNotification(null);
      console.log('Notifications cleared from local state');
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  };

  // Refresh notification status
  const refreshNotificationStatus = async () => {
    try {
      const enabled = await notificationService.areNotificationsEnabled();
      setIsNotificationsEnabled(enabled);
      console.log('Notification status refreshed:', enabled);
    } catch (error) {
      console.error('Error refreshing notification status:', error);
    }
  };

  // Handle notification tap
  const handleNotificationTap = (notification: any) => {
    try {
      const navigationData = notificationService.handleNotificationResponse(notification);
      setNavigationData(navigationData);
      console.log('Notification tapped, navigation data:', navigationData);
    } catch (error) {
      console.error('Error handling notification tap:', error);
    }
  };

  // Set up notification listeners
  useEffect(() => {
    // Set up FCM listeners
    const unsubscribe = notificationService.setupNotificationListeners();

    // Check for initial notification
    notificationService.getInitialNotification().then(initialNotification => {
      if (initialNotification) {
        setNotification(initialNotification);
        if (initialNotification.navigationData) {
          setNavigationData(initialNotification.navigationData);
        }
      }
    });

    // Clean up listeners
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Request permissions when user logs in
  useEffect(() => {
    if (userData?.uid) {
      console.log('🔐 User logged in, requesting notification permissions for:', userData.uid);
      requestPermissions();
    }
  }, [userData?.uid]);

  // Remove token when user logs out
  useEffect(() => {
    if (!userData?.uid && fcmToken) {
      console.log('🚪 User logged out, removing FCM token');
      notificationService.removeToken(fcmToken);
      setFcmToken(null);
      setIsNotificationsEnabled(false);
    }
  }, [userData?.uid, fcmToken]);

  // Log current state for debugging
  useEffect(() => {
    console.log('🔍 NotificationContext state:', {
      fcmToken: fcmToken ? `${fcmToken.substring(0, 20)}...` : null,
      isNotificationsEnabled,
      userDataUid: userData?.uid
    });
  }, [fcmToken, isNotificationsEnabled, userData?.uid]);

  const value: NotificationContextType = {
    fcmToken,
    notification,
    isNotificationsEnabled,
    requestPermissions,
    sendTestNotification,
    clearNotifications,
    refreshNotificationStatus,
    handleNotificationTap,
    navigationData,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
