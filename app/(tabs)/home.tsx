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
import CustomAlert from '../../components/CustomAlert';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { FieldValue, firebaseFirestore as firestore } from '../../firebaseConfig';
import LocationService from '../../utils/LocationService';

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

  // Custom Alert state
  const [customAlert, setCustomAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    onConfirm?: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });



  const fetchChatHistory = useCallback(async () => {
    if (!userData?.uid) {
      setLoading(true);
      return;
    }

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

          // Get chat metadata for pin, mute, favorite, and delete status
          const chatMetadata = chatData.metadata?.[userData.uid] || {};
          const isPinned = chatMetadata.isPinned || false;
          const isMuted = chatMetadata.isMuted || false;
          const isFavorite = chatMetadata.isFavorite || false;
          const isDeletedFor = chatMetadata.deletedFor || false;

          // Skip chats that are marked as deleted for the current user
          if (isDeletedFor) {
            continue;
          }

          // Get unread message count for this chat
          let unreadCount = 0;
          try {
            const messagesSnapshot = await firestore
              .collection('chats')
              .doc(chatDoc.id)
              .collection('messages')
              .where('senderId', '==', otherUserId)
              .where('readBy', 'not-in', [[userData.uid]])
              .get();

            unreadCount = messagesSnapshot.size;
          } catch (error) {
            console.error('Error fetching unread count for chat:', chatDoc.id, error);
            unreadCount = 0;
          }

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
                unreadCount,
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
              unreadCount,
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
      showCustomAlert('Error', 'Failed to load chat history', 'error');
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
    if (!userData?.uid) {
      setLoading(true);
      return;
    }

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

              // Get chat metadata for pin, mute, favorite, and delete status
              const chatMetadata = chatData.metadata?.[userData.uid] || {};
              const isPinned = chatMetadata.isPinned || false;
              const isMuted = chatMetadata.isMuted || false;
              const isFavorite = chatMetadata.isFavorite || false;
              const isDeletedFor = chatMetadata.deletedFor || false;

              // Skip chats that are marked as deleted for the current user
              if (isDeletedFor) {
                continue;
              }

              // Get unread message count for this chat
              let unreadCount = 0;
              try {
                const messagesSnapshot = await firestore
                  .collection('chats')
                  .doc(chatDoc.id)
                  .collection('messages')
                  .where('senderId', '==', otherUserId)
                  .where('readBy', 'not-in', [[userData.uid]])
                  .get();

                unreadCount = messagesSnapshot.size;
              } catch (error) {
                console.error('Error fetching unread count for chat:', chatDoc.id, error);
                unreadCount = 0;
              }

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
                    unreadCount,
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
                  unreadCount,
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
          const userDataFromDoc = doc.data();
          if (doc.id !== userData?.uid) {
            // Update individual user status without flickering
            const isOnline = userDataFromDoc?.isOnline || false;
            const lastSeen = userDataFromDoc?.lastSeen || null;

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

  // Listen to message changes to update unread counts in real-time
  useEffect(() => {
    if (!userData?.uid) return;

    const unsubscribeMessages = firestore
      .collection('chats')
      .where('participants', 'array-contains', userData.uid)
      .onSnapshot(async (snapshot) => {
        // Update unread counts for each chat
        for (const chatDoc of snapshot.docs) {
          const chatData = chatDoc.data();
          const participants = chatData.participants || [];

          // Find the other participant (not current user)
          const otherParticipantIndex = participants.findIndex((uid: string) => uid !== userData.uid);
          if (otherParticipantIndex !== -1) {
            const otherUserId = participants[otherParticipantIndex];

            try {
              // Get current unread count for this chat
              const messagesSnapshot = await firestore
                .collection('chats')
                .doc(chatDoc.id)
                .collection('messages')
                .where('senderId', '==', otherUserId)
                .where('readBy', 'not-in', [[userData.uid]])
                .get();

              const unreadCount = messagesSnapshot.size;

              // Update unread count in all state arrays
              setChatUsers(prevUsers =>
                prevUsers.map(user =>
                  user.chatId === chatDoc.id ? { ...user, unreadCount } : user
                )
              );

              setPinnedChats(prevPinned =>
                prevPinned.map(user =>
                  user.chatId === chatDoc.id ? { ...user, unreadCount } : user
                )
              );

              setUnpinnedChats(prevUnpinned =>
                prevUnpinned.map(user =>
                  user.chatId === chatDoc.id ? { ...user, unreadCount } : user
                )
              );
            } catch (error) {
              console.error('Error updating unread count for chat:', chatDoc.id, error);
            }
          }
        }
      });

    return () => unsubscribeMessages();
  }, [userData?.uid]);

  // Note: Online status is now managed at app level in AuthContext
  // No need to update online status here



  // Refresh data when user returns to this screen
  useFocusEffect(
    useCallback(() => {
      if (userData?.uid) {
        fetchChatHistory();
        // Ensure location tracking is active when returning to home
        LocationService.startLocationTracking(userData.uid);
      } else {
        setLoading(true);
      }
    }, [userData?.uid, fetchChatHistory])
  );

  // Initial data loading
  useEffect(() => {
    if (userData?.uid) {
      fetchChatHistory();
      // Start location tracking when user navigates to home
      LocationService.startLocationTracking(userData.uid);
    } else {
      // setLoading(true);
    }
  }, [userData?.uid, fetchChatHistory]);

  // Custom Alert functions
  const showCustomAlert = (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning', onConfirm?: () => void) => {
    setCustomAlert({
      visible: true,
      title,
      message,
      type,
      onConfirm,
    });
  };

  const hideCustomAlert = () => {
    setCustomAlert({
      visible: false,
      title: '',
      message: '',
      type: 'info',
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchChatHistory();
    setRefreshing(false);
  };

  const startChat = async (chatUser: ChatUser) => {
    // Mark messages as read when entering chat
    if (chatUser.chatId && chatUser.unreadCount > 0) {
      try {
        const messagesRef = firestore
          .collection('chats')
          .doc(chatUser.chatId)
          .collection('messages');

        const unreadMessages = await messagesRef
          .where('senderId', '==', chatUser.uid)
          .where('readBy', 'not-in', [[userData?.uid]])
          .get();

        if (!unreadMessages.empty) {
          const batch = firestore.batch();
          unreadMessages.forEach((doc) => {
            batch.update(doc.ref, {
              readBy: FieldValue.arrayUnion(userData?.uid),
              readAt: FieldValue.serverTimestamp(),
            });
          });
          await batch.commit();
        }
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    }

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
        showCustomAlert('Pin Limit Reached', 'You can only pin a maximum of 3 chats at a time.', 'warning');
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
      showCustomAlert('Error', 'Failed to update pin status', 'error');
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
      showCustomAlert('Error', 'Failed to update mute status', 'error');
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
      showCustomAlert('Error', 'Failed to update favorite status', 'error');
    }
  };

  const deleteChat = async (chatUser: ChatUser) => {
    if (!chatUser.chatId || !userData?.uid) return;

    showCustomAlert(
      'Delete Chat',
      `Are you sure you want to delete your chat with ${chatUser.name}? This action cannot be undone.`,
      'warning',
      async () => {
            try {
              // Mark chat as deleted for the current user (soft delete)
              await firestore.collection('chats').doc(chatUser.chatId).update({
                [`metadata.${userData.uid}.deletedFor`]: true,
                [`metadata.${userData.uid}.deletedAt`]: FieldValue.serverTimestamp(),
              });

              // Mark all messages in this chat as deleted for the current user
              const messagesSnapshot = await firestore
                .collection('chats')
                .doc(chatUser.chatId)
                .collection('messages')
                .get();

              const batch = firestore.batch();
              messagesSnapshot.forEach((doc) => {
                batch.update(doc.ref, {
                  deletedFor: FieldValue.arrayUnion(userData.uid),
                  deletedAt: FieldValue.serverTimestamp(),
                });
              });

              await batch.commit();

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

              // Alert.alert('Success', 'Chat deleted successfully');
            } catch (error) {
              console.error('Error deleting chat:', error);
              // Alert.alert('Error', 'Failed to delete chat');
            }
      }
    );
  };

  const restoreChat = async (chatUser: ChatUser) => {
    if (!chatUser.chatId || !userData?.uid) return;

    showCustomAlert(
      'Restore Chat',
      `Are you sure you want to restore your chat with ${chatUser.name}? This will restore all deleted messages.`,
      'warning',
      async () => {
            try {
              // Mark chat as not deleted for the current user (restore)
              await firestore.collection('chats').doc(chatUser.chatId).update({
                [`metadata.${userData.uid}.deletedFor`]: false,
                [`metadata.${userData.uid}.deletedAt`]: FieldValue.delete(),
              });

              // Restore all messages in this chat for the current user
              const messagesSnapshot = await firestore
                .collection('chats')
                .doc(chatUser.chatId)
                .collection('messages')
                .get();

              const batch = firestore.batch();
              messagesSnapshot.forEach((doc) => {
                batch.update(doc.ref, {
                  deletedFor: FieldValue.arrayRemove(userData.uid),
                  deletedAt: FieldValue.delete(),
                });
              });

              await batch.commit();

              // Refresh the chat list to show the restored chat
              fetchChatHistory();

              // Alert.alert('Success', `Chat with ${chatUser.name} restored successfully!`);
            } catch (error) {
              console.error('Error restoring chat:', error);
              showCustomAlert('Error', 'Failed to restore chat', 'error');
            }
      }
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

  // Calculate total unread messages
  const totalUnreadMessages = chatUsers.reduce((total, chat) => total + chat.unreadCount, 0);

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
          {item.isOnline && (
            <View style={styles.onlineStatusIndicator} />
          )}
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
            <View style={styles.modernChatTimeContainer}>
              <Text style={[styles.modernChatTime, { color: theme.colors.textSecondary }]}>
                {formatLastMessageTime(item.lastMessageTime)}
              </Text>
              {item.unreadCount > 0 && (
                <View style={[
                  styles.modernUnreadBadge,
                  item.isMuted && styles.mutedUnreadBadge
                ]}>
                  <LinearGradient
                    colors={item.isMuted ? ['#6b7280', '#9ca3af'] : [color1, color2]}
                    style={styles.unreadBadgeGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Text style={[
                      styles.modernUnreadCount,
                      item.isMuted && styles.mutedUnreadCount
                    ]}>
                      {item.unreadCount > 99 ? '99+' : item.unreadCount}
                    </Text>
                  </LinearGradient>
                </View>
              )}
            </View>
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
                  color: item.isMuted ? theme.colors.textTertiary :
                    item.unreadCount > 0 ? theme.colors.text : theme.colors.textSecondary,
                  fontStyle: item.isMuted ? 'italic' : 'normal',
                  fontWeight: item.unreadCount > 0 ? '600' : '400'
                }
              ]}
              numberOfLines={1}
            >
              {getLastMessageDisplay(item.lastMessage, item.lastMessageType)}
            </Text>
          )}
        </View>


      </TouchableOpacity>
    );
  };

  if (loading || !userData?.uid) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
          {!userData?.uid ? 'Loading user data...' : 'Loading chats...'}
        </Text>
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
                {isSelectionMode ? `${selectedChats.size} selected` : 'Amigo Chats'}
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
                {/* Restore Button */}
                <TouchableOpacity
                  style={[styles.headerActionButton, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}
                  onPress={() => {
                    const selectedChatUsers = chatUsers.filter(chat => selectedChats.has(chat.uid));
                    Alert.alert(
                      'Restore Chats',
                      `Are you sure you want to restore ${selectedChats.size} chat${selectedChats.size !== 1 ? 's' : ''}? This will restore all deleted messages.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Restore',
                          style: 'default',
                          onPress: async () => {
                            for (const chat of selectedChatUsers) {
                              await restoreChat(chat);
                            }
                            setIsSelectionMode(false);
                            setSelectedChats(new Set());
                          },
                        },
                      ]
                    );
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh" size={20} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>

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
                      // Alert.alert('Pin Limit Reached', 'You can only pin a maximum of 3 chats at a time.');
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

              {/* Restore Action */}
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => {
                  Alert.alert(
                    'Restore Chats',
                    `Are you sure you want to restore ${selectedChats.size} chat${selectedChats.size !== 1 ? 's' : ''}? This will restore all deleted messages.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Restore',
                        style: 'default',
                        onPress: async () => {
                          const selectedChatUsers = chatUsers.filter(chat => selectedChats.has(chat.uid));
                          for (const chat of selectedChatUsers) {
                            await restoreChat(chat);
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
                  <Ionicons name="refresh" size={20} color="#10b981" />
                </View>
                <Text style={[styles.actionText, { color: '#10b981' }]}>
                  Restore Chats
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

      {/* Custom Alert */}
      <CustomAlert
        visible={customAlert.visible}
        title={customAlert.title}
        message={customAlert.message}
        type={customAlert.type}
        onConfirm={customAlert.onConfirm}
        onClose={hideCustomAlert}
        showCancelButton={customAlert.type === 'warning' && !!customAlert.onConfirm}
      />
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
    borderBottomRightRadius: 25,
    borderBottomLeftRadius: 25,
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
    position: 'relative',
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
    marginTop: 10
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
    // position: 'relative',
  },
  onlineStatusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    backgroundColor: '#10b981',
    borderRadius: 10,
    elevation: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    zIndex: 1000,
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
    position: 'relative',
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
    position: 'relative',
  },
  modernChatName: {
    fontSize: 14,
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
  modernChatTimeContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    gap:10,
  },
  modernLastMessage: {
    fontSize: 13,
    lineHeight: 18,
    // fontWeight: '400',
    marginRight: 40,
  },

  // Modern unread badge
  modernUnreadBadge: {
    marginLeft: 8,
    flexShrink: 0,
  },
  mutedUnreadBadge: {
    backgroundColor: 'rgba(107, 114, 128, 0.2)', // A muted background for muted chats
    borderColor: 'rgba(107, 114, 128, 0.5)',
    borderWidth: 1,
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
  mutedUnreadCount: {
    color: 'rgba(255,255,255,0.7)', // A muted text color for muted chats
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
    alignItems: 'center',
  },
  nameAndStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  unreadIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
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

  // Quick action buttons in selection mode
  quickActionButtons: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
    zIndex: 2,
  },
  quickActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  headerUnreadBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#ff4757',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  headerUnreadText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
