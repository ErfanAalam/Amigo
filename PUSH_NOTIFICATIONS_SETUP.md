# Push Notifications Setup Guide

This guide explains how to set up and use push notifications in your React Native Expo app.

## 🚀 What's Been Implemented

### 1. **Notification Service** (`utils/NotificationService.ts`)
- Handles permission requests
- Manages Expo push tokens
- Saves tokens to Firestore
- Sends local notifications
- Manages notification categories

### 2. **Notification Context** (`context/NotificationContext.tsx`)
- Global state management for notifications
- Automatic permission requests on login
- Token management
- Notification listeners

### 3. **Profile Integration**
- Notification settings in profile screen
- Permission status display
- Test notification button
- Token display

### 4. **Notification Sender** (`utils/sendNotification.ts`)
- Send notifications to specific users
- Send notifications to multiple users
- Pre-built functions for messages, calls, and admin notifications

## 📱 Setup Instructions

### Step 1: Install Dependencies
```bash
npm install expo-notifications expo-device expo-constants
```

### Step 2: Update app.json
The following permissions and plugins have been added:
- iOS: `NSUserNotificationsUsageDescription`
- Android: `android.permission.POST_NOTIFICATIONS`
- Plugin: `expo-notifications`

### Step 3: Get Your Expo Project ID
1. Go to [Expo Dashboard](https://expo.dev)
2. Select your project
3. Copy the Project ID
4. Update `NotificationService.ts` line 67:
```typescript
projectId: 'YOUR_EXPO_PROJECT_ID', // Replace with your actual project ID
```

### Step 4: Build and Test
```bash
# For development
npx expo start

# For production build
eas build --platform all
```

## 🔧 How It Works

### 1. **Permission Flow**
```
User opens app → NotificationProvider requests permissions → 
Token generated → Token saved to Firestore → Ready for notifications
```

### 2. **Token Management**
- Tokens are automatically requested when user logs in
- Tokens are saved to user's Firestore document
- Tokens are removed when user logs out
- Admin panel can access tokens to send notifications

### 3. **Notification Types**
- **Message Notifications**: New chat messages
- **Call Notifications**: Incoming calls
- **Admin Notifications**: System announcements
- **General Notifications**: Broadcast to all users

## 📨 Sending Notifications

### From Admin Panel
```typescript
import { sendPushNotification } from '../utils/sendNotification';

// Send to specific user
await sendPushNotification({
  userId: 'user123',
  title: 'Welcome!',
  body: 'Thanks for joining Amigo!',
  type: 'admin'
});

// Send to multiple users
await sendPushNotificationToMultipleUsers(
  ['user1', 'user2', 'user3'],
  {
    title: 'App Update',
    body: 'New features available!',
    type: 'general'
  }
);
```

### From Chat System
```typescript
import { sendMessageNotification } from '../utils/sendNotification';

// Send message notification
await sendMessageNotification(
  receiverId,
  senderName,
  messageText,
  chatId
);
```

### From Call System
```typescript
import { sendCallNotification } from '../utils/sendNotification';

// Send call notification
await sendCallNotification(
  receiverId,
  callerName,
  'audio', // or 'video'
  callId
);
```

## 🧪 Testing Notifications

### 1. **Test Button in Profile**
- Go to Profile → Notifications section
- Click "Test Notification" button
- Should see immediate local notification

### 2. **Test Component**
```typescript
import NotificationTest from '../components/NotificationTest';

// Add to any screen for testing
<NotificationTest visible={true} />
```

### 3. **Manual Testing**
```typescript
import { notificationService } from '../utils/NotificationService';

// Send test notification
await notificationService.sendLocalNotification(
  'Test Title',
  'Test Body',
  { type: 'test' }
);
```

## 🔒 Security Considerations

### 1. **Token Validation**
- Only send notifications to verified users
- Validate user permissions before sending
- Rate limit notification sending

### 2. **Admin Access**
- Only admins can send notifications to users
- Use Firebase security rules to protect tokens
- Audit notification sending

### 3. **Data Privacy**
- Don't send sensitive data in notifications
- Use notification data for navigation only
- Respect user notification preferences

## 🚨 Troubleshooting

### Common Issues

#### 1. **Notifications Not Working**
- Check if permissions are granted
- Verify Expo project ID is correct
- Ensure device is physical (not simulator)
- Check if app is in background/foreground

#### 2. **Tokens Not Generated**
- Verify notification permissions
- Check Firebase connection
- Ensure user is authenticated
- Check console for errors

#### 3. **Notifications Not Received**
- Verify token is saved in Firestore
- Check notification settings on device
- Ensure app is not force-closed
- Test with local notifications first

### Debug Steps
1. Check console logs for token generation
2. Verify token in Firestore
3. Test local notifications
4. Check device notification settings
5. Verify Expo project configuration

## 📋 Next Steps

### 1. **Message Notifications**
- Integrate with chat system
- Send notifications for new messages
- Handle notification taps to open chat

### 2. **Call Notifications**
- Integrate with call system
- Send notifications for incoming calls
- Handle call acceptance/decline

### 3. **Admin Panel Integration**
- Add notification sending to admin dashboard
- Bulk notification sending
- Notification templates

### 4. **Advanced Features**
- Rich notifications with images
- Action buttons (Reply, Mark as Read)
- Notification grouping
- Silent notifications for data sync

## 🔗 Useful Links

- [Expo Notifications Documentation](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Push Notification Best Practices](https://developer.apple.com/design/human-interface-guidelines/ios/user-interface/notifications/)
- [Android Notification Guidelines](https://developer.android.com/guide/topics/ui/notifiers/notifications)

## 📞 Support

If you encounter issues:
1. Check console logs for errors
2. Verify all dependencies are installed
3. Ensure Expo project ID is correct
4. Test on physical device
5. Check notification permissions in device settings

---

**Note**: Push notifications require a physical device to test. Simulators cannot receive push notifications.
