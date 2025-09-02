import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FieldValue, firebaseFirestore } from '../firebaseConfig';
import { useAgoraAudio } from '../hooks/useAgoraAudio';
import { Call } from '../types/CallTypes';

export default function AudioCallScreen() {
  const params = useLocalSearchParams();
  const callId = params.callId as string;
  const channelId = params.channelId as string;
  const isInitiator = params.isInitiator === 'true';
  const otherUserName = params.calleeName || params.callerName || 'Unknown';
  
  const { userData } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  
  const [callStatus, setCallStatus] = useState<'connecting' | 'connected' | 'ended'>('connecting');
  const [callDuration, setCallDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const callStatusListenerRef = useRef<any>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Initialize Agora audio
  const {
    isInitialized,
    isJoined,
    isMuted,
    isSpeakerOn,
    localUid,
    remoteUid,
    callDuration: agoraCallDuration,
    initialize,
    joinChannel,
    leaveChannel,
    toggleMute,
    toggleSpeaker,
    cleanup: cleanupAgora,
  } = useAgoraAudio();

  // Fetch Agora token from backend
  const fetchAgoraToken = useCallback(async (channelId: string, uid: string): Promise<string> => {
    try {
      const response = await fetch(`https://amigo-admin-eight.vercel.app/api/agora/token?channel=${channelId}&uid=${uid}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error('Error fetching Agora token:', error);
      throw new Error('Failed to get call token');
    }
  }, []);

  // Join the call
  const joinCall = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Initialize Agora engine
      await initialize();

      // Generate a unique UID for this user
      const uid = Math.floor(Math.random() * 1000000);

      // Fetch token from backend
      const token = await fetchAgoraToken(channelId, uid.toString());

      // Join the channel
      await joinChannel(channelId, token, uid);

      // Update call status to connected
      setCallStatus('connected');
      startTimeRef.current = Date.now();

      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setCallDuration(duration);
        }
      }, 1000);

    } catch (error) {
      console.error('Error joining call:', error);
      setError(error instanceof Error ? error.message : 'Failed to join call');
      setCallStatus('ended');
    } finally {
      setIsLoading(false);
    }
  }, [initialize, joinChannel, channelId, fetchAgoraToken]);

  // End the call
  const endCall = useCallback(async () => {
    try {
      // Update Firestore call status
      if (callId) {
        await firebaseFirestore.collection('calls').doc(callId).update({
          status: 'ended',
          endedAt: FieldValue.serverTimestamp(),
          duration: callDuration,
        });
      }

      // Leave Agora channel
      await leaveChannel();

      // Cleanup
      cleanupAgora();

      // Navigate back
      router.back();

    } catch (error) {
      console.error('Error ending call:', error);
      // Still navigate back even if there's an error
      router.back();
    }
  }, [callId, callDuration, leaveChannel, cleanupAgora, router]);

  // Listen for call status changes
  useEffect(() => {
    if (!callId) return;

    callStatusListenerRef.current = firebaseFirestore
      .collection('calls')
      .doc(callId)
      .onSnapshot((doc) => {
        if (doc.exists) {
          const callData = doc.data() as Call;
          
          if (callData.status === 'ended' || callData.status === 'declined') {
            // Call was ended by the other party
            setCallStatus('ended');
            cleanupAgora();
            
            // Show alert and navigate back
            Alert.alert(
              'Call Ended',
              `Call was ${callData.status === 'declined' ? 'declined' : 'ended'} by the other party.`,
              [{ text: 'OK', onPress: () => router.back() }]
            );
          }
        }
      }, (error) => {
        console.error('Error listening to call status:', error);
      });

    return () => {
      if (callStatusListenerRef.current) {
        callStatusListenerRef.current();
      }
    };
  }, [callId, cleanupAgora, router]);

  // Auto-join call when component mounts
  useEffect(() => {
    joinCall();

    return () => {
      // Cleanup on unmount
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      cleanupAgora();
    };
  }, [joinCall, cleanupAgora]);

  // Handle back button press
  useEffect(() => {
    const handleBackPress = () => {
      if (callStatus === 'connected') {
        Alert.alert(
          'End Call',
          'Are you sure you want to end this call?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'End Call', style: 'destructive', onPress: endCall },
          ]
        );
        return true; // Prevent default back behavior
      }
      return false;
    };

    // This would need to be implemented with react-native-back-handler
    // For now, we'll handle it in the UI
  }, [callStatus, endCall]);

  // Format duration
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Render loading state
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <StatusBar barStyle="light-content" backgroundColor="#0d9488" />
        <View style={styles.loadingContainer}>
          <LinearGradient
            colors={['#0d9488', '#10b981']}
            style={styles.loadingGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.loadingIconContainer}>
              <Ionicons name="call" size={60} color="#ffffff" />
            </View>
            <Text style={styles.loadingText}>Connecting...</Text>
            <Text style={styles.loadingSubtext}>Please wait while we connect your call</Text>
          </LinearGradient>
        </View>
      </SafeAreaView>
    );
  }

  // Render error state
  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <StatusBar barStyle="light-content" backgroundColor="#F44336" />
        <View style={styles.errorContainer}>
          <LinearGradient
            colors={['#F44336', '#d32f2f']}
            style={styles.errorGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.errorIconContainer}>
              <Ionicons name="alert-circle" size={60} color="#ffffff" />
            </View>
            <Text style={styles.errorTitle}>Connection Failed</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={joinCall}
              activeOpacity={0.8}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              activeOpacity={0.8}
            >
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0d9488" />
      
      {/* Call Header */}
      <LinearGradient
        colors={['#0d9488', '#10b981']}
        style={styles.callHeader}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.callInfo}>
          <Text style={styles.callStatusText}>
            {callStatus === 'connecting' ? 'Connecting...' : 'In Call'}
          </Text>
          <Text style={styles.otherUserName}>{otherUserName}</Text>
          {callStatus === 'connected' && (
            <Text style={styles.callDuration}>{formatDuration(callDuration)}</Text>
          )}
        </View>
      </LinearGradient>

      {/* Call Controls */}
      <View style={styles.controlsContainer}>
        {/* Mute Button */}
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.controlButtonActive]}
          onPress={toggleMute}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={isMuted ? ['#F44336', '#d32f2f'] : ['#666666', '#555555']}
            style={styles.controlButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons
              name={isMuted ? "mic-off" : "mic"}
              size={24}
              color="#ffffff"
            />
          </LinearGradient>
          <Text style={[styles.controlButtonText, { color: theme.colors.text }]}>
            {isMuted ? 'Unmute' : 'Mute'}
          </Text>
        </TouchableOpacity>

        {/* Speaker Button */}
        <TouchableOpacity
          style={[styles.controlButton, isSpeakerOn && styles.controlButtonActive]}
          onPress={toggleSpeaker}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={isSpeakerOn ? ['#4CAF50', '#45a049'] : ['#666666', '#555555']}
            style={styles.controlButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons
              name={isSpeakerOn ? "volume-high" : "volume-low"}
              size={24}
              color="#ffffff"
            />
          </LinearGradient>
          <Text style={[styles.controlButtonText, { color: theme.colors.text }]}>
            {isSpeakerOn ? 'Speaker On' : 'Speaker Off'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* End Call Button */}
      <View style={styles.endCallContainer}>
        <TouchableOpacity
          style={styles.endCallButton}
          onPress={endCall}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#F44336', '#d32f2f']}
            style={styles.endCallButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="call" size={32} color="#ffffff" />
          </LinearGradient>
        </TouchableOpacity>
        <Text style={[styles.endCallText, { color: theme.colors.text }]}>End Call</Text>
      </View>

      {/* Call Status Indicator */}
      <View style={styles.statusIndicator}>
        <View style={[styles.statusDot, { backgroundColor: callStatus === 'connected' ? '#4CAF50' : '#FF9800' }]} />
        <Text style={[styles.statusText, { color: theme.colors.textSecondary }]}>
          {callStatus === 'connecting' ? 'Establishing connection...' : 
           callStatus === 'connected' ? 'Call in progress' : 'Call ended'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  
  // Loading state
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  loadingText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 10,
  },
  loadingSubtext: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    paddingHorizontal: 40,
  },

  // Error state
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 30,
  },
  retryButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    marginBottom: 15,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Call header
  callHeader: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  callInfo: {
    alignItems: 'center',
  },
  callStatusText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 10,
  },
  otherUserName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 10,
  },
  callDuration: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
  },

  // Controls
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  controlButton: {
    alignItems: 'center',
    minWidth: 80,
  },
  controlButtonActive: {
    transform: [{ scale: 1.1 }],
  },
  controlButtonGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  controlButtonText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  // End call button
  endCallContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  endCallButton: {
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  endCallButtonGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  endCallText: {
    fontSize: 16,
    fontWeight: '600',
  },

  // Status indicator
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
