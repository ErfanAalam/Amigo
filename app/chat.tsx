import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import MediaMessage from '../components/MediaMessage';
import MediaPicker from '../components/MediaPicker';
import VoiceRecorder from '../components/VoiceRecorder';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FieldValue, firebaseStorage, firebaseFirestore as firestore } from '../firebaseConfig';
import { MediaFile, Message, VoiceNote } from '../types/MessageTypes';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

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
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingMessage, setUploadingMessage] = useState<string>('');
  const [showFullScreenMedia, setShowFullScreenMedia] = useState(false);
  const [fullScreenMedia, setFullScreenMedia] = useState<{uri: string, type: string, name?: string} | null>(null);
  
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
      if (chatId && userData?.uid) {
        markMessagesAsRead();
      }
      return () => {
        // Cleanup when screen loses focus
      };
    }, [chatId, userData?.uid])
  );

  const markMessagesAsRead = async () => {
    if (!chatId || !userData?.uid) return;

    try {
      const messagesRef = firestore
        .collection('chats')
        .doc(chatId)
        .collection('messages');

      const unreadMessages = await messagesRef
        .where('senderId', '!=', userData.uid)
        .get();

      const batch = firestore.batch();
      unreadMessages.forEach((doc) => {
        const messageData = doc.data();
        if (!messageData.readBy || !messageData.readBy.includes(userData.uid)) {
          batch.update(doc.ref, {
            readBy: FieldValue.arrayUnion(userData.uid),
            readAt: FieldValue.serverTimestamp(),
          });
        }
      });

      await batch.commit();
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

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

  const uploadMediaToStorage = async (mediaFile: MediaFile): Promise<string> => {
    try {
      const fileName = `media/${chatId}/${Date.now()}_${mediaFile.name}`;
      const reference = firebaseStorage.ref().child(fileName);
      
      const response = await fetch(mediaFile.uri);
      const blob = await response.blob();
      
      // Show upload progress
      const uploadTask = reference.put(blob);
      
      return new Promise((resolve, reject) => {
        uploadTask.on('state_changed', 
          (snapshot) => {
            // Track upload progress
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
            console.log('Upload progress:', progress);
          },
          (error) => {
            console.error('Upload error:', error);
            reject(error);
          },
          async () => {
            try {
              const downloadURL = await reference.getDownloadURL();
              resolve(downloadURL);
            } catch (error) {
              console.error('Error getting download URL:', error);
              reject(error);
            }
          }
        );
      });
    } catch (error) {
      console.error('Error uploading media:', error);
      throw new Error('Failed to upload media file');
    }
  };

  const sendMediaMessage = async (mediaFiles: MediaFile[]) => {
    if (!userData?.uid || !chatId || !userId || !userName) return;

    setUploadingMedia(true);
    setUploadProgress(0);
    setUploadingMessage(`Uploading ${mediaFiles.length} item${mediaFiles.length > 1 ? 's' : ''}...`);
    
    try {
      // Upload all media files
      const uploadPromises = mediaFiles.map(async (mediaFile) => {
        const mediaUrl = await uploadMediaToStorage(mediaFile);
        
        // Determine message type
        let messageType: Message['messageType'] = 'document';
        if (mediaFile.type.startsWith('image/')) {
          messageType = 'image';
        } else if (mediaFile.type.startsWith('video/')) {
          messageType = 'video';
        } else if (mediaFile.type.startsWith('audio/')) {
          messageType = 'audio';
        }

        return {
          messageType,
          mediaUrl,
          mediaName: mediaFile.name,
          mediaSize: mediaFile.size,
          mediaDuration: mediaFile.duration,
        };
      });

      const uploadedMedia = await Promise.all(uploadPromises);

      // Add all messages to chat
      const messagePromises = uploadedMedia.map(async (mediaData) => {
        return firestore
          .collection('chats')
          .doc(chatId)
          .collection('messages')
          .add({
            ...mediaData,
            senderId: userData.uid,
            senderName: userData.displayName || 'Unknown',
            timestamp: FieldValue.serverTimestamp(),
            isRead: false,
            readBy: [],
          });
      });

      await Promise.all(messagePromises);

      // Update chat metadata with the last media message
      const lastMedia = uploadedMedia[uploadedMedia.length - 1];
      const mediaText = lastMedia.messageType === 'image' ? '📷 Image' : 
                       lastMedia.messageType === 'video' ? '🎥 Video' : 
                       lastMedia.messageType === 'audio' ? '🎵 Audio' : '📄 Document';
      
      if (uploadedMedia.length > 1) {
        const mediaText = `📎 ${uploadedMedia.length} files`;
      }
      
      await firestore
        .collection('chats')
        .doc(chatId)
        .set({
          lastMessage: mediaText,
          lastMessageType: lastMedia.messageType,
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
      console.error('Error sending media messages:', error);
      Alert.alert('Error', 'Failed to send media messages');
    } finally {
      setUploadingMedia(false);
      setUploadProgress(0);
      setUploadingMessage('');
    }
  };

  const sendVoiceMessage = async (voiceNote: VoiceNote) => {
    if (!userData?.uid || !chatId || !userId || !userName) return;

    setUploadingMedia(true);
    setUploadProgress(0);
    setUploadingMessage('Uploading voice note...');
    
    try {
      // Upload voice note to Firebase Storage
      const fileName = `voice/${chatId}/${Date.now()}_voice.m4a`;
      const reference = firebaseStorage.ref().child(fileName);
      
      const response = await fetch(voiceNote.uri);
      const blob = await response.blob();
      
      // Track upload progress for voice notes
      const uploadTask = reference.put(blob);
      await new Promise((resolve, reject) => {
        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
          },
          (error) => reject(error),
          () => resolve(true)
        );
      });
      
      const mediaUrl = await reference.getDownloadURL();

      // Add message to chat
      await firestore
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .add({
          messageType: 'voice',
          mediaUrl,
          mediaName: 'Voice Note',
          mediaSize: voiceNote.size,
          mediaDuration: voiceNote.duration,
          senderId: userData.uid,
          senderName: userData.displayName || 'Unknown',
          timestamp: FieldValue.serverTimestamp(),
          isRead: false,
          readBy: [],
        });

      // Update chat metadata
      await firestore
        .collection('chats')
        .doc(chatId)
        .set({
          lastMessage: '🎤 Voice Note',
          lastMessageType: 'voice',
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
      console.error('Error sending voice message:', error);
      Alert.alert('Error', 'Failed to send voice message');
    } finally {
      setUploadingMedia(false);
      setUploadProgress(0);
      setUploadingMessage('');
    }
  };

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
          messageType: 'text',
          senderId: userData.uid,
          senderName: userData.displayName || 'Unknown',
          timestamp: FieldValue.serverTimestamp(),
          isRead: false,
          readBy: [],
        });

      // Update chat metadata
      await firestore
        .collection('chats')
        .doc(chatId)
        .set({
          lastMessage: messageText,
          lastMessageType: 'text',
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
        // ['#a8edea', '#fed6e3'],
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

  const handleMediaPress = (message: Message) => {
    if (message.mediaUrl && (message.messageType === 'image' || message.messageType === 'video')) {
      setFullScreenMedia({
        uri: message.mediaUrl,
        type: message.messageType,
        name: message.mediaName
      });
      setShowFullScreenMedia(true);
    }
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
        
        {isOwnMessage ? (
          <LinearGradient
            colors={theme.isDark ? ['#2C3E50', '#34495E'] : ['#667eea', '#764ba2']}
            style={[
              styles.modernMessageBubble,
              styles.ownMessageBubble,
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* Render media content if it's a media message */}
            {item.messageType !== 'text' && item.mediaUrl ? (
              <MediaMessage 
                message={item} 
                isOwnMessage={isOwnMessage}
                onMediaPress={() => handleMediaPress(item)}
              />
            ) : (
              <Text style={[
                styles.modernMessageText,
                { color: '#ffffff' }
              ]}>
                {item.text}
              </Text>
            )}
            
            <View style={styles.messageFooter}>
              <Text style={[
                styles.modernMessageTime,
                { color: '#ffffff' }
              ]}>
                {item.timestamp ? new Date(item.timestamp.toDate()).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                }) : ''}
              </Text>
              {isOwnMessage && (
                <View style={styles.messageStatus}>
                  <Ionicons 
                    name="checkmark-done" 
                    size={14} 
                    color={item.isRead ? '#4CAF50' : '#ffffff'} 
                    style={{ marginLeft: 4 }}
                  />
                  {item.isRead && (
                    <Text style={[styles.readStatus, { color: '#4CAF50' }]}>
                      Read
                    </Text>
                  )}
                </View>
              )}
            </View>
          </LinearGradient>
        ) : (
          <View style={[
            styles.modernMessageBubble,
            styles.otherMessageBubble,
            {
              backgroundColor: '#F5F5F5',
              borderColor: '#E0E0E0',
            }
          ]}>
            {/* Render media content if it's a media message */}
            {item.messageType !== 'text' && item.mediaUrl ? (
              <MediaMessage 
                message={item} 
                isOwnMessage={isOwnMessage}
                onMediaPress={() => handleMediaPress(item)}
              />
            ) : (
              <Text style={[
                styles.modernMessageText,
                { color: '#424242' }
              ]}>
                {item.text}
              </Text>
            )}
            
            <View style={styles.messageFooter}>
              <Text style={[
                styles.modernMessageTime,
                { color: '#757575' }
              ]}>
                {item.timestamp ? new Date(item.timestamp.toDate()).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                }) : ''}
              </Text>
            </View>
          </View>
        )}
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
          colors={theme.isDark ? ['#2C3E50', '#34495E'] : ['#667eea', '#764ba2']}
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
                <Ionicons name="arrow-back" size={22} color={theme.colors.onPrimary} />
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
                <Text style={[styles.modernHeaderName, { color: theme.colors.onPrimary }]}>{userName}</Text>
                <Text style={[styles.modernHeaderStatus, { color: theme.colors.onPrimary }]}>
                  {userPhone ? `${userPhone}` : 'Online'}
                </Text>
              </View>
            </View>
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

        {/* Uploading Media Indicator - Integrated in Input Container */}
        {uploadingMedia && (
          <View style={[styles.uploadingIndicator, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.uploadingContent}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.uploadingText, { color: theme.colors.textSecondary }]}>
                {uploadingMessage}
              </Text>
              <View style={styles.uploadingProgressContainer}>
                <View style={[styles.uploadingProgressBar, { backgroundColor: theme.colors.border }]}>
                  <View 
                    style={[
                      styles.uploadingProgressFill, 
                      { 
                        width: `${uploadProgress}%`,
                        backgroundColor: theme.colors.primary 
                      }
                    ]} 
                  />
                </View>
                <Text style={[styles.uploadingProgressText, { color: theme.colors.primary }]}>
                  {Math.round(uploadProgress)}%
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Modern Input Container */}
        <View style={[
          styles.modernInputContainer, 
          { 
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
          }
        ]}>
          <View style={[styles.inputWrapper, { 
            backgroundColor: theme.colors.inputBackground,
            borderColor: theme.colors.inputBorder,
          }]}>
            {/* Media Button */}
            <TouchableOpacity
              style={styles.mediaButton}
              onPress={() => setShowMediaPicker(true)}
              disabled={uploadingMedia}
            >
              <Ionicons 
                name="add-circle" 
                size={24} 
                color={uploadingMedia ? theme.colors.textSecondary : theme.colors.primary} 
              />
              {uploadingMedia && (
                <View style={styles.mediaButtonLoading}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                </View>
              )}
            </TouchableOpacity>

            {/* Voice Button */}
            <TouchableOpacity
              style={styles.voiceButton}
              onPress={() => setShowVoiceRecorder(true)}
              disabled={uploadingMedia}
            >
              <Ionicons 
                name="mic" 
                size={24} 
                color={uploadingMedia ? theme.colors.textSecondary : theme.colors.primary} 
              />
              {uploadingMedia && (
                <View style={styles.mediaButtonLoading}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                </View>
              )}
            </TouchableOpacity>

            <TextInput
              style={[
                styles.modernTextInput,
                { 
                  color: theme.colors.inputText,
                  backgroundColor: 'transparent',
                }
              ]}
              value={newMessage}
              onChangeText={(text) => {
                setNewMessage(text);
                setIsTyping(text.length > 0);
              }}
              placeholder="Type a message..."
              placeholderTextColor={theme.colors.inputPlaceholder}
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
              disabled={!newMessage.trim() || loading || uploadingMedia}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={newMessage.trim() ? ['#667eea', '#764ba2'] : [theme.colors.border, theme.colors.border]}
                style={styles.sendButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons 
                  name={loading ? "hourglass" : "send"} 
                  size={18} 
                  color={theme.colors.onPrimary} 
                />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Media Picker Modal */}
      <MediaPicker
        isVisible={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        onMediaSelected={sendMediaMessage}
        onVoiceRecorded={sendVoiceMessage}
        isUploading={uploadingMedia}
      />

      {/* Voice Recorder Modal */}
      <VoiceRecorder
        isVisible={showVoiceRecorder}
        onClose={() => setShowVoiceRecorder(false)}
        onVoiceRecorded={sendVoiceMessage}
        isUploading={uploadingMedia}
      />

      {/* Full Screen Media Modal */}
      <Modal
        visible={showFullScreenMedia}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFullScreenMedia(false)}
      >
        <View style={styles.fullScreenModal}>
          <TouchableOpacity 
            style={styles.fullScreenCloseButton}
            onPress={() => setShowFullScreenMedia(false)}
          >
            <Ionicons name="close" size={30} color="#ffffff" />
          </TouchableOpacity>
          
          {fullScreenMedia && (
            <>
              {fullScreenMedia.type === 'image' ? (
                <Image
                  source={{ uri: fullScreenMedia.uri }}
                  style={styles.fullScreenImage}
                  contentFit="contain"
                />
              ) : fullScreenMedia.type === 'video' ? (
                <View style={styles.fullScreenVideoContainer}>
                  <Ionicons name="play-circle" size={80} color="#ffffff" />
                  <Text style={styles.fullScreenVideoText}>Video Player Coming Soon</Text>
                </View>
              ) : null}
              
              {fullScreenMedia.name && (
                <Text style={styles.fullScreenMediaName}>{fullScreenMedia.name}</Text>
              )}
            </>
          )}
        </View>
      </Modal>


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
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
  },
  headerGradient: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modernBackButton: {
    marginRight: 16,
  },
  backButtonContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  modernHeaderInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  chatUserAvatar: {
    marginRight: 16,
  },
  headerAvatarGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  headerAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerTextContainer: {
    flex: 1,
  },
  modernHeaderName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modernHeaderStatus: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },

  // Chat body
  chatBody: {
    flex: 1,
  },
  modernMessagesList: {
    flex: 1,
  },
  modernMessagesContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    flexGrow: 1,
  },

  // Modern message styles
  modernMessageContainer: {
    flexDirection: 'row',
    marginVertical: 8,
    paddingHorizontal: 4,
  },
  ownMessage: {
    justifyContent: 'flex-end',
  },
  otherMessage: {
    justifyContent: 'flex-start',
  },
  senderAvatarContainer: {
    marginRight: 12,
    alignSelf: 'flex-end',
    marginBottom: 6,
  },
  senderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  senderAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  modernMessageBubble: {
    maxWidth: '78%',
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
  },
  ownMessageBubble: {
    borderBottomRightRadius: 8,
    marginLeft: 'auto',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 0,
  },
  otherMessageBubble: {
    borderBottomLeftRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  modernMessageText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  modernMessageTime: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.8,
  },
  messageStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  readStatus: {
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 6,
    opacity: 0.9,
  },

  // Modern input styles
  modernInputContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 28,
    paddingHorizontal: 6,
    paddingVertical: 6,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
  },
  mediaButton: {
    padding: 10,
    marginRight: 6,
    borderRadius: 20,
  },
  voiceButton: {
    padding: 10,
    marginRight: 6,
    borderRadius: 20,
  },
  modernTextInput: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '400',
    maxHeight: 120,
    minHeight: 24,
    lineHeight: 20,
  },
  modernSendButton: {
    marginLeft: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
  sendButtonGradient: {
    width: 46,
    height: 46,
    borderRadius: 23,
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

  // Full Screen Media Modal
  fullScreenModal: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenCloseButton: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 1,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  fullScreenImage: {
    width: screenWidth,
    height: screenHeight * 0.8,
  },
  fullScreenVideoContainer: {
    width: screenWidth,
    height: screenHeight * 0.8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenVideoText: {
    color: '#ffffff',
    fontSize: 18,
    marginTop: 20,
    fontWeight: '500',
  },
  fullScreenMediaName: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 20,
    textAlign: 'center',
    paddingHorizontal: 20,
  },



  // Uploading Indicator
  uploadingIndicator: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  uploadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 24,
  },
  uploadingText: {
    fontSize: 14,
    marginLeft: 16,
    flex: 1,
    fontWeight: '500',
  },
  uploadingProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  uploadingProgressBar: {
    width: 80,
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 3,
    marginRight: 8,
  },
  uploadingProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  uploadingProgressText: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 30,
  },

  // Upload Indicator for buttons
  uploadIndicator: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  
  // Media Button Loading Indicator
  mediaButtonLoading: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
});
