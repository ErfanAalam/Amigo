import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';

interface NotificationTestProps {
  visible?: boolean;
}

const NotificationTest: React.FC<NotificationTestProps> = ({ visible = false }) => {
  const { sendTestNotification, isNotificationsEnabled, fcmToken } = useNotifications();
  const { theme } = useTheme();

  if (!visible) return null;

  const handleTestNotification = async () => {
    try {
      await sendTestNotification();
    } catch (error) {
      console.error('Error sending test notification:', error);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.header}>
        <Ionicons name="notifications" size={20} color={theme.colors.primary} />
        <Text style={[styles.title, { color: theme.colors.text }]}>Notification Test</Text>
      </View>
      
      <View style={styles.statusContainer}>
        <View style={[
          styles.statusIndicator, 
          { backgroundColor: isNotificationsEnabled ? '#10b981' : '#ef4444' }
        ]} />
        <Text style={[styles.statusText, { color: theme.colors.textSecondary }]}>
          {isNotificationsEnabled ? 'Notifications Enabled' : 'Notifications Disabled'}
        </Text>
      </View>
      
      {fcmToken && (
        <Text style={[styles.tokenText, { color: theme.colors.textSecondary }]} numberOfLines={2}>
          FCM Token: {fcmToken.substring(0, 30)}...
        </Text>
      )}
      
      <TouchableOpacity
        style={[styles.testButton, { backgroundColor: theme.colors.primary }]}
        onPress={handleTestNotification}
        activeOpacity={0.8}
      >
        <Ionicons name="send" size={16} color="#ffffff" />
        <Text style={styles.buttonText}>Send Test Notification</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tokenText: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default NotificationTest;
