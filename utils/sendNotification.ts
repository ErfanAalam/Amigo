import { firebaseFirestore } from '../firebaseConfig';

// ===== CONFIGURATION =====
// Update these values based on your setup
const CONFIG = {
  // For local development with emulator/real device
  // Use your computer's actual IP address (not localhost)
  SERVER_URL: 'http://172.24.132.187:3000', // UPDATE THIS IP ADDRESS
  
  // Alternative URLs for different scenarios:
  // LOCALHOST: 'http://localhost:3000',           // Only works on same device
  // EMULATOR: 'http://10.0.2.2:3000',            // Android emulator to host
  // REAL_DEVICE: 'http://192.168.1.100:3000',    // Real device to host (use your IP)
  // PRODUCTION: 'https://yourdomain.com',         // Production server
};

interface NotificationData {
  title: string;
  body: string;
  data?: any;
  userId?: string;
  chatId?: string;
  type: 'message' | 'call' | 'general' | 'admin';
}

/**
 * Send a push notification to a specific user
 * This function will be called from your chat system
 */
export const sendPushNotification = async (notificationData: NotificationData) => {
  try {
    // Get the user's FCM token from Firestore
    if (notificationData.userId) {
      const userDoc = await firebaseFirestore
        .collection('users')
        .doc(notificationData.userId)
        .get();

      if (userDoc.exists) {
        const userData = userDoc.data();
        const fcmToken = userData?.fcmToken;

        if (fcmToken) {
          // Send notification via Firebase Cloud Messaging
          await sendFCMNotification(fcmToken, notificationData);
          console.log('Push notification sent successfully');
        } else {
          console.log('User has no FCM token');
        }
      }
    }
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
};

/**
 * Send notification to multiple users (for group notifications)
 */
export const sendPushNotificationToMultipleUsers = async (
  userIds: string[],
  notificationData: Omit<NotificationData, 'userId'>
) => {
  try {
    const usersSnapshot = await firebaseFirestore
      .collection('users')
      .where('uid', 'in', userIds)
      .get();

    const tokens: string[] = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData?.fcmToken) {
        tokens.push(userData.fcmToken);
      }
    });

    // Send to all users with tokens
    for (const token of tokens) {
      await sendFCMNotification(token, notificationData);
    }

    console.log(`Push notifications sent to ${tokens.length} users`);
  } catch (error) {
    console.error('Error sending push notifications to multiple users:', error);
    throw error;
  }
};

/**
 * Test server connectivity
 * Use this to verify your server is reachable from the device/emulator
 */
export const testServerConnectivity = async (): Promise<boolean> => {
  try {
    const serverUrl = CONFIG.SERVER_URL + '/api/users';
    console.log('🧪 Testing server connectivity to:', serverUrl);
    
    const response = await fetch(serverUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      console.log('✅ Server is reachable!');
      return true;
    } else {
      console.log('❌ Server responded with error:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Server is not reachable:', error);
    return false;
  }
};

/**
 * Get the current user's FCM token
 */
export const getCurrentUserFCMToken = async (): Promise<string | null> => {
  try {
    const { firebaseAuth } = await import('../firebaseConfig');
    const currentUser = firebaseAuth.currentUser;
    
    if (!currentUser) {
      return null;
    }

    // Get FCM token from the current user
    const token = await currentUser.getIdToken();
    
    // You might need to implement this based on your FCM setup
    // For now, we'll return the ID token as a fallback
    return token;
  } catch (error) {
    console.error('Error getting current user FCM token:', error);
    return null;
  }
};

/**
 * Send notification via Firebase Cloud Messaging
 * This will send to your amigo-admin server endpoint which handles FCM
 */
const sendFCMNotification = async (fcmToken: string, notificationData: NotificationData) => {
  try {
    // For now, we'll use a simple approach that logs the notification
    // In production, you would send this to your server endpoint
    
    const notificationPayload = {
      to: fcmToken,
      notification: {
        title: notificationData.title,
        body: notificationData.body,
        sound: 'default',
        badge: 1,
      },
      data: {
        ...notificationData.data,
        type: notificationData.type,
        chatId: notificationData.chatId,
        timestamp: new Date().toISOString(),
      },
      priority: 'high',
    };

    console.log('FCM Notification payload:', notificationPayload);

    // Option 1: Send to your amigo-admin server endpoint (recommended)
    try {
      // IMPORTANT: Update this URL to your actual server IP address
      // For local development with emulator/real device, use your computer's IP address
      // Example: 'http://192.168.1.100:3000/api/notifications/send'
      const serverUrl = CONFIG.SERVER_URL + '/api/notifications/send';
      
      console.log('🌐 Attempting to send notification to:', serverUrl);
      console.log('📱 FCM Token:', fcmToken);
      console.log('📋 Payload:', notificationPayload);
      
      // Get current user's ID token for authentication
      const { firebaseAuth } = await import('../firebaseConfig');
      const currentUser = firebaseAuth.currentUser;
      
      if (!currentUser) {
        console.log('❌ No authenticated user, falling back to logging');
        throw new Error('No authenticated user');
      }

      const idToken = await currentUser.getIdToken();
      console.log('🔑 Got ID token for user:', currentUser.uid);
      
      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify(notificationPayload),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ FCM notification sent successfully via amigo-admin server:', result);
        return;
      } else {
        const error = await response.json();
        console.log('❌ Server returned error, falling back to logging:', error);
        console.log('📊 Response status:', response.status);
      }
    } catch (serverError) {
      console.log('❌ Server call failed, falling back to logging:', serverError);
      console.log('🔍 Error details:', serverError);
    }

    // Option 2: Fallback - Log the notification (current behavior)
    console.log('FCM notification logged (server implementation required for actual sending)');
    
    // You can also test with local notifications for development
    if (__DEV__) {
      console.log('Development mode: Would send FCM notification to:', fcmToken);
    }
    
  } catch (error) {
    console.error('Error sending FCM notification:', error);
    throw error;
  }
};

