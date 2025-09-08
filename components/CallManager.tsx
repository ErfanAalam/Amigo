import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useCallStatus } from '../context/CallStatusContext';
import { useTheme } from '../context/ThemeContext';
import { FieldValue, firebaseFirestore } from '../firebaseConfig';
import { CallNotification } from '../types/CallTypes';
import { requestMicrophonePermission, showPermissionDeniedAlert } from '../utils/permissions';
import { ringSoundManager } from '../utils/RingSound';
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
  const { setCurrentCall, setCallStatus, clearCall } = useCallStatus();
  const router = useRouter();
  
  const [incomingCall, setIncomingCall] = useState<CallNotification | null>(null);
  const [showIncomingCallModal, setShowIncomingCallModal] = useState(false);
  
  const callListenerRef = useRef<any>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Generate unique channel ID
  // const generateChannelId = useCallback(() => {
  //   return `channel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  // }, []);

  // Fetch Agora token from backend (unused but kept for potential future use)


  // Start a call


  // Accept incoming call
  const acceptCall = useCallback(async () => {
    if (!incomingCall || !userData?.uid) return;

    try {
      // Update call status to accepted
      await firebaseFirestore.collection('calls').doc(incomingCall.callId).update({
        status: 'accepted',
        acceptedAt: FieldValue.serverTimestamp(),
      });

      // Set current call in context
      const currentCall = {
        id: incomingCall.callId,
        callerId: incomingCall.callerId,
        calleeId: userData.uid,
        channelId: incomingCall.channelId,
        status: 'accepted' as const,
        createdAt: incomingCall.timestamp,
        acceptedAt: FieldValue.serverTimestamp(),
        callerName: incomingCall.callerName,
        calleeName: userData.displayName || 'Unknown',
      };
      setCurrentCall(currentCall);
      setCallStatus('connecting');

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
    }
  }, [incomingCall, userData, router, setCurrentCall, setCallStatus]);

  // Decline incoming call
  const declineCall = useCallback(async () => {
    if (!incomingCall || !userData?.uid) return;

    try {
      
      // Clear timeout first
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }

      // Update call status to declined
      await firebaseFirestore.collection('calls').doc(incomingCall.callId).update({
        status: 'declined',
        endedAt: FieldValue.serverTimestamp(),
      });

      // Close modal
      setShowIncomingCallModal(false);
      setIncomingCall(null);

      // Clear call context
      clearCall();

    } catch (error) {
      console.error('Error declining call:', error);
      // Still close modal even if Firestore update fails
      setShowIncomingCallModal(false);
      setIncomingCall(null);
      // Clear call context even on error
      clearCall();
    }
  }, [incomingCall, userData, clearCall]);


  // Listen for incoming calls
  useEffect(() => {
    if (!userData?.uid) return;


    // Listen for calls where user is the callee
    callListenerRef.current = firebaseFirestore
      .collection('calls')
      .where('calleeId', '==', userData.uid)
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const callData = change.doc.data();
          const callId = change.doc.id;


          if (change.type === 'added' && callData.status === 'ringing') {
            const callNotification: CallNotification = {
              callId: callId,
              callerId: callData.callerId,
              callerName: callData.callerName || 'Unknown',
              channelId: callData.channelId,
              timestamp: callData.createdAt,
            };

            setIncomingCall(callNotification);
            setShowIncomingCallModal(true);

            // Auto-decline after 30 seconds if not answered
            callTimeoutRef.current = setTimeout(() => {
              if (showIncomingCallModal) {
                declineCall();
              }
            }, 30000) as unknown as NodeJS.Timeout;
          } else if (change.type === 'modified') {
            // Handle call status changes
            
            if (callData.status === 'ended' || callData.status === 'declined') {
              // Clear timeout if call was ended by caller
              if (callTimeoutRef.current) {
                clearTimeout(callTimeoutRef.current);
                callTimeoutRef.current = null;
              }
              
              // Close the incoming call modal
              setShowIncomingCallModal(false);
              setIncomingCall(null);
              
              // Clear call context
              clearCall();
            }
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
  }, [userData?.uid, showIncomingCallModal, declineCall, clearCall]);

  // Listen for call status changes to stop ring sound for caller
  useEffect(() => {
    if (!userData?.uid) return;

    const callStatusListener = firebaseFirestore
      .collection('calls')
      .where('callerId', '==', userData.uid)
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'modified') {
            const callData = change.doc.data();
            if (callData.status === 'accepted' || callData.status === 'declined' || callData.status === 'ended') {
              
              // Stop ring sound when call is answered or ended
              ringSoundManager.stopRinging();
              setShowIncomingCallModal(false);
              
              // Clear call context if call ended or declined
              if (callData.status === 'ended' || callData.status === 'declined') {
                clearCall();
              }
            }
          }
        });
      }, (error) => {
        console.error('Error listening for call status changes:', error);
      });

    return () => {
      callStatusListener();
    };
  }, [userData?.uid, clearCall]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (callListenerRef.current) {
        callListenerRef.current();
      }
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
      }
      // Force close modal on unmount
      setShowIncomingCallModal(false);
      setIncomingCall(null);
      // Stop ring sound on unmount
      ringSoundManager.stopRinging();
    };
  }, []);

  // Additional safety: Close modal if it's been open for too long (35 seconds)
  useEffect(() => {
    if (showIncomingCallModal && incomingCall) {
      const safetyTimeout = setTimeout(() => {
        setShowIncomingCallModal(false);
        setIncomingCall(null);
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
        }
      }, 35000); // 35 seconds safety timeout

      return () => {
        clearTimeout(safetyTimeout);
      };
    }
  }, [showIncomingCallModal, incomingCall]);

  // Additional listener to check call status periodically
  useEffect(() => {
    if (!showIncomingCallModal || !incomingCall || !userData?.uid) return;

    const checkCallStatus = async () => {
      try {
        const callDoc = await firebaseFirestore.collection('calls').doc(incomingCall.callId).get();
        if (callDoc.exists) {
          const callData = callDoc.data();
          if (callData?.status === 'ended' || callData?.status === 'declined') {
            setShowIncomingCallModal(false);
            setIncomingCall(null);
            if (callTimeoutRef.current) {
              clearTimeout(callTimeoutRef.current);
              callTimeoutRef.current = null;
            }
          }
        }
      } catch (error) {
        console.error('Error checking call status:', error);
      }
    };

    // Check every 2 seconds
    const statusCheckInterval = setInterval(checkCallStatus, 2000);

    return () => {
      clearInterval(statusCheckInterval);
    };
  }, [showIncomingCallModal, incomingCall, userData?.uid]);

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
          // Clear timeout if manual close
          if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
          }
        }}
      />
    </>
  );
};

// Export the startCall function for use in other components
export const useCallManager = () => {
  const { userData } = useAuth();
  const { setCurrentCall, setCallStatus, isInCall } = useCallStatus();
  const router = useRouter();

  const startCall = useCallback(async (calleeId: string, calleeName: string): Promise<void> => {
    if (!userData?.uid || !userData?.displayName) {
      Alert.alert('Error', 'User data not available');
      return;
    }

    // Check if user is already in a call
    if (isInCall) {
      Alert.alert('Call in Progress', 'You are already in a call. Please end the current call before starting a new one.');
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
      
      // Set current call in context
      const currentCall = {
        id: callRef.id,
        ...callData,
        status: 'ringing' as const,
      };
      setCurrentCall(currentCall);
      setCallStatus('ringing');

      // Start ring sound for caller
      await ringSoundManager.startRinging();

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
      
      // Send push notification to the callee
      try {
        
        await sendCallNotification(
          calleeId,
          userData.displayName,
          'audio',
          callRef.id,
          channelId
        );
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
      


    } catch (error) {
      console.error('Error starting call:', error);
      Alert.alert('Error', 'Failed to start call');
    }
  }, [userData, router, setCurrentCall, setCallStatus, isInCall]);

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
