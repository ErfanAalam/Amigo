import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { Image } from 'expo-image';
import React, { memo, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Message } from '../types/MessageTypes';
import { DownloadState, MediaDownloader } from '../utils/MediaDownloader';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface MediaMessageProps {
  message: Message;
  isOwnMessage: boolean;
  onMediaPress?: () => void;
  onDocumentPress?: () => void;
  onLongPress?: () => void;
}

function MediaMessageComponent({ message, isOwnMessage, onMediaPress, onDocumentPress, onLongPress }: MediaMessageProps) {
  const { theme } = useTheme();
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  
  // Image zoom modal state
  const [isImageModalVisible, setIsImageModalVisible] = useState(false);
  const [imageScale, setImageScale] = useState(1);
  const [imageTranslateX, setImageTranslateX] = useState(0);
  const [imageTranslateY, setImageTranslateY] = useState(0);
  const [lastDistance, setLastDistance] = useState(0);
  const [lastScale, setLastScale] = useState(1);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDuration = (duration: number) => {
    // Handle both seconds and milliseconds
    // If duration is greater than 1000, it's likely in milliseconds
    const seconds = duration > 1000 ? duration / 1000 : duration;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDurationInSeconds = (duration: number) => {
    // Convert duration to seconds if it's in milliseconds
    return duration > 1000 ? duration / 1000 : duration;
  };

  const handleImagePress = () => {
    // Open image in zoom modal
    setIsImageModalVisible(true);
    setImageScale(1);
    setImageTranslateX(0);
    setImageTranslateY(0);
  };

  const closeImageModal = () => {
    setIsImageModalVisible(false);
    setImageScale(1);
    setImageTranslateX(0);
    setImageTranslateY(0);
  };

  // Pan responder for zoom modal
  const zoomPanResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt) => {
      return evt.nativeEvent.touches.length === 2 || imageScale > 1;
    },
    onMoveShouldSetPanResponder: (evt) => {
      return evt.nativeEvent.touches.length === 2 || imageScale > 1;
    },
    onPanResponderGrant: (evt) => {
      if (evt.nativeEvent.touches.length === 2) {
        // Pinch gesture - calculate initial distance
        const touches = evt.nativeEvent.touches;
        const dx = touches[0].pageX - touches[1].pageX;
        const dy = touches[0].pageY - touches[1].pageY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        setLastDistance(distance);
        setLastScale(imageScale);
      }
    },
    onPanResponderMove: (evt, gestureState) => {
      if (evt.nativeEvent.touches.length === 2 && lastDistance > 0) {
        // Pinch to zoom
        const touches = evt.nativeEvent.touches;
        const dx = touches[0].pageX - touches[1].pageX;
        const dy = touches[0].pageY - touches[1].pageY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        const scale = lastScale * (distance / lastDistance);
        const newScale = Math.max(1, Math.min(4, scale));
        setImageScale(newScale);
      } else if (evt.nativeEvent.touches.length === 1 && imageScale > 1) {
        // Pan when zoomed in (larger than original)
        setImageTranslateX(gestureState.dx);
        setImageTranslateY(gestureState.dy);
      }
    },
    onPanResponderRelease: () => {
      setLastDistance(0);
      setLastScale(imageScale);
      
      // Reset position if not zoomed in
      if (imageScale <= 1) {
        setImageTranslateX(0);
        setImageTranslateY(0);
      }
    },
  });

  // Double tap to zoom
  const handleDoubleTap = () => {
    if (imageScale > 1) {
      // Reset to full size
      setImageScale(1);
      setImageTranslateX(0);
      setImageTranslateY(0);
    } else {
      // Zoom in to larger size
      setImageScale(1);
    }
  };

  const handleVideoPress = () => {
    // For videos, always call onMediaPress for immediate preview
    if (onMediaPress) {
      onMediaPress();
    }
  };

  const [downloadState, setDownloadState] = useState<DownloadState | undefined>();
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (message.mediaUrl && message.mediaName) {
      const state = MediaDownloader.getDownloadState(message.mediaUrl, message.mediaName);
      setDownloadState(state);

      const unsubscribe = MediaDownloader.addDownloadListener(
        message.mediaUrl,
        message.mediaName,
        (newState) => {
          setDownloadState(newState);
          setIsDownloading(newState.isDownloading);
        }
      );

      return unsubscribe;
    }
  }, [message.mediaUrl, message.mediaName]);

  const handleDownload = async (mediaType: string) => {
    if (!message.mediaUrl || !message.mediaName) return;

    try {
      setIsDownloading(true);
      
      let mimeType = 'application/octet-stream';
      if (mediaType === 'image') {
        mimeType = 'image/jpeg';
      } else if (mediaType === 'video') {
        mimeType = 'video/mp4';
      }
      
      await MediaDownloader.downloadMedia(
        message.mediaUrl,
        message.mediaName,
        mimeType
      );
      
      // Alert.alert('Success', 'Media downloaded successfully!');
    } catch (error) {
      console.error('Error downloading media:', error);
      Alert.alert('Error', 'Failed to download media');
    } finally {
      setIsDownloading(false);
    }
  };



  const handleDocumentPress = async () => {
    if (!message.mediaUrl || !message.mediaName) return;

    try {
      if (downloadState?.isDownloaded && downloadState.localUri) {
        // Document is already downloaded, trigger preview
        if (onDocumentPress) {
          onDocumentPress();
        }
        return;
      } else {
        // Download the document
        setIsDownloading(true);
        await MediaDownloader.downloadMedia(
          message.mediaUrl,
          message.mediaName,
          'application/octet-stream'
        );
      }
    } catch (error) {
      console.error('Error handling document:', error);
      Alert.alert('Error', 'Failed to handle document');
    } finally {
      setIsDownloading(false);
    }
  };

  // Handle different media types based on message type
  // const handleMediaPress = () => {
  //   if (!message.mediaUrl || !message.mediaName) return;

  //   // This function now only handles documents
  //   if (message.messageType === 'document') {
  //     if (downloadState?.isDownloaded && downloadState.localUri) {
  //       if (onDocumentPress) {
  //         onDocumentPress();
  //       }
  //     } else {
  //       handleDocumentPress();
  //     }
  //   } else {
  //     // For all other media types (image, video, audio), call onMediaPress
  //     if (onMediaPress) {
  //       onMediaPress();
  //     }
  //   }
  // };

  const handleVoicePlay = async () => {
    if (!message.mediaUrl) return;

    try {
      if (sound) {
        if (isPlaying) {
          await sound.stopAsync();
          setIsPlaying(false);
        } else {
          await sound.playAsync();
          setIsPlaying(true);
        }
      } else {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: message.mediaUrl },
          { shouldPlay: true }
        );
        setSound(newSound);
        setIsPlaying(true);

        newSound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded) {
            setPlaybackPosition(status.positionMillis / 1000);
            if (status.didJustFinish) {
              setIsPlaying(false);
              setPlaybackPosition(0);
            }
          }
        });
      }
    } catch (error) {
      console.error('Error playing voice note:', error);
      Alert.alert('Error', 'Failed to play voice note');
    }
  };

  const renderImageMessage = () => (
    <View style={styles.imageContainer}>
      <TouchableOpacity onPress={handleImagePress} onLongPress={onLongPress} style={styles.imageTouchable}>
        <Image
          source={{ uri: message.mediaUrl }}
          style={styles.image}
          contentFit="cover"
          transition={0}
          recyclingKey={message.id}
          cachePolicy="memory-disk"
        />
        <View style={{position:'absolute',bottom:8,right:4,flexDirection:'row',alignItems:'center',gap:4 ,backgroundColor:'rgba(0, 0, 0, 0.37)',paddingHorizontal:4,paddingVertical:2,borderRadius:4, height:20,width:60}}/>
        <Text style={{position:'absolute',bottom:10,right:10,fontSize:12,color:'#ffffff'}}>{message.timestamp ? new Date(message.timestamp.toDate()).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        }) : ''}</Text>
      </TouchableOpacity>
      
             {/* Download Button for Images */}
       {!downloadState?.isDownloaded && (
         <View style={styles.mediaActionsContainer}>
           <TouchableOpacity 
             style={[
               styles.downloadButton, 
               { backgroundColor: theme.isDark ? theme.colors.primary : '#10b981' }
             ]}
             onPress={() => handleDownload('image')}
             disabled={isDownloading}
           >
             {isDownloading ? (
               <ActivityIndicator size="small" color={isOwnMessage ? '#ffffff' : '#ffffff'} />
             ) : (
               <Ionicons name="download-outline" size={16} color={isOwnMessage ? '#ffffff' : '#ffffff'} />
             )}
           </TouchableOpacity>
         </View>
       )}
       
       {/* Downloaded Indicator */}
       {downloadState?.isDownloaded && (
         <View style={styles.downloadedIndicator}>
           <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
         </View>
       )}
      
      {/* {message.text && (
        <Text style={[styles.mediaCaption, { color: isOwnMessage ? '#ffffff' : theme.colors.text }]}>
          {message.text}
        </Text>
      )} */}
      
      {/* Image Zoom Modal */}
      <Modal
        visible={isImageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImageModal}
      >
        <View style={styles.zoomModalContainer}>
          <View style={styles.zoomModalBackground} {...zoomPanResponder.panHandlers}>
            <TouchableOpacity 
              activeOpacity={1}
              onPress={handleDoubleTap}
              style={styles.zoomImageContainer}
            >
              <Image
                source={{ uri: message.mediaUrl }}
                style={[
                  styles.zoomImage,
                  {
                    transform: [
                      { scale: imageScale },
                      { translateX: imageTranslateX },
                      { translateY: imageTranslateY },
                    ],
                  },
                ]}
                contentFit="contain"
                transition={0}
                recyclingKey={message.id}
                cachePolicy="memory-disk"
              />
            </TouchableOpacity>
          </View>
          
          {/* Close button */}
          <TouchableOpacity 
            style={styles.zoomCloseButton} 
            onPress={closeImageModal}
          >
            <Ionicons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );

  const renderVideoMessage = () => (
    <View style={styles.videoContainer}>
      <TouchableOpacity onPress={handleVideoPress} onLongPress={onLongPress} style={styles.videoTouchable}>
        <View style={[styles.videoThumbnail, { backgroundColor: theme.colors.border }]}>
          <Ionicons name="play-circle" size={40} color={theme.isDark ? theme.colors.primary : '#10b981'} style={{position:'absolute',right:'50%'}}/>
          {message.mediaDuration && (
            <Text style={[styles.videoDuration, { color: '#fff' }]}>
              {formatDuration(message.mediaDuration)}
            </Text>
          )}
        </View>
        <View style={{position:'absolute',bottom:8,right:4,flexDirection:'row',alignItems:'center',gap:4 ,backgroundColor:'rgba(0, 0, 0, 0.37)',paddingHorizontal:4,paddingVertical:2,borderRadius:4, height:20,width:60}}/>
        <Text style={{position:'absolute',bottom:10,right:10,fontSize:12,color:'#ffffff'}}>{message.timestamp ? new Date(message.timestamp.toDate()).toLocaleTimeString([], {
          hour: '2-digit', 
          minute: '2-digit' 
        }) : ''}</Text>
      </TouchableOpacity>
      
        {/* Download Button for Videos */}
       {!downloadState?.isDownloaded && (
         <View style={styles.mediaActionsContainer}>
           <TouchableOpacity 
             style={[
               styles.downloadButton, 
               { backgroundColor: theme.isDark ? theme.colors.primary : '#10b981' }
             ]}
             onPress={() => handleDownload('video')}
             disabled={isDownloading}
           >
             {isDownloading ? (
               <ActivityIndicator size="small" color={isOwnMessage ? '#ffffff' : '#ffffff'} />
             ) : (
               <Ionicons name="download-outline" size={16} color={isOwnMessage ? '#ffffff' : '#ffffff'} />
             )}
           </TouchableOpacity>
         </View>
       )}
       
       {/* Downloaded Indicator */}
       {downloadState?.isDownloaded && (
         <View style={styles.downloadedIndicator}>
           <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
         </View>
       )}
      
      {/* {message.text && (
        <Text style={[styles.mediaCaption, { color: isOwnMessage ? '#ffffff' : theme.colors.text }]}>
          {message.text}
        </Text>
      )} */}
    </View>
  );

  const renderDocumentMessage = () => (
    <View style={styles.documentContainer}>
      <TouchableOpacity onPress={handleDocumentPress} onLongPress={onLongPress} style={styles.documentTouchable}>
        <View style={[styles.documentIcon, { backgroundColor: theme.colors.primary }]}>
          {isDownloading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : downloadState?.isDownloaded ? (
            <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
          ) : (
            <Ionicons 
              name={message.mediaName?.toLowerCase().endsWith('.pdf') ? 'document-text' : 'document'} 
              size={20} 
              color="#ffffff" 
            />
          )}
        </View>
        <View style={styles.documentInfo}>
          <Text style={[styles.documentName, { color: isOwnMessage ? '#ffffff' : '#000'}]}>
            {message.mediaName || 'Document'}
          </Text>
          {message.mediaSize && (
            <Text style={[styles.documentSize, { color: isOwnMessage ? '#ffffff' : '#000'}]}>
              {formatFileSize(message.mediaSize)}
            </Text>
          )}
          {isDownloading && (
            <Text style={[styles.downloadStatus, { color: isOwnMessage ? '#ffffff' : theme.colors.primary }]}>
              Downloading...
            </Text>
          )}
          {downloadState?.isDownloaded && (
            <Text style={[styles.downloadStatus, { color: isOwnMessage ? '#ffffff' : theme.colors.primary }]}>
              Downloaded
            </Text>
          )}
        </View>
      </TouchableOpacity>
      
             {/* Download Button for Documents */}
       {!downloadState?.isDownloaded && (
         <View style={styles.documentActionsContainer}>
           <TouchableOpacity 
             style={[
               styles.documentActionButton, 
               { backgroundColor: theme.isDark ? theme.colors.primary : '#10b981' }
             ]}
             onPress={() => handleDownload('document')}
             disabled={isDownloading}
           >
             {isDownloading ? (
               <ActivityIndicator size="small" color={isOwnMessage ? '#ffffff' : '#ffffff'} />
             ) : (
               <Ionicons name="download-outline" size={16} color={isOwnMessage ? '#ffffff' : '#ffffff'} />
             )}
           </TouchableOpacity>
         </View>
       )}
    </View>
  );

  const renderVoiceMessage = () => (
    <View style={styles.voiceContainer}>
      <TouchableOpacity onPress={handleVoicePlay} onLongPress={onLongPress} style={styles.voicePlayButton}>
        <Ionicons 
          name={isPlaying ? "pause" : "play"} 
          size={18} 
          color={theme.isDark ? theme.colors.primary : '#10b981'} 
        />
      </TouchableOpacity>
      
      <View style={styles.voiceInfo}>
        <View style={styles.voiceProgressBar}>
          <View 
            style={[
              styles.voiceProgress, 
              { 
                width: `${(playbackPosition / getDurationInSeconds(message.mediaDuration || 1)) * 100}%`,
                backgroundColor: isOwnMessage ? '#ffffff' : theme.colors.primary 
              }
            ]} 
          />
        </View>
        
        <Text style={[styles.voiceDuration, { color: isOwnMessage ? '#ffffff' : theme.colors.text }]}>
          {formatDuration(message.mediaDuration || 0)}
        </Text>
      </View>
      <View style={{position:'absolute',bottom:8,right:4,flexDirection:'row',alignItems:'center',gap:4 ,paddingHorizontal:4,paddingVertical:2,borderRadius:4, zIndex: 100000,height:20,width:60}}/>
        <Text style={{position:'absolute',bottom:0,right:4,fontSize:12,color:isOwnMessage ? '#ffffff' : '#424242'}}>{message.timestamp ? new Date(message.timestamp.toDate()).toLocaleTimeString([], {
          hour: '2-digit', 
          minute: '2-digit' 
        }) : ''}</Text>
    </View>
  );

  const renderMediaContent = () => {
    switch (message.messageType) {
      case 'image':
        return renderImageMessage();
      case 'video':
        return renderVideoMessage();
      case 'document':
        return renderDocumentMessage();
      case 'voice':
        return renderVoiceMessage();
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {renderMediaContent()}
    </View>
  );
}

