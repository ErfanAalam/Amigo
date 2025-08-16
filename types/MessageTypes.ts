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
  isPinned?: boolean; // whether message is pinned
  isStarred?: boolean; // whether message is starred
  pinnedAt?: any; // timestamp when message was pinned
  pinnedBy?: string; // user ID who pinned the message
  starredAt?: any; // timestamp when message was starred
  starredBy?: string[]; // array of user IDs who starred the message
  replyTo?: ReplyReference; // reference to the message being replied to
  forwardedFrom?: ForwardedFrom; // information about who forwarded the message
  deletedFor?: string[]; // array of user IDs who have deleted this message
  deletedAt?: any; // timestamp when message was deleted
}

export interface ForwardedFrom {
  senderName: string;
  senderId: string;
}

export interface ReplyReference {
  messageId: string;
  messageText?: string;
  messageType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'voice';
  senderName: string;
  senderId: string;
  mediaName?: string; // for media messages
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
