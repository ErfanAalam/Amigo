// app/(tabs)/home.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { FieldValue, firebaseFirestore as firestore } from '../../firebaseConfig';

interface ChatUser {
  uid: string;
  name: string;
  phoneNumber: string;
  lastMessage: string;
  lastMessageType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'voice';
  lastMessageTime: any;
  unreadCount: number;
  profileImageUrl?: string;
  isPinned?: boolean;
  isMuted?: boolean;
  isFavorite?: boolean;
  chatId?: string; // Add chatId for operations
  isOnline?: boolean;
  lastSeen?: any;
  isTyping?: boolean;
}

export default function Home() {
  const router = useRouter();
  const { theme } = useTheme();
  const { userData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [chatUsers, setChatUsers] = useState<ChatUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  
  // New state variables for chat management
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [pinnedChats, setPinnedChats] = useState<ChatUser[]>([]);
  const [unpinnedChats, setUnpinnedChats] = useState<ChatUser[]>([]);
  const [showActionMenu, setShowActionMenu] = useState(false);
  


  const fetchChatHistory = useCallback(async () => {
    if (!userData?.uid) return;

    try {
      // Only show loading on initial load, not on refreshes
      if (chatUsers.length === 0) {
        setLoading(true);
      }
      
      // Get all chats where current user is a participant
      const chatsSnapshot = await firestore
        .collection('chats')
        .where('participants', 'array-contains', userData.uid)
        .get();

      const chatList: ChatUser[] = [];
      
      for (const chatDoc of chatsSnapshot.docs) {
        const chatData = chatDoc.data();
        const participants = chatData.participants || [];
        const participantNames = chatData.participantNames || [];
        
        // Find the other participant (not current user)
        const otherParticipantIndex = participants.findIndex((uid: string) => uid !== userData.uid);
        if (otherParticipantIndex !== -1) {
          const otherUserId = participants[otherParticipantIndex];
          const otherUserName = participantNames[otherParticipantIndex] || 'Unknown';
          
          // Use the lastMessage and lastMessageTime from chat metadata
          const lastMessage = chatData.lastMessage || '';
          const lastMessageType = chatData.lastMessageType || 'text';
          const lastMessageTime = chatData.lastMessageTime || null;

          // Get chat metadata for pin, mute, and favorite status
          const chatMetadata = chatData.metadata?.[userData.uid] || {};
          const isPinned = chatMetadata.isPinned || false;
          const isMuted = chatMetadata.isMuted || false;
          const isFavorite = chatMetadata.isFavorite || false;

          // Get user details from users collection
          try {
            const userDoc = await firestore
              .collection('users')
              .doc(otherUserId)
              .get();
          
            if (userDoc.exists) {
              const userData = userDoc.data();
              chatList.push({
                uid: otherUserId,
                name: userData?.displayName || otherUserName,
                phoneNumber: userData?.phoneNumber || '',
                lastMessage,
                lastMessageType,
                lastMessageTime,
                unreadCount: 0, // TODO: Implement unread count
                profileImageUrl: userData?.profileImageUrl,
                isPinned,
                isMuted,
                isFavorite,
                chatId: chatDoc.id,
                isOnline: userData?.isOnline || false,
                lastSeen: userData?.lastSeen || null,
                isTyping: false, // Will be updated by real-time listener
              });
            }
          } catch (error) {
            console.error('Error fetching user data:', error);
            // Add with available data
            chatList.push({
              uid: otherUserId,
              name: otherUserName,
              phoneNumber: '',
              lastMessage,
              lastMessageType,
              lastMessageTime,
              unreadCount: 0,
              isPinned,
              isMuted,
              isFavorite,
              chatId: chatDoc.id,
              isOnline: false,
              lastSeen: null,
              isTyping: false,
            });
          }
        }
      }

      // Sort by last message time (most recent first)
      chatList.sort((a, b) => {
        if (!a.lastMessageTime && !b.lastMessageTime) return 0;
        if (!a.lastMessageTime) return 1;
        if (!b.lastMessageTime) return 0;
        try {
          return b.lastMessageTime.toDate() - a.lastMessageTime.toDate();
        } catch (error) {
          console.error('Error sorting chat list:', error);
          return 0;
        }
      });

      // Separate pinned and unpinned chats
      const pinned = chatList.filter(chat => chat.isPinned);
      const unpinned = chatList.filter(chat => !chat.isPinned);
      
      // Sort pinned chats by last message time
      pinned.sort((a, b) => {
        if (!a.lastMessageTime && !b.lastMessageTime) return 0;
        if (!a.lastMessageTime) return 1;
        if (!b.lastMessageTime) return 0;
        try {
          return b.lastMessageTime.toDate() - a.lastMessageTime.toDate();
        } catch (error) {
          console.error('Error sorting pinned chats:', error);
          return 0;
        }
      });

      setChatUsers(chatList);
      setPinnedChats(pinned);
      setUnpinnedChats(unpinned);
    } catch (error) {
      console.error('Error fetching chat history:', error);
      Alert.alert('Error', 'Failed to load chat history');
    } finally {
      setLoading(false);
    }
  }, [userData?.uid, chatUsers.length]);

  // Debounced refresh function to prevent excessive API calls
  const debouncedRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshTime > 3000) { // Only refresh if more than 3 seconds have passed
      setLastRefreshTime(now);
      fetchChatHistory();
    }
  }, [lastRefreshTime, fetchChatHistory]);

  // Set up real-time listeners for chat updates
  useEffect(() => {
    if (!userData?.uid) return;

    // Listen to changes in chats collection
    const unsubscribeChats = firestore
      .collection('chats')
      .where('participants', 'array-contains', userData.uid)
      .onSnapshot(async (snapshot) => {
        try {
          const chatList: ChatUser[] = [];
          
          for (const chatDoc of snapshot.docs) {
            const chatData = chatDoc.data();
            const participants = chatData.participants || [];
            const participantNames = chatData.participantNames || [];
            
            // Find the other participant (not current user)
            const otherParticipantIndex = participants.findIndex((uid: string) => uid !== userData.uid);
            if (otherParticipantIndex !== -1) {
              const otherUserId = participants[otherParticipantIndex];
              const otherUserName = participantNames[otherParticipantIndex] || 'Unknown';
              
              // Use the lastMessage and lastMessageTime from chat metadata
              const lastMessage = chatData.lastMessage || '';
              const lastMessageType = chatData.lastMessageType || 'text';
              const lastMessageTime = chatData.lastMessageTime || null;

              // Get chat metadata for pin, mute, and favorite status
              const chatMetadata = chatData.metadata?.[userData.uid] || {};
              const isPinned = chatMetadata.isPinned || false;
              const isMuted = chatMetadata.isMuted || false;
              const isFavorite = chatMetadata.isFavorite || false;

              // Get user details from users collection
              try {
                const userDoc = await firestore
                  .collection('users')
                  .doc(otherUserId)
                  .get();
              
                if (userDoc.exists) {
                  const userData = userDoc.data();
                  chatList.push({
                    uid: otherUserId,
                    name: userData?.displayName || otherUserName,
                    phoneNumber: userData?.phoneNumber || '',
                    lastMessage,
                    lastMessageType,
                    lastMessageTime,
                    unreadCount: 0, // TODO: Implement unread count
                    profileImageUrl: userData?.profileImageUrl,
                    isPinned,
                    isMuted,
                    isFavorite,
                    chatId: chatDoc.id,
                    isOnline: userData?.isOnline || false,
                    lastSeen: userData?.lastSeen || null,
                    isTyping: false,
                  });
                }
              } catch (error) {
                console.error('Error fetching user data:', error);
                // Add with available data
                                  chatList.push({
                    uid: otherUserId,
                    name: otherUserName,
                    phoneNumber: '',
                    lastMessage,
                    lastMessageType,
                    lastMessageTime,
                    unreadCount: 0,
                    isPinned,
                    isMuted,
                    isFavorite,
                    chatId: chatDoc.id,
                    isOnline: false,
                    lastSeen: null,
                    isTyping: false,
                  });
              }
            }
          }

          // Sort by last message time (most recent first)
          chatList.sort((a, b) => {
            if (!a.lastMessageTime && !b.lastMessageTime) return 0;
            if (!a.lastMessageTime) return 1;
            if (!b.lastMessageTime) return 0;
            try {
              return b.lastMessageTime.toDate() - a.lastMessageTime.toDate();
            } catch (error) {
              console.error('Error sorting chat list:', error);
              return 0;
            }
          });

          // Separate pinned and unpinned chats
          const pinned = chatList.filter(chat => chat.isPinned);
          const unpinned = chatList.filter(chat => !chat.isPinned);
          
          // Sort pinned chats by last message time
          pinned.sort((a, b) => {
            if (!a.lastMessageTime && !b.lastMessageTime) return 0;
            if (!a.lastMessageTime) return 1;
            if (!b.lastMessageTime) return 0;
            try {
              return b.lastMessageTime.toDate() - a.lastMessageTime.toDate();
            } catch (error) {
              console.error('Error sorting chat list:', error);
              return 0;
            }
          });

          setChatUsers(chatList);
          setPinnedChats(pinned);
          setUnpinnedChats(unpinned);
        } catch (error) {
          console.error('Error updating chat list:', error);
        }
      });

    return () => unsubscribeChats();
  }, [userData?.uid]);

  // Listen to chat metadata changes for immediate updates
  useEffect(() => {
    if (!userData?.uid) return;

    // Listen to changes in the main chat documents
    const unsubscribeChatMetadata = firestore
      .collection('chats')
      .where('participants', 'array-contains', userData.uid)
      .onSnapshot((snapshot) => {
        // When chat metadata changes (like lastMessage, lastMessageTime), refresh the list
        debouncedRefresh();
      });

    return () => unsubscribeChatMetadata();
  }, [userData?.uid, debouncedRefresh]);

  // Track online status and typing indicators
  useEffect(() => {
    if (!userData?.uid) return;

    // Listen to online status changes
    const unsubscribeOnlineStatus = firestore
      .collection('users')
      .onSnapshot((snapshot) => {
        snapshot.forEach((doc) => {
          const userData = doc.data();
          if (doc.id !== userData?.uid) {
            // Update individual user status without flickering
            const isOnline = userData?.isOnline || false;
            const lastSeen = userData?.lastSeen || null;
            
            setChatUsers(prevUsers => 
              prevUsers.map(user => 
                user.uid === doc.id ? { ...user, isOnline, lastSeen } : user
              )
            );
            
            setPinnedChats(prevPinned => 
              prevPinned.map(user => 
                user.uid === doc.id ? { ...user, isOnline, lastSeen } : user
              )
            );
            
            setUnpinnedChats(prevUnpinned => 
              prevUnpinned.map(user => 
                user.uid === doc.id ? { ...user, isOnline, lastSeen } : user
              )
            );
          }
        });
      });

    return () => unsubscribeOnlineStatus();
  }, [userData?.uid]);

  // Track typing indicators separately to avoid conflicts
  useEffect(() => {
    if (!userData?.uid) return;

    // Listen to typing status changes in chats
    const unsubscribeTyping = firestore
      .collection('chats')
      .where('participants', 'array-contains', userData.uid)
      .onSnapshot((snapshot) => {
        snapshot.forEach((doc) => {
          const chatData = doc.data();
          if (chatData?.typingUsers) {
            Object.keys(chatData.typingUsers).forEach((uid) => {
              if (uid !== userData.uid) {
                // Update typing status without flickering
                const isTyping = chatData.typingUsers[uid] || false;
                
                setChatUsers(prevUsers => 
                  prevUsers.map(user => 
                    user.uid === uid ? { ...user, isTyping } : user
                  )
                );
                
                setPinnedChats(prevPinned => 
                  prevPinned.map(user => 
                    user.uid === uid ? { ...user, isTyping } : user
                  )
                );
                
                setUnpinnedChats(prevUnpinned => 
                  prevUnpinned.map(user => 
                    user.uid === uid ? { ...user, isTyping } : user
                  )
                );
              }
            });
          }
        });
      });

    return () => unsubscribeTyping();
  }, [userData?.uid]);

  // Update user's online status
  useEffect(() => {
    if (!userData?.uid) return;

    const updateOnlineStatus = async (isOnline: boolean) => {
      try {
        await firestore.collection('users').doc(userData.uid).update({
          isOnline,
          lastSeen: isOnline ? null : FieldValue.serverTimestamp(),
        });
      } catch (error) {
        console.error('Error updating online status:', error);
      }
    };

    // Set online when component mounts
    updateOnlineStatus(true);

    // Set offline when component unmounts
    return () => {
      updateOnlineStatus(false);
    };
  }, [userData?.uid]);



  // Refresh data when user returns to this screen
  useFocusEffect(
    useCallback(() => {
      if (userData?.uid) {
        fetchChatHistory();
      }
    }, [userData?.uid, fetchChatHistory])
  );

  // Initial data loading
  useEffect(() => {
    if (userData?.uid) {
      fetchChatHistory();
    }
  }, [userData?.uid, fetchChatHistory]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchChatHistory();
    setRefreshing(false);
  };

  const startChat = (chatUser: ChatUser) => {
    router.push({
      pathname: '/chat',
      params: {
        userId: chatUser.uid,
        userName: chatUser.name,
        userPhone: chatUser.phoneNumber
      }
    });
  };

  // Chat management functions
  const toggleChatSelection = (chatId: string) => {
    const newSelection = new Set(selectedChats);
    if (newSelection.has(chatId)) {
      newSelection.delete(chatId);
    } else {
      newSelection.add(chatId);
    }
    setSelectedChats(newSelection);
    
    if (newSelection.size === 0) {
      setIsSelectionMode(false);
    } else if (!isSelectionMode) {
      setIsSelectionMode(true);
    }
  };

  const clearSelection = () => {
    setSelectedChats(new Set());
    setIsSelectionMode(false);
  };

  const togglePinChat = async (chatUser: ChatUser) => {
    if (!chatUser.chatId || !userData?.uid) return;
    
    try {
      const newPinStatus = !chatUser.isPinned;
      
      // Check if trying to pin more than 3 chats
      if (newPinStatus && pinnedChats.length >= 3) {
        Alert.alert('Pin Limit Reached', 'You can only pin a maximum of 3 chats at a time.');
        return;
      }
      
      // Update chat metadata in Firestore
      await firestore.collection('chats').doc(chatUser.chatId).update({
        [`metadata.${userData.uid}.isPinned`]: newPinStatus
      });
      
      // Update local state
      setChatUsers(prev => prev.map(chat => 
        chat.uid === chatUser.uid 
          ? { ...chat, isPinned: newPinStatus }
          : chat
      ));
      
      // Refresh the chat list to update pinned/unpinned separation
      fetchChatHistory();
      
    } catch (error) {
      console.error('Error toggling pin status:', error);
      Alert.alert('Error', 'Failed to update pin status');
    }
  };

  const toggleMuteChat = async (chatUser: ChatUser) => {
    if (!chatUser.chatId || !userData?.uid) return;
    
    try {
      const newMuteStatus = !chatUser.isMuted;
      
      // Update chat metadata in Firestore
      await firestore.collection('chats').doc(chatUser.chatId).update({
        [`metadata.${userData.uid}.isMuted`]: newMuteStatus
      });
      
      // Update local state
      setChatUsers(prev => prev.map(chat => 
        chat.uid === chatUser.uid 
          ? { ...chat, isMuted: newMuteStatus }
          : chat
      ));
      
    } catch (error) {
      console.error('Error toggling mute status:', error);
      Alert.alert('Error', 'Failed to update mute status');
    }
  };

  const toggleFavoriteChat = async (chatUser: ChatUser) => {
    if (!chatUser.chatId || !userData?.uid) return;
    
    try {
      const newFavoriteStatus = !chatUser.isFavorite;
      
      // Update chat metadata in Firestore
      await firestore.collection('chats').doc(chatUser.chatId).update({
        [`metadata.${userData.uid}.isFavorite`]: newFavoriteStatus
      });
      
      // Update local state
      setChatUsers(prev => prev.map(chat => 
        chat.uid === chatUser.uid 
          ? { ...chat, isFavorite: newFavoriteStatus }
          : chat
      ));
      
    } catch (error) {
      console.error('Error toggling favorite status:', error);
      Alert.alert('Error', 'Failed to update favorite status');
    }
  };

  const deleteChat = async (chatUser: ChatUser) => {
    if (!chatUser.chatId || !userData?.uid) return;
    
    Alert.alert(
      'Delete Chat',
      `Are you sure you want to delete your chat with ${chatUser.name}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Remove user from chat participants
              await firestore.collection('chats').doc(chatUser.chatId).update({
                participants: FieldValue.arrayRemove(userData.uid)
              });
              
              // Remove from local state
              setChatUsers(prev => prev.filter(chat => chat.uid !== chatUser.uid));
              setSelectedChats(prev => {
                const newSelection = new Set(prev);
                newSelection.delete(chatUser.uid);
                return newSelection;
              });
              
              // Clear selection if no chats selected
              if (selectedChats.size === 1) {
                setIsSelectionMode(false);
              }
              
              Alert.alert('Success', 'Chat deleted successfully');
            } catch (error) {
              console.error('Error deleting chat:', error);
              Alert.alert('Error', 'Failed to delete chat');
            }
          },
        },
      ]
    );
  };

  const handleLongPress = (chatUser: ChatUser) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
    }
    toggleChatSelection(chatUser.uid);
  };

  // Separate filtered chats into pinned and unpinned
  const filteredPinnedChats = pinnedChats.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.phoneNumber.includes(searchQuery)
  );
  const filteredUnpinnedChats = unpinnedChats.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.phoneNumber.includes(searchQuery)
  );

  // Combine filtered chats with pinned first
  const combinedFilteredChats = [...filteredPinnedChats, ...filteredUnpinnedChats];

  const formatLastMessageTime = (timestamp: any) => {
    if (!timestamp) return '';
    
    try {
      const date = timestamp.toDate();
      const now = new Date();
      const diffInMinutes = (now.getTime() - date.getTime()) / (1000 * 60);
      
      if (diffInMinutes < 1) {
        return 'Just now';
      } else if (diffInMinutes < 60) {
        return `${Math.floor(diffInMinutes)}m ago`;
      } else if (diffInMinutes < 1440) { // Less than 24 hours
        return date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
      } else if (diffInMinutes < 2880) { // Less than 48 hours
        return 'Yesterday';
      } else {
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
      }
    } catch (error) {
      console.error('Error formatting last message time:', error);
      return '';
    }
  };

  const formatLastSeen = (timestamp: any) => {
    if (!timestamp) return '';
    
    try {
      const date = timestamp.toDate();
      const now = new Date();
      const diffInMinutes = (now.getTime() - date.getTime()) / (1000 * 60);
      
      if (diffInMinutes < 1) {
        return 'Just now';
      } else if (diffInMinutes < 60) {
        return `${Math.floor(diffInMinutes)}m ago`;
      } else if (diffInMinutes < 1440) { // Less than 24 hours
        return `Today at ${date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        })}`;
      } else if (diffInMinutes < 2880) { // Less than 48 hours
        return `Yesterday at ${date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        })}`;
      } else {
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    } catch (error) {
      console.error('Error formatting last seen time:', error);
      return '';
    }
  };

  const getLastMessageDisplay = (message: string, messageType?: string) => {
    if (!message) return 'No messages yet';
    
    if (messageType && messageType !== 'text') {
      switch (messageType) {
        case 'image':
          return '📷 Image';
        case 'video':
          return '🎥 Video';
        case 'audio':
          return '🎵 Audio';
        case 'document':
          return '📄 Document';
        case 'voice':
          return '🎤 Voice Note';
        default:
          return message;
      }
    }
    
    return message;
  };

  const getAvatarGradient = (name: string) => {
    const gradients = [
  //     ['#FF9A9E', '#FAD0C4'], // Sunset Glow
  // ['#43CEA2', '#185A9D'], // Ocean Breeze
  // ['#DA22FF', '#9733EE'], // Purple Bliss
  // ['#FDC830', '#F37335'], // Mango Sunrise
  // ['#36D1DC', '#5B86E5'], // Blue Lagoon
  // ['#FF9966', '#FF5E62'], // Berry Smoothie
  // ['#00F260', '#0575E6'],
  ['#0d9488', '#10b981']
    ];
    const index = name.charCodeAt(0) % gradients.length;
    return gradients[index];
  };

  const renderChatItem = ({ item }: { item: ChatUser }) => {
    const [color1, color2] = getAvatarGradient(item.name);
    const isSelected = selectedChats.has(item.uid);
    
    return (
      <TouchableOpacity 
        style={[
          styles.modernChatCard, 
          { 
            borderBottomColor: theme.colors.border, 
            borderBottomWidth: 1,
            backgroundColor: isSelected ? 'rgba(102, 126, 234, 0.1)' : 'transparent',
          }
        ]}
        onPress={() => {
          if (isSelectionMode) {
            toggleChatSelection(item.uid);
          } else {
            startChat(item);
          }
        }}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.7}
      >
        {/* Selection Checkbox */}
        {isSelectionMode && (
          <View style={styles.selectionCheckbox}>
            <View style={[
              styles.checkbox,
              { 
                backgroundColor: isSelected ? '#667eea' : 'transparent',
                borderColor: isSelected ? '#667eea' : theme.colors.border,
              }
            ]}>
              {isSelected && (
                <Ionicons name="checkmark" size={16} color="#ffffff" />
              )}
            </View>
          </View>
        )}

        <View style={styles.chatAvatarContainer}>
          {item.profileImageUrl ? (
            <View style={styles.profileImageContainer}>
              <Image source={{ uri: item.profileImageUrl }} style={styles.profileImage} />
            </View>
          ) : (
            <LinearGradient
              colors={[color1, color2]}
              style={styles.modernChatAvatar}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={[styles.modernChatAvatarText, { color: '#000' }]}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
          )}
          
          {/* Pin indicator */}
          {item.isPinned && (
            <View style={styles.pinIndicator}>
              <Ionicons name="pin" size={12} color="#FFD700" />
            </View>
          )}
        </View>
        
        <View style={[styles.modernChatInfo]}>
          <View style={[styles.modernChatHeader]}>
            <View style={[styles.nameAndStatus]}>
              <Text style={[styles.modernChatName, { color: theme.colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {/* Status indicators */}
              <View style={styles.statusIndicators}>
                {item.isMuted && (
                  <Ionicons name="volume-mute" size={14} color={theme.colors.textTertiary} />
                )}
                {item.isFavorite && (
                  <Ionicons name="heart" size={14} color="#ff6b6b" />
                )}
              </View>
            </View>
            <Text style={[styles.modernChatTime, { color: theme.colors.textSecondary }]}>
              {formatLastMessageTime(item.lastMessageTime)}
            </Text>
          </View>
          
          {/* Online status and typing indicator */}
          {item.isTyping ? (
            <View style={styles.typingIndicator}>
              <Text style={[styles.typingText, { color: theme.colors.primary }]}>
                typing...
              </Text>
              <View style={styles.typingDots}>
                <View style={[styles.typingDot, { backgroundColor: theme.colors.primary }]} />
                <View style={[styles.typingDot, { backgroundColor: theme.colors.primary }]} />
                <View style={[styles.typingDot, { backgroundColor: theme.colors.primary }]} />
              </View>
            </View>
          ) : (
            <Text 
              style={[
                styles.modernLastMessage, 
                { 
                  color: item.isMuted ? theme.colors.textTertiary : theme.colors.textSecondary,
                  fontStyle: item.isMuted ? 'italic' : 'normal',
                }
              ]}
              numberOfLines={1}
            >
              {getLastMessageDisplay(item.lastMessage, item.lastMessageType)}
            </Text>
          )}
          
          {/* Online status and last seen */}
          <View style={styles.statusRow}>
            {item.isOnline ? (
              <View style={styles.onlineIndicator}>
                <View style={[styles.onlineDot, { backgroundColor: '#10b981' }]} />
                <Text style={[styles.statusText, { color: '#10b981' }]}>online</Text>
              </View>
            ) : (
              <Text style={[styles.statusText, { color: theme.colors.textTertiary }]}>
                {item.lastSeen ? `last seen ${formatLastSeen(item.lastSeen)}` : 'offline'}
              </Text>
            )}
          </View>
        </View>
        
        {item.unreadCount > 0 && !item.isMuted && (
          <View style={styles.modernUnreadBadge}>
            <LinearGradient
              colors={[color1, color2]}
              style={styles.unreadBadgeGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.modernUnreadCount}>
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
              </Text>
            </LinearGradient>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Loading chats...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Modern Header */}
      <View style={[styles.modernHeader, { backgroundColor: theme.colors.surface }]}>
        <LinearGradient
          colors={theme.isDark ? ['#1a1a2e', '#16213e'] : ['#0d9488', '#10b981']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>
                {isSelectionMode ? `${selectedChats.size} selected` : 'Chats'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {isSelectionMode 
                  ? 'Select actions for the chosen chats'
                  : chatUsers.length > 0 
                    ? `${chatUsers.length} conversation${chatUsers.length !== 1 ? 's' : ''}` 
                    : 'Start your first conversation'
                }
              </Text>
            </View>
            
            {isSelectionMode ? (
              <View style={styles.selectionActions}>
                
                {
                  showActionMenu ? (
                    <TouchableOpacity 
                  style={styles.headerActionButton}
                  onPress={clearSelection}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
                  ) : (
                    <TouchableOpacity 
                  style={styles.headerActionButton}
                  onPress={() => setShowActionMenu(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="ellipsis-vertical" size={20} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
                  )
                }
                
              </View>
            ) : (
              <TouchableOpacity 
                style={styles.headerActionButton}
                onPress={() => router.push('/(tabs)/contacts')}
                activeOpacity={0.7}
              >
                <Ionicons name="person-add" size={20} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.modernSearchContainer, { 
          backgroundColor: theme.colors.card,
          borderColor: searchQuery ? theme.colors.border : theme.colors.border,
        }]}>
          <Ionicons 
            name="search" 
            size={18} 
            color={searchQuery ? theme.colors.textTertiary : theme.colors.textTertiary} 
          />
          <TextInput
            style={[styles.modernSearchInput, { color: theme.colors.text }]}
            placeholder="Search conversations..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={theme.colors.textTertiary}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity 
              onPress={() => setSearchQuery('')}
              style={styles.searchClearButton}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={16} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        </LinearGradient>
      </View>

      {/* Modern Search Bar */}
      {/* <View style={[styles.searchSection, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.modernSearchContainer, { 
          backgroundColor: theme.colors.card,
          borderColor: searchQuery ? '#667eea' : theme.colors.border,
        }]}>
          <Ionicons 
            name="search" 
            size={18} 
            color={searchQuery ? '#667eea' : theme.colors.textTertiary} 
          />
          <TextInput
            style={[styles.modernSearchInput, { color: theme.colors.text }]}
            placeholder="Search conversations..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={theme.colors.textTertiary}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity 
              onPress={() => setSearchQuery('')}
              style={styles.searchClearButton}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={16} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View> */}

      {/* Modern Chat List */}
      {combinedFilteredChats.length > 0 ? (
        <FlatList
          data={combinedFilteredChats}
          renderItem={renderChatItem}
          keyExtractor={(item) => item.uid}
          style={styles.modernChatList}
          contentContainerStyle={styles.modernListContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#667eea']}
              tintColor={'#667eea'}
              progressBackgroundColor={theme.colors.surface}
            />
          }
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.chatSeparator} />}
        />
      ) : (
        <View style={styles.modernEmptyState}>
          <View style={[styles.emptyIconContainer, { backgroundColor: theme.colors.surface }]}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.primary} />
          </View>
          <Text style={[styles.emptyStateTitle, { color: theme.colors.text }]}>
            {searchQuery ? 'No chats found' : 'Start Chatting!'}
          </Text>
          <Text style={[styles.emptyStateSubtext, { color: theme.colors.textSecondary }]}>
            {searchQuery 
              ? 'Try adjusting your search terms'
              : 'Connect with your contacts and start meaningful conversations'
            }
          </Text>
          {!searchQuery && (
            <TouchableOpacity 
              style={styles.ctaButton}
              onPress={() => router.push('/(tabs)/contacts')}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#667eea', '#764ba2']}
                style={styles.ctaButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="people" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.ctaButtonText}>Find Contacts</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Floating refresh indicator */}
      {loading && chatUsers.length > 0 && (
        <View style={styles.floatingRefreshContainer}>
          <View style={[styles.floatingRefreshCard, { backgroundColor: theme.colors.card }]}>
            <ActivityIndicator size="small" color="#667eea" />
            <Text style={[styles.floatingRefreshText, { color: theme.colors.textSecondary }]}>
              Syncing chats...
            </Text>
          </View>
        </View>
      )}

      {/* Action Menu Modal */}
      <Modal
        visible={showActionMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActionMenu(false)}
      >
        <TouchableOpacity
          style={styles.actionMenuOverlay}
          activeOpacity={1}
          onPress={() => setShowActionMenu(false)}
        >
          <View style={[styles.actionMenu, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.actionMenuHeader}>
              <Text style={[styles.actionMenuTitle, { color: theme.colors.text }]}>
                Chat Actions
              </Text>
              <Text style={[styles.actionMenuSubtitle, { color: theme.colors.textSecondary }]}>
                {selectedChats.size} chat{selectedChats.size !== 1 ? 's' : ''} selected
              </Text>
            </View>
            
            <View style={styles.actionMenuContent}>
              {/* Pin/Unpin Action */}
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => {
                  const selectedChatUsers = chatUsers.filter(chat => selectedChats.has(chat.uid));
                  const hasUnpinnedChats = selectedChatUsers.some(chat => !chat.isPinned);
                  
                  if (hasUnpinnedChats) {
                    // Check if pinning would exceed limit
                    const currentPinnedCount = pinnedChats.length;
                    const unpinnedSelectedCount = selectedChatUsers.filter(chat => !chat.isPinned).length;
                    
                    if (currentPinnedCount + unpinnedSelectedCount > 3) {
                      Alert.alert('Pin Limit Reached', 'You can only pin a maximum of 3 chats at a time.');
                      return;
                    }
                  }
                  
                  // Toggle pin status for all selected chats
                  selectedChatUsers.forEach(chat => {
                    if (chat.chatId) {
                      togglePinChat(chat);
                    }
                  });
                  setShowActionMenu(false);
                  setIsSelectionMode(false);
                  setSelectedChats(new Set());
                }}
                activeOpacity={0.7}
              >
                <View style={styles.actionIcon}>
                  <Ionicons 
                    name={(() => {
                      const selectedChatUsers = chatUsers.filter(chat => selectedChats.has(chat.uid));
                      const hasPinnedChats = selectedChatUsers.some(chat => chat.isPinned);
                      const hasUnpinnedChats = selectedChatUsers.some(chat => !chat.isPinned);
                      
                      if (hasPinnedChats && hasUnpinnedChats) {
                        return 'pin';
                      } else if (hasPinnedChats) {
                        return 'pin-outline';
                      } else {
                        return 'pin';
                      }
                    })()} 
                    size={20} 
                    color="#FFD700" 
                  />
                </View>
                <Text style={[styles.actionText, { color: theme.colors.text }]}>
                  {(() => {
                    const selectedChatUsers = chatUsers.filter(chat => selectedChats.has(chat.uid));
                    const hasPinnedChats = selectedChatUsers.some(chat => chat.isPinned);
                    const hasUnpinnedChats = selectedChatUsers.some(chat => !chat.isPinned);
                    
                    if (hasPinnedChats && hasUnpinnedChats) {
                      return 'Pin/Unpin Chats';
                    } else if (hasPinnedChats) {
                      return 'Unpin Chats';
                    } else {
                      return 'Pin Chats';
                    }
                  })()}
                </Text>
              </TouchableOpacity>

              {/* Mute/Unmute Action */}
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => {
                  const selectedChatUsers = chatUsers.filter(chat => selectedChats.has(chat.uid));
                  selectedChatUsers.forEach(chat => {
                    if (chat.chatId) {
                      toggleMuteChat(chat);
                    }
                  });
                  setShowActionMenu(false);
                  setIsSelectionMode(false);
                  setSelectedChats(new Set());
                }}
                activeOpacity={0.7}
              >
                <View style={styles.actionIcon}>
                  <Ionicons 
                    name={(() => {
                      const selectedChatUsers = chatUsers.filter(chat => selectedChats.has(chat.uid));
                      const hasMutedChats = selectedChatUsers.some(chat => chat.isMuted);
                      const hasUnmutedChats = selectedChatUsers.some(chat => !chat.isMuted);
                      
                      if (hasMutedChats && hasUnmutedChats) {
                        return 'volume-mute';
                      } else if (hasMutedChats) {
                        return 'volume-high';
                      } else {
                        return 'volume-mute';
                      }
                    })()} 
                    size={20} 
                    color="#ff6b6b" 
                  />
                </View>
                <Text style={[styles.actionText, { color: theme.colors.text }]}>
                  {(() => {
                    const selectedChatUsers = chatUsers.filter(chat => selectedChats.has(chat.uid));
                    const hasMutedChats = selectedChatUsers.some(chat => chat.isMuted);
                    const hasUnmutedChats = selectedChatUsers.some(chat => !chat.isMuted);
                    
                    if (hasMutedChats && hasUnmutedChats) {
                      return 'Mute/Unmute Chats';
                    } else if (hasMutedChats) {
                      return 'Unmute Chats';
                    } else {
                      return 'Mute Chats';
                    }
                  })()}
                </Text>
              </TouchableOpacity>

              {/* Favorite/Unfavorite Action */}
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => {
                  const selectedChatUsers = chatUsers.filter(chat => selectedChats.has(chat.uid));
                  selectedChatUsers.forEach(chat => {
                    if (chat.chatId) {
                      toggleFavoriteChat(chat);
                    }
                  });
                  setShowActionMenu(false);
                  setIsSelectionMode(false);
                  setSelectedChats(new Set());
                  }}
                activeOpacity={0.7}
              >
                <View style={styles.actionIcon}>
                  <Ionicons 
                    name={(() => {
                      const selectedChatUsers = chatUsers.filter(chat => selectedChats.has(chat.uid));
                      const hasFavoriteChats = selectedChatUsers.some(chat => chat.isFavorite);
                      const hasUnfavoriteChats = selectedChatUsers.some(chat => !chat.isFavorite);
                      
                      if (hasFavoriteChats && hasUnfavoriteChats) {
                        return 'heart';
                      } else if (hasFavoriteChats) {
                        return 'heart-outline';
                      } else {
                        return 'heart';
                      }
                    })()} 
                    size={20} 
                    color="#ff6b6b" 
                  />
                </View>
                <Text style={[styles.actionText, { color: theme.colors.text }]}>
                  {(() => {
                    const selectedChatUsers = chatUsers.filter(chat => selectedChats.has(chat.uid));
                    const hasFavoriteChats = selectedChatUsers.some(chat => chat.isFavorite);
                    const hasUnfavoriteChats = selectedChatUsers.some(chat => !chat.isFavorite);
                    
                    if (hasFavoriteChats && hasUnfavoriteChats) {
                      return 'Favorite/Unfavorite Chats';
                    } else if (hasFavoriteChats) {
                      return 'Unfavorite Chats';
                    } else {
                      return 'Favorite Chats';
                    }
                  })()}
                </Text>
              </TouchableOpacity>

              {/* Delete Action */}
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => {
                  Alert.alert(
                    'Delete Chats',
                    `Are you sure you want to delete ${selectedChats.size} chat${selectedChats.size !== 1 ? 's' : ''}? This action cannot be undone.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          const selectedChatUsers = chatUsers.filter(chat => selectedChats.has(chat.uid));
                          for (const chat of selectedChatUsers) {
                            await deleteChat(chat);
                          }
                          setShowActionMenu(false);
                          setIsSelectionMode(false);
                          setSelectedChats(new Set());
                        },
                      },
                    ]
                  );
                }}
                activeOpacity={0.7}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name="trash" size={20} color="#ff4757" />
                </View>
                <Text style={[styles.actionText, { color: '#ff4757' }]}>
                  Delete Chats
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
  },

  // Modern header styles
  modernHeader: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  headerGradient: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  headerActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Modern search styles
  searchSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modernSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 2,
    borderWidth: 1.5,
    // shadowColor: '#667eea',
    // shadowOffset: { width: 0, height: 2 },
    // shadowOpacity: 0.1,
    // shadowRadius: 8,
    // elevation: 4,
    marginTop:10
  },
  modernSearchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
  },
  searchClearButton: {
    padding: 4,
  },

  // Modern chat list styles
  modernChatList: {
    flex: 1,
  },
  modernListContainer: {
    paddingHorizontal: 0,
    paddingVertical: 16,
  },
  chatSeparator: {
    height: 12,
  },

  // Modern chat card styles
  modernChatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 12,
    borderBottomWidth: 1,
  },
  chatAvatarContainer: {
    marginRight: 12,
    flexShrink: 0,
  },
  profileImageContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  modernChatAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernChatAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  modernChatInfo: {
    flex: 1,
  },
  modernChatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    width: '100%',
  },
  modernChatName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  modernChatTime: {
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 0,
    textAlign: 'right',
    minWidth: 50,
  },
  modernLastMessage: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '400',
  },

  // Modern unread badge
  modernUnreadBadge: {
    marginLeft: 8,
    flexShrink: 0,
  },
  unreadBadgeGradient: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  modernUnreadCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },

  // Modern empty state
  modernEmptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 30,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    opacity: 0.8,
  },
  ctaButton: {
    borderRadius: 16,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  ctaButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Floating refresh indicator
  floatingRefreshContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -60 }, { translateY: -20 }],
    zIndex: 100,
  },
  floatingRefreshCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingRefreshText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },

  // Selection mode styles
  selectionCheckbox: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 10,
    padding: 2,
    borderWidth: 1,
    borderColor: '#fff',
  },
  statusIndicators: {
    flexDirection: 'row',
    marginTop: 4,
    marginLeft: 4,
    flexShrink: 0,
  },
  nameAndStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  // Action Menu Modal Styles
  actionMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    zIndex: 1000,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  actionMenu: {
    width: '70%',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
    position: 'absolute',
    zIndex: 1000,
    top: 80,
    right: 20,
  },
  actionMenuHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  actionMenuTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  actionMenuSubtitle: {
    fontSize: 14,
  },
  actionMenuContent: {
    padding: 15,
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 12,
    marginBottom: 8,
  },
  actionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '500',
  },

  // Online status and typing indicator styles
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  typingText: {
    fontSize: 14,
    fontWeight: '500',
    marginRight: 8,
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 1,
    opacity: 0.7,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  onlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
