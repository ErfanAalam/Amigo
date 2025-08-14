import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    // Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { MediaDownloader } from '../utils/MediaDownloader';

// const { width: screenWidth } = Dimensions.get('window');

interface DocumentViewerProps {
  mediaUrl: string;
  fileName: string;
  mediaType: string;
  mediaSize?: number;
  onClose?: () => void;
}

export default function DocumentViewer({ 
  mediaUrl, 
  fileName, 
  mediaType, 
  mediaSize,
  onClose 
}: DocumentViewerProps) {
  const { theme } = useTheme();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileName: string, mediaType: string) => {
    const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    
    switch (extension) {
      case '.pdf':
        return 'document-text';
      case '.doc':
      case '.docx':
        return 'document';
      case '.xls':
      case '.xlsx':
        return 'grid';
      case '.ppt':
      case '.pptx':
        return 'easel';
      case '.txt':
        return 'text';
      default:
        return 'document';
    }
  };

  const getFileTypeName = (fileName: string, mediaType: string) => {
    const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    
    switch (extension) {
      case '.pdf':
        return 'PDF Document';
      case '.doc':
      case '.docx':
        return 'Word Document';
      case '.xls':
      case '.xlsx':
        return 'Excel Spreadsheet';
      case '.ppt':
      case '.pptx':
        return 'PowerPoint Presentation';
      case '.txt':
        return 'Text File';
      default:
        return 'Document';
    }
  };

  const downloadDocument = async () => {
    if (localUri) return; // Already downloaded

    setIsDownloading(true);
    setError(null);
    setDownloadProgress(0);

    try {
      // Request permissions first
      const hasPermission = await MediaDownloader.requestPermissions();
      if (!hasPermission) {
        Alert.alert(
          'Permission Required',
          'Storage permission is required to download documents.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Settings', onPress: () => {} }
          ]
        );
        return;
      }

      // Add download listener for progress
      const unsubscribe = MediaDownloader.addDownloadListener(
        mediaUrl,
        fileName,
        (state) => {
          setDownloadProgress(state.progress);
          if (state.error) {
            setError(state.error);
            setIsDownloading(false);
          }
        }
      );

      // Download the document
      const downloadedUri = await MediaDownloader.downloadMedia(
        mediaUrl,
        fileName,
        mediaType
      );

      setLocalUri(downloadedUri);
      setIsDownloading(false);
      unsubscribe();

      Alert.alert('Success', 'Document downloaded successfully!');
    } catch (error) {
      console.error('Download error:', error);
      setError(error instanceof Error ? error.message : 'Download failed');
      setIsDownloading(false);
    }
  };

  const openDocument = async () => {
    if (!localUri) {
      Alert.alert('Error', 'Please download the document first');
      return;
    }

    try {
      // For now, we'll just show a success message
      Alert.alert('Success', 'Document is ready for preview');
    } catch (error) {
      console.error('Open error:', error);
      Alert.alert('Error', 'Failed to open document');
    }
  };



  const deleteDownloadedDocument = async () => {
    if (!localUri) return;

    Alert.alert(
      'Delete Document',
      'Are you sure you want to delete this downloaded document?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await MediaDownloader.deleteDownloadedMedia(localUri);
              setLocalUri(null);
              Alert.alert('Success', 'Document deleted successfully');
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert('Error', 'Failed to delete document');
            }
          }
        }
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {onClose && (
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      )}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Document Header */}
        <View style={styles.documentHeader}>
          <View style={[styles.documentIcon, { backgroundColor: theme.colors.primary }]}>
            <Ionicons 
              name={getFileIcon(fileName, mediaType) as any} 
              size={32} 
              color="#ffffff" 
            />
          </View>
          
          <View style={styles.documentInfo}>
            <Text style={[styles.documentName, { color: theme.colors.text }]}>
              {fileName}
            </Text>
            <Text style={[styles.documentType, { color: theme.colors.textSecondary }]}>
              {getFileTypeName(fileName, mediaType)}
            </Text>
            {mediaSize && (
              <Text style={[styles.documentSize, { color: theme.colors.textSecondary }]}>
                {formatFileSize(mediaSize)}
              </Text>
            )}
          </View>
        </View>

        {/* Download Status */}
        {isDownloading && (
          <View style={[styles.downloadStatus, { backgroundColor: theme.colors.surface }]}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={[styles.downloadText, { color: theme.colors.text }]}>
              Downloading... {Math.round(downloadProgress * 100)}%
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: `${downloadProgress * 100}%`,
                    backgroundColor: theme.colors.primary 
                  }
                ]} 
              />
            </View>
          </View>
        )}

        {/* Error Display */}
        {error && (
          <View style={[styles.errorContainer, { backgroundColor: theme.colors.error + '20' }]}>
            <Ionicons name="alert-circle" size={20} color={theme.colors.error} />
            <Text style={[styles.errorText, { color: theme.colors.error }]}>
              {error}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {!localUri ? (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
              onPress={downloadDocument}
              disabled={isDownloading}
            >
              <Ionicons name="download" size={20} color="#ffffff" />
              <Text style={styles.actionButtonText}>Download</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
                onPress={openDocument}
              >
                <Ionicons name="open" size={20} color="#ffffff" />
                <Text style={styles.actionButtonText}>Open</Text>
              </TouchableOpacity>



              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.colors.error }]}
                onPress={deleteDownloadedDocument}
              >
                <Ionicons name="trash" size={20} color="#ffffff" />
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Document Preview Placeholder */}
        <View style={[styles.previewPlaceholder, { backgroundColor: theme.colors.surface }]}>
          <Ionicons 
            name="document-text" 
            size={64} 
            color={theme.colors.textSecondary} 
          />
          <Text style={[styles.previewText, { color: theme.colors.textSecondary }]}>
            {localUri ? 'Document downloaded successfully' : 'Download document to preview'}
          </Text>
          <Text style={[styles.previewSubtext, { color: theme.colors.textSecondary }]}>
            {localUri 
              ? 'Tap "Open" to view in external app' 
              : 'Tap "Download" to save to device'
            }
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 1,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 16,
  },
  content: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
  },
  documentIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
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
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  documentType: {
    fontSize: 14,
    marginBottom: 2,
  },
  documentSize: {
    fontSize: 12,
    opacity: 0.8,
  },
  downloadStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  downloadText: {
    marginLeft: 12,
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  progressBar: {
    width: 80,
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    marginLeft: 12,
    flex: 1,
    fontSize: 14,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  previewPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    borderRadius: 16,
    minHeight: 200,
  },
  previewText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 16,
    textAlign: 'center',
  },
  previewSubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.8,
  },
});
