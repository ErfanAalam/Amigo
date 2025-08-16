import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export interface DownloadState {
  isDownloading: boolean;
  progress: number;
  isDownloaded: boolean;
  localUri?: string;
  error?: string;
}

export class MediaDownloader {
  private static downloadStates = new Map<string, DownloadState>();
  private static listeners = new Map<string, Set<(state: DownloadState) => void>>();

  static async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  }

  static async downloadMedia(
    mediaUrl: string,
    fileName: string,
    mediaType: string
  ): Promise<string> {
    const mediaId = `${mediaUrl}_${fileName}`;
    
    // Check if already downloaded
    if (this.downloadStates.get(mediaId)?.isDownloaded) {
      const state = this.downloadStates.get(mediaId)!;
      if (state.localUri && await FileSystem.getInfoAsync(state.localUri).then(info => info.exists)) {
        return state.localUri;
      }
    }

    // Initialize download state
    await this.updateDownloadState(mediaId, {
      isDownloading: true,
      progress: 0,
      isDownloaded: false,
      error: undefined
    });

    try {
      // Create downloads directory
      const downloadsDir = `${FileSystem.documentDirectory}downloads/`;
      const dirInfo = await FileSystem.getInfoAsync(downloadsDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(downloadsDir, { intermediates: true });
      }

      // Generate unique filename
      const fileExtension = this.getFileExtension(fileName, mediaType);
      const uniqueFileName = `${Date.now()}_${fileName}`;
      const localUri = `${downloadsDir}${uniqueFileName}`;

      // Download file with progress tracking
      const downloadResumable = FileSystem.createDownloadResumable(
        mediaUrl,
        localUri,
        {},
        async (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          await this.updateDownloadState(mediaId, {
            isDownloading: true,
            progress,
            isDownloaded: false,
            localUri: undefined
          });
        }
      );

      const result = await downloadResumable.downloadAsync();
      
      if (result?.status === 200) {
        // Update state to downloaded
        await this.updateDownloadState(mediaId, {
          isDownloading: false,
          progress: 100,
          isDownloaded: true,
          localUri: result.uri,
          error: undefined
        });

        // Save to media library for images and videos
        if (mediaType.startsWith('image/') || mediaType.startsWith('video/')) {
          try {
            await MediaLibrary.saveToLibraryAsync(result.uri);
          } catch (error) {
            console.log('Could not save to media library:', error);
          }
        }

        return result.uri;
      } else {
        throw new Error('Download failed');
      }
    } catch (error) {
      console.error('Download error:', error);
      await this.updateDownloadState(mediaId, {
        isDownloading: false,
        progress: 0,
        isDownloaded: false,
        error: error instanceof Error ? error.message : 'Download failed'
      });
      throw error;
    }
  }

  static async shareMedia(localUri: string, fileName: string): Promise<void> {
    try {
      if (await Sharing.isAvailableAsync()) {
        const mimeType = this.getMimeType(fileName);
        console.log('Sharing file:', fileName, 'with mime type:', mimeType);
        
        await Sharing.shareAsync(localUri, {
          mimeType: mimeType || 'application/octet-stream',
          dialogTitle: `Share ${fileName}`
        });
      } else {
        throw new Error('Sharing is not available on this device');
      }
    } catch (error) {
      console.error('Error sharing media:', error);
      throw error;
    }
  }

  static async openPDF(localUri: string, fileName: string): Promise<void> {
    try {
      console.log('Opening PDF:', fileName, 'at:', localUri);
      
      // For mobile platforms, we need to use sharing but with intent to open
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        if (await Sharing.isAvailableAsync()) {
          // Use sharing but try to make it more "open" oriented
          await Sharing.shareAsync(localUri, {
            mimeType: 'application/pdf',
            // Don't use dialogTitle to avoid "share" language
            UTI: 'com.adobe.pdf'
          });
        } else {
          throw new Error('Unable to open PDF. Sharing not available on this device.');
        }
      } else {
        // For web or other platforms, this won't work anyway
        throw new Error('PDF viewing not supported on this platform.');
      }
    } catch (error) {
      console.error('Error opening PDF:', error);
      throw new Error('Failed to open PDF. Please ensure you have a PDF viewer app installed.');
    }
  }

  static async deleteDownloadedMedia(localUri: string): Promise<void> {
    try {
      await FileSystem.deleteAsync(localUri);
      
      // Update all download states that reference this URI
      for (const [mediaId, state] of this.downloadStates.entries()) {
        if (state.localUri === localUri) {
          await this.updateDownloadState(mediaId, {
            ...state,
            isDownloaded: false,
            localUri: undefined
          });
        }
      }
    } catch (error) {
      console.error('Error deleting media:', error);
      throw error;
    }
  }

  static getDownloadState(mediaUrl: string, fileName: string): DownloadState | undefined {
    const mediaId = `${mediaUrl}_${fileName}`;
    return this.downloadStates.get(mediaId);
  }

  static addDownloadListener(
    mediaUrl: string,
    fileName: string,
    listener: (state: DownloadState) => void
  ): () => void {
    const mediaId = `${mediaUrl}_${fileName}`;
    
    if (!this.listeners.has(mediaId)) {
      this.listeners.set(mediaId, new Set());
    }
    
    this.listeners.get(mediaId)!.add(listener);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(mediaId);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.listeners.delete(mediaId);
        }
      }
    };
  }

  private static async updateDownloadState(mediaId: string, state: DownloadState): Promise<void> {
    this.downloadStates.set(mediaId, state);
    
    // Save to AsyncStorage for persistence
    try {
      await AsyncStorage.setItem(`download_${mediaId}`, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving download state:', error);
    }
    
    // Notify listeners
    const listeners = this.listeners.get(mediaId);
    if (listeners) {
      listeners.forEach(listener => listener(state));
    }
  }

  // Load download states from AsyncStorage on app start
  static async loadDownloadStates(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const downloadKeys = keys.filter(key => key.startsWith('download_'));
      
      for (const key of downloadKeys) {
        const stateJson = await AsyncStorage.getItem(key);
        if (stateJson) {
          const state: DownloadState = JSON.parse(stateJson);
          const mediaId = key.replace('download_', '');
          this.downloadStates.set(mediaId, state);
        }
      }
    } catch (error) {
      console.error('Error loading download states:', error);
    }
  }

  private static getFileExtension(fileName: string, mediaType: string): string {
    if (fileName.includes('.')) {
      return fileName.substring(fileName.lastIndexOf('.'));
    }
    
    // Default extensions based on media type
    switch (mediaType) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/gif':
        return '.gif';
      case 'video/mp4':
        return '.mp4';
      case 'video/quicktime':
        return '.mov';
      case 'audio/mpeg':
        return '.mp3';
      case 'audio/m4a':
        return '.m4a';
      case 'application/pdf':
        return '.pdf';
      default:
        return '';
    }
  }

  private static getMimeType(fileName: string): string {
    const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    switch (extension) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.mp4':
        return 'video/mp4';
      case '.mov':
        return 'video/quicktime';
      case '.mp3':
        return 'audio/mpeg';
      case '.m4a':
        return 'audio/m4a';
      case '.pdf':
        return 'application/pdf';
      default:
        return 'application/octet-stream';
    }
  }

  static async checkFileExists(localUri: string): Promise<boolean> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      return fileInfo.exists;
    } catch (error) {
      return false;
    }
  }

  static getDownloadsDirectory(): string {
    return `${FileSystem.documentDirectory}downloads/`;
  }
}
