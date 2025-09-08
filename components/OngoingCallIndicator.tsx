import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCallStatus } from '../context/CallStatusContext';
import { useTheme } from '../context/ThemeContext';

export const OngoingCallIndicator: React.FC = () => {
  const { currentCall, isInCall, callStatus } = useCallStatus();
  const { theme } = useTheme();
  const router = useRouter();

  if (!isInCall || !currentCall) {
    return null;
  }

  const handlePress = () => {
    router.push({
      pathname: '/audioCall',
      params: {
        callId: currentCall.id,
        channelId: currentCall.channelId,
        isInitiator: currentCall.callerId === currentCall.callerId ? 'true' : 'false',
        callerName: currentCall.callerName,
        calleeName: currentCall.calleeName,
      }
    });
  };

  const getStatusText = () => {
    switch (callStatus) {
      case 'ringing':
        return 'Ringing...';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return 'In Call';
      default:
        return 'Call';
    }
  };

  const getStatusColor = () => {
    switch (callStatus) {
      case 'ringing':
        return ['#FF9800', '#F57C00'];
      case 'connecting':
        return ['#2196F3', '#1976D2'];
      case 'connected':
        return ['#4CAF50', '#388E3C'];
      default:
        return ['#666666', '#555555'];
    }
  };

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: theme.colors.surface }]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={getStatusColor() as [string, string]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons 
              name={callStatus === 'connected' ? 'call' : 'call-outline'} 
              size={20} 
              color="#ffffff" 
            />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.statusText}>{getStatusText()}</Text>
            <Text style={styles.nameText}>
              {currentCall.callerName || currentCall.calleeName || 'Unknown'}
            </Text>
          </View>
          <View style={styles.arrowContainer}>
            <Ionicons name="chevron-forward" size={20} color="#ffffff" />
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  gradient: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  nameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  arrowContainer: {
    marginLeft: 8,
  },
});
