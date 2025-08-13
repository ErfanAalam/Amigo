import app from '@react-native-firebase/app';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

// Firebase configuration object
const firebaseConfig = {
    apiKey: "AIzaSyBOvnGACw8gs2euxvd4FIUJ1GSIkTz2-UE",
    authDomain: "amigo-ec5be.firebaseapp.com",
    projectId: "amigo-ec5be",
    storageBucket: "amigo-ec5be.firebasestorage.app",
    messagingSenderId: "562549249203",
    appId: "1:562549249203:web:e74645c1d9b498b8850cc6",
    measurementId: "G-MXYMFXNKFB"
  };

// Initialize Firebase only if it hasn't been initialized already
if (app.apps.length === 0) {
  app.initializeApp(firebaseConfig);
}

// Export Firebase services
export const firebaseAuth = auth();
export const firebaseFirestore = firestore();
export const firebaseStorage = storage();
export const FieldValue = firestore.FieldValue;

// Export the config for potential use elsewhere
export { firebaseConfig };

// Export Firebase types for convenience
    export type { FirebaseAuthTypes };

// Optional: Configure Firestore settings for development
if (__DEV__) {
  // Enable offline persistence
  firestore().settings({
    cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED,
    persistence: true,
  });
  
  // Enable network logging in development
  firestore().enableNetwork();
}

// Export default Firebase app instance
export default app;
