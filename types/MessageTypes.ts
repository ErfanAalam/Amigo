export interface Message {
  id: string;
  text?: string;
  senderId: string;
  senderName: string;
  timestamp: any;
  messageType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'voice';
  mediaUrl?: string;
  mediaThumbnail?: string;
  mediaName?: string;
  mediaSize?: number;
  mediaDuration?: number; // for audio/video
  isRead: boolean;
  readBy: string[]; // array of user IDs who have read the message
  readAt?: any; // timestamp when message was read
}

export interface MediaFile {
  uri: string;
  name: string;
  size: number;
  type: string;
  duration?: number;
}

export interface VoiceNote {
  uri: string;
  duration: number;
  size: number;
}
