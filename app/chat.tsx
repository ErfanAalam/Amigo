import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FieldValue, firebaseFirestore as firestore } from '../firebaseConfig';

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: any;
}

export default function ChatPage() {
  const params = useLocalSearchParams();
  const userId = params.userId as string;
  const userName = params.userName as string;
  const userPhone = params.userPhone as string;
  const { userData } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 300);
    }
  }, [messages]);

  // Mark messages as read when screen is focused
  useFocusEffect(
    useCallback(() => {
      // Mark messages as read logic can be added here
      return () => {
        // Cleanup when screen loses focus
      };
    }, [chatId])
  );

  // Generate or find chat ID
  useEffect(() => {
    if (!userData?.uid || !userId) return;

    const generateChatId = () => {
      const ids = [userData.uid, userId].sort();
      return `${ids[0]}_${ids[1]}`;
    };

    const chatId = generateChatId();
    setChatId(chatId);

    // Initialize chat document if it doesn't exist
    const initializeChat = async () => {
      try {
        const chatDoc = await firestore.collection('chats').doc(chatId).get();
        if (!chatDoc.exists) {
          // Create initial chat document
          await firestore.collection('chats').doc(chatId).set({
            participants: [userData.uid, userId],
            participantNames: [userData.displayName || 'Unknown', userName || 'Unknown'],
            createdAt: FieldValue.serverTimestamp(),
            lastUpdated: FieldValue.serverTimestamp(),
          });
        }
      } catch (error) {
        console.error('Error initializing chat:', error);
      }
    };

    initializeChat();

    // Listen to messages
    const unsubscribe = firestore
      .collection('chats')
      .doc(chatId)
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .onSnapshot((snapshot) => {
        const messageList: Message[] = [];
        snapshot.forEach((doc) => {
          messageList.push({
            id: doc.id,
            ...doc.data(),
          } as Message);
        });
        setMessages(messageList);
      });

    return () => unsubscribe();
  }, [userData?.uid, userId, userData?.displayName, userName]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !userData?.uid || !chatId || !userId || !userName) return;

    const messageText = newMessage.trim();
    setNewMessage('');
    setLoading(true);
    setIsTyping(false);

    try {
      // Add message to chat
      await firestore
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .add({
          text: messageText,
          senderId: userData.uid,
          senderName: userData.displayName || 'Unknown',
          timestamp: FieldValue.serverTimestamp(),
        });

      // Update chat metadata
      await firestore
        .collection('chats')
        .doc(chatId)
        .set({
          lastMessage: messageText,
          lastMessageTime: FieldValue.serverTimestamp(),
          participants: [userData.uid, userId],
          participantNames: [userData.displayName || 'Unknown', userName || 'Unknown'],
          lastUpdated: FieldValue.serverTimestamp(),
        }, { merge: true });

      // Scroll to bottom after sending
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
      setNewMessage(messageText); // Restore message on error
    } finally {
      setLoading(false);
    }
  };

  const getAvatarGradient = (name: string) => {
    const gradients = [
        // ['#667eea', '#764ba2'],
        // ['#f093fb', '#f5576c'],
        // ['#4facfe', '#00f2fe'],
        // ['#43e97b', '#38f9d7'],
        // ['#fa709a', '#fee140'],
        ['#a8edea', '#fed6e3'],
        // ['#ffecd2', '#fcb69f'],
        // ['#ff8a80', '#ff7043'],
    ];
    const index = name.charCodeAt(0) % gradients.length;
    return gradients[index];
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwnMessage = item.senderId === userData?.uid;
    const [color1, color2] = getAvatarGradient(item.senderName || 'User');
    
    return (
      <View style={[
        styles.modernMessageContainer,
        isOwnMessage ? styles.ownMessage : styles.otherMessage
      ]}>
        {!isOwnMessage && (
          <View style={styles.senderAvatarContainer}>
            <LinearGradient
              colors={[color1, color2]}
              style={styles.senderAvatar}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={[styles.senderAvatarText, { color: '#000' }]}>
                {item.senderName?.charAt(0)?.toUpperCase() || 'U'}
              </Text>
            </LinearGradient>
          </View>
        )}
        
        <View style={[
          styles.modernMessageBubble,
          isOwnMessage ? styles.ownMessageBubble : styles.otherMessageBubble,
          {
            backgroundColor: isOwnMessage ? theme.colors.primary : theme.colors.card,
            borderColor: isOwnMessage ? 'transparent' : theme.colors.border,
          }
        ]}>
          <Text style={[
            styles.modernMessageText,
            { color: isOwnMessage ? '#000' : theme.colors.text }
          ]}>
            {item.text}
          </Text>
          <View style={styles.messageFooter}>
            <Text style={[
              styles.modernMessageTime,
              { color: theme.colors.textSecondary }
            ]}>
              {item.timestamp ? new Date(item.timestamp.toDate()).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              }) : ''}
            </Text>
            {isOwnMessage && (
              <Ionicons 
                name="checkmark-done" 
                size={14} 
                color='#000' 
                style={{ marginLeft: 4 }}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  if (!userData?.uid || !userId) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.errorText, { color: theme.colors.text }]}>
          Loading chat...
        </Text>
      </View>
    );
  }

  if (!chatId) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.errorText, { color: theme.colors.text }]}>
          Initializing chat...
        </Text>
      </View>
    );
  }

  const [headerColor1, headerColor2] = getAvatarGradient(userData?.displayName || 'User');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Modern Header with Gradient */}
      <View style={styles.modernHeader}>
        <LinearGradient 
          colors={theme.isDark ? ['#1a1a2e', '#16213e'] : [headerColor1, headerColor2]}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity 
              onPress={() => router.back()} 
              style={styles.modernBackButton}
              activeOpacity={0.7}
            >
              <View style={styles.backButtonContainer}>
                <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
              </View>
            </TouchableOpacity>
            
            <View style={styles.modernHeaderInfo}>
              <View style={styles.chatUserAvatar}>
                <LinearGradient
                  colors={[headerColor1, headerColor2]}
                  style={styles.headerAvatarGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={[styles.headerAvatarText, { color: '#000' }]}>
                    {userName?.charAt(0)?.toUpperCase() || 'U'}
                  </Text>
                </LinearGradient>
              </View>
              <View style={styles.headerTextContainer}>
                <Text style={[styles.modernHeaderName, { color: theme.colors.text }]}>{userName}</Text>
                <Text style={[styles.modernHeaderStatus, { color: theme.colors.textSecondary }]}>
                  {userPhone ? `${userPhone}` : 'Online'}
                </Text>
              </View>
            </View>

            {/* <TouchableOpacity 
              style={styles.headerActionButton}
              activeOpacity={0.7}
            >
              <Ionicons name="call" size={20} color={theme.colors.text} />
            </TouchableOpacity> */}
          </View>
        </LinearGradient>
      </View>

      {/* Messages and Input with proper keyboard handling */}
      <KeyboardAvoidingView 
        style={styles.chatBody}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          style={styles.modernMessagesList}
          contentContainerStyle={styles.modernMessagesContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (flatListRef.current && messages.length > 0) {
              flatListRef.current.scrollToEnd({ animated: true });
            }
          }}
          onLayout={() => {
            if (flatListRef.current && messages.length > 0) {
              flatListRef.current.scrollToEnd({ animated: false });
            }
          }}
        />

        {/* Modern Input Container */}
        <View style={[
          styles.modernInputContainer, 
          { 
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
          }
        ]}>
          <View style={[styles.inputWrapper, { backgroundColor: theme.colors.card }]}>
            <TextInput
              style={[
                styles.modernTextInput,
                { 
                  color: theme.colors.text,
                  backgroundColor: theme.colors.card,
                }
              ]}
              value={newMessage}
              onChangeText={(text) => {
                setNewMessage(text);
                setIsTyping(text.length > 0);
              }}
              placeholder="Type a message..."
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              maxLength={1000}
              textAlignVertical="top"
            />
            
            <TouchableOpacity
              style={[
                styles.modernSendButton,
                { opacity: newMessage.trim() ? 1 : 0.6 }
              ]}
              onPress={sendMessage}
              disabled={!newMessage.trim() || loading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={newMessage.trim() ? [headerColor1, headerColor2] : [theme.colors.border, theme.colors.border]}
                style={styles.sendButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons 
                  name={loading ? "hourglass" : "send"} 
                  size={18} 
                  color="#ffffff" 
                />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Main container
  container: {
    flex: 1,
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
    paddingTop: 40,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modernBackButton: {
    marginRight: 12,
  },
  backButtonContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernHeaderInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatUserAvatar: {
    marginRight: 12,
  },
  headerAvatarGradient: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  headerAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerTextContainer: {
    flex: 1,
  },
  modernHeaderName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
  },
  modernHeaderStatus: {
    fontSize: 13,
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

  // Chat body
  chatBody: {
    flex: 1,
  },
  modernMessagesList: {
    flex: 1,
  },
  modernMessagesContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    flexGrow: 1,
  },

  // Modern message styles
  modernMessageContainer: {
    flexDirection: 'row',
    marginVertical: 6,
    paddingHorizontal: 4,
  },
  ownMessage: {
    justifyContent: 'flex-end',
  },
  otherMessage: {
    justifyContent: 'flex-start',
  },
  senderAvatarContainer: {
    marginRight: 8,
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  senderAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  senderAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  modernMessageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  ownMessageBubble: {
    borderBottomRightRadius: 6,
    marginLeft: 'auto',
  },
  otherMessageBubble: {
    borderBottomLeftRadius: 6,
    borderWidth: 1,
  },
  modernMessageText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  modernMessageTime: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Modern input styles
  modernInputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 34 : 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 25,
    paddingHorizontal: 4,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  modernTextInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '400',
    maxHeight: 120,
    minHeight: 20,
  },
  modernSendButton: {
    marginLeft: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  sendButtonGradient: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Error states
  errorText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    fontWeight: '500',
  },
});