// Prevent unnecessary re-renders when typing in input by memoizing the media message.
// Ignore function prop identity changes and only re-render when relevant message fields change.
export default memo(MediaMessageComponent, (prevProps, nextProps) => {
  const prev = prevProps.message;
  const next = nextProps.message;

  if (prevProps.isOwnMessage !== nextProps.isOwnMessage) return false;

  // Compare key message fields; ignore handler props to avoid re-renders from new function identities
  if (prev.id !== next.id) return false;
  if (prev.messageType !== next.messageType) return false;
  if (prev.mediaUrl !== next.mediaUrl) return false;
  if ((prev.text || '') !== (next.text || '')) return false;

  const prevStarLen = Array.isArray(prev.starredBy) ? prev.starredBy.length : 0;
  const nextStarLen = Array.isArray(next.starredBy) ? next.starredBy.length : 0;
  if (prevStarLen !== nextStarLen) return false;

  const prevReadByLen = Array.isArray(prev.readBy) ? prev.readBy.length : 0;
  const nextReadByLen = Array.isArray(next.readBy) ? next.readBy.length : 0;
  if (prevReadByLen !== nextReadByLen) return false;

  if (!!prev.isPinned !== !!next.isPinned) return false;

  // Equal → skip re-render
  return true;
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  imageContainer: {
    // borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 0,
  },
  imageTouchable: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  image: {
    width: Math.min(screenWidth * 0.85, 320),
    height: Math.min(screenWidth * 0.95, 380) * 0.55, // Much shorter height for wider appearance
    // borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  mediaCaption: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 14,
  },
  videoContainer: {
    position:'relative',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 0,
  },
  videoTouchable: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  videoThumbnail: {
    width: Math.min(screenWidth * 0.85, 320),
    height: Math.min(screenWidth * 0.85, 320) * 0.45, // Much shorter height for wider appearance
    borderRadius: 12,
    justifyContent: 'center',
    // alignItems: 'center',
    // right:'40%',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  videoDuration: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: '#ffffff',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  documentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 14,
    marginBottom: 0,
    minWidth: 220,
    maxWidth: Math.min(screenWidth * 0.85, 320),
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  documentTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  documentIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 1,
  },
  documentSize: {
    fontSize: 10,
  },
  voiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 14,
    marginBottom: 0,
    minWidth: 220,
    maxWidth: Math.min(screenWidth * 0.85, 320),
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  voicePlayButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  voiceInfo: {
    flex: 1,
  },
  voiceProgressBar: {
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 2,
    marginBottom: 4,
    overflow: 'hidden',
  },
  voiceProgress: {
    height: '100%',
    borderRadius: 2,
  },
  voiceDuration: {
    fontSize: 10,
  },
  downloadStatus: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  
  // Media action styles
  mediaActionsContainer: {
    position:'absolute',
    right:'5%',
    top:'0%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 8,
  },
  downloadButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  downloadedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  
  // Document action styles
  documentActionsContainer: {
    marginLeft: 8,
  },
  documentActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  
  // Zoom modal styles
  zoomModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomModalBackground: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomImage: {
    width: screenWidth ,
    height: screenHeight * 0.7,
    maxWidth: screenWidth,
    maxHeight: screenHeight * 0.7,
  },
  zoomCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
});
