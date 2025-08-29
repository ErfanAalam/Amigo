# 🔔 Notification Setup Guide

## 🚨 **Current Issue: Notifications Not Working Between Emulator and Real Device**

The problem is that your notification system is trying to send to `localhost:3000`, but:
- **Emulator** can't reach `localhost:3000` on your host machine
- **Real Device** can't reach `localhost:3000` on your host machine

## 🛠️ **Solution: Update Server IP Address**

### **Step 1: Find Your Computer's IP Address**

#### **On Windows:**
```bash
ipconfig
```
Look for your local IP address (usually starts with `192.168.` or `10.0.`)

#### **On Mac/Linux:**
```bash
ifconfig
# or
ip addr
```

### **Step 2: Update the Configuration**

Open `Amigo/utils/sendNotification.ts` and update this line:

```typescript
const CONFIG = {
  // Replace 192.168.1.100 with YOUR actual IP address
  SERVER_URL: 'http://192.168.1.100:3000', // UPDATE THIS IP ADDRESS
};
```

**Example IP addresses to try:**
- `http://192.168.1.100:3000` (common home network)
- `http://10.0.2.2:3000` (Android emulator to host)
- `http://172.20.10.2:3000` (iPhone hotspot)

### **Step 3: Test Server Connectivity**

Add this to your chat component to test connectivity:

```typescript
import { testServerConnectivity } from '../utils/sendNotification';

// Add this button or call it when needed
const testConnection = async () => {
  const isConnected = await testServerConnectivity();
  if (isConnected) {
    console.log('✅ Server is reachable!');
  } else {
    console.log('❌ Server is not reachable');
  }
};
```

## 🔍 **Troubleshooting Steps**

### **1. Check if amigo-admin server is running**
```bash
cd amigo-admin
npm run dev
```

### **2. Verify server is accessible from your computer**
Open browser and go to: `http://YOUR_IP:3000`

### **3. Check firewall settings**
Make sure port 3000 is not blocked by Windows Firewall

### **4. Test with different IP addresses**
Try these common patterns:
- `192.168.1.X` (home router)
- `10.0.2.2` (Android emulator)
- `172.20.10.X` (iPhone hotspot)

### **5. Check console logs**
Look for these emojis in your console:
- 🌐 Server URL being used
- 📱 FCM Token
- 📋 Notification payload
- ✅ Success messages
- ❌ Error messages

## 📱 **Testing the Setup**

### **Test 1: Admin Dashboard Notifications**
1. Go to admin dashboard
2. Send a test notification
3. Should work (already working)

### **Test 2: Chat Notifications**
1. Send message from emulator to real device
2. Check console for notification logs
3. Real device should receive notification

### **Test 3: Server Connectivity**
1. Use the `testServerConnectivity()` function
2. Check if server responds
3. Verify IP address is correct

## 🚀 **Quick Fix Commands**

### **Find Your IP:**
```bash
# Windows
ipconfig | findstr "IPv4"

# Mac/Linux
ifconfig | grep "inet "
```

### **Test Server:**
```bash
# Test if server responds
curl http://YOUR_IP:3000/api/users
```

### **Update Configuration:**
1. Open `Amigo/utils/sendNotification.ts`
2. Find `SERVER_URL` in the `CONFIG` object
3. Replace with your actual IP address
4. Save and restart your app

## 🎯 **Expected Behavior After Fix**

1. **Console logs** show server connection attempts
2. **Notifications** are sent via your amigo-admin server
3. **Real device** receives push notifications
4. **Emulator** can send notifications successfully

## 🔧 **If Still Not Working**

1. **Check network**: Are both devices on same WiFi?
2. **Check server**: Is amigo-admin running and accessible?
3. **Check IP**: Is the IP address correct and reachable?
4. **Check firewall**: Is port 3000 open?
5. **Check logs**: What error messages do you see?

## 📞 **Need Help?**

Check the console logs for:
- 🌐 Server URL being used
- ❌ Error messages
- 📊 Response status codes

The logs will tell you exactly what's happening with your notifications!
