// app/(tabs)/profile.tsx
import { Ionicons } from '@expo/vector-icons';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNotifications } from '../../context/NotificationContext';
import { useTheme } from '../../context/ThemeContext';

interface UserData {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  // email: string;
  displayName: string;
  createdAt: any;
  isOnline: boolean;
  lastSeen: any;
  profileImageUrl?: string;
}

interface DeletedChat {
  uid: string;
  name: string;
  phoneNumber: string;
  lastMessage: string;
  lastMessageType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'voice';
  lastMessageTime: any;
  profileImageUrl?: string;
  chatId: string;
}

export default function Profile() {
  const router = useRouter();
  const { theme, isDark, toggleTheme } = useTheme();
  const { 
    fcmToken, 
    isNotificationsEnabled, 
    requestPermissions, 
    sendTestNotification,
    clearNotifications,
    refreshNotificationStatus
  } = useNotifications();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [deletedChats, setDeletedChats] = useState<DeletedChat[]>([]);
  const [loadingDeletedChats, setLoadingDeletedChats] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const user = auth().currentUser;
        if (user) {
          const userDoc = await firestore().collection('users').doc(user.uid).get();
          if (userDoc.exists) {
            const data = userDoc.data() as UserData;
            setUserData(data);
            setProfileImage(data.profileImageUrl || null);
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

  // Fetch deleted chats when component mounts
  useEffect(() => {
    if (userData) {
      fetchDeletedChats();
    }
  }, [userData]);

  const fetchDeletedChats = async () => {
    const user = auth().currentUser;
    if (!user) return;

    setLoadingDeletedChats(true);
    try {
      const chatsSnapshot = await firestore()
        .collection('chats')
        .where('participants', 'array-contains', user.uid)
        .get();

      const deletedChatsList: DeletedChat[] = [];
      
      for (const chatDoc of chatsSnapshot.docs) {
        const chatData = chatDoc.data();
        const chatMetadata = chatData.metadata?.[user.uid] || {};
        
        // Only include chats that are marked as deleted for the current user
        if (chatMetadata.deletedFor) {
          const participants = chatData.participants || [];
          const participantNames = chatData.participantNames || [];
          
          // Find the other participant (not current user)
          const otherParticipantIndex = participants.findIndex((uid: string) => uid !== user.uid);
          if (otherParticipantIndex !== -1) {
            const otherUserId = participants[otherParticipantIndex];
            const otherUserName = participantNames[otherParticipantIndex] || 'Unknown';
            
            // Get user details from users collection
            try {
              const userDoc = await firestore()
                .collection('users')
                .doc(otherUserId)
                .get();
            
              if (userDoc.exists) {
                const userData = userDoc.data();
                deletedChatsList.push({
                  uid: otherUserId,
                  name: userData?.displayName || otherUserName,
                  phoneNumber: userData?.phoneNumber || '',
                  lastMessage: chatData.lastMessage || '',
                  lastMessageType: chatData.lastMessageType || 'text',
                  lastMessageTime: chatData.lastMessageTime || null,
                  profileImageUrl: userData?.profileImageUrl,
                  chatId: chatDoc.id,
                });
              }
            } catch (error) {
              console.error('Error fetching user data for deleted chat:', error);
            }
          }
        }
      }
      
      setDeletedChats(deletedChatsList);
    } catch (error) {
      console.error('Error fetching deleted chats:', error);
    } finally {
      setLoadingDeletedChats(false);
    }
  };

  const restoreChat = async (chat: DeletedChat) => {
    const user = auth().currentUser;
    if (!user) return;

    try {
      // Mark chat as not deleted for the current user (restore)
      await firestore().collection('chats').doc(chat.chatId).update({
        [`metadata.${user.uid}.deletedFor`]: false,
        [`metadata.${user.uid}.deletedAt`]: firestore.FieldValue.delete(),
      });
      
      // Remove from deleted chats list
      setDeletedChats(prev => prev.filter(c => c.chatId !== chat.chatId));
      
      // Alert.alert('Success', `Chat with ${chat.name} restored successfully!`);
    } catch (error) {
      console.error('Error restoring chat:', error);
      // Alert.alert('Error', 'Failed to restore chat. Please try again.');
    }
  };

  const requestImagePermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Sorry, we need camera roll permissions to make this work!',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const pickImage = async () => {
    try {
      const hasPermission = await requestImagePermission();
      if (!hasPermission) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadProfileImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const uploadProfileImage = async (imageUri: string) => {
    const user = auth().currentUser;
    if (!user) return;

    setUploadingImage(true);
    try {
      const fileName = `profile_images/${user.uid}_${Date.now()}.jpg`;
      
      // Convert image to blob
      const response = await fetch(imageUri);
      const blob = await response.blob();
      
      // Upload to Firebase Storage
      const storageRef = storage().ref().child(fileName);
      await storageRef.put(blob);
      
      // Get download URL
      const downloadURL = await storageRef.getDownloadURL();
      
      // Update Firestore
      await firestore().collection('users').doc(user.uid).update({
        profileImageUrl: downloadURL,
      });
      
      // Update local state
      setProfileImage(downloadURL);
      setUserData(prev => prev ? { ...prev, profileImageUrl: downloadURL } : null);
      
      // Alert.alert('Success', 'Profile image updated successfully!');
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

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
      ['#0d9488', '#10b981'],
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

  const renderDeletedChat = ({ item }: { item: DeletedChat }) => {
    const [color1, color2] = getAvatarGradient(item.name);
    
    return (
      <View style={[styles.deletedChatItem, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.deletedChatAvatar}>
          {item.profileImageUrl ? (
            <Image source={{ uri: item.profileImageUrl }} style={styles.deletedChatProfileImage} />
          ) : (
            <LinearGradient
              colors={[color1, color2]}
              style={styles.deletedChatAvatarGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.deletedChatAvatarText}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
          )}
        </View>
        
        <View style={styles.deletedChatInfo}>
          <Text style={[styles.deletedChatName, { color: theme.colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.deletedChatMessage, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {item.lastMessage || 'No messages'}
          </Text>
        </View>
        
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={() => restoreChat(item)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#10b981', '#059669']}
            style={styles.restoreButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="refresh" size={16} color="#ffffff" />
            <Text style={styles.restoreButtonText}>Restore</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
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
          colors={theme.isDark ? ['#1a1a2e', '#16213e'] : ['#0d9488', '#10b981']}
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
            <TouchableOpacity 
              style={styles.modernAvatarContainer}
              onPress={pickImage}
              disabled={uploadingImage}
              activeOpacity={0.8}
            >
              {profileImage ? (
                <View style={styles.profileImageContainer}>
                  <Image source={{ uri: profileImage }} style={styles.profileImage} />
                  {uploadingImage && (
                    <View style={styles.uploadingOverlay}>
                      <ActivityIndicator size="small" color="#ffffff" />
                    </View>
                  )}
                  <View style={styles.uploadIconOverlay}>
                    <Ionicons name="camera" size={20} color="#ffffff" />
                  </View>
                </View>
              ) : (
                <LinearGradient
                  colors={[color1, color2]}
                  style={styles.modernAvatar}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={[styles.modernAvatarText, { color: '#ffffff' }]}>
                    {userData?.firstName?.charAt(0)?.toUpperCase() || 'U'}
                  </Text>
                  {uploadingImage && (
                    <View style={styles.uploadingOverlay}>
                      <ActivityIndicator size="small" color="#ffffff" />
                    </View>
                  )}
                </LinearGradient>
              )}
              {userData?.isOnline && (
                <View style={styles.onlineStatusIndicator} />
                
              )}
            </TouchableOpacity>
            
            <Text style={[styles.modernUserName, { color: '#FFFFFF'}]}>
              {userData?.displayName || 'User'}
            </Text>
            {/* <View style={styles.statusContainer}>
              <View style={[
                styles.statusDot, 
                { backgroundColor: userData?.isOnline ? '#00d4aa' : '#ff6b6b' }
              ]} />
              <Text style={[styles.statusText, { color: '#FFFFFF' }]}>
                {userData?.isOnline ? 'Online' : 'Offline'}
              </Text>
            </View> */}
            
            <TouchableOpacity 
              style={styles.uploadButton}
              onPress={pickImage}
              disabled={uploadingImage}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.1)']}
                style={styles.uploadButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons 
                  name={uploadingImage ? "hourglass" : "camera"} 
                  size={16} 
                  color="#ffffff" 
                />
                <Text style={styles.uploadButtonText}>
                  {uploadingImage ? 'Uploading...' : 'Upload Photo'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
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

      {/* Deleted Chats Section */}
      {deletedChats.length > 0 && (
        <View style={styles.deletedChatsContainer}>
          <View style={[styles.modernCard, { backgroundColor: theme.colors.card }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIcon, { backgroundColor: '#ff6b6b20' }]}>
                <Ionicons name="trash" size={20} color="#ff6b6b" />
              </View>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Deleted Chats</Text>
              <Text style={[styles.deletedChatsCount, { color: theme.colors.textSecondary }]}>
                {deletedChats.length}
              </Text>
            </View>
            
            <FlatList
              data={deletedChats}
              renderItem={renderDeletedChat}
              keyExtractor={(item) => item.chatId}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      )}



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
  profileImageContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 50,
  },
  uploadIconOverlay: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
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
    marginBottom: 16,
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
  uploadButton: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  uploadButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    gap: 8,
  },
  uploadButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
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
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },

  notificationActions: {
    marginTop: 20,
    gap: 10,
  },
  notificationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 15,
    gap: 8,
  },
  notificationButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Deleted chats section
  deletedChatsContainer: {
    padding: 20,
    marginTop: 0,
  },
  deletedChatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  deletedChatAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 15,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  deletedChatAvatarGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deletedChatProfileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  deletedChatAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  deletedChatInfo: {
    flex: 1,
    marginRight: 10,
  },
  deletedChatName: {
    fontSize: 16,
    fontWeight: '600',
  },
  deletedChatMessage: {
    fontSize: 13,
    marginTop: 2,
  },
  restoreButton: {
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  restoreButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 10,
    gap: 5,
  },
  restoreButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  deletedChatsCount: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 10,
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
