// app/_layout.tsx
import { Stack } from "expo-router";
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// import IncomingCallHandler from '../components/IncomingCallHandler';
import { AuthProvider, useAuth } from "../context/AuthContext";
// import { CallProvider } from '../context/CallContext';
import { NotificationProvider } from "../context/NotificationContext";
import { ThemeProvider } from "../context/ThemeContext";

function RootLayoutNav() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      {/* <StatusBar style="auto" /> */}          
      <Stack screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen 
              name="chat" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                animation: 'slide_from_right'
              }} 
            />
          </>
        ) : (
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        )}
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          {/* <CallProvider> */}
            <GestureHandlerRootView style={{ flex: 1 }}>
              <RootLayoutNav />
              {/* <IncomingCallHandler /> */}
            </GestureHandlerRootView>
          {/* </CallProvider> */}
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
