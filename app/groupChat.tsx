import { Ionicons } from '@expo/vector-icons';
import storage from '@react-native-firebase/storage';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
    // ActionSheetIOS,
    ActivityIndicator,
    Alert,
    Animated,
    Clipboard,
    Dimensions,
    Easing,
    FlatList,
    Image,
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
import CustomAlert from '../components/CustomAlert';
import DocumentViewer from '../components/DocumentViewer';
import MediaMessage from '../components/MediaMessage';
import MediaPicker from '../components/MediaPicker';
import PDFViewer from '../components/PDFViewer';
import VideoPlayer from '../components/VideoPlayer';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FieldValue, firebaseFirestore as firestore } from '../firebaseConfig';
import { Message } from '../types/MessageTypes';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// interface GroupMember {
//     uid: string;
//     displayName: string;
//     isAdmin: boolean;
// }

interface Group {
    id: string;
    name: string;
    description: string;
    createdBy: string;
    createdAt: any;
    memberCount: number;
    isPrivate: boolean;
    members: string[];
    admins: string[];
    inviteCode?: string;
    profileImageUrl?: string;
}

export default function GroupChatPage() {
    const params = useLocalSearchParams();
    const groupId = params.groupId as string;
    const groupName = params.groupName as string;
    const innerGroupId = params.innerGroupId as string;
    const startTime = params.startTime as string;
    const endTime = params.endTime as string;
    const { userData } = useAuth();
    const { theme } = useTheme();
    const router = useRouter();

    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    // const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
    const [group, setGroup] = useState<Group | null>(null);
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const [uploadingVoice, setUploadingVoice] = useState(false);
    const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [recordingTimer, setRecordingTimer] = useState<ReturnType<typeof setInterval> | null>(null);
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    // const [isPlaying, setIsPlaying] = string | null>(null);
    // const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [canSendMessage, setCanSendMessage] = useState(true);
    const [timeRestrictionMessage, setTimeRestrictionMessage] = useState('');
    const [uploadingMessage, setUploadingMessage] = useState<string>('');
    const [showFullScreenMedia, setShowFullScreenMedia] = useState(false);
    const [fullScreenMedia, setFullScreenMedia] = useState<{ uri: string, type: string, name?: string } | null>(null);
    const [showVideoPlayer, setShowVideoPlayer] = useState(false);
    const [showDocumentViewer, setShowDocumentViewer] = useState(false);
    const [showPDFViewer, setShowPDFViewer] = useState(false);
    const [selectedMedia, setSelectedMedia] = useState<Message | null>(null);
    const [pinnedMessage, setPinnedMessage] = useState<Message | null>(null);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
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
    const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
    const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

    // New state for action popup modal
    const [showActionSheet, setShowActionSheet] = useState(false);
    const [selectedMessageForActions, setSelectedMessageForActions] = useState<Message | null>(null);
    const [popupAnimation] = useState(new Animated.Value(0));
    const [popupScale] = useState(new Animated.Value(0.8));

    const flatListRef = useRef<FlatList>(null);
    // const popupAnimation = useRef(new Animated.Value(0)).current;
    // const recordingRef = useRef<any>(null);

    // Function to check if current time is within allowed messaging window
    const checkMessageTimeWindow = () => {
        if (!startTime || !endTime) {
            setCanSendMessage(true);
            setTimeRestrictionMessage('');
            return;
        }

        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes(); // Convert to minutes

        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);

        const startTimeMinutes = startHour * 60 + startMin;
        const endTimeMinutes = endHour * 60 + endMin;

        if (currentTime >= startTimeMinutes && currentTime <= endTimeMinutes) {
            setCanSendMessage(true);
            setTimeRestrictionMessage('');
        } else {
            setCanSendMessage(false);
            const formatTime = (time: string) => {
                const [hours, minutes] = time.split(':');
                const hour = parseInt(hours);
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
                return `${displayHour}:${minutes} ${ampm}`;
            };
            setTimeRestrictionMessage(`Messaging is only allowed between ${formatTime(startTime)} and ${formatTime(endTime)}`);
        }
    };

    // Animation functions for action popup
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

    // Determine the correct collection path for messages
    const getMessageCollectionPath = () => {
        if (innerGroupId) {
            // Admin-created inner group - use chats collection
            return firestore
                .collection('chats')
                .doc(`${groupId}_${innerGroupId}`)
                .collection('messages');
        } else {
            // User-created group - use groups collection
            return firestore
                .collection('groups')
                .doc(groupId)
                .collection('messages');
        }
    };

    // Fetch messages
    useEffect(() => {
        if (!groupId) return;

        const messagesRef = getMessageCollectionPath();

        const unsubscribe = messagesRef
            .orderBy('timestamp', 'desc')
            .onSnapshot((snapshot: any) => {
                const messagesData: Message[] = [];
                snapshot.forEach((doc: any) => {
                    messagesData.push({ id: doc.id, ...doc.data() } as Message);
                });
                setMessages(messagesData);
            });

        return () => unsubscribe();
    }, [groupId, innerGroupId]);

    // Check time restrictions on component mount and every minute
    useEffect(() => {
        checkMessageTimeWindow(); // Check immediately

        const interval = setInterval(() => {
            checkMessageTimeWindow();
        }, 60000); // Check every minute

        return () => clearInterval(interval);
    }, [startTime, endTime, checkMessageTimeWindow]);

    // Typing indicator logic
    useEffect(() => {
        if (!groupId) return;

        // Listen to typing status changes
        const unsubscribeTyping = firestore
            .collection('groups')
            .doc(groupId)
            .onSnapshot((doc) => {
                const groupData = doc.data();
                if (groupData?.typingUsers) {
                    const typingUsersSet = new Set<string>();
                    Object.keys(groupData.typingUsers).forEach((uid) => {
                        if (uid !== userData?.uid && groupData.typingUsers[uid]) {
                            typingUsersSet.add(uid);
                        }
                    });
                    setTypingUsers(typingUsersSet);
                }
            });

        return () => unsubscribeTyping();
    }, [groupId, userData?.uid]);

    // Update typing status when user types
    const updateTypingStatus = useCallback(async (typing: boolean) => {
        if (!groupId || !userData?.uid) return;

        try {
            await firestore
                .collection('groups')
                .doc(groupId)
                .update({
                    [`typingUsers.${userData.uid}`]: typing,
                });
        } catch (error) {
            console.error('Error updating typing status:', error);
        }
    }, [groupId, userData?.uid]);

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

    // Fetch group details
    useEffect(() => {
        if (!groupId) return;

        const fetchGroupDetails = async () => {
            try {
                const groupDoc = await firestore.collection('groups').doc(groupId).get();
                if (groupDoc.exists) {
                    setGroup({ id: groupDoc.id, ...groupDoc.data() } as Group);
                }
            } catch (error) {
                console.error('Error fetching group details:', error);
            }
        };

        fetchGroupDetails();
    }, [groupId]);

    // Cleanup audio resources
    useEffect(() => {
        return () => {
            if (sound) {
                sound.unloadAsync();
            }
            if (recording) {
                recording.stopAndUnloadAsync();
            }
        };
    }, [sound, recording]);

    // Voice recording functions
    const startRecording = async () => {
        try {
            // Request permissions
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                showCustomAlert('Permission Required', 'Please grant microphone permission to record voice notes', 'warning');
                return;
            }

            // Configure audio mode
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                shouldDuckAndroid: true,
                staysActiveInBackground: false,
                playThroughEarpieceAndroid: false,
            });

            // Start recording
            const { recording: newRecording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );

            setRecording(newRecording);
            setIsRecording(true);
            setRecordingDuration(0);

            // Start timer for recording duration
            const timer = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);
            setRecordingTimer(timer);

            // showCustomAlert('Recording', 'Voice recording started...', 'info');
        } catch (error) {
            console.error('Error starting recording:', error);
            showCustomAlert('Error', 'Failed to start recording', 'error');
        }
    };

    const stopRecording = async () => {
        try {
            if (!recording) return;

            setIsRecording(false);
            if (recordingTimer) {
                clearInterval(recordingTimer);
                setRecordingTimer(null);
            }

            // Stop recording
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            const info = await recording.getStatusAsync();

            if (uri && info.durationMillis) {
                const voiceNote = {
                    uri: uri,
                    duration: Math.round(info.durationMillis / 1000),
                    fileName: `Voice_Note_${Date.now()}.m4a`,
                    fileSize: info.durationMillis * 16, // Approximate size
                };

                await sendVoiceMessage(voiceNote);
            }

            setRecording(null);
            setRecordingDuration(0);

        } catch (error) {
            console.error('Error stopping recording:', error);
            showCustomAlert('Error', 'Failed to stop recording', 'error');
        }
    };

    // const playVoiceNote = async (message: Message) => {
    //     try {
    //         // Stop any currently playing audio
    //         if (sound) {
    //             await sound.unloadAsync();
    //             setSound(null);
    //         }

    //         if (isPlaying === message.id) {
    //             // Stop playing
    //             setIsPlaying(null);
    //             setPlayingMessageId(null);
    //             return;
    //         }

    //         // Start playing
    //         setIsPlaying(message.id);
    //         setPlayingMessageId(message.id);

    //         const { sound: newSound } = await Audio.Sound.createAsync(
    //             { uri: message.mediaUrl! },
    //             { shouldPlay: true }
    //         );

    //         setSound(newSound);

    //         // Listen for playback status
    //         newSound.setOnPlaybackStatusUpdate((status) => {
    //             if (status.isLoaded && status.didJustFinish) {
    //                 setIsPlaying(null);
    //                 setPlayingMessageId(null);
    //             }
    //         });

    //         await newSound.playAsync();

    //     } catch (error) {
    //         console.error('Error playing voice note:', error);
    //         showCustomAlert('Error', 'Failed to play voice note', 'error');
    //         setIsPlaying(null);
    //         setPlayingMessageId(null);
    //     }
    // };

    const sendVoiceMessage = async (voiceNote: any) => {
        if (!userData?.uid || !groupId) return;

        // Check if messaging is allowed at current time
        if (!canSendMessage) {
            Alert.alert('Messaging Restricted', timeRestrictionMessage);
            return;
        }

        setUploadingVoice(true);
        setUploadProgress(0);
        setUploadingMessage('Uploading voice note...');

        try {
            // Upload voice note to Firebase Storage
            const fileName = `voice/${groupId}/${Date.now()}_voice.m4a`;

            // Create the storage reference using the exact same method as chat.tsx
            const reference = storage().ref().child(fileName);

            const response = await fetch(voiceNote.uri);
            const blob = await response.blob();

            // Track upload progress for voice notes
            const uploadTask = reference.put(blob);
            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot: any) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        setUploadProgress(progress);
                    },
                    (error: any) => reject(error),
                    () => resolve(true)
                );
            });

            const mediaUrl = await reference.getDownloadURL();

            // Use conditional collection path
            const messagesRef = getMessageCollectionPath();
            await messagesRef.add({
                messageType: 'voice',
                mediaUrl,
                mediaName: 'Voice Note',
                mediaSize: voiceNote.fileSize,
                mediaDuration: voiceNote.duration,
                senderId: userData.uid,
                senderName: userData.displayName || 'Unknown',
                timestamp: FieldValue.serverTimestamp(),
                isRead: false,
                readBy: [],
            });

            // Update group metadata based on collection type
            if (innerGroupId) {
                // Admin-created inner group - update chats collection
                await firestore
                    .collection('chats')
                    .doc(`${groupId}_${innerGroupId}`)
                    .set({
                        lastMessage: '🎤 Voice Note',
                        lastMessageType: 'voice',
                        lastMessageTime: FieldValue.serverTimestamp(),
                        participants: [userData.uid],
                        participantNames: [userData.displayName || 'Unknown'],
                        lastUpdated: FieldValue.serverTimestamp(),
                    }, { merge: true });
            } else {
                // User-created group - update groups collection
                await firestore
                    .collection('groups')
                    .doc(groupId)
                    .update({
                        lastMessage: '🎤 Voice Note',
                        lastMessageType: 'voice',
                        lastMessageTime: FieldValue.serverTimestamp(),
                        lastUpdated: FieldValue.serverTimestamp(),
                    });
            }

            // Scroll to bottom after sending
            // setTimeout(() => {
            //     if (flatListRef.current) {
            //         flatListRef.current.scrollToEnd({ animated: true });
            //     }
            // }, 100);
        } catch (error) {
            console.error('Error sending voice message:', error);
            showCustomAlert('Error', 'Failed to send voice message', 'error');
        } finally {
            setUploadingVoice(false);
            setUploadProgress(0);
            setUploadingMessage('');
        }
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const openGroupManagement = () => {
        router.push({
            pathname: '/groupDetails',
            params: {
                groupId: groupId,
                groupName: groupName
            }
        });
    };

    const sendMessage = async () => {
        if (!newMessage.trim() || !userData?.uid || !groupId) return;

        // Check if messaging is allowed at current time
        if (!canSendMessage) {
            Alert.alert('Messaging Restricted', timeRestrictionMessage);
            return;
        }

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

            if (replyingTo) {
                messageData.replyTo = {
                    messageId: replyingTo.id,
                    messageText: replyingTo.text,
                    messageType: replyingTo.messageType || 'text',
                    senderName: replyingTo.senderName,
                    senderId: replyingTo.senderId,
                    mediaName: replyingTo.mediaName,
                };
            }

            // Use conditional collection path
            const messagesRef = getMessageCollectionPath();
            await messagesRef.add(messageData);

            // Update group metadata based on collection type
            if (innerGroupId) {
                // Admin-created inner group - update chats collection
                await firestore
                    .collection('chats')
                    .doc(`${groupId}_${innerGroupId}`)
                    .set({
                        lastMessage: messageData.text,
                        lastMessageType: 'text',
                        lastMessageTime: FieldValue.serverTimestamp(),
                        participants: [userData.uid],
                        participantNames: [userData.displayName || 'Unknown'],
                        lastUpdated: FieldValue.serverTimestamp(),
                    }, { merge: true });
            } else {
                // User-created group - update groups collection
                await firestore
                    .collection('groups')
                    .doc(groupId)
                    .update({
                        lastMessage: messageData.text,
                        lastMessageType: 'text',
                        lastMessageTime: FieldValue.serverTimestamp(),
                        lastUpdated: FieldValue.serverTimestamp(),
                    });
            }

            setReplyingTo(null);
            // setTimeout(() => {
            //     if (flatListRef.current) {
            //         flatListRef.current.scrollToEnd({ animated: true });
            //     }
            // }, 100);
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            setLoading(false);
        }
    };



    const sendMediaMessage = async (mediaFiles: any[], type: 'image' | 'video' | 'document') => {
        if (!userData?.uid || !groupId) return;

        // Check if messaging is allowed at current time
        if (!canSendMessage) {
            Alert.alert('Messaging Restricted', timeRestrictionMessage);
            return;
        }

        setUploadingMedia(true);
        setUploadProgress(0);
        setUploadingMessage(`Uploading ${type}...`);

        try {


            for (const mediaFile of mediaFiles) {


                // Validate required fields
                if (!mediaFile.uri) {
                    console.error('❌ MediaFile.uri is undefined!');
                    throw new Error('Media file URI is undefined');
                }

                if (!mediaFile.fileName && !mediaFile.name) {
                    console.error('❌ Both fileName and name are undefined!');
                    throw new Error('Media file name is undefined');
                }

                // Upload media to Firebase Storage first
                const fileName = `${type}/${groupId}/${Date.now()}_${mediaFile.fileName || mediaFile.name || 'file'}`;


                const reference = storage().ref().child(fileName);

                // Convert local URI to blob
                const response = await fetch(mediaFile.uri);
                const blob = await response.blob();


                // Track upload progress
                const uploadTask = reference.put(blob);
                await new Promise((resolve, reject) => {
                    uploadTask.on('state_changed',
                        (snapshot: any) => {
                            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                            setUploadProgress(progress);
                        },
                        (error: any) => reject(error),
                        () => resolve(true)
                    );
                });

                // Get download URL
                const mediaUrl = await reference.getDownloadURL();


                const messageData: any = {
                    messageType: type,
                    mediaUrl, // Use Firebase Storage download URL instead of local URI
                    senderId: userData.uid,
                    senderName: userData.displayName || 'Unknown',
                    timestamp: FieldValue.serverTimestamp(),
                    mediaName: mediaFile.fileName || mediaFile.name || 'File',
                    mediaSize: mediaFile.fileSize || mediaFile.size || 0,
                    isRead: false,
                    readBy: [],
                };

                // Validate messageData before sending

                // Check for undefined values
                const undefinedFields = Object.entries(messageData)
                    .filter(([key, value]) => value === undefined)
                    .map(([key]) => key);

                if (undefinedFields.length > 0) {
                    console.error('❌ Found undefined fields:', undefinedFields);
                    throw new Error(`Undefined fields found: ${undefinedFields.join(', ')}`);
                }

                // Check for null values
                const nullFields = Object.entries(messageData)
                    .filter(([key, value]) => value === null)
                    .map(([key]) => key);

                if (nullFields.length > 0) {
                    console.error('❌ Found null fields:', nullFields);
                    throw new Error(`Null fields found: ${nullFields.join(', ')}`);
                }



                if (type === 'image' || type === 'video') {
                    // For videos, add video-specific properties
                    if (type === 'video') {
                        messageData.mediaDuration = 0; // You can extract actual duration if needed
                        // Ensure the messageType is correctly set for videos
                        messageData.messageType = 'video';
                        // Add text for video messages to prevent undefined field error
                        messageData.text = '🎥 Video';
                    }
                    if (type === 'image') {
                        messageData.messageType = 'image';
                        // Add text for image messages to prevent undefined field error
                        messageData.text = '📷 Image';
                    }
                } else {
                    messageData.text = '📄 Document';
                }

                if (replyingTo) {
                    messageData.replyTo = {
                        messageId: replyingTo.id,
                        messageText: replyingTo.text,
                        messageType: replyingTo.messageType || 'text',
                        senderName: replyingTo.senderName,
                        senderId: replyingTo.senderId,
                        mediaName: replyingTo.mediaName,
                    };
                }



                // Use conditional collection path
                const messagesRef = getMessageCollectionPath();


                await messagesRef.add(messageData);


                // Update group metadata based on collection type
                if (innerGroupId) {
                    // Admin-created inner group - update chats collection
                    await firestore
                        .collection('chats')
                        .doc(`${groupId}_${innerGroupId}`)
                        .set({
                            lastMessage: messageData.text || `📎 ${type}`,
                            lastMessageType: type,
                            lastMessageTime: FieldValue.serverTimestamp(),
                            participants: [userData.uid],
                            participantNames: [userData.displayName || 'Unknown'],
                            lastUpdated: FieldValue.serverTimestamp(),
                        }, { merge: true });
                } else {
                    // User-created group - update groups collection
                    await firestore
                        .collection('groups')
                        .doc(groupId)
                        .update({
                            lastMessage: messageData.text || `📎 ${type}`,
                            lastMessageType: type,
                            lastMessageTime: FieldValue.serverTimestamp(),
                            lastUpdated: FieldValue.serverTimestamp(),
                        });
                }


            }

            setReplyingTo(null);
            setShowMediaPicker(false);
            // showCustomAlert('Success', 'Media sent successfully!', 'success');

        } catch (error: any) {
            console.error('=== Error in sendMediaMessage ===');

            showCustomAlert('Error', `Failed to send media: ${error.message}`, 'error');
        } finally {
            setUploadingMedia(false);
            setUploadProgress(0);
            setUploadingMessage('');
        }
    };

    const copyMessage = async (message: Message) => {
        try {
            if (message.text) {
                await Clipboard.setString(message.text);
                showCustomAlert('Success', 'Message copied to clipboard!', 'success');
            } else {
                showCustomAlert('Error', 'No text to copy', 'error');
            }
        } catch (error) {
            console.error('Error copying message:', error);
            showCustomAlert('Error', 'Failed to copy message', 'error');
        }
    };

    const pinMessage = async (message: Message) => {
        try {
            // Update the message to be pinned
            const messagesRef = getMessageCollectionPath();
            await messagesRef
                .doc(message.id)
                .update({
                    isPinned: true,
                });

            setPinnedMessage(message);
            showCustomAlert('Success', 'Message pinned!', 'success');
        } catch (error) {
            console.error('Error pinning message:', error);
            showCustomAlert('Error', 'Failed to pin message', 'error');
        }
    };

    const unpinMessage = async () => {
        if (!pinnedMessage) return;

        try {
            const messagesRef = getMessageCollectionPath();
            await messagesRef
                .doc(pinnedMessage.id)
                .update({
                    isPinned: false,
                });

            setPinnedMessage(null);
            showCustomAlert('Success', 'Message unpinned!', 'success');
        } catch (error) {
            console.error('Error unpinning message:', error);
            showCustomAlert('Error', 'Failed to unpin message', 'error');
        }
    };

    const starMessage = async (message: Message) => {
        try {
            const isCurrentlyStarred = message.starredBy?.includes(userData?.uid || '') || false;

            if (isCurrentlyStarred) {
                // Unstar the message
                const messagesRef = getMessageCollectionPath();
                await messagesRef
                    .doc(message.id)
                    .update({
                        starredBy: FieldValue.arrayRemove(userData?.uid),
                        isStarred: false,
                    });
                showCustomAlert('Success', 'Message unstarred!', 'success');
            } else {
                // Star the message
                const messagesRef = getMessageCollectionPath();
                await messagesRef
                    .doc(message.id)
                    .update({
                        starredBy: FieldValue.arrayUnion(userData?.uid),
                        starredAt: FieldValue.serverTimestamp(),
                        isStarred: true,
                    });
                showCustomAlert('Success', 'Message starred!', 'success');
            }
        } catch (error) {
            console.error('Error starring message:', error);
            showCustomAlert('Error', 'Failed to update message', 'error');
        }
    };

    const deleteMessage = async (message: Message) => {
        Alert.alert(
            'Delete Message',
            'Are you sure you want to delete this message?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const messagesRef = getMessageCollectionPath();
                            await messagesRef
                                .doc(message.id)
                                .delete();

                            showCustomAlert('Success', 'Message deleted!', 'success');
                        } catch (error) {
                            console.error('Error deleting message:', error);
                            showCustomAlert('Error', 'Failed to delete message', 'error');
                        }
                    },
                },
            ]
        );
    };

    const replyToMessage = (message: Message) => {
        setReplyingTo(message);
    };

    const showCustomAlert = (title: string, message: string, type: 'success' | 'error' | 'info' | 'warning', onConfirm?: () => void) => {
        setCustomAlert({
            visible: true,
            title,
            message,
            type,
            onConfirm,
        });

        setTimeout(() => {
            hideCustomAlert();
        }, 3000);
    };

    const hideCustomAlert = () => {
        setCustomAlert({
            visible: false,
            title: '',
            message: '',
            type: 'info',
        });
    };

    const showMessageActions = (message: Message) => {
        setSelectedMessageForActions(message);
        setShowActionSheet(true);
        // Start animation immediately for smoother experience
        requestAnimationFrame(() => {
            animatePopupIn();
        });
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

    const getAvatarGradient = (name: string) => {
        const gradients = [
            // ['#a8edea', '#fed6e3'],
            // ['#667eea', '#764ba2'],
            // ['#f093fb', '#f5576c'],
            // ['#4facfe', '#00f2fe'],
            // ['#43e97b', '#38f9d7'],
            ['#0d9488', '#10b981'],
        ];
        const index = name.charCodeAt(0) % gradients.length;
        return gradients[index];
    };

    const MessageRow = memo(({ item }: { item: Message }) => {
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
                {/* Sender name for group chat */}
                {!isOwnMessage && (
                    <View style={styles.senderNameContainer}>
                        <Text style={[styles.senderName, { color: theme.colors.textSecondary }]}>
                            {item.senderName || 'Unknown'}
                        </Text>
                    </View>
                )}

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
                                    { color: isOwnMessage ? '#ffffff' : theme.colors.primary }
                                ]}>
                                    {item.replyTo.senderName}
                                </Text>
                                <Text
                                    style={[
                                        styles.replyText,
                                        {
                                            color: isOwnMessage
                                                ? 'rgba(255,255,255,0.95)'
                                                : '#333333'
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

                        {/* Message content */}
                        {item.messageType !== 'text' && item.mediaUrl ? (
                            <MediaMessage
                                message={item}
                                isOwnMessage={isOwnMessage}
                                onMediaPress={() => {
                                    handleMediaPress(item);
                                }}
                                onDocumentPress={() => handleDocumentPress(item)}
                                onLongPress={() => showMessageActions(item)}
                            />
                        ) : (
                            <View style={{ flexDirection: 'row', gap: 0, alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <Text style={[
                                    styles.modernMessageText,
                                    { color: isOwnMessage ? '#ffffff' : '#424242' }
                                ]}>
                                    {item.text || 'Message'}
                                </Text>
                                <Text style={[
                                    styles.modernMessageTime,
                                    { color: isOwnMessage ? '#ffffff' : '#757575' }
                                ]}>
                                    {item.timestamp ? new Date(item.timestamp.toDate()).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    }) :
                                        <Ionicons
                                            name="checkmark"
                                            size={16}
                                            color="rgba(255,255,255,0.7)" // Single white tick for delivered but unread messages
                                        />
                                    }
                                </Text>
                            </View>

                        )}

                    </MessageBubble>
                </TouchableOpacity>
            </View>
        );
    }, (prevProps, nextProps) => prevProps.item.id === nextProps.item.id
        && prevProps.item.messageType === nextProps.item.messageType
        && prevProps.item.mediaUrl === nextProps.item.mediaUrl
        && (prevProps.item.text || '') === (nextProps.item.text || '')
        && (!!prevProps.item.isPinned) === (!!nextProps.item.isPinned)
        && (Array.isArray(prevProps.item.starredBy) ? prevProps.item.starredBy.length : 0) === (Array.isArray(nextProps.item.starredBy) ? nextProps.item.starredBy.length : 0)
        && (Array.isArray(prevProps.item.readBy) ? prevProps.item.readBy.length : 0) === (Array.isArray(nextProps.item.readBy) ? nextProps.item.readBy.length : 0)
    );
    MessageRow.displayName = 'MessageRow';

    const renderMessage = useCallback(({ item }: { item: Message }) => {
        return <MessageRow item={item} />;
    }, []);

    if (!userData?.uid || !groupId) {
        return (
            <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
                <Text style={[styles.errorText, { color: theme.colors.text }]}>
                    Loading group chat...
                </Text>
            </View>
        );
    }

    const [headerColor1, headerColor2] = getAvatarGradient(groupName);

    return (
        <ImageBackground
            source={theme.isDark ? require('../assets/images/chat-bg-dark.jpeg') : require('../assets/images/chat-bg-light.jpeg')}
            style={styles.backgroundImage}
            resizeMode="cover"
        >
            <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
                {/* Modern Header with Gradient - Clickable for Group Management */}
                <TouchableOpacity onPress={openGroupManagement} activeOpacity={0.8}>
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
                                        <Ionicons name="arrow-back" size={22} color="#ffffff" />
                                    </View>
                                </TouchableOpacity>

                                <View style={styles.modernHeaderInfo}>
                                    <View style={styles.chatUserAvatar}>
                                        {group?.profileImageUrl ? (
                                            <Image source={{ uri: group.profileImageUrl }} style={styles.headerAvatarImage} />
                                        ) : (
                                            <LinearGradient
                                                colors={[headerColor1, headerColor2]}
                                                style={styles.headerAvatarGradient}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                            >
                                                <Text style={[styles.headerAvatarText, { color: '#000' }]}>
                                                    {groupName?.charAt(0)?.toUpperCase() || 'G'}
                                                </Text>
                                            </LinearGradient>
                                        )}
                                    </View>
                                    <View style={styles.headerTextContainer}>
                                        <Text style={[styles.modernHeaderName, { color: '#ffffff' }]}>{groupName || 'Group Chat'}</Text>
                                        <Text style={[styles.modernHeaderStatus, { color: 'rgba(255,255,255,0.8)' }]}>
                                            {typingUsers.size > 0 ? `${typingUsers.size} typing...` : 'Group Chat • Tap for details'}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
                                </View>
                            </View>
                        </LinearGradient>
                    </View>
                </TouchableOpacity>

                {/* Pinned Message */}
                {pinnedMessage && (
                    <View style={[styles.pinnedMessageContainer, { backgroundColor: 'transparent' }]}>
                        <Ionicons name="pin" size={16} color="#FFD700" />
                        <Text style={styles.pinnedMessageText} numberOfLines={1}>
                            {pinnedMessage.senderName || 'Unknown'}: {pinnedMessage.text || 'Message'}
                        </Text>
                        <TouchableOpacity onPress={unpinMessage}>
                            <Ionicons name="close" size={16} color="#666" />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Reply Indicator */}
                {replyingTo && (
                    <View style={[styles.replyContainer, { backgroundColor: 'transparent' }]}>
                        <View style={styles.replyContent}>
                            <Text style={styles.replyInputLabel}>Replying to {replyingTo.senderName || 'Unknown'}</Text>
                            <Text style={styles.replyText} numberOfLines={1}>{replyingTo.text || 'Message'}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setReplyingTo(null)}>
                            <Ionicons name="close" size={20} color="#666" />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Messages and Input with proper keyboard handling */}
                <KeyboardAvoidingView
                    style={styles.chatBody}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : -30}
                >
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        renderItem={renderMessage}
                        keyExtractor={(item) => item.id}
                        style={styles.modernMessagesList}
                        contentContainerStyle={styles.modernMessagesContent}
                        showsVerticalScrollIndicator={false}
                        inverted={true}
                    />

                    {/* Typing Indicators */}
                    {typingUsers.size > 0 && (
                        <View style={[styles.typingIndicator, { backgroundColor: 'transparent' }]}>
                            <View style={styles.typingContent}>
                                <View style={styles.typingAvatar}>
                                    <LinearGradient
                                        colors={getAvatarGradient('Group') as [string, string]}
                                        style={styles.typingAvatarGradient}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                    >
                                        <Text style={styles.typingAvatarText}>
                                            👥
                                        </Text>
                                    </LinearGradient>
                                </View>
                                <View style={styles.typingBubble}>
                                    <Text style={[styles.typingText, { color: theme.colors.textSecondary }]}>
                                        {typingUsers.size === 1 ? 'Someone is typing...' : `${typingUsers.size} people are typing...`}
                                    </Text>
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
                    {(uploadingMedia || uploadingVoice) && (
                        <View style={[styles.uploadingIndicator, { backgroundColor: 'transparent' }]}>
                            <View style={styles.uploadingContent}>
                                <ActivityIndicator size="small" color={theme.colors.primary} />
                                <Text style={[styles.uploadingText, { color: theme.colors.textSecondary }]}>
                                    {uploadingMessage || 'Uploading...'}
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

                    {/* Time Restriction Message */}
                    {!canSendMessage && timeRestrictionMessage && (
                        <View style={[styles.timeRestrictionBanner, { backgroundColor: 'rgba(255, 243, 205, 0.9)' }]}>
                            <Ionicons name="time" size={16} color="#856404" />
                            <Text style={[styles.timeRestrictionText, { color: '#856404' }]}>
                                {timeRestrictionMessage}
                            </Text>
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
                                disabled={uploadingMedia || uploadingVoice || !canSendMessage}
                            >
                                <Ionicons
                                    name="add-circle"
                                    size={24}
                                    color={(uploadingMedia || uploadingVoice) ? theme.colors.textSecondary : theme.colors.primary}
                                />
                            </TouchableOpacity>

                            {/* Voice Button */}
                            <TouchableOpacity
                                style={styles.voiceButton}
                                onPress={() => setShowVoiceRecorder(true)}
                                disabled={uploadingMedia || uploadingVoice || !canSendMessage}
                            >
                                <Ionicons
                                    name="mic"
                                    size={24}
                                    color={(uploadingMedia || uploadingVoice) ? theme.colors.textSecondary : theme.colors.primary}
                                />
                            </TouchableOpacity>

                            <TextInput
                                style={[
                                    styles.modernTextInput,
                                    {
                                        color: theme.colors.inputText || '#333333',
                                        backgroundColor: 'transparent',
                                        opacity: canSendMessage ? 1 : 0.5,
                                    }
                                ]}
                                value={newMessage}
                                onChangeText={handleTextChange}
                                placeholder={canSendMessage ? "Type a message..." : "Messaging restricted"}
                                placeholderTextColor={theme.colors.inputPlaceholder || '#999999'}
                                multiline
                                maxLength={1000}
                                textAlignVertical="top"
                                editable={canSendMessage}
                            />

                            <TouchableOpacity
                                style={[
                                    styles.modernSendButton,
                                    { opacity: newMessage.trim() && canSendMessage ? 1 : 0.6 }
                                ]}
                                onPress={sendMessage}
                                disabled={!newMessage.trim() || loading || uploadingMedia || uploadingVoice || !canSendMessage}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={newMessage.trim() ? ['#0d9488', '#10b981'] : ['#ccc', '#ccc']}
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

                {/* Media Picker Modal */}
                <MediaPicker
                    isVisible={showMediaPicker}
                    onClose={() => setShowMediaPicker(false)}
                    onMediaSelected={(mediaFiles) => {
                        // Determine type from the first media file
                        const firstFile = mediaFiles[0];
                        let mediaType: 'image' | 'video' | 'document' = 'document';

                        if (firstFile.type.startsWith('image/')) {
                            mediaType = 'image';
                        } else if (firstFile.type.startsWith('video/')) {
                            mediaType = 'video';
                        }

                        sendMediaMessage(mediaFiles, mediaType);
                    }}
                    onVoiceRecorded={sendVoiceMessage}
                    isUploading={uploadingMedia}
                />

                {/* Voice Recorder Modal */}
                <Modal
                    visible={showVoiceRecorder}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setShowVoiceRecorder(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Record Voice Note</Text>

                            <View style={styles.voiceRecorderContainer}>
                                {!isRecording ? (
                                    <TouchableOpacity
                                        style={styles.recordButton}
                                        onPress={startRecording}
                                        disabled={uploadingMedia}
                                    >
                                        <Ionicons name="mic" size={48} color="#667eea" />
                                        <Text style={styles.recordButtonText}>Tap to Record</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <View style={styles.recordingContainer}>
                                        <View style={styles.recordingIndicator}>
                                            <View style={styles.recordingDot} />
                                            <Text style={styles.recordingText}>
                                                Recording... {formatDuration(recordingDuration)}
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.stopButton}
                                            onPress={stopRecording}
                                        >
                                            <Ionicons name="stop-circle" size={48} color="#ff4444" />
                                            <Text style={styles.stopButtonText}>Stop Recording</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>

                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={() => setShowVoiceRecorder(false)}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                {/* Full Screen Media Modal */}
                <Modal
                    visible={showFullScreenMedia}
                    animationType="fade"
                    transparent={true}
                    onRequestClose={() => setShowFullScreenMedia(false)}
                >
                    <View style={styles.fullScreenOverlay}>
                        <TouchableOpacity
                            style={styles.fullScreenCloseButton}
                            onPress={() => setShowFullScreenMedia(false)}
                        >
                            <Ionicons name="close" size={30} color="#ffffff" />
                        </TouchableOpacity>

                        {fullScreenMedia && (
                            <Image
                                source={{ uri: fullScreenMedia.uri }}
                                style={styles.fullScreenImage}
                                resizeMode="contain"
                            />
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



                {/* Custom Alert */}
                <CustomAlert
                    visible={customAlert.visible}
                    title={customAlert.title}
                    message={customAlert.message}
                    type={customAlert.type}
                    onConfirm={customAlert.onConfirm}
                    onClose={hideCustomAlert}
                />

                {/* Action Sheet Modal */}
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
                                                {selectedMessageForActions.text || 'Media message'}
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
            </SafeAreaView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    // Background image
    backgroundImage: {
        flex: 1,
    },
    container: {
        flex: 1,
    },

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
    headerAvatarImage: {
        width: 48,
        height: 48,
        borderRadius: 24,
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

    // Pinned message styles
    pinnedMessageContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 215, 0, 0.1)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 215, 0, 0.3)',
    },
    pinnedMessageText: {
        flex: 1,
        fontSize: 14,
        color: '#666',
        marginLeft: 8,
        marginRight: 8,
    },



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

    modernMessageContainer: {
        flexDirection: 'column',
        marginVertical: 8,
        paddingHorizontal: 4,
    },
    ownMessage: {
        justifyContent: 'flex-end',
    },
    otherMessage: {
        justifyContent: 'flex-start',
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 4,
    },
    modernMessageTime: {
        fontSize: 12,
        fontWeight: '500',
        opacity: 0.8,
    },
    pinIcon: {
        marginRight: 4,
    },
    starIcon: {
        marginRight: 4,
    },

    // Media styles
    mediaImage: {
        width: 200,
        height: 150,
        borderRadius: 12,
        marginTop: 8,
    },
    videoThumbnail: {
        width: 200,
        height: 150,
        borderRadius: 12,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    videoText: {
        color: '#ffffff',
        fontSize: 14,
        marginTop: 8,
    },
    documentItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        padding: 12,
        borderRadius: 8,
        marginTop: 8,
    },
    documentText: {
        marginLeft: 8,
        fontSize: 14,
        color: '#667eea',
        fontWeight: '500',
    },

    // Reply indicator styles
    replyIndicator: {
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        padding: 8,
        borderRadius: 8,
        marginBottom: 8,
        borderLeftWidth: 3,
        borderLeftColor: '#667eea',
    },
    modernInputContainer: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderTopWidth: 1,
        paddingBottom: Platform.OS === 'ios' ? 40 : 30,
    },
    mediaButtonsContainer: {
        flexDirection: 'row',
        marginBottom: 12,
        gap: 12,
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
    recordingButton: {
        backgroundColor: 'rgba(255, 68, 68, 0.1)',
    },
    recordingIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    recordingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ff4444',
        marginRight: 8,
    },
    recordingText: {
        fontSize: 14,
        color: '#666',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        borderRadius: 28,
        paddingHorizontal: 6,
        paddingVertical: 6,
        marginBottom: 12,
        borderWidth: 1,
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

    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 25,
        width: screenWidth * 0.9,
        maxHeight: screenHeight * 0.8,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 20,
        textAlign: 'center',
    },
    mediaOptionsContainer: {
        flexDirection: 'column',
        // justifyContent: 'space-around',
        marginBottom: 20,
    },
    mediaOption: {
        alignItems: 'center',
        padding: 20,
    },
    mediaOptionText: {
        marginTop: 8,
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
    },
    cancelButton: {
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e9ecef',
    },
    cancelButtonText: {
        color: '#333',
        fontSize: 16,
        fontWeight: '600',
    },

    // Full screen media styles
    fullScreenOverlay: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullScreenModal: {
        flex: 1,
        backgroundColor: '#000000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullScreenCloseButton: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 1000,
    },
    fullScreenImage: {
        width: screenWidth,
        height: screenHeight,
    },
    documentModal: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.9)',
    },



    errorText: {
        textAlign: 'center',
        marginTop: 50,
        fontSize: 16,
        fontWeight: '500',
    },

    // Voice note styles
    voiceNoteContainer: {
        padding: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
    },

    // Voice recorder modal styles
    voiceRecorderContainer: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    recordButton: {
        alignItems: 'center',
        padding: 20,
    },
    recordButtonText: {
        marginTop: 12,
        fontSize: 16,
        color: '#667eea',
        fontWeight: '500',
    },
    recordingContainer: {
        alignItems: 'center',
    },
    stopButton: {
        alignItems: 'center',
        padding: 20,
        marginTop: 20,
    },
    stopButtonText: {
        marginTop: 12,
        fontSize: 16,
        color: '#ff4444',
        fontWeight: '500',
    },
    voiceNoteContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    voiceNoteInfo: {
        marginLeft: 8,
    },
    voiceNoteText: {
        fontSize: 14,
        fontWeight: '500',
    },
    voiceNoteDuration: {
        fontSize: 12,
        fontWeight: '400',
    },
    playingIndicator: {
        flexDirection: 'row',
        marginLeft: 10,
        alignItems: 'center',
    },
    playingDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#ff4444',
        marginHorizontal: 2,
        opacity: 0.8,
    },

    // Message wrapper for touch handling
    messageWrapper: {
        flex: 1,
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
        backgroundColor: 'rgba(71, 22, 94, 0.67)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
    },
    otherReplyContainer: {
        maxWidth: '78%',
        backgroundColor: 'rgba(71, 22, 94, 0.67)',
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

    // Reply input bar styles
    replyInputLabel: {
        fontSize: 12,
        color: '#667eea',
        fontWeight: '600',
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

    // Sender name styles for group chat
    senderNameContainer: {
        marginBottom: 4,
        marginLeft: 8,
    },
    senderName: {
        fontSize: 12,
        fontWeight: '600',
        opacity: 0.8,
    },

    // Uploading Media Indicator styles
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

    // Action Popup Modal styles
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
    actionPopupButtonText: {
        fontSize: 15,
        fontWeight: '500',
    },
    actionIconContainer: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },

    // Time restriction styles
    timeRestrictionBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ffeaa7',
    },
    timeRestrictionText: {
        fontSize: 14,
        fontWeight: '500',
        marginLeft: 8,
        flex: 1,
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
    typingText: {
        fontSize: 12,
        fontWeight: '500',
        marginBottom: 8,
        color: '#666',
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
