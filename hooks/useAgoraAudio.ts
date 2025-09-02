import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { ChannelProfileType, ClientRoleType, createAgoraRtcEngine, IRtcEngine, IRtcEngineEventHandler } from 'react-native-agora';

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

export const useAgoraAudio = (): UseAgoraAudioReturn => {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isJoined, setIsJoined] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(true);
    const [localUid, setLocalUid] = useState<number | null>(null);
    const [remoteUid, setRemoteUid] = useState<number | null>(null);
    const [callDuration, setCallDuration] = useState(0);

    const rtcEngineRef = useRef<IRtcEngine | null>(null);
    const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const joinTimeRef = useRef<number | null>(null);

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

    // Initialize Agora engine
    const initialize = useCallback(async () => {
        try {
            if (rtcEngineRef.current) {
                console.log('ℹ️ Agora engine already initialized');
                return;
            }

            console.log('🚀 Initializing Agora engine...');

            // Request permissions first
            const permissionsGranted = await requestPermissions();
            if (!permissionsGranted) {
                throw new Error('Audio permissions not granted');
            }

            // Create RTC engine using the correct method
            const rtcEngine = createAgoraRtcEngine();
            
            // Initialize with proper configuration
            rtcEngine.initialize({
                appId: AGORA_APP_ID,
                channelProfile: ChannelProfileType.ChannelProfileCommunication,
            });

            console.log('✅ Engine created and initialized successfully');

            // Enable audio
            rtcEngine.enableAudio();

            // Set audio profile for better quality
            try {
                rtcEngine.setAudioProfile(1, 2 as any); // 1 = Speech Standard, 2 = Communication Scenario
                console.log('✅ Audio profile set to Speech Standard + Communication');
            } catch (error) {
                console.log('⚠️ Audio profile setting failed, using defaults');
            }

            // Set audio route to speaker by default
            try {
                if (Platform.OS === 'ios') {
                    await rtcEngine.setDefaultAudioRouteToSpeakerphone(true);
                    console.log('✅ iOS audio route set to speakerphone');
                } else {
                    await rtcEngine.setEnableSpeakerphone(true);
                    console.log('✅ Android speakerphone enabled');
                }
            } catch (error) {
                console.log('⚠️ Audio route setting failed:', error);
            }

            // Register event handler using the correct method
            rtcEngine.registerEventHandler({
                onJoinChannelSuccess: (connection: any, elapsed: number) => {
                    console.log('🎉 Successfully joined channel:', connection, 'Elapsed:', elapsed);
                    setLocalUid(connection.localUid);
                    setIsJoined(true);
                    joinTimeRef.current = Date.now();

                    // Start duration timer
                    durationIntervalRef.current = setInterval(() => {
                        if (joinTimeRef.current) {
                            const duration = Math.floor((Date.now() - joinTimeRef.current) / 1000);
                            setCallDuration(duration);
                        }
                    }, 1000) as unknown as NodeJS.Timeout;

                    // CRITICAL: Configure audio after joining
                    setTimeout(async () => {
                        try {
                            // Force unmute local audio
                            await rtcEngine.muteLocalAudioStream(false);
                            console.log('✅ Local audio unmuted after join');

                            // Force unmute all remote audio streams
                            await rtcEngine.muteAllRemoteAudioStreams(false);
                            console.log('✅ All remote audio streams unmuted after join');

                            // Force speakerphone ON
                            if (Platform.OS === 'ios') {
                                await rtcEngine.setDefaultAudioRouteToSpeakerphone(true);
                            } else {
                                await rtcEngine.setEnableSpeakerphone(true);
                            }
                            console.log('✅ Speakerphone forced ON after join');
                        } catch (error) {
                            console.log('⚠️ Audio configuration after join failed:', error);
                        }
                    }, 100);
                },

                onUserJoined: async (connection: any, uid: number, elapsed: number) => {
                    console.log('👥 Remote user joined:', uid, 'Elapsed:', elapsed);
                    setRemoteUid(uid);

                    // CRITICAL: Configure audio when remote user joins
                    setTimeout(async () => {
                        try {
                            // Unmute the specific remote UID
                            await rtcEngine.muteRemoteAudioStream(uid, false);
                            console.log('✅ Remote audio unmuted for user:', uid);

                            // Ensure audio route is set correctly
                            if (Platform.OS === 'ios') {
                                await rtcEngine.setDefaultAudioRouteToSpeakerphone(true);
                            } else {
                                await rtcEngine.setEnableSpeakerphone(true);
                            }
                            console.log('✅ Audio route configured for remote user:', uid);

                            // Force unmute all remote audio streams again
                            await rtcEngine.muteAllRemoteAudioStreams(false);
                            console.log('✅ All remote audio streams unmuted again');
                        } catch (error) {
                            console.log('⚠️ Audio configuration for remote user failed:', error);
                        }
                    }, 100);
                },

                onUserOffline: (connection: any, uid: number, reason: number) => {
                    console.log('👋 Remote user left:', uid, 'Reason:', reason);
                    setRemoteUid(null);
                },

                onLeaveChannel: (connection: any, stats: any) => {
                    console.log('🚪 Left channel:', connection, 'Stats:', stats);
                    setIsJoined(false);
                    setLocalUid(null);
                    setRemoteUid(null);
                    setCallDuration(0);

                    // Clear duration timer
                    if (durationIntervalRef.current) {
                        clearInterval(durationIntervalRef.current);
                        durationIntervalRef.current = null;
                    }
                    joinTimeRef.current = null;
                },

                onAudioVolumeIndication: (connection: any, speakers: any[], totalVolume: number) => {
                    console.log('🔊 Audio volume indication:', speakers.length, 'speakers, Total:', totalVolume);
                },

                onConnectionStateChanged: (connection: any, state: number, reason: number) => {
                    console.log('🔗 Connection state changed:', state, 'Reason:', reason);
                },
            } as IRtcEngineEventHandler);

            console.log('✅ Event handlers registered successfully');

            rtcEngineRef.current = rtcEngine;
            setIsInitialized(true);
            console.log('✅ Agora engine initialization completed');

        } catch (error) {
            console.error('❌ Failed to initialize Agora engine:', error);
            throw error;
        }
    }, []);

    // Join channel
    const joinChannel = useCallback(async (channelId: string, token: string, uid: number) => {
        try {
            if (!rtcEngineRef.current) {
                throw new Error('Agora engine not initialized');
            }

            console.log('🚪 Joining channel:', channelId, 'with UID:', uid);

            // Join channel using the correct method
           const result = rtcEngineRef.current.joinChannel(
                token || '',
                channelId,
                uid,
                {
                  clientRoleType: ClientRoleType.ClientRoleBroadcaster,
                  channelProfile: ChannelProfileType.ChannelProfileCommunication,
                }
              );
              console.log("Join result:", result);
            console.log('✅ Channel join request sent successfully');

        } catch (error) {
            console.error('❌ Failed to join channel:', error);
            throw error;
        }
    }, []);

    // Leave channel
    const leaveChannel = useCallback(async () => {
        try {
            if (!rtcEngineRef.current || !isJoined) {
                return;
            }

            console.log('🚪 Leaving channel...');

            await rtcEngineRef.current.leaveChannel();

        } catch (error) {
            console.error('❌ Failed to leave channel:', error);
            throw error;
        }
    }, [isJoined]);

    // Toggle mute
    const toggleMute = useCallback(async () => {
        try {
            if (!rtcEngineRef.current) {
                return;
            }

            const newMuteState = !isMuted;
            await rtcEngineRef.current.muteLocalAudioStream(newMuteState);
            setIsMuted(newMuteState);
            console.log('🔇 Mute toggled:', newMuteState);

        } catch (error) {
            console.error('❌ Failed to toggle mute:', error);
        }
    }, [isMuted]);

    // Set mute state
    const setMute = useCallback(async (muted: boolean) => {
        try {
            if (!rtcEngineRef.current) {
                return;
            }

            await rtcEngineRef.current.muteLocalAudioStream(muted);
            setIsMuted(muted);
            console.log('🔇 Mute set to:', muted);

        } catch (error) {
            console.error('❌ Failed to set mute:', error);
        }
    }, []);

    // Toggle speaker
    const toggleSpeaker = useCallback(async () => {
        try {
            if (!rtcEngineRef.current) {
                return;
            }

            const newSpeakerState = !isSpeakerOn;

            if (Platform.OS === 'ios') {
                await rtcEngineRef.current.setDefaultAudioRouteToSpeakerphone(newSpeakerState);
            } else {
                await rtcEngineRef.current.setEnableSpeakerphone(newSpeakerState);
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
            if (!rtcEngineRef.current) {
                return;
            }

            if (Platform.OS === 'ios') {
                await rtcEngineRef.current.setDefaultAudioRouteToSpeakerphone(enabled);
            } else {
                await rtcEngineRef.current.setEnableSpeakerphone(enabled);
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
            // Clear duration timer
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
                durationIntervalRef.current = null;
            }

            // Leave channel if joined
            if (rtcEngineRef.current && isJoined) {
                await rtcEngineRef.current.leaveChannel();
            }

            // Release engine
            if (rtcEngineRef.current) {
                try {
                    await rtcEngineRef.current.release();
                    console.log('✅ Engine released successfully');
                } catch (releaseError) {
                    console.log('⚠️ Engine release failed:', releaseError);
                }
                rtcEngineRef.current = null;
            }

            // Reset state
            setIsInitialized(false);
            setIsJoined(false);
            setIsMuted(false);
            setIsSpeakerOn(true);
            setLocalUid(null);
            setRemoteUid(null);
            setCallDuration(0);
            joinTimeRef.current = null;

            console.log('🧹 Agora engine cleaned up');

        } catch (error) {
            console.error('❌ Error during cleanup:', error);
        }
    }, [isJoined]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    return {
        // State
        isInitialized,
        isJoined,
        isMuted,
        isSpeakerOn,
        localUid,
        remoteUid,
        callDuration,

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