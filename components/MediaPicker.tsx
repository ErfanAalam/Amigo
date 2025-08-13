import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { MediaFile, VoiceNote } from '../types/MessageTypes';
import VoiceRecorder from './VoiceRecorder';

interface MediaPickerProps {
  onMediaSelected: (media: MediaFile[]) => void;
  onVoiceRecorded: (voiceNote: VoiceNote) => void;
  isVisible: boolean;
  onClose: () => void;
  isUploading?: boolean;
}

export default function MediaPicker({ 
  onMediaSelected, 
  onVoiceRecorded, 
  isVisible, 
  onClose,
  isUploading 
}: MediaPickerProps) {
  const { theme } = useTheme();
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaFile[]>([]);
  const [showMediaPreview, setShowMediaPreview] = useState(false);

  // Debug state changes
  useEffect(() => {
    console.log('State changed - selectedMedia:', selectedMedia.length, 'showMediaPreview:', showMediaPreview);
  }, [selectedMedia, showMediaPreview]);

  const requestPermissions = async () => {
    if (Platform.OS === 'ios') {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (cameraStatus !== 'granted' || libraryStatus !== 'granted') {
        Alert.alert('Permission Required', 'Camera and media library permissions are required to use this feature.');
        return false;
      }
    }
    return true;
  };

  const pickImage = async (useCamera: boolean = false) => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      let result;
      if (useCamera) {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          allowsEditing: false,
          quality: 0.8,
          allowsMultipleSelection: true,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          allowsEditing: false,
          quality: 0.8,
          allowsMultipleSelection: true,
        });
      }

      console.log('Image picker result:', result);
      
      if (!result.canceled && result.assets.length > 0) {
        const newMediaFiles: MediaFile[] = result.assets.map(asset => ({
          uri: asset.uri,
          name: asset.fileName || `media_${Date.now()}_${Math.random()}`,
          size: asset.fileSize || 0,
          type: asset.type || 'image',
          duration: asset.duration || 0,
        }));
        
        console.log('New media files:', newMediaFiles);
        setSelectedMedia(prev => [...prev, ...newMediaFiles]);
        setShowMediaPreview(true);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });

      console.log('Document picker result:', result);

      if (!result.canceled && result.assets.length > 0) {
        const newMediaFiles: MediaFile[] = result.assets.map(asset => ({
          uri: asset.uri,
          name: asset.name,
          size: asset.size || 0,
          type: asset.mimeType || 'application/octet-stream',
        }));
        
        console.log('New document files:', newMediaFiles);
        setSelectedMedia(prev => [...prev, ...newMediaFiles]);
        setShowMediaPreview(true);
        console.log('Set showMediaPreview to true for documents');
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const removeMedia = (index: number) => {
    setSelectedMedia(prev => {
      const newMedia = prev.filter((_, i) => i !== index);
      if (newMedia.length === 0) {
        setShowMediaPreview(false);
      }
      return newMedia;
    });
  };

  const clearAllMedia = () => {
    setSelectedMedia([]);
    setShowMediaPreview(false);
  };

  const sendSelectedMedia = () => {
    if (selectedMedia.length > 0) {
      onMediaSelected(selectedMedia);
      setSelectedMedia([]);
      setShowMediaPreview(false);
      onClose();
    }
  };

  const cancelUpload = () => {
    // This will be handled by the parent component
    onClose();
  };

  const startVoiceRecording = () => {
    setShowVoiceRecorder(true);
  };

  const handleVoiceRecorded = (voiceNote: VoiceNote) => {
    onVoiceRecorded(voiceNote);
    setShowVoiceRecorder(false);
    onClose();
  };

  const handleVoiceRecorderClose = () => {
    setShowVoiceRecorder(false);
  };

  // Reset state when modal closes
  const handleClose = () => {
    setSelectedMedia([]);
    setShowMediaPreview(false);
    onClose();
  };

  if (showVoiceRecorder) {
    return (
      <VoiceRecorder
        isVisible={true}
        onVoiceRecorded={handleVoiceRecorded}
        onClose={handleVoiceRecorderClose}
      />
    );
  }

  const MediaOption = ({ 
    icon, 
    title, 
    onPress, 
    color = theme.colors.primary,
    disabled = false
  }: { 
    icon: string; 
    title: string; 
    onPress: () => void; 
    color?: string;
    disabled?: boolean;
  }) => (
    <TouchableOpacity 
      style={[styles.mediaOption, disabled && styles.mediaOptionDisabled]} 
      onPress={onPress}
      disabled={disabled}
    >
      <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={24} color={disabled ? theme.colors.textSecondary : color} />
      </View>
      <Text style={[styles.optionTitle, { color: disabled ? theme.colors.textSecondary : theme.colors.text }]}>{title}</Text>
    </TouchableOpacity>
  );

  const MediaPreview = () => {
    return (
      <View style={styles.mediaPreviewContainer}>
        <View style={styles.mediaPreviewHeader}>
          <Text style={[styles.mediaPreviewTitle, { color: theme.colors.text }]}>
            Selected Media ({selectedMedia.length})
          </Text>
          <TouchableOpacity onPress={clearAllMedia} style={styles.clearAllButton}>
            <Text style={[styles.clearAllText, { color: theme.colors.error }]}>Clear All</Text>
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.mediaList} showsVerticalScrollIndicator={false}>
          {selectedMedia.map((media, index) => (
            <View key={index} style={styles.mediaItem}>
              <View style={styles.mediaInfo}>
                <Ionicons 
                  name={media.type.startsWith('image/') ? 'image' : 
                        media.type.startsWith('video/') ? 'videocam' : 
                        media.type.startsWith('audio/') ? 'musical-notes' : 'document'} 
                  size={20} 
                  color={theme.colors.primary} 
                />
                <View style={styles.mediaDetails}>
                  <Text style={[styles.mediaName, { color: theme.colors.text }]} numberOfLines={1}>
                    {media.name}
                  </Text>
                  <Text style={[styles.mediaSize, { color: theme.colors.textSecondary }]}>
                    {(media.size / 1024 / 1024).toFixed(2)} MB
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => removeMedia(index)} style={styles.removeButton}>
                <Ionicons name="close-circle" size={24} color={theme.colors.error} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
        
        <View style={styles.mediaPreviewActions}>
          {isUploading ? (
            <TouchableOpacity onPress={cancelUpload} style={styles.cancelButton}>
              <Text style={[styles.cancelButtonText, { color: theme.colors.error }]}>Cancel Upload</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setShowMediaPreview(false)} style={styles.cancelButton}>
              <Text style={[styles.cancelButtonText, { color: theme.colors.textSecondary }]}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            onPress={sendSelectedMedia} 
            style={[styles.sendButton, { backgroundColor: theme.colors.primary }]}
            disabled={isUploading}
          >
            <Text style={[styles.sendButtonText, { color: '#ffffff' }]}>
              {isUploading ? 'Sending...' : `Send ${selectedMedia.length} item${selectedMedia.length > 1 ? 's' : ''}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
          {showMediaPreview ? (
            <MediaPreview />
          ) : (
            <>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                  Share Media
                </Text>
                <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.optionsGrid}>
                <MediaOption
                  icon="camera"
                  title="Camera"
                  onPress={() => pickImage(true)}
                  color="#FF6B6B"
                  disabled={isUploading}
                />
                <MediaOption
                  icon="images"
                  title="Gallery"
                  onPress={() => pickImage(false)}
                  color="#4ECDC4"
                  disabled={isUploading}
                />
                <MediaOption
                  icon="document"
                  title="Document"
                  onPress={pickDocument}
                  color="#45B7D1"
                  disabled={isUploading}
                />
                <MediaOption
                  icon="mic"
                  title="Voice Note"
                  onPress={startVoiceRecording}
                  color="#96CEB4"
                  disabled={isUploading}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 20,
    maxHeight: '80%',
    minHeight: 300,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    padding: 5,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  mediaOption: {
    width: '48%',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  mediaOptionDisabled: {
    opacity: 0.5,
  },
  
  // Media Preview Styles
  mediaPreviewContainer: {
    // flex: 1,
    height: '100%',
    // height: '100%',
  },
  mediaPreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  mediaPreviewTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  clearAllButton: {
    padding: 8,
  },
  clearAllText: {
    fontSize: 14,
    fontWeight: '500',
  },
  mediaList: {
    flex: 1,
    marginBottom: 20,
  },
  mediaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 12,
    marginBottom: 8,
  },
  mediaInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  mediaDetails: {
    marginLeft: 12,
    flex: 1,
  },
  mediaName: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  mediaSize: {
    fontSize: 12,
  },
  removeButton: {
    padding: 4,
  },
  mediaPreviewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  sendButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    minWidth: 120,
    alignItems: 'center',
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
