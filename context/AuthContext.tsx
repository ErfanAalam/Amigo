// context/AuthContext.tsx
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { createContext, useContext, useEffect, useState } from 'react';
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
            
            // Update online status
            await firebaseFirestore.collection('users').doc(user.uid).update({
              isOnline: true,
              lastSeen: new Date()
            });
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
        }
      } else {
        setUserData(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

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
          lastSeen: new Date()
        });
        
        // Update local state
        setUserData(prev => prev ? { ...prev, isOnline, lastSeen: new Date() } : null);
      }
    } catch (error) {
      console.error('Error updating user status:', error);
    }
  };

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