/**
 * Send message notification - This is the main function for chat notifications
 */
export const sendMessageNotification = async (
  userId: string,
  senderName: string,
  message: string,
  chatId: string,
  messageType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'voice' = 'text'
) => {
  try {
    let title = `New message from ${senderName}`;
    let body = message;
    
    // Customize notification based on message type
    switch (messageType) {
      case 'image':
        title = `📷 ${senderName} sent a photo`;
        body = 'Tap to view';
        break;
      case 'video':
        title = `🎥 ${senderName} sent a video`;
        body = 'Tap to view';
        break;
      case 'audio':
        title = `🎵 ${senderName} sent a voice message`;
        body = 'Tap to play';
        break;
      case 'document':
        title = `📄 ${senderName} sent a document`;
        body = 'Tap to download';
        break;
      case 'voice':
        title = `🎤 ${senderName} sent a voice note`;
        body = 'Tap to play';
        break;
      default:
        // For text messages, truncate if too long
        if (message.length > 50) {
          body = `${message.substring(0, 50)}...`;
        }
    }

    await sendPushNotification({
      userId,
      title,
      body,
      data: { 
        senderName, 
        message, 
        messageType,
        senderId: (await firebaseFirestore.collection('users').where('displayName', '==', senderName).limit(1).get()).docs[0]?.id || null
      },
      chatId,
      type: 'message',
    });
    
    console.log(`Message notification sent to ${userId} from ${senderName}`);
  } catch (error) {
    console.error('Error sending message notification:', error);
    // Don't throw error here to avoid breaking the chat functionality
  }
};

/**
 * Send call notification
 */
export const sendCallNotification = async (
  userId: string,
  callerName: string,
  callType: 'audio' | 'video',
  callId: string
) => {
  await sendPushNotification({
    userId,
    title: `📞 Incoming ${callType} call`,
    body: `${callerName} is calling you`,
    data: { callerName, callType, callId },
    type: 'call',
  });
};

/**
 * Send admin notification
 */
export const sendAdminNotification = async (
  userId: string,
  title: string,
  body: string,
  data?: any
) => {
  await sendPushNotification({
    userId,
    title,
    body,
    data,
    type: 'admin',
  });
};

/**
 * Send general notification to all users
 */
export const sendGeneralNotification = async (
  title: string,
  body: string,
  data?: any
) => {
  try {
    const usersSnapshot = await firebaseFirestore.collection('users').get();
    const tokens: string[] = [];

    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData?.fcmToken) {
        tokens.push(userData.fcmToken);
      }
    });

    // Send to all users with tokens
    for (const token of tokens) {
      await sendFCMNotification(token, {
        title,
        body,
        data,
        type: 'general',
      });
    }

    console.log(`General notification sent to ${tokens.length} users`);
  } catch (error) {
    console.error('Error sending general notification:', error);
    throw error;
  }
};

/**
 * Send group message notification
 */
export const sendGroupMessageNotification = async (
  groupName: string,
  senderName: string,
  message: string,
  chatId: string,
  participantIds: string[],
  excludeUserId?: string // Exclude sender from notifications
) => {
  try {
    // Filter out the sender if excludeUserId is provided
    const recipientIds = excludeUserId 
      ? participantIds.filter(id => id !== excludeUserId)
      : participantIds;

    if (recipientIds.length === 0) return;

    const title = `👥 ${groupName}`;
    const body = `${senderName}: ${message.length > 30 ? message.substring(0, 30) + '...' : message}`;

    await sendPushNotificationToMultipleUsers(recipientIds, {
      title,
      body,
      data: { 
        senderName, 
        message, 
        groupName,
        senderId: excludeUserId,
        isGroupChat: true
      },
      chatId,
      type: 'message',
    });

    console.log(`Group message notification sent to ${recipientIds.length} users in ${groupName}`);
  } catch (error) {
    console.error('Error sending group message notification:', error);
  }
};
