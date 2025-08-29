import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Animated,
  Clipboard,
  Dimensions,
  Easing,
  FlatList,
  ImageBackground,
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
// import CallButton from '../components/CallButton';
import DocumentViewer from '../components/DocumentViewer';
import MediaMessage from '../components/MediaMessage';
import MediaPicker from '../components/MediaPicker';
import PDFViewer from '../components/PDFViewer';
import VideoPlayer from '../components/VideoPlayer';
import VoiceRecorder from '../components/VoiceRecorder';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FieldValue, firebaseStorage, firebaseFirestore as firestore } from '../firebaseConfig';
import { MediaFile, Message, ReplyReference, VoiceNote } from '../types/MessageTypes';
import { MediaDownloader } from '../utils/MediaDownloader';
import { sendMessageNotification } from '../utils/sendNotification';

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
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingMessage, setUploadingMessage] = useState<string>('');
  const [showFullScreenMedia, setShowFullScreenMedia] = useState(false);
  const [fullScreenMedia, setFullScreenMedia] = useState<{ uri: string, type: string, name?: string } | null>(null);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [showPDFViewer, setShowPDFViewer] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<Message | null>(null);
  const [receiverProfileImage, setReceiverProfileImage] = useState<string | null>(null);
  const [pinnedMessage, setPinnedMessage] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<ReplyReference | null>(null);
  const [showContactsList, setShowContactsList] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
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

  // Typing indicator state
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll when new messages arrive
  // useEffect(() => {
  //   if (messages.length > 0) {
  //     setTimeout(() => {
  //       if (flatListRef.current) {
  //         flatListRef.current.scrollToEnd({ animated: true });
  //       }
  //     }, 300);
  //   }
  // }, [messages]);

  // Fetch receiver's profile image
  const fetchReceiverProfileImage = useCallback(async () => {
    if (!userId) return;

    try {
      const userDoc = await firestore.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        setReceiverProfileImage(userData?.profileImageUrl || null);
      }
    } catch (error) {
      console.error('Error fetching receiver profile image:', error);
    }
  }, [userId]);

  // Fetch pinned message
  const fetchPinnedMessage = useCallback(async () => {
    if (!chatId) return;

    try {
      const pinnedQuery = await firestore
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .where('isPinned', '==', true)
        .limit(1)
        .get();

      if (!pinnedQuery.empty) {
        const pinnedDoc = pinnedQuery.docs[0];
        setPinnedMessage({
          id: pinnedDoc.id,
          ...pinnedDoc.data(),
        } as Message);
      } else {
        setPinnedMessage(null);
      }
    } catch (error) {
      console.error('Error fetching pinned message:', error);
    }
  }, [chatId]);

  // Fetch contacts for forwarding
  const fetchContacts = useCallback(async () => {
    if (!userData?.uid) return;

    try {
      const chatsSnapshot = await firestore
        .collection('chats')
        .where('participants', 'array-contains', userData.uid)
        .get();

      const contactsList: any[] = [];
      chatsSnapshot.forEach((doc) => {
        const chatData = doc.data();
        const otherParticipantIndex = chatData.participants.findIndex((p: string) => p !== userData.uid);
        if (otherParticipantIndex !== -1) {
          contactsList.push({
            id: chatData.participants[otherParticipantIndex],
            name: chatData.participantNames[otherParticipantIndex],
            chatId: doc.id,
          });
        }
      });

      setContacts(contactsList);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    }
  }, [userData?.uid]);

  const markMessagesAsRead = useCallback(async () => {
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
  }, [chatId, userData?.uid]);

  // Initialize MediaDownloader and mark messages as read when screen is focused
  useFocusEffect(
    useCallback(() => {
      // Initialize MediaDownloader
      MediaDownloader.loadDownloadStates();

      // Fetch receiver's profile image
      fetchReceiverProfileImage();

      // Fetch pinned message
      fetchPinnedMessage();

      // Fetch contacts for forwarding
      fetchContacts();

      if (chatId && userData?.uid) {
        markMessagesAsRead();
      }
      return () => {
        // Cleanup when screen loses focus
      };
    }, [chatId, userData?.uid, fetchReceiverProfileImage, fetchPinnedMessage, fetchContacts, markMessagesAsRead])
  );

  // Typing indicator logic
  useEffect(() => {
    if (!chatId || !userData?.uid) return;

    // Listen to typing status changes
    const unsubscribeTyping = firestore
      .collection('chats')
      .doc(chatId)
      .onSnapshot((doc) => {
        const chatData = doc.data();
        if (chatData?.typingUsers) {
          const typingUser = Object.keys(chatData.typingUsers).find(
            (uid) => uid !== userData.uid && chatData.typingUsers[uid]
          );
          setOtherUserTyping(!!typingUser);
        }
      });

    return () => unsubscribeTyping();
  }, [chatId, userData?.uid]);

  // Update typing status when user types
  const updateTypingStatus = useCallback(async (typing: boolean) => {
    if (!chatId || !userData?.uid) return;

    try {
      await firestore
        .collection('chats')
        .doc(chatId)
        .update({
          [`typingUsers.${userData.uid}`]: typing,
        });
    } catch (error) {
      console.error('Error updating typing status:', error);
    }
  }, [chatId, userData?.uid]);

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

  // Handle text input changes for typing indicator
  const handleTextChange = (text: string) => {
    setNewMessage(text);

    // Clear existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    // Set typing to true if user is typing
    if (text.length > 0 && !isTyping) {
      setIsTyping(true);
      updateTypingStatus(true);
    }

    // Set a timeout to stop typing indicator
    const timeout = setTimeout(() => {
      setIsTyping(false);
      updateTypingStatus(false);
    }, 2000);

    setTypingTimeout(timeout);
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
      .orderBy('timestamp', 'desc')
      .onSnapshot((snapshot) => {
        const messageList: Message[] = [];
        snapshot.forEach((doc) => {
          const messageData = doc.data() as Message;

          // Filter out messages that the current user has deleted
          if (!messageData.deletedFor || !messageData.deletedFor.includes(userData.uid)) {
            messageList.push({
              ...messageData,
              id: doc.id,
            } as Message);
          }
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

        // Debug logging
        // console.log('MediaFile details:', {
        //   name: mediaFile.name,
        //   type: mediaFile.type,
        //   size: mediaFile.size
        // });

        // Determine message type
        let messageType: Message['messageType'] = 'document';
        if (mediaFile.type.startsWith('image/')) {
          messageType = 'image';
          // console.log('✅ Detected as IMAGE');
        } else if (mediaFile.type.startsWith('video/')) {
          messageType = 'video';
          // console.log('✅ Detected as VIDEO');
        } else if (mediaFile.type.startsWith('audio/')) {
          messageType = 'audio';
          // console.log('✅ Detected as AUDIO');
        } else {
          console.log('❌ Defaulting to DOCUMENT, type was:', mediaFile.type);
        }

        // console.log('Final messageType:', messageType);

        return {
          messageType,
          mediaUrl,
          mediaName: mediaFile.name,
          mediaSize: mediaFile.size || 0,
          ...(mediaFile.duration && { mediaDuration: mediaFile.duration }),
        };
      });

      const uploadedMedia = await Promise.all(uploadPromises);

      // Add all messages to chat
      const messagePromises = uploadedMedia.map(async (mediaData) => {
        // Clean the data to remove any undefined values
        const cleanMediaData = Object.fromEntries(
          Object.entries(mediaData).filter(([_, value]) => value !== undefined)
        );

        // console.log('Clean media data for Firebase:', cleanMediaData);

        return firestore
          .collection('chats')
          .doc(chatId)
          .collection('messages')
          .add({
            ...cleanMediaData,
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
      let mediaText = lastMedia.messageType === 'image' ? '📷 Image' :
        lastMedia.messageType === 'video' ? '🎥 Video' :
          lastMedia.messageType === 'audio' ? '🎵 Audio' : '📄 Document';

      if (uploadedMedia.length > 1) {
        mediaText = `📎 ${uploadedMedia.length} files`;
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

      // Send push notification to recipient for media message
      try {
        const lastMediaFile = uploadedMedia[uploadedMedia.length - 1];
        await sendMessageNotification(
          userId, // recipient user ID
          userData.displayName || 'Unknown', // sender name
          mediaText, // media description
          chatId, // chat ID
          lastMediaFile.messageType // message type
        );
        console.log('Push notification sent for media message');
      } catch (notificationError) {
        console.error('Error sending push notification for media:', notificationError);
        // Don't fail the media sending if notification fails
      }

      // Scroll to bottom after sending
      // setTimeout(() => {
      //   if (flatListRef.current) {
      //     flatListRef.current.scrollToEnd({ animated: true });
      //   }
      // }, 100);
    } catch (error) {
      console.error('Error sending media messages:', error);
      showCustomAlert('Error', 'Failed to send media messages', 'error');
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

      // Send push notification to recipient for voice note
      try {
        await sendMessageNotification(
          userId, // recipient user ID
          userData.displayName || 'Unknown', // sender name
          '🎤 Voice Note', // voice note description
          chatId, // chat ID
          'voice' // message type
        );
        console.log('Push notification sent for voice note');
      } catch (notificationError) {
        console.error('Error sending push notification for voice note:', notificationError);
        // Don't fail the voice note sending if notification fails
      }

      // Scroll to bottom after sending
      // setTimeout(() => {
      //   if (flatListRef.current) {
      //     flatListRef.current.scrollToEnd({ animated: true });
      //   }
      // }, 100);
    } catch (error) {
      console.error('Error sending voice message:', error);
      showCustomAlert('Error', 'Failed to send voice message', 'error');
    } finally {
      setUploadingMedia(false);
      setUploadProgress(0);
      setUploadingMessage('');
    }
  };

  // Message actions
  const copyMessage = async (message: Message) => {
    const textToCopy = message.text || `${message.messageType} message`;
    await Clipboard.setString(textToCopy);
    showCustomAlert('Copied', 'Message copied to clipboard', 'success');
  };

  const pinMessage = async (message: Message) => {
    if (!chatId || !userData?.uid) return;

    try {
      // First, unpin any existing pinned message
      if (pinnedMessage) {
        await firestore
          .collection('chats')
          .doc(chatId)
          .collection('messages')
          .doc(pinnedMessage.id)
          .update({
            isPinned: false,
            pinnedAt: FieldValue.delete(),
          });
      }

      // Pin the new message
      await firestore
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .doc(message.id)
        .update({
          isPinned: true,
          pinnedAt: FieldValue.serverTimestamp(),
          pinnedBy: userData.uid, // Track who pinned the message
        });

      // Update local state
      setPinnedMessage(message);
      showCustomAlert('Pinned', 'Message pinned successfully', 'success');
    } catch (error) {
      console.error('Error pinning message:', error);
      showCustomAlert('Error', 'Failed to pin message', 'error');
    }
  };

  const unpinMessage = async () => {
    if (!chatId || !pinnedMessage) return;

    try {
      await firestore
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .doc(pinnedMessage.id)
        .update({
          isPinned: false,
          pinnedAt: FieldValue.delete(),
          pinnedBy: FieldValue.delete(),
        });

      setPinnedMessage(null);
      showCustomAlert('Unpinned', 'Message unpinned successfully', 'success');
    } catch (error) {
      console.error('Error unpinning message:', error);
      showCustomAlert('Error', 'Failed to unpin message', 'error');
    }
  };

  const starMessage = async (message: Message) => {
    if (!chatId || !userData?.uid) return;

    try {
      const isCurrentlyStarred = message.starredBy?.includes(userData.uid);

      if (isCurrentlyStarred) {
        // Unstar the message
        await firestore
          .collection('chats')
          .doc(chatId)
          .collection('messages')
          .doc(message.id)
          .update({
            starredBy: FieldValue.arrayRemove(userData.uid),
            isStarred: false,
          });
        showCustomAlert('Unstarred', 'Message removed from starred', 'info');
      } else {
        // Star the message
        await firestore
          .collection('chats')
          .doc(chatId)
          .collection('messages')
          .doc(message.id)
          .update({
            starredBy: FieldValue.arrayUnion(userData.uid),
            starredAt: FieldValue.serverTimestamp(),
            isStarred: true,
          });
        showCustomAlert('Starred', 'Message added to starred', 'success');
      }
    } catch (error) {
      console.error('Error starring message:', error);
      showCustomAlert('Error', 'Failed to star message', 'error');
    }
  };

  const deleteMessage = async (message: Message) => {
    if (!chatId || !userData?.uid) return;

    // Show confirmation dialog
    const isOwnMessage = message.senderId === userData?.uid;
    showCustomAlert(
      'Delete Message',
      `Are you sure you want to delete this ${isOwnMessage ? 'message' : 'message from ' + message.senderName}? This action cannot be undone.`,
      'warning',
      async () => {
        try {
          // Instead of deleting the message, mark it as deleted for the user
          // This keeps it in the database for admin purposes
          await firestore
            .collection('chats')
            .doc(chatId)
            .collection('messages')
            .doc(message.id)
            .update({
              deletedFor: FieldValue.arrayUnion(userData.uid),
              deletedAt: FieldValue.serverTimestamp(),
            });

          showCustomAlert('Deleted', 'Message deleted successfully', 'success');
        } catch (error) {
          console.error('Error deleting message:', error);
          showCustomAlert('Error', 'Failed to delete message', 'error');
        }
      }
    );
  };

  const forwardMessage = async (targetChatId: string) => {
    if (!forwardingMessage || !userData?.uid) return;

    try {
      // Create the forwarded message
      const messageData: any = {
        senderId: userData.uid,
        senderName: userData.displayName || 'Unknown',
        timestamp: FieldValue.serverTimestamp(),
        isRead: false,
        readBy: [],
        messageType: forwardingMessage.messageType,
        forwardedFrom: {
          senderName: forwardingMessage.senderName,
          senderId: forwardingMessage.senderId,
        },
      };

      if (forwardingMessage.messageType === 'text') {
        messageData.text = forwardingMessage.text;
      } else {
        messageData.mediaUrl = forwardingMessage.mediaUrl;
        messageData.mediaName = forwardingMessage.mediaName;
        messageData.mediaSize = forwardingMessage.mediaSize;
        if (forwardingMessage.mediaDuration) {
          messageData.mediaDuration = forwardingMessage.mediaDuration;
        }
      }

      // Add message to target chat
      await firestore
        .collection('chats')
        .doc(targetChatId)
        .collection('messages')
        .add(messageData);

      // Update target chat metadata
      const lastMessage = forwardingMessage.messageType === 'text'
        ? forwardingMessage.text
        : `📎 ${forwardingMessage.messageType}`;

      await firestore
        .collection('chats')
        .doc(targetChatId)
        .update({
          lastMessage,
          lastMessageType: forwardingMessage.messageType,
          lastMessageTime: FieldValue.serverTimestamp(),
          lastUpdated: FieldValue.serverTimestamp(),
        });

      setForwardingMessage(null);
      setShowContactsList(false);
      showCustomAlert('Forwarded', 'Message forwarded successfully', 'success');
    } catch (error) {
      console.error('Error forwarding message:', error);
      showCustomAlert('Error', 'Failed to forward message', 'error');
    }
  };

  const replyToMessage = (message: Message) => {
    const replyRef: ReplyReference = {
      messageId: message.id,
      messageText: message.text,
      messageType: message.messageType,
      senderName: message.senderName,
      senderId: message.senderId,
      mediaName: message.mediaName,
    };
    setReplyingTo(replyRef);
  };

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

  const [showActionSheet, setShowActionSheet] = useState(false);
  const [selectedMessageForActions, setSelectedMessageForActions] = useState<Message | null>(null);
  const [popupAnimation] = useState(new Animated.Value(0));
  const [popupScale] = useState(new Animated.Value(0.8));

  const animatePopupIn = () => {
    // Reset values first
    popupAnimation.setValue(0);
    popupScale.setValue(0.8);

    Animated.parallel([
      Animated.timing(popupAnimation, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(popupScale, {
        toValue: 1,
        tension: 150,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animatePopupOut = () => {
    Animated.parallel([
      Animated.timing(popupAnimation, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.in(Easing.cubic),
      }),
      Animated.timing(popupScale, {
        toValue: 0.8,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.in(Easing.cubic),
      }),
    ]).start(() => {
      // Small delay to ensure animation completes before hiding modal
      setTimeout(() => {
        setShowActionSheet(false);
        setSelectedMessageForActions(null);
      }, 50);
    });
  };

  const showMessageActions = (message: Message) => {
    // const isOwnMessage = message.senderId === userData?.uid;
    const isStarred = message.starredBy?.includes(userData?.uid || '') || false;

    if (Platform.OS === 'ios') {
      const options = [
        'Copy',
        isStarred ? 'Unstar' : 'Star',
        'Reply',
        'Forward',
      ];

      // Add pin/unpin option for all messages
      options.push(pinnedMessage?.id === message.id ? 'Unpin' : 'Pin');

      // Add delete option for all messages
      options.push('Delete');

      options.push('Cancel');

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) copyMessage(message);
          else if (buttonIndex === 1) starMessage(message);
          else if (buttonIndex === 2) replyToMessage(message);
          else if (buttonIndex === 3) {
            setForwardingMessage(message);
            setShowContactsList(true);
          }
          else if (buttonIndex === 4) {
            // Pin/Unpin action
            if (pinnedMessage?.id === message.id) {
              unpinMessage();
            } else {
              pinMessage(message);
            }
          }
          else if (buttonIndex === 5) {
            // Delete action
            deleteMessage(message);
          }
        }
      );
    } else {
      // For `Android`, show custom action popup
      setSelectedMessageForActions(message);
      setShowActionSheet(true);
      // Start animation immediately for smoother experience
      requestAnimationFrame(() => {
        animatePopupIn();
      });
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !userData?.uid || !chatId || !userId || !userName) return;

    const messageText = newMessage.trim();
    setNewMessage('');
    setLoading(true);

    try {
      const messageData: any = {
        text: messageText,
        messageType: 'text',
        senderId: userData.uid,
        senderName: userData.displayName || 'Unknown',
        timestamp: FieldValue.serverTimestamp(),
        isRead: false,
        readBy: [],
      };

      // Add reply reference if replying
      if (replyingTo) {
        // Clean the reply data to remove any undefined values
        const cleanReplyTo = {
          messageId: replyingTo.messageId,
          messageText: replyingTo.messageText || '',
          messageType: replyingTo.messageType,
          senderName: replyingTo.senderName || 'Unknown',
          senderId: replyingTo.senderId,
          mediaName: replyingTo.mediaName || '',
        };
        messageData.replyTo = cleanReplyTo;
        setReplyingTo(null);
      }

      // Add message to chat
      await firestore
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .add(messageData);

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

      // Send push notification to recipient
      try {
        await sendMessageNotification(
          userId, // recipient user ID
          userData.displayName || 'Unknown', // sender name
          messageText, // message content
          chatId, // chat ID
          'text' // message type
        );
        console.log('Push notification sent for text message');
      } catch (notificationError) {
        console.error('Error sending push notification:', notificationError);
        // Don't fail the message sending if notification fails
      }

      // Scroll to bottom after sending
      // setTimeout(() => {
      //   if (flatListRef.current) {
      //     flatListRef.current.scrollToEnd({ animated: true });
      //   }
      // }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
      showCustomAlert('Error', 'Failed to send message', 'error');
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
    if (!message.mediaUrl) return;

    setSelectedMedia(message);

    switch (message.messageType) {
      case 'image':
        // For images, show full screen preview immediately
        setFullScreenMedia({
          uri: message.mediaUrl,
          type: message.messageType,
          name: message.mediaName
        });
        setShowFullScreenMedia(true);
        break;
      case 'video':
        // For videos, show video player immediately
        setShowVideoPlayer(true);
        break;
      case 'audio':
      case 'voice':
        // Audio is handled by MediaMessage component
        break;
      default:
        // Handle other media types
        break;
    }
  };

  const handleDocumentPress = (message: Message) => {
    if (!message.mediaUrl) return;

    setSelectedMedia(message);

    // For documents, check if it's a PDF
    if (message.mediaName?.toLowerCase().endsWith('.pdf')) {
      setShowDocumentViewer(false);
      setShowPDFViewer(true);
    } else {
      setShowDocumentViewer(true);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwnMessage = item.senderId === userData?.uid;
    const isStarred = item.starredBy?.includes(userData?.uid || '') || false;
    const isPinned = item.isPinned || false;

    const MessageBubble = ({ children }: { children: React.ReactNode }) => {
      if (isOwnMessage) {
        return (
          <LinearGradient
            colors={theme.isDark ? ['#2C3E50', '#34495E'] : ['#0d9488', '#10b981']}
            style={[
              styles.modernMessageBubble,
              styles.ownMessageBubble,
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {children}
          </LinearGradient>
        );
      } else {
        return (
          <View style={[
            styles.modernMessageBubble,
            styles.otherMessageBubble,
            {
              backgroundColor: '#F5F5F5',
              borderColor: '#E0E0E0',
            }
          ]}>
            {children}
          </View>
        );
      }
    };

    return (
      <View style={[
        styles.modernMessageContainer,
        isOwnMessage ? styles.ownMessage : styles.otherMessage
      ]}>
        <TouchableOpacity
          onLongPress={() => showMessageActions(item)}
          onPress={() => {
            showMessageActions(item);
            // Simple tap action - could be used for other features
          }}
          style={styles.messageWrapper}
          activeOpacity={0.8}
        >
          {/* Reply indicator */}
          {item.replyTo && (
            <View style={[
              styles.replyContainer,
              isOwnMessage ? styles.ownReplyContainer : styles.otherReplyContainer
            ]}>
              <View style={[
                styles.replyBar,
                { backgroundColor: isOwnMessage ? 'rgba(255,255,255,0.3)' : theme.colors.primary }
              ]} />
              <View style={styles.replyContent}>
                <Text style={[
                  styles.replySenderName,
                  { color: theme.colors.text }
                ]}>
                  {item.replyTo.senderName}
                </Text>
                <Text
                  style={[
                    styles.replyText,
                    {
                      color: theme.colors.text
                    }
                  ]}
                  numberOfLines={1}
                >
                  {item.replyTo.messageType === 'text'
                    ? (item.replyTo.messageText || 'Text message')
                    : `📎 ${item.replyTo.mediaName || item.replyTo.messageType || 'Media'}`
                  }
                </Text>
              </View>
            </View>
          )}

          <MessageBubble>
            {/* Pin indicator */}
            {isPinned && (
              <View style={styles.pinIndicator}>
                <Ionicons name="pin" size={12} color={isOwnMessage ? '#ffffff' : theme.colors.primary} />
              </View>
            )}

            {/* Star indicator */}
            {isStarred && (
              <View style={styles.starIndicator}>
                <Ionicons name="star" size={12} color={isOwnMessage ? '#FFD700' : '#FFD700'} />
              </View>
            )}

            {/* Forward indicator */}
            {item.forwardedFrom && (
              <View style={styles.forwardIndicator}>
                <Ionicons name="share" size={12} color={isOwnMessage ? 'rgba(255,255,255,0.8)' : theme.colors.textSecondary} />
                <Text style={[
                  styles.forwardText,
                  { color: isOwnMessage ? 'rgba(255,255,255,0.8)' : theme.colors.textSecondary }
                ]}>
                  Forwarded
                </Text>
              </View>
            )}

            {/* Message content */}
            {item.messageType !== 'text' && item.mediaUrl ? (
              <MediaMessage
                message={item}
                isOwnMessage={isOwnMessage}
                onMediaPress={() => handleMediaPress(item)}
                onDocumentPress={() => handleDocumentPress(item)}
                onLongPress={() => showMessageActions(item)}
              />
            ) : (
              <View style={{ flexDirection: 'row', gap: 0, alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Text style={[
                  styles.modernMessageText,
                  { color: isOwnMessage ? '#ffffff' : '#424242' }
                ]}>
                  {item.text}
                </Text>
                <Text style={[
                  styles.modernMessageTime,
                  { color: isOwnMessage ? theme.colors.text : '#000000' }
                ]}>
                  {/* {item.text} */}
                  {item.timestamp ? new Date(item.timestamp.toDate()).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : ''}
                </Text>
                {isOwnMessage && (
                  <View style={styles.messageStatus}>
                    {/* Read receipts with proper tick colors */}
                    {item.readBy && item.readBy.length > 0 ? (
                      <View style={styles.readReceipts}>
                        <Ionicons
                          name="checkmark-done"
                          size={16}
                          color="#2196F3" // Blue double tick for read messages
                        />
                        {/* <Text style={[styles.readStatus, { color: '#2196F3' }]}>
                        Read
                      </Text> */}
                      </View>
                    ) : item.timestamp ? (
                      <View style={styles.readReceipts}>
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color="rgba(255,255,255,0.7)" // Single white tick for delivered but unread messages
                        />
                        {/* <Text style={[styles.readStatus, { color: 'rgba(255,255,255,0.7)' }]}>
                        Delivered
                      </Text> */}
                      </View>
                    ) : (
                      <View style={styles.readReceipts}>
                        <ActivityIndicator size={12} color="rgba(255,255,255,0.7)" />
                        <Text style={[styles.readStatus, { color: 'rgba(255,255,255,0.7)' }]}>
                          Sending...
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

          </MessageBubble>
        </TouchableOpacity>
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
    <ImageBackground
      source={theme.isDark ? require('../assets/images/chat-bg-dark.jpeg') : require('../assets/images/chat-bg-light.jpeg')}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
        {/* Modern Header with Gradient */}
        <View style={styles.modernHeader}>
          <LinearGradient
            colors={theme.isDark ? ['#2C3E50', '#34495E'] : ['#0d9488', '#10b981']}
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
                  {receiverProfileImage ? (
                    <View style={styles.headerProfileImageContainer}>
                      <Image source={{ uri: receiverProfileImage }} style={styles.headerProfileImage} />
                    </View>
                  ) : (
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
                  )}
                </View>
                <View style={styles.headerTextContainer}>
                  <Text style={[styles.modernHeaderName, { color: theme.colors.onPrimary }]}>{userName}</Text>
                  <Text style={[styles.modernHeaderStatus, { color: theme.colors.onPrimary }]}>
                    {otherUserTyping ? 'typing...' : (userPhone ? `${userPhone}` : 'Online')}
                  </Text>
                </View>
              </View>
              
              {/* Call Button */}
              {/* <CallButton
                receiverId={userId}
                receiverName={userName}
                receiverPhone={userPhone}
                size="medium"
                variant="outline"
              /> */}
            </View>
          </LinearGradient>
        </View>

        {/* Pinned Message Banner */}
        {pinnedMessage && (
          <TouchableOpacity
            style={[styles.pinnedMessageBanner, { backgroundColor: theme.colors.surface }]}
            onPress={() => {
              // Scroll to pinned message
              const messageIndex = messages.findIndex(m => m.id === pinnedMessage.id);
              if (messageIndex !== -1 && flatListRef.current) {
                flatListRef.current.scrollToIndex({ index: messageIndex, animated: true });
              }
            }}
            activeOpacity={0.8}
          >
            <View style={styles.pinnedMessageContent}>
              <View style={styles.pinnedMessageIconContainer}>
                <Ionicons name="pin" size={16} color={theme.colors.primary} />
              </View>
              <View style={styles.pinnedMessageTextContainer}>
                <Text style={[styles.pinnedMessageLabel, { color: theme.colors.primary }]}>
                  Pinned by {pinnedMessage.pinnedBy === userData?.uid ? 'you' : pinnedMessage.senderName}
                </Text>
                <Text style={[styles.pinnedMessageText, { color: theme.colors.text }]} numberOfLines={1}>
                  {pinnedMessage.messageType === 'text'
                    ? (pinnedMessage.text || 'Text message')
                    : `📎 ${pinnedMessage.mediaName || pinnedMessage.messageType || 'Media'}`
                  }
                </Text>
              </View>
              <TouchableOpacity
                onPress={unpinMessage}
                style={styles.unpinButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}

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
            inverted

          />

          {/* Typing Indicator */}
          {otherUserTyping && (
            <View style={[styles.typingIndicator, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.typingContent}>
                <View style={styles.typingAvatar}>
                  <LinearGradient
                    colors={getAvatarGradient(userName) as [string, string]}
                    style={styles.typingAvatarGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Text style={styles.typingAvatarText}>
                      {userName?.charAt(0)?.toUpperCase() || 'U'}
                    </Text>
                  </LinearGradient>
                </View>
                <View style={styles.typingBubble}>
                  <View style={styles.typingDots}>
                    <View style={[styles.typingDot, { backgroundColor: theme.colors.textSecondary }]} />
                    <View style={[styles.typingDot, { backgroundColor: theme.colors.textSecondary }]} />
                    <View style={[styles.typingDot, { backgroundColor: theme.colors.textSecondary }]} />
                  </View>
                </View>
              </View>
            </View>
          )}

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

          {/* Reply Bar */}
          {replyingTo && (
            <View style={[styles.replyInputBar, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.replyInputContent}>
                <View style={styles.replyInputInfo}>
                  <View style={styles.replyInputIconContainer}>
                    <Ionicons name="arrow-undo" size={16} color={theme.colors.primary} />
                  </View>
                  <View style={styles.replyInputTextContainer}>
                    <Text style={[styles.replyInputLabel, { color: theme.colors.primary }]}>
                      Replying to {replyingTo.senderName}
                    </Text>
                    <Text
                      style={[styles.replyInputText, { color: theme.colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {replyingTo.messageType === 'text'
                        ? (replyingTo.messageText || 'Text message')
                        : `📎 ${replyingTo.mediaName || replyingTo.messageType || 'Media'}`
                      }
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setReplyingTo(null)}
                  style={styles.cancelReplyButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Modern Input Container */}
          <View style={[
            styles.modernInputContainer,
            {
              backgroundColor: 'transparent',
              borderTopColor: 'transparent',
            }
          ]}>
            <View style={[styles.inputWrapper, {
              backgroundColor: theme.isDark ? 'rgba(52, 73, 94, 0.6)' : 'rgb(255, 255, 255)',
              borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
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
                onChangeText={handleTextChange}
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
                  colors={newMessage.trim() ? ['#0d9488', '#10b981'] : [theme.colors.border, theme.colors.border]}
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
                ) : null}

                {fullScreenMedia.name && (
                  <Text style={styles.fullScreenMediaName}>{fullScreenMedia.name}</Text>
                )}
              </>
            )}
          </View>
        </Modal>

        {/* Video Player Modal */}
        <Modal
          visible={showVideoPlayer}
          transparent
          animationType="fade"
          onRequestClose={() => setShowVideoPlayer(false)}
        >
          <View style={styles.fullScreenModal}>
            {selectedMedia && (
              <VideoPlayer
                uri={selectedMedia.mediaUrl!}
                onClose={() => setShowVideoPlayer(false)}
                isFullScreen={true}
              />
            )}
          </View>
        </Modal>

        {/* Document Viewer Modal */}
        <Modal
          visible={showDocumentViewer}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDocumentViewer(false)}
        >
          <View style={styles.documentModal}>
            {selectedMedia && (
              <DocumentViewer
                mediaUrl={selectedMedia.mediaUrl!}
                fileName={selectedMedia.mediaName || 'Document'}
                mediaType={selectedMedia.messageType === 'document' ? 'application/octet-stream' : 'image/jpeg'}
                mediaSize={selectedMedia.mediaSize}
                onClose={() => setShowDocumentViewer(false)}
              />
            )}
          </View>
        </Modal>

        {/* PDF Viewer Modal */}
        <Modal
          visible={showPDFViewer}
          transparent
          animationType="slide"
          onRequestClose={() => setShowPDFViewer(false)}
        >
          <View style={styles.documentModal}>
            {selectedMedia && (
              <PDFViewer
                mediaUrl={selectedMedia.mediaUrl!}
                fileName={selectedMedia.mediaName || 'Document.pdf'}
                mediaSize={selectedMedia.mediaSize}
                onClose={() => setShowPDFViewer(false)}
              />
            )}
          </View>
        </Modal>

        {/* Custom Action Popup Modal */}
        <Modal
          visible={showActionSheet}
          transparent
          animationType="none"
          onRequestClose={animatePopupOut}
          statusBarTranslucent
          hardwareAccelerated
        >
          <View style={styles.actionPopupOverlay} pointerEvents="box-none">
            <Animated.View
              style={[
                styles.actionPopupBackdrop,
                {
                  opacity: popupAnimation,
                },
              ]}
              pointerEvents="none"
            />
            <TouchableOpacity
              style={styles.actionPopupBackdrop}
              onPress={animatePopupOut}
              activeOpacity={1}
            />
            <Animated.View
              style={[
                styles.actionPopupContainer,
                {
                  backgroundColor: theme.colors.surface,
                  opacity: popupAnimation,
                  transform: [{ scale: popupScale }],
                }
              ]}
              pointerEvents="box-none"
            >
              {selectedMessageForActions && (
                <>
                  {/* Selected Message Display */}
                  <View style={styles.selectedMessageContainer}>
                    <View style={[
                      styles.selectedMessageBubble,
                      {
                        backgroundColor: selectedMessageForActions.senderId === userData?.uid
                          ? theme.colors.primary
                          : theme.colors.border
                      }
                    ]}>
                      <Text style={[
                        styles.selectedMessageText,
                        {
                          color: selectedMessageForActions.senderId === userData?.uid
                            ? '#FFFFFF'
                            : theme.colors.text
                        }
                      ]}>
                        {selectedMessageForActions.text}
                      </Text>
                      <Text style={[
                        styles.selectedMessageTime,
                        {
                          color: selectedMessageForActions.senderId === userData?.uid
                            ? 'rgba(255, 255, 255, 0.7)'
                            : theme.colors.textSecondary
                        }
                      ]}>
                        {selectedMessageForActions.timestamp ? new Date(selectedMessageForActions.timestamp.toDate()).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        }) : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.actionPopupActions}>
                    <TouchableOpacity
                      style={[styles.actionPopupButton, { borderBottomColor: theme.colors.border }]}
                      onPress={() => {
                        replyToMessage(selectedMessageForActions);
                        animatePopupOut();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.actionPopupButtonContent}>
                        <Text style={[styles.actionPopupButtonText, { color: theme.colors.text }]}>Reply</Text>
                      </View>
                      <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(76, 175, 80, 0.1)' }]}>
                        <Ionicons name="arrow-undo-outline" size={18} color={theme.colors.primary} />
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionPopupButton, { borderBottomColor: theme.colors.border }]}
                      onPress={() => {
                        setForwardingMessage(selectedMessageForActions);
                        setShowContactsList(true);
                        animatePopupOut();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.actionPopupButtonContent}>
                        <Text style={[styles.actionPopupButtonText, { color: theme.colors.text }]}>Forward</Text>
                      </View>
                      <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(255, 152, 0, 0.1)' }]}>
                        <Ionicons name="share-outline" size={18} color={theme.colors.primary} />
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionPopupButton, { borderBottomColor: theme.colors.border }]}
                      onPress={() => {
                        copyMessage(selectedMessageForActions);
                        animatePopupOut();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.actionPopupButtonContent}>
                        <Text style={[styles.actionPopupButtonText, { color: theme.colors.text }]}>Copy</Text>
                      </View>
                      <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(103, 126, 234, 0.1)' }]}>
                        <Ionicons name="copy-outline" size={18} color={theme.colors.primary} />
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionPopupButton, { borderBottomColor: theme.colors.border }]}
                      onPress={() => {
                        starMessage(selectedMessageForActions);
                        animatePopupOut();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.actionPopupButtonContent}>
                        <Text style={[styles.actionPopupButtonText, { color: theme.colors.text }]}>
                          {selectedMessageForActions.starredBy?.includes(userData?.uid || '') ? 'Unstar' : 'Star'}
                        </Text>
                      </View>
                      <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(255, 215, 0, 0.1)' }]}>
                        <Ionicons
                          name={selectedMessageForActions.starredBy?.includes(userData?.uid || '') ? "star" : "star-outline"}
                          size={18}
                          color={selectedMessageForActions.starredBy?.includes(userData?.uid || '') ? "#FFD700" : theme.colors.primary}
                        />
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionPopupButton, { borderBottomColor: theme.colors.border }]}
                      onPress={() => {
                        if (pinnedMessage?.id === selectedMessageForActions.id) {
                          unpinMessage();
                        } else {
                          pinMessage(selectedMessageForActions);
                        }
                        animatePopupOut();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.actionPopupButtonContent}>
                        <Text style={[styles.actionPopupButtonText, { color: theme.colors.text }]}>
                          {pinnedMessage?.id === selectedMessageForActions.id ? 'Unpin' : 'Pin'}
                        </Text>
                      </View>
                      <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(244, 67, 54, 0.1)' }]}>
                        <Ionicons
                          name={pinnedMessage?.id === selectedMessageForActions.id ? "pin" : "pin-outline"}
                          size={18}
                          color={pinnedMessage?.id === selectedMessageForActions.id ? "#FF6B6B" : theme.colors.primary}
                        />
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionPopupButton, { borderBottomColor: theme.colors.border }]}
                      onPress={() => {
                        // Report functionality can be added here
                        animatePopupOut();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.actionPopupButtonContent}>
                        <Text style={[styles.actionPopupButtonText, { color: theme.colors.text }]}>Report</Text>
                      </View>
                      <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(255, 193, 7, 0.1)' }]}>
                        <Ionicons name="warning-outline" size={18} color="#FF9800" />
                      </View>
                    </TouchableOpacity>

                    {/* Delete Option - Available for all messages */}
                    <TouchableOpacity
                      style={[styles.actionPopupButton, { borderBottomColor: theme.colors.border }]}
                      onPress={() => {
                        deleteMessage(selectedMessageForActions);
                        animatePopupOut();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.actionPopupButtonContent}>
                        <Text style={[styles.actionPopupButtonText, { color: '#F44336' }]}>
                          Delete
                        </Text>
                      </View>
                      <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(244, 67, 54, 0.1)' }]}>
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color="#F44336"
                        />
                      </View>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </Animated.View>
          </View>
        </Modal>

        {/* Custom Alert Modal */}
        <Modal
          visible={customAlert.visible}
          transparent
          animationType="fade"
          onRequestClose={hideCustomAlert}
        >
          <View style={styles.customAlertOverlay}>
            <View style={[styles.customAlertContainer, { backgroundColor: theme.colors.surface }]}>
              {/* Alert Icon */}
              <View style={[
                styles.alertIconContainer,
                {
                  backgroundColor: customAlert.type === 'success' ? '#4CAF50' :
                    customAlert.type === 'error' ? '#F44336' :
                      customAlert.type === 'warning' ? '#FF9800' : '#2196F3'
                }
              ]}>
                <Ionicons
                  name={
                    customAlert.type === 'success' ? 'checkmark-circle' :
                      customAlert.type === 'error' ? 'close-circle' :
                        customAlert.type === 'warning' ? 'warning' : 'information-circle'
                  }
                  size={32}
                  color="#ffffff"
                />
              </View>

              {/* Alert Title */}
              <Text style={[styles.alertTitle, { color: theme.colors.text }]}>
                {customAlert.title}
              </Text>

              {/* Alert Message */}
              <Text style={[styles.alertMessage, { color: theme.colors.textSecondary }]}>
                {customAlert.message}
              </Text>

              {/* Action Buttons */}
              <View style={styles.alertButtonsContainer}>
                {customAlert.type === 'warning' && customAlert.onConfirm && (
                  <TouchableOpacity
                    style={[styles.alertButton, styles.alertCancelButton]}
                    onPress={hideCustomAlert}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.alertCancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.alertButton,
                    {
                      backgroundColor: customAlert.type === 'success' ? '#4CAF50' :
                        customAlert.type === 'error' ? '#F44336' :
                          customAlert.type === 'warning' ? '#FF9800' : '#2196F3'
                    }
                  ]}
                  onPress={() => {
                    if (customAlert.onConfirm) {
                      customAlert.onConfirm();
                    }
                    hideCustomAlert();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.alertButtonText}>
                    {customAlert.type === 'warning' && customAlert.onConfirm ? 'Delete' : 'OK'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Contacts List Modal for Forwarding */}
        <Modal
          visible={showContactsList}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setShowContactsList(false);
            setForwardingMessage(null);
          }}
        >
          <View style={styles.contactsModal}>
            <View style={[styles.contactsContainer, { backgroundColor: theme.colors.background }]}>
              <View style={styles.contactsHeader}>
                <View style={styles.contactsHeaderInfo}>
                  <Text style={[styles.contactsTitle, { color: theme.colors.text }]}>
                    Forward to
                  </Text>
                  {forwardingMessage && (
                    <Text style={[styles.forwardingPreview, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                      {forwardingMessage.messageType === 'text'
                        ? (forwardingMessage.text || 'Text message')
                        : `📎 ${forwardingMessage.mediaName || forwardingMessage.messageType || 'Media'}`
                      }
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setShowContactsList(false);
                    setForwardingMessage(null);
                  }}
                  style={styles.contactsCloseButton}
                >
                  <Ionicons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>

              <FlatList
                data={contacts}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.contactItem, { borderBottomColor: theme.colors.border }]}
                    onPress={() => forwardMessage(item.chatId)}
                  >
                    <LinearGradient
                      colors={getAvatarGradient(item.name) as any}
                      style={styles.contactAvatar}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Text style={styles.contactAvatarText}>
                        {item.name?.charAt(0)?.toUpperCase() || 'U'}
                      </Text>
                    </LinearGradient>
                    <View style={styles.contactInfo}>
                      <Text style={[styles.contactName, { color: theme.colors.text }]}>
                        {item.name}
                      </Text>
                      <Text style={[styles.contactSubtitle, { color: theme.colors.textSecondary }]}>
                        Forward from {userData?.displayName || 'You'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                style={styles.contactsList}
              />
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  // Background image
  backgroundImage: {
    flex: 1,
  },
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
    gap: 16,
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
  headerProfileImageContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  headerProfileImage: {
    width: '100%',
    height: '100%',
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
    paddingTop: 0,
    paddingBottom: 0,
    flexGrow: 1,
  },

  // Modern message styles
  modernMessageContainer: {
    flexDirection: 'row',
    marginVertical: 8,
    paddingHorizontal: 4,
    position: 'relative',
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
    minWidth: 90,
    paddingHorizontal: 3,
    paddingVertical: 3,
    borderRadius: 12,
    position: 'relative',
    overflow: 'hidden',

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
    marginRight: 'auto',
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
    padding: 8
  },
  messageFooter: {
    position: 'absolute',
    bottom: 4,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
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
    marginLeft: 8,
  },
  readReceipts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  readStatus: {
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 2,
    opacity: 0.9,
  },

  // Modern input styles
  modernInputContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 28,
    paddingHorizontal: 6,
    paddingVertical: 6,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
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
  documentModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
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

  // Message wrapper for touch handling
  messageWrapper: {
    flex: 1,
  },

  // Pinned message banner
  pinnedMessageBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
    backgroundColor: 'rgba(103, 126, 234, 0.08)',
  },
  pinnedMessageContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinnedMessageIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(103, 126, 234, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(103, 126, 234, 0.2)',
  },
  pinnedMessageTextContainer: {
    flex: 1,
  },
  pinnedMessageLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pinnedMessageText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  unpinButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },

  // Reply container in messages
  replyContainer: {
    marginBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 8,
    paddingBottom: 4,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  ownReplyContainer: {
    marginLeft: 'auto',
    maxWidth: '78%',
    backgroundColor: '#10b981',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  otherReplyContainer: {
    maxWidth: '78%',
    backgroundColor: '#0d9488',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  replyBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 4,
    width: 3,
    borderRadius: 2,
  },
  replyContent: {
    marginLeft: 12,
    paddingVertical: 2,
  },
  replySenderName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  replyText: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // Reply input bar
  replyInputBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    backgroundColor: 'rgba(103, 126, 234, 0.05)',
  },
  replyInputContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyInputInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyInputIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(103, 126, 234, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(103, 126, 234, 0.2)',
  },
  replyInputTextContainer: {
    flex: 1,
  },
  replyInputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  replyInputText: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  cancelReplyButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },

  // Star and pin indicators
  starIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
  },
  pinIndicator: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 1,
  },

  // Contacts modal for forwarding
  contactsModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  contactsContainer: {
    maxHeight: screenHeight * 0.7,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
  },
  contactsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  contactsHeaderInfo: {
    flex: 1,
    marginRight: 16,
  },
  contactsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  forwardingPreview: {
    fontSize: 14,
    fontWeight: '400',
    fontStyle: 'italic',
  },
  contactsCloseButton: {
    padding: 4,
  },
  contactsList: {
    paddingHorizontal: 20,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  contactSubtitle: {
    fontSize: 13,
    fontWeight: '400',
  },

  // Custom Alert Styles
  customAlertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  customAlertContainer: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  alertIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 28,
  },
  alertMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  alertButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  alertButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    minWidth: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  alertCancelButton: {
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
  },
  alertButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  alertCancelButtonText: {
    color: '#666666',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Action Popup Styles
  actionPopupOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  actionPopupBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  actionPopupContainer: {
    width: 280,
    borderRadius: 16,
    padding: 16,
    marginRight: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },

  actionPopupActions: {
  },
  actionPopupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderRadius: 0,
    marginBottom: 0,
  },
  actionPopupButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  actionIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionPopupButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },

  forwardIndicator: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  forwardText: {
    marginLeft: 4,
  },
  selectedMessageContainer: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  selectedMessageBubble: {
    padding: 12,
    borderRadius: 12,
    maxWidth: '100%',
  },
  selectedMessageText: {
    fontSize: 15,
    fontWeight: '400',
    marginBottom: 6,
    lineHeight: 20,
  },
  selectedMessageTime: {
    fontSize: 11,
    fontWeight: '400',
    opacity: 0.7,
  },

  // Typing indicator styles
  typingIndicator: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  typingContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  typingAvatar: {
    marginRight: 12,
  },
  typingAvatarGradient: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typingAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  typingBubble: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderBottomLeftRadius: 8,
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 2,
    opacity: 0.7,
  },
});
