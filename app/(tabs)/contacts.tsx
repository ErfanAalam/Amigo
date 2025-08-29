// app/(tabs)/contacts.tsx
import { Ionicons } from '@expo/vector-icons';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import * as Contacts from 'expo-contacts';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useTheme } from '../../context/ThemeContext';

interface ContactUser {
  uid: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phoneNumber: string;
  isOnline: boolean;
  lastSeen: any;
  profileImageUrl?: string;
}

export default function ContactsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [contactUsers, setContactUsers] = useState<ContactUser[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<ContactUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [hasContactPermission, setHasContactPermission] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(0);

  useEffect(() => {
    checkContactPermission();
  }, []);

  const fetchContacts = useCallback(async (forceRefresh = false) => {
    if (!hasContactPermission) {
      setLoading(false);
      return;
    }
    
    // Don't fetch if we have recent data and it's not a forced refresh
    const now = Date.now();
    if (!forceRefresh && contactUsers.length > 0 && (now - lastFetchTime) < 30000) { // 30 seconds
      setLoading(false);
      return;
    }
    
    try {
      // Only show loading indicator on initial load or forced refresh
      if (contactUsers.length === 0 || forceRefresh) {
        setContactsLoading(true);
      }
      
      // Get all contacts from device
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
        ],
      });
      
      if (data.length > 0) {
        // Extract phone numbers and normalize them
        const phoneNumbers = data
          .filter((contact: any) => contact.phoneNumbers && contact.phoneNumbers.length > 0)
          .map((contact: any) => ({
            name: contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
            phoneNumbers: contact.phoneNumbers.map((phone: any) => phone.number)
          }))
          .filter((contact: any) => contact.phoneNumbers.length > 0);

        // Find users in our app who match these phone numbers
        await findMatchingUsers(phoneNumbers);
        setLastFetchTime(now);
      } else {
        console.log("No contacts found on device");
        setLoading(false);
      }
      
    } catch (error) {
      console.error("Error fetching contacts:", error);
      Alert.alert("Error", "Failed to access contacts. Please check permissions.");
      setLoading(false);
    } finally {
      setContactsLoading(false);
    }
  }, [hasContactPermission, contactUsers.length, lastFetchTime]);

  // Always refresh contacts when returning to this screen
  useFocusEffect(
    useCallback(() => {
      if (hasContactPermission) {
        fetchContacts(true); // Force refresh every time
      }
    }, [hasContactPermission])
  );

  useEffect(() => {
    // Filter contacts based on search query
    if (searchQuery.trim() === '') {
      setFilteredContacts(contactUsers);
    } else {
      const filtered = contactUsers.filter(contact =>
        contact.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.phoneNumber.includes(searchQuery)
      );
      setFilteredContacts(filtered);
    }
  }, [searchQuery, contactUsers]);

  const checkContactPermission = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
        setHasContactPermission(true);
        await fetchContacts();
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.warn("Permission error:", err);
      setLoading(false);
    }
  };



  // const normalizePhoneNumber = (phone: string): string => {
  //   // Remove all non-numeric characters and ensure it starts with +91
  //   const cleaned = phone.replace(/\D/g, '');
  //   // console.log("Normalizing phone:", phone, "-> cleaned:", cleaned);
    
  //   if (cleaned.length === 10) {
  //     return `+91${cleaned}`;
  //   } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
  //     return `+${cleaned}`;
  //   } else if (cleaned.length === 13 && cleaned.startsWith('91')) {
  //     return `+${cleaned}`;
  //   }
  //   return phone; // Return as is if can't normalize
  // };

  const findMatchingUsers = async (contacts: { name: string; phoneNumbers: string[] }[]) => {
    try {
      const user = auth().currentUser;
      if (!user) {
        console.log("No current user found");
        setLoading(false);
        return;
      }

    //   console.log("Finding matching users for current user:", user.uid);
      const matchingUsers: ContactUser[] = [];

      // Get all users from Firestore
      const usersSnapshot = await firestore().collection('users').get();
    //   console.log("Total users in Firestore:", usersSnapshot.size);
      
      // Create a map of phone numbers to user data
      const phoneToUserMap = new Map<string, any>();
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.phoneNumber) {
          phoneToUserMap.set(userData.phoneNumber, { uid: doc.id, ...userData });
        //   console.log("User in Firestore:", userData.phoneNumber, userData.displayName);
        }
      });

    //   console.log("Phone to user map size:", phoneToUserMap.size);

      // Find matches
      contacts.forEach(contact => {
        contact.phoneNumbers.forEach(phone => {
        //   console.log("Checking phone:", phone);
          const matchedUser = phoneToUserMap.get(phone);
          if (matchedUser && matchedUser.uid !== user.uid) {
            // console.log("Found match:", phone, matchedUser.displayName);
            matchingUsers.push({
              uid: matchedUser.uid,
              firstName: matchedUser.firstName || '',
              lastName: matchedUser.lastName || '',
              displayName: matchedUser.displayName || contact.name,
              phoneNumber: matchedUser.phoneNumber,
              isOnline: matchedUser.isOnline || false,
              lastSeen: matchedUser.lastSeen,
              profileImageUrl: matchedUser.profileImageUrl
            });
          }
        });
      });

    //   console.log("Total matching users found:", matchingUsers.length);

      // Remove duplicates and sort by name
      const uniqueUsers = matchingUsers.filter((user, index, self) => 
        index === self.findIndex(u => u.uid === user.uid)
      );
      
      uniqueUsers.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setContactUsers(uniqueUsers);
      setFilteredContacts(uniqueUsers);
      setLoading(false);

    } catch (error) {
      console.error("Error finding matching users:", error);
      setLoading(false);
    }
  };

  const startChat = (contactUser: ContactUser) => {
    router.push({
      pathname: '/chat',
      params: {
        userId: contactUser.uid,
        userName: contactUser.displayName,
        userPhone: contactUser.phoneNumber
      }
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchContacts(true); // Force refresh
    setRefreshing(false);
  };

  // Removed unused testPhoneNumberFormat function

  const getAvatarGradient = (name: string) => {
    const gradients = [
      ['#0d9488', '#10b981'],
      ['#f093fb', '#f5576c'],
      ['#4facfe', '#00f2fe'],
      ['#43e97b', '#38f9d7'],
      ['#fa709a', '#fee140'],
      ['#a8edea', '#fed6e3'],
      ['#ffecd2', '#fcb69f'],
      ['#ff8a80', '#ff7043'],
    ];
    const index = name.charCodeAt(0) % gradients.length;
    return gradients[index];
  };

  const renderContactItem = ({ item }: { item: ContactUser }) => {
    const [color1, color2] = getAvatarGradient(item.displayName);
    
    return (
      <TouchableOpacity 
        style={[styles.contactCard, { backgroundColor: theme.colors.card }]}
        onPress={() => startChat(item)}
        activeOpacity={0.7}
      >
        <View style={styles.contactAvatarContainer}>
          {item.profileImageUrl ? (
            <View style={styles.profileImageContainer}>
              <Image source={{ uri: item.profileImageUrl }} style={styles.profileImage} />
            </View>
          ) : (
            <LinearGradient
              colors={[color1, color2]}
              style={styles.contactAvatar}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.contactAvatarText}>
                {item.firstName?.charAt(0)?.toUpperCase() || item.displayName?.charAt(0)?.toUpperCase() || 'U'}
              </Text>
            </LinearGradient>
          )}
          {item.isOnline && (
            <View style={[styles.onlineIndicator, { borderColor: theme.colors.card }]} />
          )}
        </View>
        
        <View style={styles.contactInfo}>
          <Text style={[styles.contactName, { color: theme.colors.text }]} numberOfLines={1}>
            {item.displayName}
          </Text>
          <View style={styles.contactMetaRow}>
            <Ionicons name="call-outline" size={12} color={theme.colors.textTertiary} />
            <Text style={[styles.contactPhone, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {item.phoneNumber.replace('+91', '')}
            </Text>
          </View>
          {/* <View style={styles.contactStatusRow}>
            <View style={[
              styles.statusDot, 
              { backgroundColor: item.isOnline ? '#00d4aa' : theme.colors.textTertiary }
            ]} />
            <Text style={[styles.contactStatus, { 
              color: item.isOnline ? '#00d4aa' : theme.colors.textSecondary 
            }]}>
              {item.isOnline ? 'Online' : 'Last seen recently'}
            </Text>
          </View> */}
        </View>
        
        <TouchableOpacity 
          style={[styles.messageButton]}
          onPress={() => startChat(item)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[color1, color2]}
            style={styles.messageButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="chatbubble" size={16} color="#ffffff" />
          </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIconContainer, { backgroundColor: theme.colors.surface }]}>
        <Ionicons name="people-outline" size={48} color={theme.colors.primary} />
      </View>
      <Text style={[styles.emptyStateTitle, { color: theme.colors.text }]}>
        {!hasContactPermission ? 'Connect with Friends' : 'No Contacts Found'}
      </Text>
      <Text style={[styles.emptyStateSubtext, { color: theme.colors.textSecondary }]}>
        {!hasContactPermission 
          ? "Allow access to find friends who are using Amigo"
          : "No contacts from your phone are using Amigo yet"
        }
      </Text>
      {!hasContactPermission && (
        <TouchableOpacity 
          style={styles.ctaButton}
          onPress={checkContactPermission}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#0d9488', '#10b981']}
            style={styles.ctaButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="people" size={18} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.ctaButtonText}>Allow Contact Access</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Loading contacts...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Modern Header */}
      <View style={[styles.modernHeader, { backgroundColor: theme.colors.surface }]}>
        <LinearGradient
          colors={theme.isDark ? ['#1a1a2e', '#16213e'] : ['#0d9488', '#10b981']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>Contacts</Text>
              <Text style={styles.headerSubtitle}>
                {contactUsers.length} {contactUsers.length === 1 ? 'friend' : 'friends'} on Amigo
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.headerActionButton}
              onPress={onRefresh}
              disabled={contactsLoading}
              activeOpacity={0.7}
            >
              {contactsLoading ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.9)" />
              ) : (
                <Ionicons name="refresh" size={20} color="rgba(255,255,255,0.9)" />
              )}
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {/* Modern Search Bar */}
      <View style={[styles.searchSection, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.modernSearchContainer, { 
          backgroundColor: theme.colors.card,
          borderColor: searchQuery ? '#667eea' : theme.colors.border,
        }]}>
          <Ionicons 
            name="search" 
            size={18} 
            color={searchQuery ? '#667eea' : theme.colors.textTertiary} 
          />
          <TextInput
            style={[styles.modernSearchInput, { color: theme.colors.text }]}
            placeholder="Search your contacts..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={theme.colors.textTertiary}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity 
              onPress={() => setSearchQuery('')}
              style={styles.searchClearButton}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={16} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Debug Info */}
      {/* {__DEV__ && (
        <View style={styles.debugContainer}>
          <Text style={styles.debugTitle}>Debug Info</Text>
          <Text style={styles.debugText}>Permission: {hasContactPermission ? '✅ Granted' : '❌ Not Granted'}</Text>
          <Text style={styles.debugText}>Loading: {loading ? '🔄 Yes' : '✅ No'}</Text>
          <Text style={styles.debugText}>Contacts Loading: {contactsLoading ? '🔄 Yes' : '✅ No'}</Text>
          <Text style={styles.debugText}>Total Contacts: {contactUsers.length}</Text>
          <Text style={styles.debugText}>Filtered: {filteredContacts.length}</Text>
          <Text style={styles.debugText}>Search Query: &quot;{searchQuery}&quot;</Text>
          
          <View style={styles.debugButtons}>
            <TouchableOpacity 
              style={styles.debugButton}
              onPress={checkContactPermission}
            >
              <Text style={styles.debugButtonText}>Test Permission</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.debugButton}
              onPress={fetchContacts}
              disabled={!hasContactPermission}
            >
              <Text style={styles.debugButtonText}>Test Fetch</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.debugButton}
              onPress={testPhoneNumberFormat}
            >
              <Text style={styles.debugButtonText}>Test Phone</Text>
            </TouchableOpacity>
          </View>
        </View>
      )} */}

      {/* Contacts List */}
      {contactsLoading && contactUsers.length === 0 ? (
        <View style={[styles.loadingSection, { backgroundColor: theme.colors.background }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Finding your contacts...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredContacts}
          renderItem={renderContactItem}
          keyExtractor={(item) => item.uid}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#0d9488']}
              tintColor={'#0d9488'}
              progressBackgroundColor={theme.colors.surface}
            />
          }
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={styles.modernListContainer}
          ItemSeparatorComponent={() => <View style={styles.contactSeparator} />}
        />
      )}

      {/* Floating refresh indicator */}
      {contactsLoading && contactUsers.length > 0 && (
        <View style={styles.floatingRefreshContainer}>
          <View style={[styles.floatingRefreshCard, { backgroundColor: theme.colors.card }]}>
            <ActivityIndicator size="small" color="#667eea" />
            <Text style={[styles.floatingRefreshText, { color: theme.colors.textSecondary }]}>
              Syncing contacts...
            </Text>
          </View>
        </View>
      )}

      {/* Footer Stats */}
      {contactUsers.length > 0 && (
        <View style={[styles.footerStats, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.footerStatsText, { color: theme.colors.textSecondary }]}>
            {filteredContacts.length} of {contactUsers.length} contacts
            {searchQuery ? ` matching "${searchQuery}"` : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Main container
  container: {
    flex: 1,
  },
  
  // Loading states
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
  },
  loadingSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },

  // Modern header styles
  modernHeader: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  headerGradient: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
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

  // Modern search styles
  searchSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modernSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  modernSearchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
  },
  searchClearButton: {
    padding: 4,
  },

  // Modern list styles
  modernListContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexGrow: 1,
  },
  contactSeparator: {
    height: 12,
  },

  // Contact card styles
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 10,
    // shadowColor: '#000',
    // shadowOffset: { width: 0, height: 2 },
    // shadowOpacity: 0.08,
    // shadowRadius: 8,
    // elevation: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  contactAvatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  profileImageContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  contactAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#00d4aa',
    borderWidth: 2,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  contactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  contactPhone: {
    fontSize: 13,
    marginLeft: 6,
    fontWeight: '500',
  },
  contactStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  contactStatus: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Message button styles
  messageButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  messageButtonGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty state styles
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 30,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    opacity: 0.8,
  },
  ctaButton: {
    borderRadius: 16,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  ctaButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Floating refresh indicator
  floatingRefreshContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -60 }, { translateY: -20 }],
    zIndex: 100,
  },
  floatingRefreshCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingRefreshText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },

  // Footer stats
  footerStats: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  footerStatsText: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
});
