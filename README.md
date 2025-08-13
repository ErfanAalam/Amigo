# Amigo - Modern Chat Application

A feature-rich chat application built with React Native, Expo, and Firebase, featuring modern UI design and comprehensive messaging capabilities.

## 🚀 Features

### Core Chat Features
- **Real-time Messaging**: Instant message delivery using Firebase Firestore
- **User Authentication**: Secure login/signup with Firebase Auth
- **Contact Management**: Add and manage contacts from your device
- **Group Chats**: Create and participate in group conversations
- **Modern UI**: Beautiful, responsive design with dark/light theme support

### Media Sharing
- **Images & Videos**: Send photos and videos from camera or gallery
- **Documents**: Share PDFs, Word documents, and other file types
- **Audio Files**: Send music and audio clips
- **Voice Notes**: Record and send voice messages (like WhatsApp)

### Message Features
- **Read Receipts**: See when your messages are read (blue ticks)
- **Message Status**: Visual indicators for sent, delivered, and read messages
- **Media Preview**: Rich previews for all media types
- **File Downloads**: Save received documents to your device

### Advanced Features
- **Real-time Updates**: Live chat synchronization across devices
- **Offline Support**: Messages are cached and synced when online
- **Push Notifications**: Get notified of new messages (coming soon)
- **Search**: Find messages and conversations quickly
- **Responsive Design**: Works seamlessly on all screen sizes

## 🛠️ Technology Stack

- **Frontend**: React Native with Expo
- **Backend**: Firebase (Firestore, Auth, Storage)
- **State Management**: React Context API
- **UI Components**: Custom components with Expo Vector Icons
- **Media Handling**: Expo Image Picker, Document Picker, Audio Recording
- **File Storage**: Firebase Cloud Storage
- **Real-time**: Firebase Firestore listeners

## 📱 Installation

### Prerequisites
- Node.js (v16 or higher)
- Expo CLI
- Android Studio / Xcode (for native development)
- Firebase project

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Amigo
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Firebase Configuration**
   - Create a Firebase project
   - Enable Authentication, Firestore, and Storage
   - Download `google-services.json` and place it in the `android/app/` directory
   - Update `firebaseConfig.ts` with your Firebase credentials

4. **Run the application**
   ```bash
   # Start Expo development server
   expo start
   
   # Run on Android
   expo run:android
   
   # Run on iOS
   expo run:ios
   ```

## 🔧 Configuration

### Firebase Setup
1. Create a new Firebase project
2. Enable the following services:
   - Authentication (Email/Password)
   - Firestore Database
   - Storage
3. Set up Firestore security rules
4. Configure Storage rules for media uploads

### Environment Variables
Create a `.env` file in the root directory:
```env
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_auth_domain
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_storage_bucket
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
```

## 📁 Project Structure

```
Amigo/
├── app/                    # Main app screens
│   ├── (auth)/            # Authentication screens
│   ├── (tabs)/            # Tab navigation screens
│   └── chat.tsx           # Chat screen
├── components/             # Reusable components
│   ├── MediaPicker.tsx    # Media selection component
│   ├── MediaMessage.tsx   # Media message renderer
│   └── VoiceRecorder.tsx  # Voice recording component
├── context/                # React Context providers
├── types/                  # TypeScript type definitions
├── firebaseConfig.ts       # Firebase configuration
└── package.json           # Dependencies and scripts
```

## 🎯 Key Components

### MediaPicker
- Handles image, video, document, and voice note selection
- Integrates with device camera and gallery
- Manages file permissions and uploads

### MediaMessage
- Renders different media types in chat
- Provides interactive media playback
- Handles file downloads and sharing

### VoiceRecorder
- Records high-quality voice notes
- Shows recording timer and controls
- Integrates with chat messaging

## 🔒 Security Features

- **Firebase Security Rules**: Configurable access control
- **User Authentication**: Secure login with Firebase Auth
- **File Validation**: Media type and size validation
- **Permission Management**: Device permission handling

## 📊 Performance Optimizations

- **Lazy Loading**: Images and media load on demand
- **Caching**: Firebase offline persistence
- **Optimized Queries**: Efficient Firestore queries
- **Memory Management**: Proper cleanup of media resources

## 🚧 Known Issues & Limitations

- Voice notes require microphone permissions
- Large file uploads may take time on slow connections
- Some media types may not be supported on all devices
- Offline functionality is limited to cached data

## 🔮 Future Enhancements

- [ ] Push notifications
- [ ] End-to-end encryption
- [ ] Video calling
- [ ] Message reactions
- [ ] File sharing improvements
- [ ] Group chat enhancements
- [ ] Message search and filtering
- [ ] Custom themes and stickers

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the Firebase documentation
- Review Expo documentation for platform-specific issues

## 🙏 Acknowledgments

- Firebase team for the excellent backend services
- Expo team for the amazing development platform
- React Native community for the robust framework
- All contributors who helped improve this project

---

**Note**: This application is designed for educational and personal use. Please ensure compliance with local laws and regulations regarding data privacy and messaging applications.
