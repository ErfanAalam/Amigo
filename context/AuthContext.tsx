// context/AuthContext.tsx
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { firebaseAuth, firebaseFirestore } from '../firebaseConfig';

interface UserData {
  uid: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  displayName: string;
  createdAt: any;
  updatedAt: any;
  isOnline: boolean;
  lastSeen: any;
  profileImageUrl?: string;
}

interface AuthContextType {
  user: FirebaseAuthTypes.User | null;
  userData: UserData | null;
  loading: boolean;
  signOut: () => Promise<void>;
  updateUserStatus: (isOnline: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  // Update online status in Firestore
  const updateOnlineStatus =useCallback (async (isOnline: boolean) => {
    if (user?.uid) {
      try {
        await firebaseFirestore.collection('users').doc(user.uid).update({
          isOnline,
          lastSeen: isOnline ? null : new Date()
        });
        
        // Update local state
        setUserData(prev => prev ? { ...prev, isOnline, lastSeen: isOnline ? null : new Date() } : null);
      } catch (error) {
        console.error('Error updating online status:', error);
      }
    }
  },[user?.uid]);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && user?.uid) {
        // App became active - set user online
        updateOnlineStatus(true);
      } else if (nextAppState === 'background' && user?.uid) {
        // App went to background - set user offline
        updateOnlineStatus(false);
      }
    };

    // Use the appropriate method based on React Native version
    let subscription: any;
    if (AppState.addEventListener) {
      subscription = AppState.addEventListener('change', handleAppStateChange);
    } else {
      // Fallback for older versions
      AppState.addEventListener('change', handleAppStateChange);
    }
    
    return () => {
      if (subscription?.remove) {
        subscription.remove();
      }
    };
  }, [user?.uid,updateOnlineStatus]);

  useEffect(() => {
    const unsubscribe = firebaseAuth.onAuthStateChanged(async (user) => {
      setUser(user);
      
      if (user) {
        try {
          // Fetch user data from Firestore
          const userDoc = await firebaseFirestore.collection('users').doc(user.uid).get();
          if (userDoc.exists) {
            const data = userDoc.data() as UserData;
            setUserData(data);
            
            // Set user online when they log in
            await firebaseFirestore.collection('users').doc(user.uid).update({
              isOnline: true,
              lastSeen: null
            });
            
            // Update local state
            setUserData(prev => prev ? { ...prev, isOnline: true, lastSeen: null } : null);
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
        }
      } else {
        // User logged out - ensure they're marked as offline
        if (userData?.uid) {
          try {
            await firebaseFirestore.collection('users').doc(userData.uid).update({
              isOnline: false,
              lastSeen: new Date()
            });
          } catch (error) {
            console.error('Error updating offline status:', error);
          }
        }
        setUserData(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, [userData?.uid]);

  const signOut = async () => {
    try {
      if (user) {
        // Update user status to offline before signing out
        await firebaseFirestore.collection('users').doc(user.uid).update({
          isOnline: false,
          lastSeen: new Date()
        });
      }
      await firebaseAuth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const updateUserStatus = async (isOnline: boolean) => {
    try {
      if (user) {
        await firebaseFirestore.collection('users').doc(user.uid).update({
          isOnline,
          lastSeen: isOnline ? null : new Date()
        });
        
        // Update local state
        setUserData(prev => prev ? { ...prev, isOnline, lastSeen: isOnline ? null : new Date() } : null);
      }
    } catch (error) {
      console.error('Error updating user status:', error);
    }
  };

  // Cleanup effect when component unmounts
  useEffect(() => {
    return () => {
      // When the app is completely closed, ensure user is marked as offline
      if (user?.uid) {
        firebaseFirestore.collection('users').doc(user.uid).update({
          isOnline: false,
          lastSeen: new Date()
        }).catch(error => {
          console.error('Error updating offline status on unmount:', error);
        });
      }
    };
  }, [user?.uid]);

  const value: AuthContextType = {
    user,
    userData,
    loading,
    signOut,
    updateUserStatus,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
