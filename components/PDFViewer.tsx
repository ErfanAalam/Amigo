import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  // Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { MediaDownloader } from '../utils/MediaDownloader';

// const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface PDFViewerProps {
  mediaUrl: string;
  fileName: string;
  mediaSize?: number;
  onClose?: () => void;
}

export default function PDFViewer({ 
  mediaUrl, 
  fileName, 
  mediaSize,
  onClose 
}: PDFViewerProps) {
  const { theme } = useTheme();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPDFViewer, setShowPDFViewer] = useState(false);

  // Check if PDF is already downloaded when component mounts
  React.useEffect(() => {
    const checkDownloadState = async () => {
      try {
        const downloadState = MediaDownloader.getDownloadState(mediaUrl, fileName);
        if (downloadState?.isDownloaded && downloadState.localUri) {
          console.log('PDF already downloaded:', downloadState.localUri);
          setLocalUri(downloadState.localUri);
        }
      } catch (error) {
        console.error('Error checking download state:', error);
      }
    };
    
    checkDownloadState();
  }, [mediaUrl, fileName]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const downloadPDF = async () => {
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
          'Storage permission is required to download PDFs.',
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

      // Download the PDF
      const downloadedUri = await MediaDownloader.downloadMedia(
        mediaUrl,
        fileName,
        'application/pdf'
      );

      setLocalUri(downloadedUri);
      setIsDownloading(false);
      unsubscribe();

      Alert.alert('Success', 'PDF downloaded successfully!');
    } catch (error) {
      console.error('Download error:', error);
      setError(error instanceof Error ? error.message : 'Download failed');
      setIsDownloading(false);
    }
  };

  const openPDFInApp = async () => {
    if (!localUri) {
      Alert.alert('Error', 'Please download the PDF first');
      return;
    }
    
    try {
      console.log('Opening PDF:', localUri);
      // Use MediaDownloader to open the PDF directly
      await MediaDownloader.openPDF(localUri, fileName);
    } catch (error) {
      console.error('Error opening PDF:', error);
      Alert.alert('Error', 'Failed to open PDF. Please make sure you have a PDF viewer app installed.');
    }
  };



  const deleteDownloadedPDF = async () => {
    if (!localUri) return;

    Alert.alert(
      'Delete PDF',
      'Are you sure you want to delete this downloaded PDF?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await MediaDownloader.deleteDownloadedMedia(localUri);
              setLocalUri(null);
              setShowPDFViewer(false);
              Alert.alert('Success', 'PDF deleted successfully');
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert('Error', 'Failed to delete PDF');
            }
          }
        }
      ]
    );
  };

  if (showPDFViewer && localUri) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.pdfHeader}>
          <TouchableOpacity style={styles.backButton} onPress={() => setShowPDFViewer(false)}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.pdfTitle, { color: theme.colors.text }]}>{fileName}</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
        
        <View style={styles.pdfContainer}>
          <Text style={[styles.pdfMessage, { color: theme.colors.textSecondary }]}>
            PDF Ready to View
          </Text>
          <Text style={[styles.pdfSubMessage, { color: theme.colors.textSecondary }]}>
            Tap &quot;Open PDF&quot; to view in your default PDF app
          </Text>
          
          <View style={styles.pdfActions}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
              onPress={openPDFInApp}
            >
              <Ionicons name="eye" size={20} color="#ffffff" />
              <Text style={styles.actionButtonText}>Open PDF</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.colors.error }]}
              onPress={deleteDownloadedPDF}
            >
              <Ionicons name="trash" size={20} color="#ffffff" />
              <Text style={styles.actionButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {onClose && (
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      )}

      <View style={styles.content}>
        {/* PDF Header */}
        <View style={styles.pdfHeader}>
          <View style={[styles.pdfIcon, { backgroundColor: theme.colors.primary }]}>
            <Ionicons name="document-text" size={32} color="#ffffff" />
          </View>
          
          <View style={styles.pdfInfo}>
            <Text style={[styles.pdfName, { color: theme.colors.text }]}>
              {fileName}
            </Text>
            <Text style={[styles.pdfType, { color: theme.colors.textSecondary }]}>
              PDF Document
            </Text>
            {mediaSize && (
              <Text style={[styles.pdfSize, { color: theme.colors.textSecondary }]}>
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
              onPress={downloadPDF}
              disabled={isDownloading}
            >
              <Ionicons name="download" size={20} color="#ffffff" />
              <Text style={styles.actionButtonText}>Download PDF</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
                onPress={openPDFInApp}
              >
                <Ionicons name="eye" size={20} color="#ffffff" />
                <Text style={styles.actionButtonText}>Preview PDF</Text>
              </TouchableOpacity>



              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.colors.error }]}
                onPress={deleteDownloadedPDF}
              >
                <Ionicons name="trash" size={20} color="#ffffff" />
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* PDF Preview Placeholder */}
        <View style={[styles.previewPlaceholder, { backgroundColor: theme.colors.surface }]}>
          <Ionicons 
            name="document-text" 
            size={64} 
            color={theme.colors.textSecondary} 
          />
          <Text style={[styles.previewText, { color: theme.colors.textSecondary }]}>
            {localUri ? 'PDF downloaded successfully' : 'Download PDF to preview'}
          </Text>
          <Text style={[styles.previewSubtext, { color: theme.colors.textSecondary }]}>
            {localUri 
              ? 'Tap "Preview PDF" to view in the app' 
              : 'Tap "Download PDF" to save to device'
            }
          </Text>
        </View>
      </View>
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
  pdfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
  },
  pdfIcon: {
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
  pdfInfo: {
    flex: 1,
  },
  pdfName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  pdfType: {
    fontSize: 14,
    marginBottom: 2,
  },
  pdfSize: {
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
  pdfContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  pdfMessage: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  pdfSubMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
    opacity: 0.8,
  },
  pdfActions: {
    flexDirection: 'row',
    gap: 16,
  },
  backButton: {
    padding: 8,
    marginRight: 16,
  },
  pdfTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
});
