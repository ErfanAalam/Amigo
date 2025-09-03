import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import {
    AudioProfileType,
    AudioScenarioType,
    ChannelProfileType,
    ClientRoleType,
    ConnectionChangedReasonType,
    ConnectionStateType,
    createAgoraRtcEngine,
    IRtcEngine,
    IRtcEngineEventHandler
} from 'react-native-agora';

// Singleton Agora engine instance
let globalAgoraEngine: IRtcEngine | null = null;
let isEngineInitialized = false;
let eventHandlersRegistered = false;
let isCallActive = false;
let callEndRequested = false;
let currentChannelId: string | null = null;
let isCleaningUp = false;
let cleanupInProgress = false;

// Note: Global callbacks removed as we're using direct event handlers

// Global cleanup function for app shutdown
export const cleanupGlobalAgoraEngine = async () => {
    if (globalAgoraEngine) {
        try {
            console.log('🧹 Starting global cleanup...');
            isCleaningUp = true;
            callEndRequested = true;
            isCallActive = false;

            // Force mute all audio streams
            try {
                 globalAgoraEngine.muteLocalAudioStream(true);
                 globalAgoraEngine.muteAllRemoteAudioStreams(true);
                console.log('✅ All audio streams muted during global cleanup');
            } catch (error) {
                console.log('⚠️ Error muting audio streams during global cleanup:', error);
            }

            // Disable monitoring to prevent reconnection
            try {
                // Note: These methods don't exist in the current API, so we'll rely on engine release
                console.log('✅ Preparing to release engine during global cleanup');
            } catch (error) {
                console.log('⚠️ Error preparing engine release during global cleanup:', error);
            }

            // Leave channel
             globalAgoraEngine.leaveChannel();
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Release engine
            await globalAgoraEngine.release();
            console.log('✅ Global Agora engine released successfully');
        } catch (error) {
            console.log('⚠️ Global engine release failed:', error);
        }
        globalAgoraEngine = null;
        isEngineInitialized = false;
        eventHandlersRegistered = false;
        isCleaningUp = false;
        cleanupInProgress = false;
        currentChannelId = null;
        isCallActive = false;
        callEndRequested = false;
    }
};

// Function to completely reset global state (for call cleanup)
export const resetGlobalAgoraState = () => {
    console.log('🔄 Resetting global Agora state...');
    isCallActive = false;
    callEndRequested = false; // Reset to false for new calls
    isCleaningUp = false; // Reset to false for new calls
    cleanupInProgress = false; // Reset to false for new calls
    currentChannelId = null;
    console.log('✅ Global Agora state reset');
};

// Utility function to check singleton status
export const getAgoraEngineStatus = () => {
    return {
        engineExists: !!globalAgoraEngine,
        isInitialized: isEngineInitialized,
        eventHandlersRegistered: eventHandlersRegistered,
        isCallActive: isCallActive,
        callEndRequested: callEndRequested,
        currentChannelId: currentChannelId,
        isCleaningUp: isCleaningUp,
        cleanupInProgress: cleanupInProgress,
        engineId: globalAgoraEngine ? 'SINGLETON_INSTANCE' : 'NO_ENGINE'
    };
};

// Note: Global event handlers are now registered inline to avoid unused function warning

// Agora App ID from your configuration
const AGORA_APP_ID = '2a9f25085e0e43ef8f32986b30064056';

export interface UseAgoraAudioReturn {
    // State
    isInitialized: boolean;
    isJoined: boolean;
    isMuted: boolean;
    isSpeakerOn: boolean;
    localUid: number | null;
    remoteUid: number | null;
    callDuration: number;
    connectionState: ConnectionStateType | null;

    // Actions
    initialize: () => Promise<void>;
    joinChannel: (channelId: string, token: string, uid: number) => Promise<void>;
    leaveChannel: () => Promise<void>;
    toggleMute: () => Promise<void>;
    toggleSpeaker: () => Promise<void>;
    setMute: (muted: boolean) => Promise<void>;
    setSpeaker: (enabled: boolean) => Promise<void>;

    // Cleanup
    cleanup: () => void;
}

