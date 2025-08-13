// app/(tabs)/home.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { firebaseFirestore as firestore } from '../../firebaseConfig';

interface ChatUser {
  uid: string;
  name: string;
  phoneNumber: string;
  lastMessage: string;
  lastMessageType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'voice';
  lastMessageTime: any;
  unreadCount: number;
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
          return 0;
        }
      });

      setChatUsers(chatList);
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
              return 0;
            }
          });

          setChatUsers(chatList);
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

  const filteredChatUsers = chatUsers.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.phoneNumber.includes(searchQuery)
  );

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
      ['#667eea', '#764ba2'],
      ['#f093fb', '#f5576c'],
      ['#4facfe', '#00f2fe'],
      ['#43e97b', '#38f9d7'],
      ['#fa709a', '#fee140'],
      ['#a8edea', '#fed6e3'],
      ['#ffecd2', '#fcb69f'],
      ['#ff8a80', '#ff7043'], 
    ];
    const index = name.charCodeAt(0) % gradients.length;
    return gradients[index];
  };

  const renderChatItem = ({ item }: { item: ChatUser }) => {
    const [color1, color2] = getAvatarGradient(item.name);
    
    return (
      <TouchableOpacity 
        style={[styles.modernChatCard, { backgroundColor: theme.colors.card }]}
        onPress={() => startChat(item)}
        activeOpacity={0.7}
      >
        <View style={styles.chatAvatarContainer}>
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
          {/* Online indicator can be added here if needed */}
        </View>
        
        <View style={styles.modernChatInfo}>
          <View style={styles.modernChatHeader}>
            <Text style={[styles.modernChatName, { color: theme.colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.modernChatTime, { color: theme.colors.textSecondary }]}>
              {formatLastMessageTime(item.lastMessageTime)}
            </Text>
          </View>
          <Text 
            style={[styles.modernLastMessage, { color: theme.colors.textSecondary }]}
            numberOfLines={1}
          >
            {getLastMessageDisplay(item.lastMessage, item.lastMessageType)}
          </Text>
        </View>
        
        {item.unreadCount > 0 && (
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
          colors={theme.isDark ? ['#1a1a2e', '#16213e'] : ['#667eea', '#764ba2']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>Chats</Text>
              <Text style={styles.headerSubtitle}>
                {chatUsers.length > 0 
                  ? `${chatUsers.length} conversation${chatUsers.length !== 1 ? 's' : ''}` 
                  : 'Start your first conversation'
                }
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.headerActionButton}
              onPress={() => router.push('/(tabs)/contacts')}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add" size={20} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {/* Modern Search Bar */}
      <View style={[styles.searchSection, { backgroundColor: theme.colors.background }]}>
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
      </View>

      {/* Modern Chat List */}
      {filteredChatUsers.length > 0 ? (
        <FlatList
          data={filteredChatUsers}
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
    paddingVertical: 12,
    borderWidth: 1.5,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
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
    paddingHorizontal: 20,
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
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  chatAvatarContainer: {
    marginRight: 12,
  },
  modernChatAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
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
  },
  modernLastMessage: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '400',
  },

  // Modern unread badge
  modernUnreadBadge: {
    marginLeft: 8,
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
});
