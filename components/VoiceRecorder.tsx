import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { VoiceNote } from '../types/MessageTypes';

interface VoiceRecorderProps {
  onVoiceRecorded: (voiceNote: VoiceNote) => void;
  onClose: () => void;
  isVisible: boolean;
  isUploading?: boolean;
}

export default function VoiceRecorder({ onVoiceRecorded, onClose, isVisible, isUploading }: VoiceRecorderProps) {
  const { theme } = useTheme();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioPermission, setAudioPermission] = useState<Audio.PermissionStatus | null>(null);
  const timeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      try {
        // First check if we already have permission
        const { status: existingStatus } = await Audio.getPermissionsAsync();
        console.log('Existing audio permission status:', existingStatus);
        
        if (existingStatus === 'granted') {
          setAudioPermission(existingStatus);
          return;
        }

        // Set the current status
        setAudioPermission(existingStatus);
        
        // If permission is undetermined, we can request it
        if (existingStatus === 'undetermined') {
          console.log('Permission undetermined, will request when user tries to record');
        } else if (existingStatus === 'denied') {
          console.log('Permission denied, user needs to grant it manually');
          // Force a permission check to see if it changed
          setTimeout(async () => {
            try {
              const { status: newStatus } = await Audio.getPermissionsAsync();
              console.log('Delayed permission check result:', newStatus);
              if (newStatus !== existingStatus) {
                setAudioPermission(newStatus);
              }
            } catch (error) {
              console.error('Error in delayed permission check:', error);
            }
          }, 1000);
        }
      } catch (error) {
        console.error('Error checking audio permission:', error);
        setAudioPermission('denied' as Audio.PermissionStatus);
      }
    })();

    return () => {
      if (timeIntervalRef.current) {
        clearInterval(timeIntervalRef.current);
      }
      if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, []);

  useEffect(() => {
    // Add a subtle pulsing animation to the hold button when not recording
    if (!isRecording) {
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnimation.start();
      
      return () => pulseAnimation.stop();
    }
  }, [isRecording, pulseAnim]);

  const startRecording = async () => {
    try {
      console.log('🎬 Starting recording process...');
      console.log('Current recording state before start:', isRecording);
      
      // Check permission first
      const { status } = await Audio.getPermissionsAsync();
      console.log('🔐 Current permission status:', status);
      
      if (status !== 'granted') {
        console.log('❌ Permission not granted, requesting...');
        
        // Request permission - this should show the system popup
        const { status: newStatus } = await Audio.requestPermissionsAsync();
        console.log('🔐 Permission request result:', newStatus);
        
        if (newStatus !== 'granted') {
          console.log('❌ Permission denied by user');
          setAudioPermission(newStatus);
          Alert.alert(
            'Microphone Permission Required',
            'This app needs microphone access to record voice notes. Please go to your device settings and enable microphone permission for this app.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Try Again', onPress: () => {
                // Allow user to try requesting permission again
                setAudioPermission('undetermined' as Audio.PermissionStatus);
              }}
            ]
          );
          return;
        }
        
        // Update permission state
        setAudioPermission(newStatus);
        console.log('✅ Permission granted, proceeding with recording...');
      }

      // Set audio mode
      console.log('🎵 Setting audio mode...');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      console.log('🎵 Audio mode set, creating recording...');

      // Create recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      console.log('✅ Recording created successfully');

      setRecording(newRecording);
      setIsRecording(true);
      setRecordingTime(0);

      // Add haptic feedback for recording start
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Start timer
      timeIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Animate button scale to show recording is active
      Animated.spring(scaleAnim, {
        toValue: 1.2,
        useNativeDriver: true,
      }).start();

      console.log('🎬 Recording started successfully!');

    } catch (err) {
      console.error('❌ Failed to start recording:', err);
      Alert.alert(
        'Recording Error', 
        'Failed to start recording. Please check your microphone permissions and try again.'
      );
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      console.log('Stopping recording...');
      setIsRecording(false);
      
      if (timeIntervalRef.current) {
        clearInterval(timeIntervalRef.current);
      }

      // Reset button scale
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
      }).start();

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      if (uri) {
        // Check if recording is too short (less than 1 second)
        if (recordingTime < 1) {
          console.log('Recording too short, canceling...');
          Alert.alert('Recording Too Short', 'Please hold the button for at least 1 second to record a voice note.');
          await FileSystem.deleteAsync(uri);
          setRecording(null);
          setRecordingTime(0);
          return;
        }
        
        const fileInfo = await FileSystem.getInfoAsync(uri);
        const voiceNote: VoiceNote = {
          uri,
          duration: recordingTime,
          size: fileInfo.exists ? fileInfo.size : 0,
        };
        
        console.log('Voice note created, sending...');
        onVoiceRecorded(voiceNote);
        
        // Add haptic feedback for recording completion
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        // Close the recorder after sending
        setTimeout(() => {
          onClose();
        }, 500);
      }
      
      setRecording(null);
      setRecordingTime(0);
    } catch (err) {
      console.error('Failed to stop recording', err);
      Alert.alert('Error', 'Failed to stop recording');
    }
  };

  const cancelRecording = async () => {
    if (recording) {
      try {
        console.log('Canceling recording...');
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        if (uri) {
          await FileSystem.deleteAsync(uri);
        }
      } catch (err) {
        console.error('Failed to cancel recording', err);
      }
    }
    
    if (timeIntervalRef.current) {
      clearInterval(timeIntervalRef.current);
    }
    
    // Reset button scale
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
    
    setRecording(null);
    setIsRecording(false);
    setRecordingTime(0);
    
    // Add haptic feedback for recording cancellation
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    
    console.log('Recording canceled');
    onClose();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const requestPermissionWithRetry = async () => {
    try {
      console.log('Requesting permission with retry...');
      
      // First check current status
      const { status: currentStatus } = await Audio.getPermissionsAsync();
      console.log('Current permission status before request:', currentStatus);
      
      if (currentStatus === 'granted') {
        setAudioPermission(currentStatus);
        return currentStatus;
      }
      
      // Request permission
      const { status: newStatus } = await Audio.requestPermissionsAsync();
      console.log('Permission request result:', newStatus);
      
      setAudioPermission(newStatus);
      
      if (newStatus === 'granted') {
        console.log('Permission granted successfully!');
        return newStatus;
      } else if (newStatus === 'denied') {
        console.log('Permission denied by user');
        // Show alert with instructions
        Alert.alert(
          'Permission Denied',
          'Microphone permission was denied. To use voice notes, please:\n\n1. Go to your device Settings\n2. Find "Amigo" app\n3. Tap "Permissions"\n4. Enable "Microphone"\n\nThen return to the app and try again.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Try Again', onPress: () => {
              // Reset permission state to allow retry
              setAudioPermission('undetermined' as Audio.PermissionStatus);
            }}
          ]
        );
      }
      
      return newStatus;
    } catch (error) {
      console.error('Error requesting permission:', error);
      Alert.alert('Error', 'Failed to request microphone permission. Please try again.');
      return 'denied' as Audio.PermissionStatus;
    }
  };

  // Remove the PanResponder and use simple press events instead
  const handlePressIn = () => {
    console.log('🎤 Button pressed in - starting recording');
    console.log('Current recording state:', isRecording);
    // Add haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!isRecording) {
      console.log('🚀 Calling startRecording...');
      startRecording();
    } else {
      console.log('⚠️ Already recording, ignoring press in');
    }
  };

  const handlePressOut = () => {
    console.log('🛑 Button pressed out - stopping recording');
    console.log('Current recording state:', isRecording);
    // Add haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isRecording) {
      console.log('⏹️ Calling stopRecording...');
      stopRecording();
    } else {
      console.log('⚠️ Not recording, ignoring press out');
    }
  };

  const handleLongPress = () => {
    console.log('⏰ Long press detected - this should not happen with hold-to-record');
  };

  if (audioPermission === null) {
    return (
      <Modal
        visible={isVisible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.text, { color: theme.colors.text }]}>Requesting permission...</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={[styles.closeButtonText, { color: theme.colors.primary }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // Don't block the UI if permission is not granted, let user try to record
  // The startRecording function will handle permission requests

  // If permission is denied, show a permission request screen
  if (audioPermission === 'denied') {
    return (
      <Modal
        visible={isVisible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.colors.text }]}>Microphone Permission</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.permissionContainer}>
              <Ionicons name="mic-off" size={64} color={theme.colors.error} />
              <Text style={[styles.permissionTitle, { color: theme.colors.text }]}>
                Microphone Access Required
              </Text>
              <Text style={[styles.permissionText, { color: theme.colors.textSecondary }]}>
                To record voice notes, this app needs access to your microphone. Please grant permission to continue.
              </Text>
              
              <View style={styles.instructionBox}>
                <Text style={[styles.instructionTitle, { color: theme.colors.primary }]}>
                  How to enable microphone:
                </Text>
                <Text style={[styles.instructionStep, { color: theme.colors.textSecondary }]}>
                  1. Go to your device Settings
                </Text>
                <Text style={[styles.instructionStep, { color: theme.colors.textSecondary }]}>
                  2. Find &quot;Amigo&quot; app
                </Text>
                <Text style={[styles.instructionStep, { color: theme.colors.textSecondary }]}>
                  3. Tap &quot;Permissions&quot;
                </Text>
                <Text style={[styles.instructionStep, { color: theme.colors.textSecondary }]}>
                  4. Enable &quot;Microphone&quot;
                </Text>
              </View>
              
              <TouchableOpacity
                style={[styles.permissionButton, { backgroundColor: theme.colors.primary }]}
                onPress={async () => {
                  try {
                    const status = await requestPermissionWithRetry();
                    console.log('Permission request completed with status:', status);
                  } catch (error) {
                    console.error('Error in permission button:', error);
                  }
                }}
              >
                <Text style={styles.permissionButtonText}>Grant Permission</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.permissionButton, { backgroundColor: theme.colors.border }]}
                onPress={async () => {
                  try {
                    const { status } = await Audio.getPermissionsAsync();
                    console.log('Current permission status:', status);
                    setAudioPermission(status);
                    Alert.alert('Permission Status', `Current microphone permission status: ${status}`);
                  } catch (error) {
                    console.error('Error checking permission:', error);
                  }
                }}
              >
                <Text style={[styles.permissionButtonText, { color: theme.colors.text }]}>Check Permission</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.permissionButton, { backgroundColor: theme.colors.success }]}
                onPress={async () => {
                  try {
                    const { status } = await Audio.getPermissionsAsync();
                    console.log('Refreshed permission status:', status);
                    setAudioPermission(status);
                    if (status === 'granted') {
                      Alert.alert('Success!', 'Microphone permission is now granted. You can record voice notes!');
                    } else {
                      Alert.alert('Permission Status', `Microphone permission status: ${status}`);
                    }
                  } catch (error) {
                    console.error('Error refreshing permission:', error);
                  }
                }}
              >
                <Text style={styles.permissionButtonText}>Refresh Status</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.permissionButton, { backgroundColor: theme.colors.border }]}
                onPress={onClose}
              >
                <Text style={[styles.permissionButtonText, { color: theme.colors.text }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Voice Recorder</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.recordingArea}>
            {isUploading ? (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.processingText, { color: theme.colors.text }]}>
                  Processing voice note...
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.timerContainer}>
                  <Text style={[styles.timer, { color: theme.colors.primary }]}>
                    {formatTime(recordingTime)}
                  </Text>
                </View>

            <View style={styles.controlsContainer}>
              {!isRecording ? (
                <View style={styles.instructionContainer}>
                  <Text style={[styles.instruction, { color: theme.colors.textSecondary }]}>
                    Hold the button below to record
                  </Text>
                </View>
              ) : (
                <View style={styles.recordingControls}>
                  <TouchableOpacity
                    style={[styles.controlButton, { backgroundColor: theme.colors.error }]}
                    onPress={cancelRecording}
                  >
                    <Ionicons name="close" size={24} color="#ffffff" />
                  </TouchableOpacity>
                  
                  <Animated.View style={[styles.recordButton, { 
                    backgroundColor: theme.colors.success,
                    transform: [{ scale: scaleAnim }]
                  }]}>
                    <Ionicons name="stop" size={32} color="#ffffff" />
                  </Animated.View>
                </View>
              )}
            </View>

            {/* Hold-to-record button - This is the main recording button */}
            <View style={styles.holdContainer}>
              <Text style={[styles.holdInstruction, { color: theme.colors.textSecondary }]}>
                {isRecording ? 'Recording... Release to send' : '🎤 HOLD TO RECORD'}
              </Text>
              
              {/* Recording indicator */}
              {isRecording && (
                <View style={styles.recordingIndicator}>
                  <View style={[styles.recordingDot, { backgroundColor: theme.colors.error }]} />
                  <Text style={[styles.recordingText, { color: theme.colors.error }]}>
                    Recording...
                  </Text>
                </View>
              )}
              
              <TouchableOpacity
                style={[
                  styles.holdButton,
                  { 
                    backgroundColor: isRecording ? theme.colors.error : theme.colors.primary,
                    transform: [
                      { scale: isRecording ? 1.1 : pulseAnim }
                    ]
                  }
                ]}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onLongPress={handleLongPress}
                activeOpacity={0.6}
                delayPressIn={0}
                delayPressOut={0}
              >
                <Ionicons 
                  name={isRecording ? "stop" : "mic"} 
                  size={32} 
                  color="#ffffff" 
                />
              </TouchableOpacity>
              
              <Text style={[styles.holdHint, { color: theme.colors.textSecondary }]}>
                {isRecording ? '👆 RELEASE TO SEND' : '👆 HOLD AND SPEAK'}
              </Text>
            </View>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    padding: 20,
    borderRadius: 20,
    minHeight: 300,
    maxWidth: '90%',
    width: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  recordingArea: {
    alignItems: 'center',
    // flex: 1,
  },
  timerContainer: {
    marginBottom: 40,
  },
  timer: {
    fontSize: 48,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  controlsContainer: {
    marginBottom: 30,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  recordingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  instruction: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10, // Added margin to separate from button
  },
  instructionContainer: {
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
    textAlign: 'center',
  },
  holdContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  holdInstruction: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 15,
    textAlign: 'center',
  },
  holdButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  holdHint: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
  permissionContainer: {
    alignItems: 'center',
    padding: 20,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
  },
  permissionText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionButton: {
    width: '100%',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  permissionButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  instructionBox: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
    marginBottom: 20,
    width: '100%',
    alignItems: 'center',
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  instructionStep: {
    fontSize: 14,
    marginBottom: 5,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 5,
  },
  recordingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  processingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  processingText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 20,
    textAlign: 'center',
  },
});