export const useAgoraAudio = (onCallStatusChange?: (status: 'connecting' | 'connected' | 'ended') => void): UseAgoraAudioReturn => {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isJoined, setIsJoined] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(true);
    const [localUid, setLocalUid] = useState<number | null>(null);
    const [remoteUid, setRemoteUid] = useState<number | null>(null);
    const [callDuration, setCallDuration] = useState(0);
    const [connectionState, setConnectionState] = useState<ConnectionStateType | null>(null);

    const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const joinTimeRef = useRef<number | null>(null);
    const stateUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isCleaningUpRef = useRef<boolean>(false);

    // Debounced state update to prevent rapid UI changes
    const debouncedStateUpdate = useCallback((updateFn: () => void, delay: number = 300) => {
        if (stateUpdateTimeoutRef.current) {
            clearTimeout(stateUpdateTimeoutRef.current);
        }
        stateUpdateTimeoutRef.current = setTimeout(updateFn, delay) as unknown as NodeJS.Timeout;
    }, []);

    // Request Android permissions
    const requestPermissions = async () => {
        if (Platform.OS === 'android') {
            try {
                const granted = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, // Android 12+
                ]);

                if (granted['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED) {
                    console.log('✅ Audio permissions granted');
                    return true;
                } else {
                    console.log('❌ Audio permissions denied');
                    return false;
                }
            } catch (error) {
                console.error('❌ Error requesting permissions:', error);
                return false;
            }
        }
        return true; // iOS permissions are handled in Info.plist
    };

    // Initialize Agora engine (singleton pattern)
    const initialize = useCallback(async () => {
        try {
            // Check if already initialized for this hook instance
            if (isInitialized) {
                console.log('ℹ️ Hook already initialized, skipping...');
                return;
            }

            console.log('🚀 Initializing Agora engine...');

            // Request permissions first
            const permissionsGranted = await requestPermissions();
            if (!permissionsGranted) {
                throw new Error('Audio permissions not granted');
            }

            // Use singleton engine instance - but recreate if it was released
            if (!globalAgoraEngine) {
                globalAgoraEngine = createAgoraRtcEngine();
                console.log('✅ Global engine created successfully (SINGLETON)');
            } else {
                console.log('ℹ️ Global engine already exists, reusing (SINGLETON)...');
            }

            // Initialize the engine only if not already initialized globally
            if (!isEngineInitialized) {
                globalAgoraEngine.initialize({
                    appId: AGORA_APP_ID,
                    channelProfile: ChannelProfileType.ChannelProfileCommunication,
                });

                console.log('✅ Engine initialized successfully');
                isEngineInitialized = true;
            } else {
                console.log('ℹ️ Engine already initialized globally, skipping...');
            }

            // Enable audio
            globalAgoraEngine.enableAudio();

            // Set audio profile for better quality using correct enum values
            try {
                globalAgoraEngine.setAudioProfile(
                    AudioProfileType.AudioProfileDefault,
                    AudioScenarioType.AudioScenarioDefault
                );
                console.log('✅ Audio profile set to Default + Default');
            } catch (profileError) {
                console.log('⚠️ Audio profile setting failed, using defaults:', profileError);
            }

            // Set audio route to speaker by default
            try {
                if (Platform.OS === 'ios') {
                    await globalAgoraEngine.setDefaultAudioRouteToSpeakerphone(true);
                    console.log('✅ iOS audio route set to speakerphone');
                } else {
                    await globalAgoraEngine.setEnableSpeakerphone(true);
                    console.log('✅ Android speakerphone enabled');
                }
            } catch (routeError) {
                console.log('⚠️ Audio route setting failed:', routeError);
            }

            // Register event handler using the correct method
            // Note: We need to be careful about multiple registrations
            if (!eventHandlersRegistered) {
                globalAgoraEngine.registerEventHandler({
                    onJoinChannelSuccess: (connection: any, elapsed: number) => {
                        console.log('🎉 Successfully joined channel:', connection, 'Elapsed:', elapsed);

                        // Skip if we're in cleanup mode or call end was requested
                        if (isCleaningUpRef.current || isCleaningUp || callEndRequested || cleanupInProgress) {
                            console.log('⚠️ Skipping join success during cleanup or call end requested');
                            return;
                        }

                        // Set call as active and reset call end requested flag
                        isCallActive = true;
                        callEndRequested = false;

                        // Always update local UID and joined state
                        // Use debounced state update to prevent rapid UI changes
                        debouncedStateUpdate(() => {
                            setLocalUid(connection.localUid);
                            setIsJoined(true);
                            // Don't start timer yet - wait for remote user
                            joinTimeRef.current = null;
                        }, 100);
                        
                        // Notify that we've joined the channel (but not fully connected yet)
                        console.log('📞 Calling onCallStatusChange with connecting status');
                        onCallStatusChange?.('connecting');

                        // CRITICAL: Configure audio after joining
                        setTimeout(async () => {
                            try {
                                // Skip audio configuration if cleanup started
                                if (isCleaningUpRef.current || isCleaningUp || callEndRequested) {
                                    console.log('⚠️ Skipping audio configuration - cleanup started');
                                    return;
                                }

                                // Force unmute local audio
                                await globalAgoraEngine!.muteLocalAudioStream(false);
                                console.log('✅ Local audio unmuted after join');

                                // Force unmute all remote audio streams
                                await globalAgoraEngine!.muteAllRemoteAudioStreams(false);
                                console.log('✅ All remote audio streams unmuted after join');

                                // Force speakerphone ON
                                if (Platform.OS === 'ios') {
                                    await globalAgoraEngine!.setDefaultAudioRouteToSpeakerphone(true);
                                } else {
                                    await globalAgoraEngine!.setEnableSpeakerphone(true);
                                }
                                console.log('✅ Speakerphone forced ON after join');
                            } catch (error) {
                                console.log('⚠️ Audio configuration after join failed:', error);
                            }
                        }, 500);
                        
                        // Fallback: Start timer after a delay if no remote user joins
                        // This handles cases where onUserJoined might not fire
                        setTimeout(() => {
                            if (!joinTimeRef.current && isCallActive && !callEndRequested && !isCleaningUp) {
                                console.log('⏰ Fallback: Starting timer without remote user');
                                joinTimeRef.current = Date.now();
                                
                                // Start duration timer
                                durationIntervalRef.current = setInterval(() => {
                                    if (joinTimeRef.current && !callEndRequested && !isCleaningUp) {
                                        const duration = Math.floor((Date.now() - joinTimeRef.current) / 1000);
                                        setCallDuration(duration);
                                    }
                                }, 1000) as unknown as NodeJS.Timeout;
                                
                                // Notify that call is now connected
                                console.log('📞 Fallback: Calling onCallStatusChange with connected status');
                                onCallStatusChange?.('connected');
                            }
                        }, 3000);
                    },

                    onUserJoined: async (connection: any, uid: number, elapsed: number) => {
                        console.log('👥 Remote user joined:', uid, 'Elapsed:', elapsed);

                        // Skip if we're in cleanup mode or call end was requested
                        if (isCleaningUpRef.current || isCleaningUp || callEndRequested || cleanupInProgress) {
                            console.log('⚠️ Skipping user joined during cleanup or call end requested');
                            return;
                        }

                        // Always update remote UID and start timer when remote user joins
                        // Use debounced state update to prevent rapid UI changes
                        debouncedStateUpdate(() => {
                            setRemoteUid(uid);
                            // Start timer when remote user joins (call is now active)
                            if (!joinTimeRef.current && !callEndRequested && !isCleaningUp) {
                                joinTimeRef.current = Date.now();
                                console.log('⏰ Call timer started - both users connected');
                                
                                // Start duration timer
                                durationIntervalRef.current = setInterval(() => {
                                    if (joinTimeRef.current && !callEndRequested && !isCleaningUp) {
                                        const duration = Math.floor((Date.now() - joinTimeRef.current) / 1000);
                                        setCallDuration(duration);
                                    }
                                }, 1000) as unknown as NodeJS.Timeout;
                                
                                // Notify that call is now connected
                                console.log('📞 Calling onCallStatusChange with connected status');
                                onCallStatusChange?.('connected');
                            }
                        }, 100);

                        // CRITICAL: Configure audio when remote user joins
                        setTimeout(async () => {
                            try {
                                // Skip audio configuration if cleanup started
                                if (isCleaningUpRef.current || isCleaningUp || callEndRequested) {
                                    console.log('⚠️ Skipping audio configuration for remote user - cleanup started');
                                    return;
                                }

                                // Unmute the specific remote UID
                                await globalAgoraEngine!.muteRemoteAudioStream(uid, false);
                                console.log('✅ Remote audio unmuted for user:', uid);

                                // Ensure audio route is set correctly
                                if (Platform.OS === 'ios') {
                                    await globalAgoraEngine!.setDefaultAudioRouteToSpeakerphone(true);
                                } else {
                                    await globalAgoraEngine!.setEnableSpeakerphone(true);
                                }
                                console.log('✅ Audio route configured for remote user:', uid);

                                // Force unmute all remote audio streams again
                                await globalAgoraEngine!.muteAllRemoteAudioStreams(false);
                                console.log('✅ All remote audio streams unmuted again');
                                
                                // Also ensure local audio is unmuted
                                await globalAgoraEngine!.muteLocalAudioStream(false);
                                console.log('✅ Local audio ensured unmuted for remote user');
                            } catch (error) {
                                console.log('⚠️ Audio configuration for remote user failed:', error);
                            }
                        }, 500);
                    },

                    onUserOffline: (connection: any, uid: number, reason: number) => {
                        console.log('👋 Remote user left:', uid, 'Reason:', reason);

                        // Use debounced state update to prevent rapid UI changes
                        debouncedStateUpdate(() => {
                            setRemoteUid(null);
                        }, 100);
                    },

                    onLeaveChannel: (connection: any, stats: any) => {
                        console.log('🚪 Left channel:', connection, 'Stats:', stats);

                        // Set call as inactive and cleanup flags
                        isCallActive = false;
                        callEndRequested = true;
                        isCleaningUp = true;

                        // Use debounced state update to prevent rapid UI changes
                        debouncedStateUpdate(() => {
                            setIsJoined(false);
                            setLocalUid(null);
                            setRemoteUid(null);
                            setCallDuration(0);
                            joinTimeRef.current = null;
                        }, 100);

                        // Clear duration timer
                        if (durationIntervalRef.current) {
                            clearInterval(durationIntervalRef.current);
                            durationIntervalRef.current = null;
                        }

                        // Reset global state
                        currentChannelId = null;

                        // Don't notify call ended on leave channel - let the endCall function handle it
                        console.log('⚠️ onLeaveChannel triggered, not notifying call ended');

                        // Force mute all audio streams to ensure no audio continues
                        setTimeout(async () => {
                            try {
                                if (globalAgoraEngine) {
                                    await globalAgoraEngine.muteLocalAudioStream(true);
                                    await globalAgoraEngine.muteAllRemoteAudioStreams(true);
                                    console.log('✅ All audio streams muted after leaving channel');
                                    
                                    // Mute again after a short delay to ensure it sticks
                                    setTimeout(async () => {
                                        try {
                                            if (globalAgoraEngine) {
                                                await globalAgoraEngine.muteLocalAudioStream(true);
                                                await globalAgoraEngine.muteAllRemoteAudioStreams(true);
                                                console.log('✅ All audio streams muted again after leaving channel');
                                            }
                                        } catch (error) {
                                            console.log('⚠️ Error muting audio streams again after leave:', error);
                                        }
                                    }, 200);
                                }
                            } catch (error) {
                                console.log('⚠️ Error muting audio streams after leave:', error);
                            }
                        }, 500);
                    },

                    onAudioVolumeIndication: (connection: any, speakers: any[], totalVolume: number) => {
                        console.log('🔊 Audio volume indication:', speakers.length, 'speakers, Total:', totalVolume);
                    },

                    onConnectionStateChanged: (connection: any, state: ConnectionStateType, reason: ConnectionChangedReasonType) => {
                        console.log('🔗 Connection state changed:', state, 'Reason:', reason);

                        // Skip connection state changes during cleanup or after call end
                        if (isCleaningUpRef.current || isCleaningUp || callEndRequested || cleanupInProgress) {
                            console.log('⚠️ Skipping connection state change during cleanup');
                            return;
                        }

                        // Only update connection state for stable states to prevent UI fluctuation
                        if (state === ConnectionStateType.ConnectionStateConnected ||
                            state === ConnectionStateType.ConnectionStateDisconnected) {
                            setConnectionState(state);
                        }

                        // Handle connection state changes
                        if (state === ConnectionStateType.ConnectionStateConnected) {
                            console.log('✅ Connection established successfully');
                        } else if (state === ConnectionStateType.ConnectionStateDisconnected) {
                            console.log('❌ Connection lost');
                        } else if (state === ConnectionStateType.ConnectionStateConnecting) {
                            console.log('🔄 Connecting...');
                        } else if (state === ConnectionStateType.ConnectionStateReconnecting) {
                            console.log('🔄 Reconnecting...');
                        }
                    },

                    onError: (err: number, msg: string) => {
                        console.error('❌ Agora Error:', err, msg);

                        // Handle specific error codes
                        switch (err) {
                            case 110:
                                console.error('❌ Token Error: Invalid or expired token');
                                break;
                            case 17:
                                console.error('❌ Join Error: Failed to join channel');
                                break;
                            case 18:
                                console.error('❌ Leave Error: Failed to leave channel');
                                break;
                            case 19:
                                console.error('❌ Already in Channel: User already in channel');
                                break;
                            case 20:
                                console.error('❌ Token Expired: Token has expired');
                                break;
                            default:
                                console.error(`❌ Unknown Error: ${err} - ${msg}`);
                        }
                    },

                    onTokenPrivilegeWillExpire: (connection: any, token: string) => {
                        console.log('⚠️ Token will expire soon');
                    },

                    onRequestToken: (connection: any) => {
                        console.log('🔄 Token requested');
                    },

                    onLocalAudioStateChanged: (connection: any, state: number, error: number) => {
                        console.log('🎤 Local audio state changed:', state, 'Error:', error);
                    },

                    onRemoteAudioStateChanged: (connection: any, uid: number, state: number, reason: number, elapsed: number) => {
                        console.log('🔊 Remote audio state changed for user:', uid, 'State:', state, 'Reason:', reason);
                    },
                } as IRtcEngineEventHandler);

                eventHandlersRegistered = true;
                console.log('✅ Event handlers registered successfully');
            } else {
                console.log('ℹ️ Event handlers already registered, skipping...');
            }

            // Store reference to global engine for this hook instance
            // Note: We don't store it in rtcEngineRef anymore since we use global singleton
            setIsInitialized(true);
            console.log('✅ Agora engine initialization completed');

        } catch (error) {
            console.error('❌ Failed to initialize Agora engine:', error);
            throw error;
        }
    }, [isInitialized, debouncedStateUpdate, onCallStatusChange]);

    // Join channel
    const joinChannel = useCallback(async (channelId: string, token: string, uid: number) => {
        try {
            if (!globalAgoraEngine) {
                throw new Error('Agora engine not initialized');
            }

            // CRITICAL: Reset ALL global state for new call
            console.log('🔄 Resetting ALL global state for new call');
            callEndRequested = false;
            isCleaningUp = false;
            isCleaningUpRef.current = false;
            cleanupInProgress = false;
            isCallActive = false; // Reset call active state
            currentChannelId = null; // Reset current channel
            
            // Force reset all global state to ensure clean start
            resetGlobalAgoraState();

            console.log('🚪 Joining channel:', channelId, 'with UID:', uid);

            // If already joined to the same channel, don't join again
            if (isJoined && currentChannelId === channelId) {
                console.log('ℹ️ Already joined to the same channel, skipping...');
                return;
            }

            // If already joined to a different channel, leave first
            if (isJoined && currentChannelId !== channelId) {
                console.log('🔄 Already joined to a different channel, leaving first...');
                isCleaningUpRef.current = true;
                isCleaningUp = true;
                 globalAgoraEngine.leaveChannel();
                setIsJoined(false);
                setLocalUid(null);
                setRemoteUid(null);

                // Wait for the leave to complete
                await new Promise(resolve => setTimeout(resolve, 2000));
                isCleaningUpRef.current = false;
                isCleaningUp = false;
            }

            // Join channel using the correct method with proper options
            const result = globalAgoraEngine.joinChannel(
                token || '',
                channelId,
                uid,
                {
                    clientRoleType: ClientRoleType.ClientRoleBroadcaster,
                    channelProfile: ChannelProfileType.ChannelProfileCommunication,
                    publishMicrophoneTrack: true,
                    publishCameraTrack: false,
                    publishScreenTrack: false,
                    autoSubscribeAudio: true,
                    autoSubscribeVideo: false,
                }
            );

            console.log("Join result:", result);

            // Handle specific error codes
            if (result !== 0) {
                switch (result) {
                    case -17:
                        console.log('⚠️ User already in channel, this is expected - connection will be established');
                        
                        console.log('uid', uid);

                        // Don't throw error for -17, let the connection establish naturally
                        break;
                    default:
                        throw new Error(`Failed to join channel: ${result}`);
                }
            }

            // Track current channel and set call as active
            currentChannelId = channelId;
            isCallActive = true;
            callEndRequested = false;
            console.log('✅ Channel join request sent successfully');

        } catch (error) {
            console.error('❌ Failed to join channel:', error);
            throw error;
        }
    }, [isJoined]);

    // Leave channel
    const leaveChannel = useCallback(async () => {
        try {
            if (!globalAgoraEngine) {
                console.log('⚠️ No global engine available for leave');
                return;
            }

            console.log('🚪 Leaving channel...');

            // Set cleanup flags before leaving
            isCleaningUpRef.current = true;
            isCleaningUp = true;
            callEndRequested = true;
            isCallActive = false;

            // Leave the channel
            await globalAgoraEngine.leaveChannel();
            console.log('✅ Left channel successfully');

            // Reset global state
            currentChannelId = null;

        } catch (error) {
            console.error('❌ Failed to leave channel:', error);
            throw error;
        }
    }, []);

    // Toggle mute
    const toggleMute = useCallback(async () => {
        try {
            if (!globalAgoraEngine) {
                return;
            }

            const newMuteState = !isMuted;
            globalAgoraEngine.muteLocalAudioStream(newMuteState);
            setIsMuted(newMuteState);
            console.log('🔇 Mute toggled:', newMuteState);

        } catch (error) {
            console.error('❌ Failed to toggle mute:', error);
        }
    }, [isMuted]);

    // Set mute state
    const setMute = useCallback(async (muted: boolean) => {
        try {
            if (!globalAgoraEngine) {
                return;
            }

            await globalAgoraEngine.muteLocalAudioStream(muted);
            setIsMuted(muted);
            console.log('🔇 Mute set to:', muted);

        } catch (error) {
            console.error('❌ Failed to set mute:', error);
        }
    }, []);

    // Toggle speaker
    const toggleSpeaker = useCallback(async () => {
        try {
            if (!globalAgoraEngine) {
                return;
            }

            const newSpeakerState = !isSpeakerOn;

            if (Platform.OS === 'ios') {
                await globalAgoraEngine.setDefaultAudioRouteToSpeakerphone(newSpeakerState);
            } else {
                await globalAgoraEngine.setEnableSpeakerphone(newSpeakerState);
            }

            setIsSpeakerOn(newSpeakerState);
            console.log('🔊 Speaker toggled:', newSpeakerState);

        } catch (error) {
            console.error('❌ Failed to toggle speaker:', error);
        }
    }, [isSpeakerOn]);

    // Set speaker state
    const setSpeaker = useCallback(async (enabled: boolean) => {
        try {
            if (!globalAgoraEngine) {
                return;
            }

            if (Platform.OS === 'ios') {
                await globalAgoraEngine.setDefaultAudioRouteToSpeakerphone(enabled);
            } else {
                await globalAgoraEngine.setEnableSpeakerphone(enabled);
            }

            setIsSpeakerOn(enabled);
            console.log('🔊 Speaker set to:', enabled);

        } catch (error) {
            console.error('❌ Failed to set speaker:', error);
        }
    }, []);

    // Cleanup function
    const cleanup = useCallback(async () => {
        try {
            // Prevent multiple cleanup calls
            if (cleanupInProgress) {
                console.log('⚠️ Cleanup already in progress, skipping...');
                return;
            }
            
            console.log('🧹 Starting cleanup...');
            cleanupInProgress = true;
            isCleaningUpRef.current = true;
            isCleaningUp = true;
            
            // Always set call end requested when cleanup is called
            callEndRequested = true;
            isCallActive = false; // Set call as inactive

            // Clear duration timer
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
                durationIntervalRef.current = null;
            }

            // Clear debounce timeout
            if (stateUpdateTimeoutRef.current) {
                clearTimeout(stateUpdateTimeoutRef.current);
                stateUpdateTimeoutRef.current = null;
            }

            // Force mute all audio streams immediately
            if (globalAgoraEngine) {
                try {
                    console.log('🔇 Force muting all audio streams...');
                    await globalAgoraEngine.muteLocalAudioStream(true);
                    await globalAgoraEngine.muteAllRemoteAudioStreams(true);
                    console.log('✅ All audio streams muted during cleanup');
                } catch (error) {
                    console.log('⚠️ Error muting audio streams during cleanup:', error);
                }
            }

            // Leave channel if joined
            if (globalAgoraEngine && isJoined) {
                console.log('🚪 Leaving channel during cleanup...');
                try {
                    await globalAgoraEngine.leaveChannel();
                    console.log('✅ Left channel during cleanup');
                } catch (error) {
                    console.log('⚠️ Error leaving channel during cleanup:', error);
                }

                // Wait for leave to complete
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // CRITICAL: Completely release the engine to prevent reconnection attempts
            if (globalAgoraEngine) {
                try {
                    console.log('🚫 Releasing Agora engine to prevent reconnection...');
                    
                    // Release the engine completely
                    await globalAgoraEngine.release();
                    console.log('✅ Agora engine released');
                    
                    // Reset global engine state
                    globalAgoraEngine = null;
                    isEngineInitialized = false;
                    eventHandlersRegistered = false;
                    
                } catch (error) {
                    console.log('⚠️ Error releasing Agora engine:', error);
                }
            }

            // CRITICAL: Reset ALL global state to prevent reconnection attempts
            console.log('🔄 Resetting all global state...');
            resetGlobalAgoraState();

            // Reset hook state immediately
            setIsInitialized(false);
            setIsJoined(false);
            setIsMuted(false);
            setIsSpeakerOn(true);
            setLocalUid(null);
            setRemoteUid(null);
            setCallDuration(0);
            setConnectionState(null);
            joinTimeRef.current = null;

            // Final cleanup of global state - ensure all flags are reset
            isCleaningUpRef.current = false;
            isCleaningUp = false;
            cleanupInProgress = false;
            callEndRequested = false;
            isCallActive = false;
            currentChannelId = null;
            
            console.log('✅ Complete cleanup finished - engine ready for new calls');

        } catch (error) {
            console.error('❌ Error during cleanup:', error);
            isCleaningUpRef.current = false;
            isCleaningUp = false;
            cleanupInProgress = false;
        }
    }, [isJoined]);

    // Don't cleanup on unmount - let the call end naturally
    useEffect(() => {
        return () => {
            console.log('🧹 Hook unmounting, but not cleaning up to prevent call interruption');
        };
    }, []);

    return {
        // State
        isInitialized,
        isJoined,
        isMuted,
        isSpeakerOn,
        localUid,
        remoteUid,
        callDuration,
        connectionState,

        // Actions
        initialize,
        joinChannel,
        leaveChannel,
        toggleMute,
        toggleSpeaker,
        setMute,
        setSpeaker,

        // Cleanup
        cleanup,
    };
};