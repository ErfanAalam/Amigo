import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { useNotifications } from '../context/NotificationContext';

interface NotificationHandlerProps {
  children: React.ReactNode;
}

export const NotificationHandler: React.FC<NotificationHandlerProps> = ({ children }) => {
  const { navigationData } = useNotifications();
  const router = useRouter();

  useEffect(() => {
    if (navigationData) {
      console.log('🔔 Handling notification navigation:', navigationData);
      
      // Handle different notification types
      switch (navigationData.screen) {
        case 'chat':
          router.push({
            pathname: '/chat',
            params: navigationData.params
          });
          break;
          
        case 'audioCall':
          // For call notifications, navigate to the call screen
          router.push({
            pathname: '/audioCall',
            params: {
              callId: navigationData.params?.callId,
              channelId: navigationData.params?.channelId || '',
              isInitiator: 'false',
              callerName: navigationData.params?.callerName,
              callType: navigationData.params?.callType,
              fromNotification: 'true', // Flag to indicate this came from notification
            }
          });
          break;
          
        default:
          console.log('🔔 Unknown notification screen:', navigationData.screen);
      }
    }
  }, [navigationData, router]);

  return <>{children}</>;
};
