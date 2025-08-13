// app/(tabs)/profile.tsx
import { Ionicons } from '@expo/vector-icons';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useTheme } from '../../context/ThemeContext';

interface UserData {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  displayName: string;
  createdAt: any;
  isOnline: boolean;
  lastSeen: any;
}

export default function Profile() {
  const router = useRouter();
  const { theme, isDark, toggleTheme } = useTheme();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const user = auth().currentUser;
        if (user) {
          const userDoc = await firestore().collection('users').doc(user.uid).get();
          if (userDoc.exists) {
            setUserData(userDoc.data() as UserData);
          }
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handleLogout = async () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            try {
              // Update user status to offline
              const currentUser = auth().currentUser;
              if (currentUser) {
                await firestore().collection('users').doc(currentUser.uid).update({
                  isOnline: false,
                  lastSeen: new Date()
                });
              }
              
              await auth().signOut();
              router.replace("/(auth)/login");
            } catch (error) {
              console.error("Logout error:", error);
              Alert.alert("Error", "Failed to logout. Please try again.");
            }
          }
        }
      ]
    );
  };

  const formatDate = (date: any) => {
    if (!date) return "N/A";
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return "N/A";
    }
  };

  const getAvatarGradient = (name: string) => {
    const gradients = [
      ['#667eea', '#764ba2'],
      // ['#f093fb', '#f5576c'],
      // ['#4facfe', '#00f2fe'],
      // ['#43e97b', '#38f9d7'],
      // ['#fa709a', '#fee140'],
      // ['#a8edea', '#fed6e3'],
      // ['#ffecd2', '#fcb69f'],
      // ['#ff8a80', '#ff7043'],
    ];
    const index = name.charCodeAt(0) % gradients.length;
    return gradients[index];
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.loadingCard, { backgroundColor: theme.colors.surface }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  const [color1, color2] = getAvatarGradient(userData?.displayName || 'User');

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Modern Header with Gradient */}
      <View style={styles.modernHeader}>
        <LinearGradient
          colors={theme.isDark ? ['#1a1a2e', '#16213e'] : [color1, color2]}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <TouchableOpacity 
            style={styles.modernThemeToggle}
            onPress={toggleTheme}
            activeOpacity={0.8}
          >
            <View style={styles.themeToggleBackground}>
              {isDark ? (
                <Ionicons name="sunny" size={20} color="#FFA500" />
              ) : (
                <Ionicons name="moon" size={20} color="#4A90E2" />
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.profileSection}>
            <View style={styles.modernAvatarContainer}>
              <LinearGradient
                colors={[color1, color2]}
                style={styles.modernAvatar}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={[styles.modernAvatarText, { color: '#ffffff' }]}>
                  {userData?.firstName?.charAt(0)?.toUpperCase() || 'U'}
                </Text>
              </LinearGradient>
              {userData?.isOnline && (
                <View style={styles.onlineStatusIndicator} />
              )}
            </View>
            
            <Text style={[styles.modernUserName, { color: '#FFFFFF'}]}>
              {userData?.displayName || 'User'}
            </Text>
            <View style={styles.statusContainer}>
              <View style={[
                styles.statusDot, 
                { backgroundColor: userData?.isOnline ? '#00d4aa' : '#ff6b6b' }
              ]} />
              <Text style={[styles.statusText, { color: '#FFFFFF' }]}>
                {userData?.isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Modern Info Cards */}
      <View style={styles.infoCardsContainer}>
        <View style={[styles.modernCard, { backgroundColor: theme.colors.card }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: color1 + '20' }]}>
              <Ionicons name="person" size={20} color={color1} />
            </View>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Personal Info</Text>
          </View>
          
          <View style={styles.cardContent}>
            <View style={styles.modernInfoRow}>
              <Text style={[styles.modernInfoLabel, { color: theme.colors.textSecondary }]}>First Name</Text>
              <Text style={[styles.modernInfoValue, { color: theme.colors.text }]}>
                {userData?.firstName || 'N/A'}
              </Text>
            </View>
            
            <View style={styles.modernInfoRow}>
              <Text style={[styles.modernInfoLabel, { color: theme.colors.textSecondary }]}>Last Name</Text>
              <Text style={[styles.modernInfoValue, { color: theme.colors.text }]}>
                {userData?.lastName || 'N/A'}
              </Text>
            </View>
            
            <View style={styles.modernInfoRow}>
              <Text style={[styles.modernInfoLabel, { color: theme.colors.textSecondary }]}>Phone</Text>
              <Text style={[styles.modernInfoValue, { color: theme.colors.text }]}>
                {userData?.phoneNumber || 'N/A'}
              </Text>
            </View>
            
            <View style={[styles.modernInfoRow, { borderBottomWidth: 0 }]}>
              <Text style={[styles.modernInfoLabel, { color: theme.colors.textSecondary }]}>Email</Text>
              <Text style={[styles.modernInfoValue, { color: theme.colors.text }]}>
                {userData?.email || 'N/A'}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.modernCard, { backgroundColor: theme.colors.card }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: color2 + '20' }]}>
              <Ionicons name="time" size={20} color={color2} />
            </View>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Account Info</Text>
          </View>
          
          <View style={styles.cardContent}>
            <View style={styles.modernInfoRow}>
              <Text style={[styles.modernInfoLabel, { color: theme.colors.textSecondary }]}>Member Since</Text>
              <Text style={[styles.modernInfoValue, { color: theme.colors.text }]}>
                {formatDate(userData?.createdAt)}
              </Text>
            </View>
            
            <View style={[styles.modernInfoRow, { borderBottomWidth: 0 }]}>
              <Text style={[styles.modernInfoLabel, { color: theme.colors.textSecondary }]}>Last Seen</Text>
              <Text style={[styles.modernInfoValue, { color: theme.colors.text }]}>
                {formatDate(userData?.lastSeen)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Modern Logout Button */}
      <View style={styles.modernButtonContainer}>
        <TouchableOpacity 
          style={styles.modernLogoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#ff6b6b', '#ff8e8e']}
            style={styles.logoutButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="log-out" size={20} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.modernLogoutText}>Logout</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Main container
  container: {
    flex: 1,
  },
  
  // Loading states
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingCard: {
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    fontWeight: '500',
  },

  // Modern header styles
  modernHeader: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  headerGradient: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    alignItems: 'center',
  },
  modernThemeToggle: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1,
  },
  themeToggleBackground: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    // shadowColor: '#000',
    // shadowOffset: { width: 0, height: 4 },
    // shadowOpacity: 0.15,
    // shadowRadius: 8,
    // elevation: 6,
  },
  profileSection: {
    alignItems: 'center',
    marginTop: 20,
  },
  modernAvatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  modernAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  modernAvatarText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#ffffff',
  },
  onlineStatusIndicator: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#00d4aa',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  modernUserName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Modern info cards
  infoCardsContainer: {
    padding: 20,
    gap: 20,
  },
  modernCard: {
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardContent: {
    gap: 2,
  },
  modernInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  modernInfoLabel: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  modernInfoValue: {
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'right',
    flex: 1,
  },

  // Modern logout button
  modernButtonContainer: {
    padding: 20,
    paddingTop: 0,
  },
  modernLogoutButton: {
    borderRadius: 20,
    shadowColor: '#ff6b6b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  logoutButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  modernLogoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});
