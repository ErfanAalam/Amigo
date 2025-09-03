import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FieldValue, firebaseFirestore } from '../firebaseConfig';
import { getAgoraEngineStatus, resetGlobalAgoraState, useAgoraAudio } from '../hooks/useAgoraAudio';
import { Call } from '../types/CallTypes';

export default function AudioCallScreen() {
  const params = useLocalSearchParams();
  const callId = params.callId as string;
  const channelId = params.channelId as string;
  const otherUserName = params.calleeName || params.callerName || 'Unknown';
  const fromNotification = params.fromNotification === 'true';
  
  const { userData } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  
  const [callStatus, setCallStatus] = useState<'connecting' | 'connected' | 'ended'>('connecting');
  const [firestoreCallStatus, setFirestoreCallStatus] = useState<'ringing' | 'accepted' | 'ended' | 'declined'>('ringing');
  const [actualChannelId, setActualChannelId] = useState<string>(Array.isArray(channelId) ? channelId[0] : channelId);
  const [actualOtherUserName, setActualOtherUserName] = useState<string>(Array.isArray(otherUserName) ? otherUserName[0] : otherUserName);

  const [error, setError] = useState<string | null>(null);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [hasJoinedChannel, setHasJoinedChannel] = useState(false);
  const [isCallEstablished, setIsCallEstablished] = useState(false);
  
  const callStatusListenerRef = useRef<any>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch call data if coming from notification and missing channelId
  useEffect(() => {
    const fetchCallData = async () => {
      if (fromNotification && (!actualChannelId || actualChannelId === '') && callId) {
        try {
          console.log('📞 Fetching call data from notification for callId:', callId);
          const callDoc = await firebaseFirestore.collection('calls').doc(callId).get();
          
          if (callDoc.exists) {
            const callData = callDoc.data() as Call;
            console.log('📞 Call data fetched:', callData);
            
            setActualChannelId(callData.channelId);
            setActualOtherUserName(callData.callerName || callData.calleeName || 'Unknown');
            
            console.log('✅ Call data updated - channelId:', callData.channelId, 'otherUserName:', callData.callerName || callData.calleeName);
          } else {
            console.error('❌ Call document not found for callId:', callId);
            setError('Call not found');
          }
        } catch (error) {
          console.error('❌ Error fetching call data:', error);
          setError('Failed to load call data');
        }
      }
    };

    fetchCallData();
  }, [fromNotification, actualChannelId, callId]);

  // Initialize Agora audio
  const {
    isMuted,
    isSpeakerOn,
    callDuration,
    initialize,
    joinChannel,
    leaveChannel,
    toggleMute,
    toggleSpeaker,
    cleanup: cleanupAgora,
  } = useAgoraAudio((status) => {
    console.log('📞 Call status change received:', status);
    // Handle call status changes from Agora
    if (status === 'connected') {
      // Only set to connected if the call has been accepted in Firestore
      if (firestoreCallStatus === 'accepted') {
        setCallStatus('connected');
        setIsCallEstablished(true);
        startTimeRef.current = Date.now();
        console.log('✅ Call established - status updated to connected (call accepted)');
      } else {
        console.log('⚠️ Agora connected but call not accepted yet, keeping connecting status');
        setCallStatus('connecting');
        setIsCallEstablished(false);
      }
    } else if (status === 'ended') {
      setCallStatus('ended');
      setIsCallEstablished(false);
      console.log('✅ Call ended - status updated to ended');
    } else if (status === 'connecting') {
      setCallStatus('connecting');
      setIsCallEstablished(false);
      console.log('✅ Call connecting - status updated to connecting');
    }
  });

  // Fetch Agora token from backend
  const fetchAgoraToken = useCallback(async (channelId: string, uid: string): Promise<string> => {
    try {
      console.log('🔑 Fetching Agora token for channel:', channelId, 'UID:', uid);
      
      const response = await fetch('https://amigo-admin-eight.vercel.app/api/agora/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelName: channelId,
          uid: uid,
          role: 'publisher'
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Token request failed:', response.status, errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('✅ Token received successfully:', {
        channelName: data.channelName,
        uid: data.uid,
        expiresIn: data.expiresIn,
        generatedAt: data.generatedAt
      });
      
      return data.token;
    } catch (error) {
      console.error('❌ Error fetching Agora token:', error);
      throw new Error(`Failed to get call token: ${error}`);
    }
  }, []);

  // Join the call
  const joinCall = useCallback(async () => {
    // Prevent multiple join attempts
    if (hasJoinedChannel || isEndingCall) {
      console.log('⚠️ Already joined or ending call, skipping join...');
      return;
    }

    try {
      console.log('🚀 Starting call join process...');
      setError(null);
      
      // Reset all call states for new call
      setCallStatus('connecting');
      setIsCallEstablished(false);
      setHasJoinedChannel(false);

      // Initialize Agora engine
      await initialize();
      const engineStatus = getAgoraEngineStatus();
      console.log(`Agora engine initialized (${engineStatus.engineId})`);

      // Generate a unique UID for this user
      const uid = Math.floor(Math.random() * 1000000);
      console.log(`Generated UID: ${uid}`);

      // Fetch token from backend
      const token = await fetchAgoraToken(actualChannelId, uid.toString());
      console.log(`Token received, length: ${token.length}`);

      // Join the channel
      await joinChannel(actualChannelId, token, uid);
      console.log('Join request sent');
      setHasJoinedChannel(true);

      // Don't start timer yet - wait for both users to be connected
      // The timer will start when remote user joins (handled in useAgoraAudio)
      setCallStatus('connecting');

      console.log('✅ Call join process completed successfully');

    } catch (error) {
      console.error('❌ Error joining call:', error);
      setError(error instanceof Error ? error.message : 'Failed to join call');
      setCallStatus('ended');
    }
  }, [initialize, joinChannel, actualChannelId, fetchAgoraToken, hasJoinedChannel, isEndingCall]);

  // End the call
  const endCall = useCallback(async () => {
    if (isEndingCall) {
      console.log('⚠️ Call ending already in progress, skipping...');
      return;
    }

    try {
      console.log('🚪 Ending call...');
      setIsEndingCall(true);
      setCallStatus('ended');
      setHasJoinedChannel(false);
      setIsCallEstablished(false);

      // Clear duration timer immediately
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      // Clear cleanup timeout
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = null;
      }

      // Clear call timeout
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }

      // Update Firestore call status
      if (callId) {
        try {
          await firebaseFirestore.collection('calls').doc(callId).update({
            status: 'ended',
            endedAt: FieldValue.serverTimestamp(),
            duration: callDuration,
          });
          console.log('✅ Firestore call status updated');
        } catch (error) {
          console.log('⚠️ Error updating Firestore:', error);
        }
      }

      // Leave Agora channel first
      console.log('🚪 Leaving Agora channel...');
      try {
        await leaveChannel();
        console.log('✅ Left Agora channel');
      } catch (error) {
        console.log('⚠️ Error leaving channel:', error);
      }

      // Wait for leave to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Cleanup Agora engine completely
      console.log('🧹 Cleaning up Agora engine completely...');
      try {
        cleanupAgora();
        console.log('✅ Agora engine cleaned up');
      } catch (error) {
        console.log('⚠️ Error cleaning up Agora engine:', error);
      }

      // Reset global state to prevent reconnection attempts
      console.log('🔄 Resetting global Agora state...');
      resetGlobalAgoraState();

      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Navigate back
      console.log('🔙 Navigating back...');
      router.back();

    } catch (error) {
      console.error('❌ Error ending call:', error);
      router.back();
    } finally {
      setIsEndingCall(false);
    }
  }, [callId, callDuration, leaveChannel, cleanupAgora, router, isEndingCall]);
  
  // endCall();
  // Listen for call status changes
  useEffect(() => {
    if (!callId) return;

    callStatusListenerRef.current = firebaseFirestore
      .collection('calls')
      .doc(callId)
      .onSnapshot((doc) => {
        if (doc.exists) {
          const callData = doc.data() as Call;
          
          console.log('📞 Firestore call status update:', callData.status, 'isCallEstablished:', isCallEstablished, 'isEndingCall:', isEndingCall);
          
          // Update Firestore call status
          setFirestoreCallStatus(callData.status);
          
          // Handle call acceptance
          if (callData.status === 'accepted') {
            console.log('✅ Call accepted in Firestore - updating UI to connected');
            setCallStatus('connected');
            setIsCallEstablished(true);
            startTimeRef.current = Date.now();
            
            // Clear any pending call timeout
            if (callTimeoutRef.current) {
              clearTimeout(callTimeoutRef.current);
              callTimeoutRef.current = null;
            }
          }
          
          // Handle call ringing - set timeout for auto-decline
          if (callData.status === 'ringing' && !callTimeoutRef.current) {
            console.log('📞 Call is ringing - setting 30 second timeout');
            callTimeoutRef.current = setTimeout(() => {
              console.log('⏰ Call timeout - auto ending call');
              endCall();
            }, 30000) as unknown as NodeJS.Timeout;
          }
          
          if (callData.status === 'ended' || callData.status === 'declined') {
            // Call was ended by the other party
            console.log('📞 Call ended by other party:', callData.status);
            
            // Prevent multiple cleanup calls
            if (isEndingCall) {
              console.log('⚠️ Already ending call, skipping...');
              return;
            }
            
            // Set ending call flag to prevent multiple triggers
            setIsEndingCall(true);
            setCallStatus('ended');
            setHasJoinedChannel(false);
            setIsCallEstablished(false);
            
            // Clear duration timer
            if (durationIntervalRef.current) {
              clearInterval(durationIntervalRef.current);
              durationIntervalRef.current = null;
            }
            
            // Clear cleanup timeout
            if (cleanupTimeoutRef.current) {
              clearTimeout(cleanupTimeoutRef.current);
              cleanupTimeoutRef.current = null;
            }
            
            // Clear call timeout
            if (callTimeoutRef.current) {
              clearTimeout(callTimeoutRef.current);
              callTimeoutRef.current = null;
            }
            
            // Cleanup Agora engine completely
            console.log('🧹 Calling cleanupAgora from Firestore listener');
            try {
              cleanupAgora();
              console.log('✅ Cleanup completed from Firestore listener');
              // Reset global state to prevent reconnection attempts
              resetGlobalAgoraState();
            } catch (error) {
              console.log('⚠️ Error during cleanup from Firestore listener:', error);
              // Still reset global state even on error
              resetGlobalAgoraState();
            }
            
            router.back();
            // Show alert and navigate back
            // Alert.alert(
            //   'Call Ended',
            //   `Call was ${callData.status === 'declined' ? 'declined' : 'ended'} by the other party.`,
            //   [{ text: 'OK', onPress: () => router.back() }]
            // );
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
  }, [callId, cleanupAgora, router, isEndingCall, isCallEstablished, hasJoinedChannel, endCall]);

  // Auto-join call when component mounts
  useEffect(() => {
    // Only join if not already joined, not ending, and call status is not ended
    if (!hasJoinedChannel && !isEndingCall && callStatus !== 'ended') {
      joinCall();
    }

    // Don't cleanup on unmount - let the call end naturally
    return () => {
      console.log('🧹 Component unmounting, but not cleaning up to prevent call interruption');
    };
  }, [joinCall, hasJoinedChannel, isEndingCall, callStatus]);

  // Handle back button press
  useEffect(() => {
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
  // if (isLoading) {
  //   return (
  //     <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
  //       <StatusBar barStyle="light-content" backgroundColor="#0d9488" />
  //       <View style={styles.loadingContainer}>
  //         <LinearGradient
  //           colors={['#0d9488', '#10b981']}
  //           style={styles.loadingGradient}
  //           start={{ x: 0, y: 0 }}
  //           end={{ x: 1, y: 1 }}
  //         >
  //           <View style={styles.loadingIconContainer}>
  //             <Ionicons name="call" size={60} color="#ffffff" />
  //           </View>
  //           <Text style={styles.loadingText}>Connecting...</Text>
  //           <Text style={styles.loadingSubtext}>Please wait while we connect your call</Text>
  //         </LinearGradient>
  //       </View>
  //     </SafeAreaView>
  //   );
  // }

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
            {callStatus === 'connecting' && firestoreCallStatus === 'ringing' ? 'Ringing...' :
             callStatus === 'connecting' ? 'Connecting...' : 
             callStatus === 'ended' ? 'Call Ended' : 'In Call'}
          </Text>
          <Text style={styles.otherUserName}>{actualOtherUserName}</Text>
          {callStatus === 'connected' && (
            <Text style={styles.callDuration}>{formatDuration(callDuration)}</Text>
          )}
        </View>
      </LinearGradient>

      <View style={styles.callInfo}>  
            <Ionicons name="person" size={100} color="#4f4f4f" />
        {
          userData?.firstName && userData?.lastName && (
            <Text style={styles.profileName}>{otherUserName}</Text>
          )
        }
        {
          userData?.email && (
            <Text style={styles.profileEmail}>{userData?.email}</Text>
          )
        }
        {/* <Text style={styles.profileEmail}>{userData?.email}</Text> */}
      </View>

      {/* Call Controls */}
      <View style={styles.controlsContainer}>
        {/* Mute Button */}
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.controlButtonActive, isEndingCall && styles.controlButtonDisabled]}
          onPress={toggleMute}
          activeOpacity={0.8}
          disabled={isEndingCall}
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
          {/* <Text style={[styles.controlButtonText, { color: theme.colors.text }]}>
            {isMuted ? 'Unmute' : 'Mute'}
          </Text> */}
        </TouchableOpacity>

        {/* Speaker Button */}
        <TouchableOpacity
          style={[styles.controlButton, isSpeakerOn && styles.controlButtonActive, isEndingCall && styles.controlButtonDisabled]}
          onPress={toggleSpeaker}
          activeOpacity={0.8}
          disabled={isEndingCall}
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
          {/* <Text style={[styles.controlButtonText, { color: theme.colors.text }]}>
            {isSpeakerOn ? 'Speaker On' : 'Speaker Off'}
          </Text> */}
        </TouchableOpacity>


        <TouchableOpacity
          style={[styles.controlButton, styles.controlButtonActive, isEndingCall && styles.endCallButtonDisabled]}
          onPress={endCall}
          activeOpacity={0.8}
          disabled={isEndingCall}
        >
          <LinearGradient
            colors={['#F44336', '#d32f2f']}
            style={styles.controlButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="call" size={32} color="#ffffff" />
          </LinearGradient>
          {/* <Text style={[styles.controlButtonText, { color: theme.colors.text }]}>
            End Call
          </Text> */}
        </TouchableOpacity>

     
      </View>

      {/* End Call Button */}
      

      {/* Call Status Indicator */}
      {/* <View style={styles.statusIndicator}>
        <View style={[styles.statusDot, { 
          backgroundColor: callStatus === 'connected' && connectionState === 3 ? '#4CAF50' : '#FF9800' 
        }]} />
        <Text style={[styles.statusText, { color: theme.colors.textSecondary }]}>
          {callStatus === 'connecting' ? 'Establishing connection...' : 
           callStatus === 'connected' && connectionState === 3 ? 'Call in progress' : 
           callStatus === 'connected' ? 'Connecting to audio...' : 'Call ended'}
        </Text>
        {connectionState && (
          <Text style={[styles.connectionStatusText, { color: theme.colors.textSecondary }]}>
            Connection: {connectionState === 3 ? 'Connected' : 
                        connectionState === 1 ? 'Connecting' : 
                        connectionState === 2 ? 'Reconnecting' : 'Disconnected'}
          </Text>
        )}
      </View> */}

     
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
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
  profilePicture: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  profileEmail: {
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
    marginBottom: 40,
  },
  controlButton: {
    alignItems: 'center',
    minWidth: 80,
  },
  controlButtonActive: {
    transform: [{ scale: 1.1 }],
  },
  controlButtonDisabled: {
    opacity: 0.5,
  },
  endCallButtonDisabled: {
    opacity: 0.5,
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
    // paddingVertical: 40,
  },
  endCallButton: {
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
  connectionStatusText: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 4,
    textAlign: 'center',
  },
  debugContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 8,
  },
  debugText: {
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  testContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  testButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  testButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
