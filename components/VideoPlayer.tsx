import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
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

  // Debug logging
  console.log('VideoPlayer received URI:', uri);

  const togglePlayPause = async () => {
    try {
      console.log('Play button pressed!');
      console.log('Video ref exists:', !!videoRef.current);
      console.log('Current isPlaying state:', isPlaying);
      
      if (videoRef.current) {
        if (isPlaying) {
          console.log('Pausing video...');
          await videoRef.current.pauseAsync();
          console.log('Video paused successfully');
        } else {
          console.log('Playing video...');
          await videoRef.current.playAsync();
          console.log('Video play command sent');
        }
      } else {
        console.log('Video ref is null - cannot control video');
        setError('Video player not ready');
      }
    } catch (error) {
      console.error('Error toggling play/pause:', error);
      setError('Failed to control video playback: ' + error);
    }
  };

  // Initialize video when component mounts
  React.useEffect(() => {
    if (videoRef.current) {
      console.log('Video ref initialized');
    }
  }, []);

  const handlePlaybackStatusUpdate = (playbackStatus: any) => {
    console.log('Playback status update:', playbackStatus);
    setStatus(playbackStatus);
    setIsPlaying(playbackStatus.isPlaying);
    setIsLoading(false);
    
    // Don't auto-play - let user control it manually
  };

  const handleLoadStart = () => {
    setIsLoading(true);
    setError(null);
  };

  const handleError = (error: string) => {
    console.error('Video error:', error);
    setError(error);
    setIsLoading(false);
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
         onLoad={() => console.log('Video loaded successfully')}
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
});
