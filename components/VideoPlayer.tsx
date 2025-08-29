import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface VideoPlayerProps {
  uri: string;
  onClose?: () => void;
  isFullScreen?: boolean;
}

export default function VideoPlayer({ uri, onClose, isFullScreen = false }: VideoPlayerProps) {
  const { theme } = useTheme();
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<any>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Debug logging
  console.log('VideoPlayer received URI:', uri);

  // Validate URI
  useEffect(() => {
    if (!uri || uri.trim() === '') {
      setError('Invalid video URL provided');
      return;
    }
    
    // Check if URI is accessible
    const validateUri = async () => {
      try {
        const response = await fetch(uri, { method: 'HEAD' });
        if (!response.ok) {
          setError('Video file not accessible. Please check the URL.');
        }
      } catch (error) {
        console.warn('Could not validate URI, proceeding anyway:', error);
        // Continue anyway - some URIs might not support HEAD requests
      }
    };
    
    validateUri();
  }, [uri]);

  const togglePlayPause = async () => {
    try {
      console.log('Play button pressed!');
      console.log('Video ref exists:', !!videoRef.current);
      console.log('Current isPlaying state:', isPlaying);
      
      if (!videoRef.current) {
        console.log('Video ref is null - cannot control video');
        setError('Video player not ready');
        return;
      }

      if (isPlaying) {
        console.log('Pausing video...');
        await videoRef.current.pauseAsync();
        console.log('Video paused successfully');
      } else {
        console.log('Playing video...');
        await videoRef.current.playAsync();
        console.log('Video play command sent');
      }
    } catch (error: any) {
      console.error('Error toggling play/pause:', error);
      
      // Handle specific audio focus errors
      if (error?.message && error.message.includes('AudioFocusNotAcquiredException')) {
        setError('Audio focus issue. Please close other audio apps and try again.');
        
        // Show user-friendly alert with troubleshooting steps
        Alert.alert(
          'Audio Focus Error',
          'Unable to play video due to audio focus issues.\n\nTroubleshooting steps:\n\n1. Close other audio/video apps\n2. Check if your device is in silent mode\n3. Try the "Try Muted" option\n4. Restart your device if the issue persists',
          [
            { text: 'OK', style: 'default' },
            { 
              text: 'Try Muted', 
              onPress: () => tryPlayMuted() 
            },
            {
              text: 'Alternative Settings',
              onPress: () => tryAlternativePlayback()
            }
          ]
        );
      } else {
        setError('Failed to control video playback: ' + (error?.message || 'Unknown error'));
      }
    }
  };

  const tryPlayMuted = async () => {
    try {
      if (videoRef.current) {
        console.log('Attempting to play video muted...');
        await videoRef.current.setIsMutedAsync(true);
        await videoRef.current.playAsync();
        setError(null);
      }
    } catch (error: any) {
      console.error('Error playing muted video:', error);
      setError('Failed to play video even when muted');
    }
  };

  const tryAlternativePlayback = async () => {
    try {
      if (videoRef.current) {
        console.log('Trying alternative playback settings...');
        
        // Try with different settings
        await videoRef.current.setIsMutedAsync(true);
        await videoRef.current.setVolumeAsync(0.0);
        
        // Try to play with minimal audio requirements
        await videoRef.current.playAsync();
        setError(null);
      }
    } catch (error: any) {
      console.error('Error with alternative playback:', error);
      setError('All playback methods failed. Please check your device settings.');
    }
  };

  const handlePlaybackStatusUpdate = (playbackStatus: any) => {
    console.log('Playback status update:', playbackStatus);
    setStatus(playbackStatus);
    setIsPlaying(playbackStatus.isPlaying);
    setIsLoading(false);
    
    // Clear any previous errors when playback starts successfully
    if (playbackStatus.isPlaying && error) {
      setError(null);
    }
  };

  const handleLoadStart = () => {
    setIsLoading(true);
    setError(null);
    console.log('Video loading started...');
  };

  const handleError = (error: string) => {
    console.error('Video error:', error);
    setError(error);
    setIsLoading(false);
    
    // Auto-retry for certain types of errors
    if (error.includes('Network') && retryCount < 2) {
      console.log('Auto-retrying due to network error...');
      setTimeout(() => {
        retryVideo();
      }, 2000);
    }
  };

  const handleLoad = () => {
    console.log('Video loaded successfully');
    setIsLoading(false);
    setError(null);
    setRetryCount(0); // Reset retry count on successful load
  };

  const retryVideo = async () => {
    if (retryCount >= 3) {
      setError('Maximum retry attempts reached. Please check your connection and try again.');
      return;
    }
    
    setRetryCount(prev => prev + 1);
    setError(null);
    setIsLoading(true);
    
    try {
      if (videoRef.current) {
        // Reset video player completely
        await videoRef.current.unloadAsync();
        await videoRef.current.loadAsync({ uri }, {}, false);
      }
    } catch (error: any) {
      console.error('Error retrying video:', error);
      
      // Provide specific error messages based on error type
      if (error?.message?.includes('Network')) {
        setError('Network error. Please check your internet connection.');
      } else if (error?.message?.includes('AudioFocus')) {
        setError('Audio focus issue. Try closing other audio apps.');
      } else {
        setError('Failed to retry video: ' + (error?.message || 'Unknown error'));
      }
      setIsLoading(false);
    }
  };

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getCurrentTime = () => {
    return status.positionMillis || 0;
  };

  const getDuration = () => {
    return status.durationMillis || 0;
  };

  const seekTo = async (position: number) => {
    if (videoRef.current) {
      await videoRef.current.setPositionAsync(position);
    }
  };

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={theme.colors.error} />
          <Text style={[styles.errorText, { color: theme.colors.error }]}>
            Failed to load video
          </Text>
          <Text style={[styles.errorSubtext, { color: theme.colors.textSecondary }]}>
            {error}
          </Text>
          
          {/* Retry and Muted Options */}
          <View style={styles.errorActions}>
            <TouchableOpacity 
              style={[styles.retryButton, { backgroundColor: theme.colors.primary }]}
              onPress={retryVideo}
            >
              <Ionicons name="refresh" size={20} color="#ffffff" />
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.mutedButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary }]}
              onPress={tryPlayMuted}
            >
              <Ionicons name="volume-mute" size={20} color={theme.colors.primary} />
              <Text style={[styles.mutedButtonText, { color: theme.colors.primary }]}>Try Muted</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.alternativeButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.secondary }]}
              onPress={tryAlternativePlayback}
            >
              <Ionicons name="settings" size={20} color={theme.colors.secondary} />
              <Text style={[styles.alternativeButtonText, { color: theme.colors.secondary }]}>Alternative</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, isFullScreen && styles.fullScreenContainer]}>
      {onClose && (
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={24} color="#ffffff" />
        </TouchableOpacity>
      )}

             <Video
         ref={videoRef}
         source={{ uri }}
         style={[styles.video, isFullScreen && styles.fullScreenVideo]}
         useNativeControls={false}
         resizeMode={ResizeMode.CONTAIN}
         isLooping={false}
         onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
         onLoadStart={handleLoadStart}
         onError={handleError}
         onLoad={handleLoad}
         shouldPlay={false}
         isMuted={false}
       />

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.text }]}>
            Loading video...
          </Text>
        </View>
      )}

      {/* Custom Controls */}
      <View style={styles.controlsOverlay}>
                 <TouchableOpacity
           style={styles.playPauseButton}
           onPress={togglePlayPause}
           disabled={isLoading}
         >
           <Ionicons
             name={isPlaying ? "pause" : "play"}
             size={32}
             color="#ffffff"
           />
           <Text style={styles.playButtonText}>
             {isPlaying ? "Pause" : "Play"}
           </Text>
         </TouchableOpacity>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${(getCurrentTime() / getDuration()) * 100}%`,
                },
              ]}
            />
          </View>
          <View style={styles.timeContainer}>
            <Text style={styles.timeText}>
              {formatTime(getCurrentTime())}
            </Text>
            <Text style={styles.timeText}>
              {formatTime(getDuration())}
            </Text>
          </View>
        </View>
      </View>

             {/* Remove the tap area that was blocking button clicks */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  fullScreenVideo: {
    width: screenWidth,
    height: screenHeight,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
  },
  controlsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 20,
    paddingBottom: 40,
  },
     playPauseButton: {
     alignSelf: 'center',
     marginBottom: 20,
     padding: 16,
     backgroundColor: 'rgba(0,0,0,0.7)',
     borderRadius: 32,
     flexDirection: 'row',
     alignItems: 'center',
     gap: 8,
     minWidth: 120,
     justifyContent: 'center',
     elevation: 5,
     shadowColor: '#000',
     shadowOffset: { width: 0, height: 2 },
     shadowOpacity: 0.25,
     shadowRadius: 3.84,
   },
   playButtonText: {
     color: '#ffffff',
     fontSize: 16,
     fontWeight: '600',
   },
  progressContainer: {
    marginBottom: 10,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  errorActions: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 10,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    gap: 5,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  mutedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 5,
  },
  mutedButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  alternativeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 5,
  },
  alternativeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
