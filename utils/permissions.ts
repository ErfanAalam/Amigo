import { Audio } from 'expo-av';
import { Alert, PermissionsAndroid, Platform } from 'react-native';

/**
 * Request microphone permission for audio calls
 * @returns Promise<boolean> - true if permission granted, false otherwise
 */
export const requestMicrophonePermission = async (): Promise<boolean> => {
  try {
    if (Platform.OS === 'android') {
      // For Android, request microphone permission
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'Amigo needs access to your microphone to make audio calls.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );
      
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log('Microphone permission granted');
        return true;
      } else {
        console.log('Microphone permission denied');
        return false;
      }
    } else {
      // For iOS, request audio permission through Expo AV
      const { status } = await Audio.requestPermissionsAsync();
      if (status === 'granted') {
        console.log('Audio permission granted');
        return true;
      } else {
        console.log('Audio permission denied');
        return false;
      }
    }
  } catch (error) {
    console.error('Error requesting microphone permission:', error);
    return false;
  }
  
};

/**
 * Check if microphone permission is already granted
 * @returns Promise<boolean> - true if permission already granted, false otherwise
 */
export const checkMicrophonePermission = async (): Promise<boolean> => {
  try {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      return granted;
    } else {
      const { status } = await Audio.getPermissionsAsync();
      return status === 'granted';
    }
  } catch (error) {
    console.error('Error checking microphone permission:', error);
    return false;
  }
};

/**
 * Show permission denied alert with instructions
 */
export const showPermissionDeniedAlert = () => {
  Alert.alert(
    'Permission Required',
    'Microphone access is required to make audio calls. Please enable it in your device settings.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Settings', onPress: () => {
        // On iOS, this will open the app settings
        // On Android, this will open the app info page
        if (Platform.OS === 'ios') {
          // For iOS, we can't directly open settings, but we can guide the user
          Alert.alert(
            'Open Settings',
            'Please go to Settings > Amigo > Microphone and enable access.',
            [{ text: 'OK' }]
          );
        }
      }}
    ]
  );
};
