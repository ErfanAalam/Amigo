import { firebaseFirestore } from '../firebaseConfig';

// ===== CONFIGURATION =====
// Update these values based on your setup
const CONFIG = {
  // For local development with emulator/real device
  // Use your computer's actual IP address (not localhost)
  SERVER_URL: 'https://amigo-admin-eight.vercel.app', // UPDATE THIS IP ADDRESS
  
  // Alternative URLs for different scenarios:
  // LOCALHOST: 'http://localhost:3000',           // Only works on same device
  // EMULATOR: 'http://10.0.2.2:3000',            // Android emulator to host
  // REAL_DEVICE: 'http://172.24.132.187:3000',   // Real device to host (use your IP)
  // PRODUCTION: 'https://amigo-admin-eight.vercel.app', // Production server
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
          
        } else {
          
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
    
    
    const response = await fetch(serverUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      
      return true;
    } else {
      
      return false;
    }
  } catch (error) {
    
    return false;
  }
};

/**
 * Test notification endpoint specifically
 */
export const testNotificationEndpoint = async (): Promise<boolean> => {
  try {
    const serverUrl = CONFIG.SERVER_URL + '/api/notifications/send';
    
    
    // Send a minimal test payload
    const testPayload = {
      to: 'test-token',
      notification: {
        title: 'Test',
        body: 'Test notification',
      },
      data: {
        type: 'test',
        timestamp: new Date().toISOString(),
      },
    };
    
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });
    
    
    
    
    const responseText = await response.text();
    
    
    if (response.ok) {
      
      return true;
    } else {
      
      return false;
    }
  } catch (error) {
    
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
    const notificationPayload = {
      to: fcmToken,
      notification: {
        title: notificationData.title,
        body: notificationData.body,
        sound: 'default',
        badge: 1,
        // For call notifications, add special properties
        ...(notificationData.type === 'call' && {
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          tag: `call_${notificationData.data?.callId}`,
        }),
      },
      data: {
        ...notificationData.data,
        type: notificationData.type,
        chatId: notificationData.chatId,
        timestamp: new Date().toISOString(),
      },
      priority: notificationData.type === 'call' ? 'high' : 'high',
      // For call notifications, add time-to-live to ensure they're delivered quickly
      ...(notificationData.type === 'call' && {
        time_to_live: 30, // 30 seconds TTL for call notifications
      }),
    };

    

    // Send to your live amigo-admin server endpoint
    try {
      const serverUrl = CONFIG.SERVER_URL + '/api/notifications/send';
      
      
      
      
      
      // Get current user's ID token for authentication
      const { firebaseAuth } = await import('../firebaseConfig');
      const currentUser = firebaseAuth.currentUser;
      
      if (!currentUser) {
        
        throw new Error('No authenticated user');
      }

      const idToken = await currentUser.getIdToken();
      
      
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
        
        return;
      } else {
        
        
        
        // Try to get the response as text first to see what's actually returned
        const responseText = await response.text();
        
        
        let error;
        try {
          error = JSON.parse(responseText);
          
        } catch (parseError) {
          
          
          throw new Error(`Backend returned invalid response (status: ${response.status}): ${responseText.substring(0, 100)}...`);
        }
        
        throw new Error(`Backend error: ${error.error || response.statusText}`);
      }
    } catch (serverError) {
      
      throw serverError;
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

    
    

    // Get the user's FCM token from Firestore
    
    const userDoc = await firebaseFirestore
      .collection('users')
      .doc(userId)
      .get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      const fcmToken = userData?.fcmToken;
      
      
      
      

      if (fcmToken) {
        // Send notification directly to live backend
        
        await sendFCMNotification(fcmToken, {
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
        
        
      } else {
        
        
      }
    } else {
      
    }
  } catch (error) {
    console.error('❌ Error sending message notification:', error);
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
  callId: string,
  channelId?: string
) => {
  try {
    
    
    
    // Get the user's FCM token from Firestore
    
    const userDoc = await firebaseFirestore
      .collection('users')
      .doc(userId)
      .get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      const fcmToken = userData?.fcmToken;
      
      
      
      

      if (fcmToken) {
        // Send notification directly to live backend
        
        await sendFCMNotification(fcmToken, {
          userId,
          title: `📞 Incoming ${callType} call`,
          body: `${callerName} is calling you`,
          data: { 
            callerName, 
            callType, 
            callId,
            channelId: channelId || '',
            timestamp: new Date().toISOString()
          },
          type: 'call',
        });
        
        
      } else {
        
        
        throw new Error('User has no FCM token');
      }
    } else {
      
      throw new Error('User not found in Firestore');
    }
  } catch (error) {
    console.error('❌ Error sending call notification:', error);
    throw error;
  }
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

    
  } catch (error) {
    console.error('Error sending group message notification:', error);
  }
};
