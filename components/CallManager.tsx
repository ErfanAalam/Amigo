import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FieldValue, firebaseFirestore } from '../firebaseConfig';
import { Call, CallNotification } from '../types/CallTypes';
import { requestMicrophonePermission, showPermissionDeniedAlert } from '../utils/permissions';
import { sendCallNotification } from '../utils/sendNotification';

interface CallManagerProps {
  children: React.ReactNode;
}

interface IncomingCallModalProps {
  visible: boolean;
  call: CallNotification | null;
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
}

const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  visible,
  call,
  onAccept,
  onDecline,
  onClose,
}) => {
  const { theme } = useTheme();

  if (!call) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { backgroundColor: theme.colors.surface }]}>
          <LinearGradient
            colors={['#0d9488', '#10b981']}
            style={styles.callHeader}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.callIconContainer}>
              <Ionicons name="call" size={40} color="#ffffff" />
            </View>
            <Text style={styles.incomingCallText}>Incoming Call</Text>
            <Text style={styles.callerNameText}>{call.callerName}</Text>
          </LinearGradient>

          <View style={styles.callActions}>
            <TouchableOpacity
              style={[styles.callButton, styles.acceptButton]}
              onPress={onAccept}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#4CAF50', '#45a049']}
                style={styles.acceptButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="call" size={24} color="#ffffff" />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.callButton, styles.declineButton]}
              onPress={onDecline}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#F44336', '#d32f2f']}
                style={styles.declineButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="call-outline" size={24} color="#ffffff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={[styles.closeButtonText, { color: theme.colors.textSecondary }]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export const CallManager: React.FC<CallManagerProps> = ({ children }) => {
  const { userData } = useAuth();
  const router = useRouter();
  
  const [incomingCall, setIncomingCall] = useState<CallNotification | null>(null);
  const [showIncomingCallModal, setShowIncomingCallModal] = useState(false);
  const [isProcessingCall, setIsProcessingCall] = useState(false);
  
  const callListenerRef = useRef<any>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Generate unique channel ID
  const generateChannelId = useCallback(() => {
    return `channel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Fetch Agora token from backend (unused but kept for potential future use)
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

  // Start a call
  const startCall = useCallback(async (calleeId: string, calleeName: string): Promise<void> => {
    if (!userData?.uid || !userData?.displayName) {
      Alert.alert('Error', 'User data not available');
      return;
    }

    try {
      // Request microphone permission
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        showPermissionDeniedAlert();
        return;
      }

      setIsProcessingCall(true);

      // Generate channel ID
      const channelId = generateChannelId();
      
      // Create call document
      const callData: Omit<Call, 'id'> = {
        callerId: userData.uid,
        calleeId,
        channelId,
        status: 'ringing',
        createdAt: FieldValue.serverTimestamp(),
        callerName: userData.displayName,
        calleeName,
      };

      const callRef = await firebaseFirestore.collection('calls').add(callData);
      
      console.log('✅ Call created with ID:', callRef.id, 'Status: ringing');
      
      // Send push notification to the callee
      try {
        console.log('📞 Starting to send call notification...');
        console.log('📞 Call details:', {
          calleeId,
          callerName: userData.displayName,
          callId: callRef.id,
          channelId
        });
        
        await sendCallNotification(
          calleeId,
          userData.displayName,
          'audio',
          callRef.id,
          channelId
        );
        console.log('✅ Call notification sent successfully to:', calleeName);
      } catch (notificationError) {
        console.error('❌ Error sending call notification:', notificationError);
        console.error('❌ Notification error details:', {
          calleeId,
          callerName: userData.displayName,
          callId: callRef.id,
          channelId,
          error: notificationError
        });
        // Don't fail the call if notification fails
      }
      
      // Navigate to call screen
      router.push({
        pathname: '/audioCall',
        params: {
          callId: callRef.id,
          channelId,
          isInitiator: 'true',
          calleeName,
        }
      });

    } catch (error) {
      console.error('Error starting call:', error);
      Alert.alert('Error', 'Failed to start call');
    } finally {
      setIsProcessingCall(false);
    }
  }, [userData, generateChannelId, router]);

  // Accept incoming call
  const acceptCall = useCallback(async () => {
    if (!incomingCall || !userData?.uid) return;

    try {
      setIsProcessingCall(true);

      // Update call status to accepted
      await firebaseFirestore.collection('calls').doc(incomingCall.callId).update({
        status: 'accepted',
        acceptedAt: FieldValue.serverTimestamp(),
      });
      
      console.log('✅ Call status updated to accepted for call:', incomingCall.callId);

      // Navigate to call screen
      router.push({
        pathname: '/audioCall',
        params: {
          callId: incomingCall.callId,
          channelId: incomingCall.channelId,
          isInitiator: 'false',
          callerName: incomingCall.callerName,
        }
      });

      // Close modal
      setShowIncomingCallModal(false);
      setIncomingCall(null);

    } catch (error) {
      console.error('Error accepting call:', error);
      Alert.alert('Error', 'Failed to accept call');
    } finally {
      setIsProcessingCall(false);
    }
  }, [incomingCall, userData, router]);

  // Decline incoming call
  const declineCall = useCallback(async () => {
    if (!incomingCall || !userData?.uid) return;

    try {
      // Update call status to declined
      await firebaseFirestore.collection('calls').doc(incomingCall.callId).update({
        status: 'declined',
        endedAt: FieldValue.serverTimestamp(),
      });

      // Close modal
      setShowIncomingCallModal(false);
      setIncomingCall(null);

    } catch (error) {
      console.error('Error declining call:', error);
    }
  }, [incomingCall, userData]);


  // Listen for incoming calls
  useEffect(() => {
    if (!userData?.uid) return;

    // console.log('Setting up call listener for user:', userData.uid);

    // Listen for calls where user is the callee and status is ringing
    callListenerRef.current = firebaseFirestore
      .collection('calls')
      .where('calleeId', '==', userData.uid)
      .where('status', '==', 'ringing')
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const callData = change.doc.data();
            const callNotification: CallNotification = {
              callId: change.doc.id,
              callerId: callData.callerId,
              callerName: callData.callerName || 'Unknown',
              channelId: callData.channelId,
              timestamp: callData.createdAt,
            };

            // console.log('Incoming call received:', callNotification);
            setIncomingCall(callNotification);
            setShowIncomingCallModal(true);

            // Auto-decline after 30 seconds if not answered
            callTimeoutRef.current = setTimeout(() => {
              if (showIncomingCallModal) {
                declineCall();
              }
            }, 30000) as unknown as NodeJS.Timeout;
          }
        });
      }, (error) => {
        console.error('Error listening for calls:', error);
      });

    return () => {
      if (callListenerRef.current) {
        callListenerRef.current();
      }
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
      }
    };
  }, [userData?.uid, showIncomingCallModal, declineCall]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (callListenerRef.current) {
        callListenerRef.current();
      }
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      {children}
      
      <IncomingCallModal
        visible={showIncomingCallModal}
        call={incomingCall}
        onAccept={acceptCall}
        onDecline={declineCall}
        onClose={() => {
          setShowIncomingCallModal(false);
          setIncomingCall(null);
        }}
      />
    </>
  );
};

// Export the startCall function for use in other components
export const useCallManager = () => {
  const { userData } = useAuth();
  const router = useRouter();

  const startCall = useCallback(async (calleeId: string, calleeName: string): Promise<void> => {
    if (!userData?.uid || !userData?.displayName) {
      Alert.alert('Error', 'User data not available');
      return;
    }

    try {
      // Request microphone permission
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        showPermissionDeniedAlert();
        return;
      }

      // Generate channel ID
      const channelId = `channel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create call document
      const callData = {
        callerId: userData.uid,
        calleeId,
        channelId,
        status: 'ringing',
        createdAt: FieldValue.serverTimestamp(),
        callerName: userData.displayName,
        calleeName,
      };

      const callRef = await firebaseFirestore.collection('calls').add(callData);
      
      console.log('✅ Call created with ID:', callRef.id, 'Status: ringing');
      
      // Send push notification to the callee
      try {
        console.log('📞 Starting to send call notification...');
        console.log('📞 Call details:', {
          calleeId,
          callerName: userData.displayName,
          callId: callRef.id,
          channelId
        });
        
        await sendCallNotification(
          calleeId,
          userData.displayName,
          'audio',
          callRef.id,
          channelId
        );
        console.log('✅ Call notification sent successfully to:', calleeName);
      } catch (notificationError) {
        console.error('❌ Error sending call notification:', notificationError);
        console.error('❌ Notification error details:', {
          calleeId,
          callerName: userData.displayName,
          callId: callRef.id,
          channelId,
          error: notificationError
        });
        // Don't fail the call if notification fails
      }
      
      // Navigate to call screen
      router.push({
        pathname: '/audioCall',
        params: {
          callId: callRef.id,
          channelId,
          isInitiator: 'true',
          calleeName,
        }
      });

    } catch (error) {
      console.error('Error starting call:', error);
      Alert.alert('Error', 'Failed to start call');
    }
  }, [userData, router]);

  return { startCall };
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  callHeader: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  callIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  incomingCallText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  callerNameText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  callActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  callButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  acceptButton: {
    marginRight: 20,
  },
  declineButton: {
    marginLeft: 20,
  },
  acceptButtonGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineButtonGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
