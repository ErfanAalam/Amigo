export interface Call {
  id: string;
  callerId: string;
  calleeId: string;
  channelId: string;
  status: 'ringing' | 'accepted' | 'ended' | 'declined';
  createdAt: any;
  acceptedAt?: any;
  endedAt?: any;
  duration?: number; // in seconds
  callerName?: string;
  calleeName?: string;
}

export interface CallState {
  isInCall: boolean;
  isMuted: boolean;
  isSpeakerOn: boolean;
  channelId: string | null;
  remoteUid: number | null;
  localUid: number | null;
  callDuration: number; // in seconds
}

export interface CallNotification {
  callId: string;
  callerId: string;
  callerName: string;
  channelId: string;
  timestamp: any;
}

export interface AgoraTokenResponse {
  token: string;
  channelId: string;
  uid: string;
}
