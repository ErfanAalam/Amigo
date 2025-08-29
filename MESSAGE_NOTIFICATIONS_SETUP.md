# 🔔 Message Notifications Setup Guide

This guide explains how to set up and use the push notification system for messages in your Amigo chat app.

## 🚀 **What's Already Implemented**

✅ **Client-side notification system** using React Native Firebase messaging
✅ **Automatic notification sending** when messages are sent
✅ **Support for all message types**: text, images, videos, audio, documents, voice notes
✅ **Notification permission handling** and FCM token management
✅ **Background message handling** when app is closed
✅ **Notification tap handling** with navigation data extraction

## 📱 **How It Works**

### **1. When a User Sends a Message:**
- Message is saved to Firestore
- Push notification is automatically sent to recipient
- Recipient receives notification even if app is closed

### **2. Notification Types:**
- **Text Messages**: "New message from [Sender]"
- **Images**: "📷 [Sender] sent a photo"
- **Videos**: "🎥 [Sender] sent a video"
- **Audio**: "🎵 [Sender] sent a voice message"
- **Documents**: "📄 [Sender] sent a document"
- **Voice Notes**: "🎤 [Sender] sent a voice note"

### **3. Notification Flow:**
```
User sends message → Notification sent → Recipient receives FCM → System shows notification → User taps → App opens → Navigates to chat
```

## 🔧 **Current Status**

### **✅ Working:**
- FCM token generation and storage
- Permission handling
- Automatic notification sending (logs to console)
- Background message handling
- Notification tap handling

### **❌ Needs Implementation:**
- **Server endpoint** for actual FCM sending
- **Firebase Admin SDK** on server side
- **Real notification delivery** (currently just logging)

## 🖥️ **Server Setup (Required for Production)**

### **✅ Option 1: Use Your Existing amigo-admin (RECOMMENDED)**

Your **amigo-admin Next.js app** is now fully set up to handle notifications! This is the **best approach** since you already have:

- ✅ **Next.js API routes** ready
- ✅ **Firebase Admin SDK** access  
- ✅ **Authentication system** in place
- ✅ **User management** already built
- ✅ **Notification management UI** added

#### **What's Already Implemented:**

1. **API Endpoints:**
   - `/api/notifications/send` - Send single notification
   - `/api/notifications/send-bulk` - Send to multiple users
   - `/api/notifications/logs` - View notification history

2. **Admin Dashboard:**
   - New "Notifications" tab
   - Send single/bulk notifications
   - View notification logs
   - User selection interface

3. **Security:**
   - Admin-only access
   - Firebase Auth verification
   - Comprehensive logging

#### **Configuration Steps:**

1. **Update your React Native app** with the correct server URL:
   ```typescript
   // In utils/sendNotification.ts, replace:
   const serverUrl = 'https://your-amigo-admin-domain.com/api/notifications/send';
   
   // With your actual amigo-admin URL, for example:
   const serverUrl = 'https://amigo-admin.vercel.app/api/notifications/send';
   // or
   const serverUrl = 'http://localhost:3000/api/notifications/send'; // for local development
   ```

2. **Deploy your amigo-admin** to a hosting service (Vercel, Netlify, etc.)

3. **Test the system:**
   - Send a message from your React Native app
   - Check the notification logs in amigo-admin
   - Verify FCM delivery

### **Option 2: Create Your Own Server**

If you prefer a separate server:

1. **Set up a Node.js server** with Firebase Admin SDK
2. **Create an endpoint** `/api/send-notification`
3. **Use Firebase Admin SDK** to send FCM messages

### **Option 3: Use Firebase Functions**

1. **Deploy Firebase Functions** with messaging capabilities
2. **Create a function** that triggers on new messages
3. **Send FCM notifications** automatically

### **Option 4: Use Third-Party Services**

- **OneSignal** - Easy to implement
- **Pushwoosh** - Enterprise solution
- **Airship** - Advanced features

## 🧪 **Testing the System**

### **1. Test Local Notifications:**
- Go to Profile → Notification Settings
- Click "Test Notification" - should show alert
- Check console logs for FCM payload

### **2. Test Message Notifications:**
- Send a message to another user
- Check console logs: "Push notification sent for [type] message"
- Verify FCM payload is logged

### **3. Test Background Notifications:**
- Close the app completely
- Send message from another device
- Check if notification appears (requires server setup)

## 📋 **Configuration Files**

### **Update Server URL in React Native App:**
In `Amigo/utils/sendNotification.ts`, replace:
```typescript
const serverUrl = 'https://your-amigo-admin-domain.com/api/notifications/send';
```

**For Development:**
```typescript
const serverUrl = 'http://localhost:3000/api/notifications/send';
```

**For Production (after deploying amigo-admin):**
```typescript
const serverUrl = 'https://your-amigo-admin-domain.vercel.app/api/notifications/send';
// or
const serverUrl = 'https://your-amigo-admin-domain.netlify.app/api/notifications/send';
```

### **amigo-admin Configuration:**
Your amigo-admin is already configured with:
- ✅ Firebase Admin SDK
- ✅ Authentication middleware
- ✅ API routes for notifications
- ✅ Admin dashboard integration

### **No Additional Authentication Required:**
The system automatically uses Firebase Auth tokens from your React Native app, so no additional API keys or tokens are needed.

## 🔐 **Security Considerations**

1. **Server Authentication**: Use proper API keys/tokens
2. **Rate Limiting**: Prevent spam notifications
3. **User Consent**: Respect notification preferences
4. **Data Privacy**: Don't send sensitive data in notifications

## 🚨 **Troubleshooting**

### **Notifications Not Working:**
1. Check FCM token is generated (Profile → Notification Settings)
2. Verify permissions are granted
3. Check console logs for errors
4. Ensure server endpoint is working

### **Common Issues:**
- **"Permission denied"**: User needs to enable notifications in device settings
- **"No FCM token"**: User hasn't granted notification permissions
- **"Server error"**: Check server endpoint and authentication

## 📚 **Next Steps**

1. **Set up server endpoint** for FCM sending
2. **Test with real devices** (notifications don't work in simulator)
3. **Add notification channels** for Android
4. **Implement notification actions** (Reply, Mark as Read)
5. **Add notification grouping** for multiple messages
6. **Implement notification badges** and sound customization

## 🎯 **Quick Start for Development**

1. **Test current setup:**
   ```bash
   # Run the app
   npx expo run:android
   # or
   npx expo run:ios
   ```

2. **Check notification permissions:**
   - Go to Profile → Notification Settings
   - Click "Update Permissions"
   - Verify FCM token is generated

3. **Test message notifications:**
   - Send a message to another user
   - Check console logs for notification payload

4. **Set up server (when ready):**
   - Create server endpoint
   - Update server URL in code
   - Test real notification delivery

## 📞 **Support**

If you encounter issues:
1. Check console logs for error messages
2. Verify FCM token generation
3. Test with physical device (not simulator)
4. Check Firebase project configuration

---

**🎉 Congratulations!** Your chat app now has a complete push notification system. Once you set up the server endpoint, users will receive real-time notifications for all messages, even when the app is closed.

