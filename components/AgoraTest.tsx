import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAgoraAudio } from '../hooks/useAgoraAudio';

interface AgoraTestProps {
  channelId: string;
  token: string;
  uid: number;
}

export const AgoraTest: React.FC<AgoraTestProps> = ({ channelId, token, uid }) => {
  const [testStatus, setTestStatus] = useState<string>('Ready to test');
  
  const {
    isInitialized,
    isJoined,
    isMuted,
    isSpeakerOn,
    localUid,
    remoteUid,
    callDuration,
    connectionState,
    initialize,
    joinChannel,
    leaveChannel,
    toggleMute,
    toggleSpeaker,
    cleanup,
  } = useAgoraAudio();

  const handleInitialize = async () => {
    try {
      setTestStatus('Initializing...');
      await initialize();
      setTestStatus('Initialized successfully');
    } catch (error) {
      setTestStatus(`Initialization failed: ${error}`);
      Alert.alert('Error', `Failed to initialize: ${error}`);
    }
  };

  const handleJoinChannel = async () => {
    try {
      setTestStatus('Joining channel...');
      await joinChannel(channelId, token, uid);
      setTestStatus('Join request sent');
    } catch (error) {
      setTestStatus(`Join failed: ${error}`);
      Alert.alert('Error', `Failed to join channel: ${error}`);
    }
  };

  const handleLeaveChannel = async () => {
    try {
      setTestStatus('Leaving channel...');
      await leaveChannel();
      setTestStatus('Left channel');
    } catch (error) {
      setTestStatus(`Leave failed: ${error}`);
      Alert.alert('Error', `Failed to leave channel: ${error}`);
    }
  };

  const handleToggleMute = async () => {
    try {
      await toggleMute();
      setTestStatus(`Mute toggled: ${!isMuted}`);
    } catch (error) {
      setTestStatus(`Mute toggle failed: ${error}`);
    }
  };

  const handleToggleSpeaker = async () => {
    try {
      await toggleSpeaker();
      setTestStatus(`Speaker toggled: ${!isSpeakerOn}`);
    } catch (error) {
      setTestStatus(`Speaker toggle failed: ${error}`);
    }
  };

  const handleCleanup = async () => {
    try {
      await cleanup();
      setTestStatus('Cleaned up');
    } catch (error) {
      setTestStatus(`Cleanup failed: ${error}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Agora Audio Test</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.statusLabel}>Status:</Text>
        <Text style={styles.statusText}>{testStatus}</Text>
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>Initialized: {isInitialized ? 'Yes' : 'No'}</Text>
        <Text style={styles.infoText}>Joined: {isJoined ? 'Yes' : 'No'}</Text>
        <Text style={styles.infoText}>Muted: {isMuted ? 'Yes' : 'No'}</Text>
        <Text style={styles.infoText}>Speaker On: {isSpeakerOn ? 'Yes' : 'No'}</Text>
        <Text style={styles.infoText}>Local UID: {localUid || 'None'}</Text>
        <Text style={styles.infoText}>Remote UID: {remoteUid || 'None'}</Text>
        <Text style={styles.infoText}>Duration: {callDuration}s</Text>
        <Text style={styles.infoText}>Connection State: {connectionState || 'None'}</Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.button, styles.initButton]} 
          onPress={handleInitialize}
          disabled={isInitialized}
        >
          <Text style={styles.buttonText}>Initialize</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.joinButton]} 
          onPress={handleJoinChannel}
          disabled={!isInitialized || isJoined}
        >
          <Text style={styles.buttonText}>Join Channel</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.leaveButton]} 
          onPress={handleLeaveChannel}
          disabled={!isJoined}
        >
          <Text style={styles.buttonText}>Leave Channel</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.muteButton]} 
          onPress={handleToggleMute}
          disabled={!isJoined}
        >
          <Text style={styles.buttonText}>{isMuted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.speakerButton]} 
          onPress={handleToggleSpeaker}
          disabled={!isJoined}
        >
          <Text style={styles.buttonText}>{isSpeakerOn ? 'Speaker Off' : 'Speaker On'}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.cleanupButton]} 
          onPress={handleCleanup}
        >
          <Text style={styles.buttonText}>Cleanup</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  statusContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  statusText: {
    fontSize: 14,
    color: '#666',
  },
  infoContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 5,
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  button: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    minWidth: '48%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  initButton: {
    backgroundColor: '#007AFF',
  },
  joinButton: {
    backgroundColor: '#34C759',
  },
  leaveButton: {
    backgroundColor: '#FF3B30',
  },
  muteButton: {
    backgroundColor: '#FF9500',
  },
  speakerButton: {
    backgroundColor: '#5856D6',
  },
  cleanupButton: {
    backgroundColor: '#8E8E93',
  },
});
