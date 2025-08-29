// app/groupDetails.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Dimensions,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FieldValue, firebaseStorage, firebaseFirestore as firestore } from '../firebaseConfig';

const { width, height } = Dimensions.get('window');

interface GroupMember {
  uid: string;
  displayName: string;
  isAdmin: boolean;
  profileImageUrl?: string;
}

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

export default function GroupDetailsPage() {
  const params = useLocalSearchParams();
  const groupId = params.groupId as string;
  const groupName = params.groupName as string;
  const { userData } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [saving, setSaving] = useState(false);
  
  // New state variables for image upload and adding members
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [availableContacts, setAvailableContacts] = useState<ContactUser[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<ContactUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [hasContactPermission, setHasContactPermission] = useState(false);
  const [addingMembers, setAddingMembers] = useState<string[]>([]);

  useEffect(() => {
    if (groupId && userData?.uid) {
      fetchGroupDetails();
      fetchGroupMembers();
      checkContactPermission();
    }
  }, [groupId, userData?.uid]);

  // Filter contacts based on search query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredContacts(availableContacts);
    } else {
      const filtered = availableContacts.filter(contact =>
        contact.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.phoneNumber.includes(searchQuery)
      );
      setFilteredContacts(filtered);
    }
  }, [searchQuery, availableContacts]);

  // Debug useEffect to log state changes
  useEffect(() => {
    // Removed debug logging
  }, [availableContacts, filteredContacts]);

  // Auto-fetch contacts when modal is opened
  useEffect(() => {
    if (showAddMembersModal) {
      if (hasContactPermission) {
        fetchAvailableContacts();
      } else {
        // If no permission, try to get permission
        checkContactPermission();
      }
    }
  }, [showAddMembersModal]);

  const fetchGroupDetails = async () => {
    try {
      const groupDoc = await firestore.collection('groups').doc(groupId).get();
      if (groupDoc.exists) {
        setGroup({ id: groupDoc.id, ...groupDoc.data() } as Group);
        setEditingName(groupDoc.data()?.name || '');
        setEditingDescription(groupDoc.data()?.description || '');
      }
    } catch (error) {
      console.error('Error fetching group details:', error);
      Alert.alert('Error', 'Failed to load group details');
    } finally {
      setLoading(false);
    }
  };

  const fetchGroupMembers = async () => {
    try {
      const groupDoc = await firestore.collection('groups').doc(groupId).get();
      if (groupDoc.exists) {
        const groupData = groupDoc.data() as Group;
        const memberPromises = groupData.members.map(async (memberId) => {
          try {
            const userDoc = await firestore.collection('users').doc(memberId).get();
            if (userDoc.exists) {
              const userData = userDoc.data();
              return {
                uid: memberId,
                displayName: userData?.displayName || 'Unknown',
                isAdmin: groupData.createdBy === memberId || groupData.admins?.includes(memberId),
                profileImageUrl: userData?.profileImageUrl,
              };
            }
          } catch (error) {
            console.error('Error fetching user data:', error);
          }
          return {
            uid: memberId,
            displayName: 'Unknown',
            isAdmin: groupData.createdBy === memberId || groupData.admins?.includes(memberId),
          };
        });

        const memberResults = await Promise.all(memberPromises);
        setMembers(memberResults.filter(Boolean));
      }
    } catch (error) {
      console.error('Error fetching group members:', error);
    }
  };

  // Contact permission and fetching functions
  const checkContactPermission = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
        setHasContactPermission(true);
        await fetchAvailableContacts();
      } else {
        setHasContactPermission(false);
        // If permission is denied, show empty state
        setAvailableContacts([]);
        setFilteredContacts([]);
      }
    } catch (err) {
      console.error('Error checking contact permission:', err);
      setHasContactPermission(false);
      // If there's an error, show empty state
      setAvailableContacts([]);
      setFilteredContacts([]);
    }
  };

  const normalizePhoneNumber = (phone: string): string => {
    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Handle different phone number formats
    if (cleaned.length === 10) {
      return `+91${cleaned}`;
    } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return `+${cleaned}`;
    } else if (cleaned.length === 13 && cleaned.startsWith('91')) {
      return `+${cleaned}`;
    } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
      return `+91${cleaned.substring(1)}`;
    } else if (cleaned.length === 10 && !phone.startsWith('+')) {
      return `+91${cleaned}`;
    }
    
    // Return original if we can't normalize
    return phone;
  };

  const fetchAvailableContacts = async () => {
    if (!hasContactPermission || !userData?.uid) {
      return;
    }
    
    try {
      setLoadingContacts(true);
      
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
            phoneNumbers: contact.phoneNumbers.map((phone: any) => normalizePhoneNumber(phone.number))
          }))
          .filter((contact: any) => contact.phoneNumbers.length > 0);

        // Find users in our app who match these phone numbers
        await findMatchingUsers(phoneNumbers);
      } else {
        // No contacts found, show empty state
        setAvailableContacts([]);
        setFilteredContacts([]);
      }
    } catch (error) {
      console.error("Error accessing contacts:", error);
      // Don't fallback to testFetchUsers - show proper error state
      setAvailableContacts([]);
      setFilteredContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  };



  const findMatchingUsers = async (contacts: { name: string; phoneNumbers: string[] }[]) => {
    try {
      if (!userData?.uid) return;
      
      const matchingUsers: ContactUser[] = [];

      // Get all users from Firestore
      const usersSnapshot = await firestore.collection('users').get();
      
      // Create a map of phone numbers to user data
      const phoneToUserMap = new Map<string, any>();
      usersSnapshot.forEach(doc => {
        const docData = doc.data();
        if (docData.phoneNumber) {
          // Store both the original phone number and normalized versions
          phoneToUserMap.set(docData.phoneNumber, { uid: doc.id, ...docData });
          
          // Also try different phone number formats
          const cleaned = docData.phoneNumber.replace(/\D/g, '');
          if (cleaned.length === 10) {
            phoneToUserMap.set(`+91${cleaned}`, { uid: doc.id, ...docData });
          }
          if (cleaned.length === 12 && cleaned.startsWith('91')) {
            phoneToUserMap.set(`+${cleaned}`, { uid: doc.id, ...docData });
          }
        }
      });

      // Find matches that are not the current user
      contacts.forEach(contact => {
        contact.phoneNumbers.forEach(phone => {
          // Try to find exact match first
          let matchedUser = phoneToUserMap.get(phone);
          
          // If no exact match, try to find by cleaned phone number
          if (!matchedUser) {
            const cleaned = phone.replace(/\D/g, '');
            if (cleaned.length === 10) {
              matchedUser = phoneToUserMap.get(`+91${cleaned}`);
            }
            if (!matchedUser && cleaned.length === 12 && cleaned.startsWith('91')) {
              matchedUser = phoneToUserMap.get(`+${cleaned}`);
            }
          }
          
          if (matchedUser && matchedUser.uid !== userData?.uid) {
            // Check if user is not already in the group (only if group is loaded)
            if (!group || !group.members.includes(matchedUser.uid)) {
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
          }
        });
      });

      // Remove duplicates and sort by name
      const uniqueUsers = matchingUsers.filter((user, index, self) => 
        index === self.findIndex(u => u.uid === user.uid)
      );
      
      uniqueUsers.sort((a, b) => a.displayName.localeCompare(b.displayName));
      
      // Set the state
      setAvailableContacts(uniqueUsers);
      setFilteredContacts(uniqueUsers);
      
    } catch (error) {
      console.error('Error finding matching users:', error);
      // Don't fallback - show empty state
      setAvailableContacts([]);
      setFilteredContacts([]);
    }
  };



  // Image upload function
  const uploadGroupImage = async (imageUri: string): Promise<string> => {
    try {
      const fileName = `groups/${groupId}/profile_${Date.now()}.jpg`;
      const reference = firebaseStorage.ref().child(fileName);
      
      const response = await fetch(imageUri);
      const blob = await response.blob();
      
      const uploadTask = reference.put(blob);
      
      return new Promise((resolve, reject) => {
        uploadTask.on('state_changed', 
          (snapshot) => {
            // Track upload progress if needed
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
      console.error('Error uploading image:', error);
      throw new Error('Failed to upload image');
    }
  };

  // Add members to group function
  const addMembersToGroup = async () => {
    if (addingMembers.length === 0) return;
    
    try {
      setSaving(true);
      
      // Add members to group
      await firestore.collection('groups').doc(groupId).update({
        members: FieldValue.arrayUnion(...addingMembers),
        memberCount: FieldValue.increment(addingMembers.length),
      });

      // Refresh group data and members
      await fetchGroupDetails();
      await fetchGroupMembers();
      
      setShowAddMembersModal(false);
      setAddingMembers([]);
      setSearchQuery('');
      // Alert.alert('Success', `${addingMembers.length} member(s) added to group successfully!`);
    } catch (error) {
      console.error('Error adding members:', error);
      // Alert.alert('Error', 'Failed to add members to group');
    } finally {
      setSaving(false);
    }
  };

  // Refresh contacts function
  const refreshContacts = async () => {
    if (hasContactPermission) {
      await fetchAvailableContacts();
    } else {
      // Try to get permission and then fetch contacts
      await checkContactPermission();
    }
  };

  const isGroupAdmin = () => {
    return group?.createdBy === userData?.uid || (userData?.uid && group?.admins?.includes(userData.uid)) || false;
  };

  const isGroupCreator = () => {
    return group?.createdBy === userData?.uid;
  };

  const leaveGroup = async () => {
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await firestore.collection('groups').doc(groupId).update({
                members: FieldValue.arrayRemove(userData?.uid),
                memberCount: FieldValue.increment(-1),
              });

              if (isGroupAdmin()) {
                await firestore.collection('groups').doc(groupId).update({
                  admins: FieldValue.arrayRemove(userData?.uid),
                });
              }

              // Navigate back to groups page - this will trigger the real-time update
              router.replace('/(tabs)/groups');
            } catch (error) {
              console.error('Error leaving group:', error);
              // Alert.alert('Error', 'Failed to leave group');
            }
          },
        },
      ]
    );
  };

  const deleteGroup = async () => {
    if (!isGroupCreator()) return;

    Alert.alert(
      'Delete Group',
      'Are you sure you want to delete this group? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete all messages
              const messagesSnapshot = await firestore
                .collection('groups')
                .doc(groupId)
                .collection('messages')
                .get();

              const deletePromises = messagesSnapshot.docs.map(doc => doc.ref.delete());
              await Promise.all(deletePromises);

              // Delete the group
              await firestore.collection('groups').doc(groupId).delete();

              // Navigate back to groups page - this will trigger the real-time update
              router.replace('/(tabs)/groups');
            } catch (error) {
              console.error('Error deleting group:', error);
              // Alert.alert('Error', 'Failed to delete group');
            }
          },
        },
      ]
    );
  };

  const makeAdmin = async (memberId: string) => {
    try {
      await firestore.collection('groups').doc(groupId).update({
        admins: FieldValue.arrayUnion(memberId),
      });
      fetchGroupMembers();
      // Alert.alert('Success', 'Member promoted to admin');
    } catch (error) {
      console.error('Error promoting member:', error);
      // Alert.alert('Error', 'Failed to promote member');
    }
  };

  const removeAdmin = async (memberId: string) => {
    if (memberId === group?.createdBy) {
      // Alert.alert('Error', 'Cannot remove group creator from admin');
      return;
    }

    try {
      await firestore.collection('groups').doc(groupId).update({
        admins: FieldValue.arrayRemove(memberId),
      });
      fetchGroupMembers();
      // Alert.alert('Success', 'Admin privileges removed');
    } catch (error) {
      console.error('Error removing admin:', error);
      // Alert.alert('Error', 'Failed to remove admin privileges');
    }
  };

  const removeMember = async (memberId: string) => {
    if (memberId === group?.createdBy) {
      // Alert.alert('Error', 'Cannot remove group creator');
      return;
    }

    Alert.alert(
      'Remove Member',
      'Are you sure you want to remove this member from the group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await firestore.collection('groups').doc(groupId).update({
                members: FieldValue.arrayRemove(memberId),
                memberCount: FieldValue.increment(-1),
              });

              if (members.find(m => m.uid === memberId)?.isAdmin) {
                await firestore.collection('groups').doc(groupId).update({
                  admins: FieldValue.arrayRemove(memberId),
                });
              }

              fetchGroupMembers();
              // Alert.alert('Success', 'Member removed from group');
            } catch (error) {
              console.error('Error removing member:', error);
              // Alert.alert('Error', 'Failed to remove member');
            }
          },
        },
      ]
    );
  };

  const saveGroupChanges = async () => {
    if (!editingName.trim()) {
      // Alert.alert('Error', 'Group name cannot be empty');
      return;
    }

    setSaving(true);
    try {
      await firestore.collection('groups').doc(groupId).update({
        name: editingName.trim(),
        description: editingDescription.trim(),
      });

      setGroup(prev => prev ? { ...prev, name: editingName.trim(), description: editingDescription.trim() } : null);
      setShowEditModal(false);
      // Alert.alert('Success', 'Group details updated successfully');
    } catch (error) {
      console.error('Error updating group:', error);
      // Alert.alert('Error', 'Failed to update group details');
    } finally {
      setSaving(false);
    }
  };

  const pickGroupImage = async () => {
    if (!isGroupAdmin()) return;
    
    try {
      setUploadingImage(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        try {
          // Upload image to Firebase Storage
          const imageUrl = await uploadGroupImage(result.assets[0].uri);
          
          // Update group with new image URL
          await firestore.collection('groups').doc(groupId).update({
            profileImageUrl: imageUrl,
          });

          // Update local state
          setGroup(prev => prev ? { ...prev, profileImageUrl: imageUrl } : null);
          // Alert.alert('Success', 'Group profile image updated successfully!');
        } catch (error) {
          console.error('Error updating group image:', error);
          // Alert.alert('Error', 'Failed to update group image');
        } finally {
          setUploadingImage(false);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      // Alert.alert('Error', 'Failed to pick image');
    }
  };

  const getAvatarGradient = (name: string) => {
    const gradients = [
      ['#0d9488', '#10b981']
    ];
    const index = name.charCodeAt(0) % gradients.length;
    return gradients[index];
  };

  const renderMemberItem = ({ item }: { item: GroupMember }) => {
    const [color1, color2] = getAvatarGradient(item.displayName);
    const canManageMember = isGroupAdmin() && item.uid !== userData?.uid;
    const isCurrentUser = item.uid === userData?.uid;

    return (
      <View style={[styles.memberCard, { backgroundColor: theme.colors.card }]}>
        <View style={styles.memberInfo}>
          {item.profileImageUrl ? (
            <Image source={{ uri: item.profileImageUrl }} style={styles.memberAvatar} />
          ) : (
            <LinearGradient
              colors={[color1, color2]}
              style={styles.memberAvatar}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.memberAvatarText}>
                {item.displayName.charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
          )}
          
          <View style={styles.memberDetails}>
            <Text style={[styles.memberName, { color: theme.colors.text }]}>
              {item.displayName}
              {isCurrentUser && ' (You)'}
            </Text>
            <View style={styles.memberBadges}>
              {item.isAdmin && (
                <View style={styles.adminBadge}>
                  <Ionicons name="shield" size={12} color="#FFD700" />
                  <Text style={styles.adminBadgeText}>Admin</Text>
                </View>
              )}
              {item.uid === group?.createdBy && (
                <View style={styles.creatorBadge}>
                  <Ionicons name="star" size={12} color="#FFD700" />
                  <Text style={styles.creatorBadgeText}>Creator</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {canManageMember && (
          <View style={styles.memberActions}>
            {item.isAdmin ? (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => removeAdmin(item.uid)}
              >
                <Ionicons name="shield-outline" size={16} color="#ff6b6b" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => makeAdmin(item.uid)}
              >
                <Ionicons name="shield" size={16} color="#667eea" />
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => removeMember(item.uid)}
            >
              <Ionicons name="person-remove" size={16} color="#ff6b6b" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
          Loading group details...
        </Text>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.errorText, { color: theme.colors.text }]}>
          Group not found
        </Text>
      </View>
    );
  }

  const [headerColor1, headerColor2] = getAvatarGradient(group.name);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <LinearGradient
          colors={theme.isDark ? ['#2C3E50', '#34495E'] :['#0d9488', '#10b981']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>
            
            <Text style={styles.headerTitle}>Group Details</Text>
            
            {isGroupAdmin() && (
              <TouchableOpacity
                onPress={() => setShowEditModal(true)}
                style={styles.editButton}
              >
                <Ionicons name="create" size={24} color="#ffffff" />
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Group Info Section */}
        <View style={[styles.section, { backgroundColor: theme.colors.card }]}>
          <View style={styles.groupHeader}>
            <TouchableOpacity
              onPress={pickGroupImage}
              disabled={!isGroupAdmin() || uploadingImage}
              style={styles.groupImageContainer}
            >
              {group.profileImageUrl ? (
                <Image source={{ uri: group.profileImageUrl }} style={styles.groupImage} />
              ) : (
                <LinearGradient
                  colors={[headerColor1, headerColor2]}
                  style={styles.groupImage}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.groupImageText}>
                    {group.name.charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>
              )}
              {isGroupAdmin() && (
                <View style={styles.editImageOverlay}>
                  {uploadingImage ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Ionicons name="camera" size={20} color="#ffffff" />
                  )}
                </View>
              )}
            </TouchableOpacity>
            
            <View style={styles.groupInfo}>
              <Text style={[styles.groupName, { color: theme.colors.text }]}>
                {group.name.charAt(0).toUpperCase() + group.name.slice(1)}
              </Text>
              <Text style={[styles.groupDescription, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                {group.description.charAt(0).toUpperCase() + group.description.slice(1)}
              </Text>
              <View style={styles.groupMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="people" size={16} color={theme.colors.textTertiary} />
                  <Text style={[styles.metaText, { color: theme.colors.textTertiary }]}>
                    {group.memberCount} members
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="lock-closed" size={16} color="#ff6b6b" />
                  <Text style={[styles.metaText, { color: '#ff6b6b' }]}>Private</Text>
                </View>
              </View>
            </View>
          </View>

          {group.inviteCode && isGroupAdmin() && (
            <View style={styles.inviteCodeContainer}>
              <Text style={[styles.inviteCodeLabel, { color: theme.colors.textSecondary }]}>
                Invite Code
              </Text>
              <View style={styles.inviteCodeBox}>
                <Text style={styles.inviteCode}>{group.inviteCode}</Text>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={() => {
                    Clipboard.setString(group.inviteCode || '');
                    // Alert.alert('Success', 'Invite code copied to clipboard!');
                  }}
                >
                  <Ionicons name="copy" size={16} color="#667eea" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Add Members Button - Only for admins */}
          {isGroupAdmin() && (
            <View style={styles.addMembersContainer}>
              <TouchableOpacity
                style={styles.addMembersButton}
                onPress={() => {[]
                  setShowAddMembersModal(true);
                }}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#43CEA2', '#185A9D']}
                  style={styles.addMembersButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="person-add" size={18} color="#ffffff" />
                  <Text style={styles.addMembersButtonText}>Add Members</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Members Section */}
        <View style={[styles.section, { backgroundColor: theme.colors.card }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Members ({members.length})
            </Text>
          </View>
          
          <FlatList
            data={members}
            renderItem={renderMemberItem}
            keyExtractor={(item) => item.uid}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.memberSeparator} />}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.leaveButton}
            onPress={leaveGroup}
          >
            <LinearGradient
              colors={['#ff6b6b', '#ff8e8e']}
              style={styles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="exit" size={20} color="#ffffff" />
              <Text style={styles.buttonText}>Leave Group</Text>
            </LinearGradient>
          </TouchableOpacity>

          {isGroupCreator() && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={deleteGroup}
            >
              <LinearGradient
                colors={['#ff4757', '#ff3742']}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="trash" size={20} color="#ffffff" />
                <Text style={styles.buttonText}>Delete Group</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Edit Group Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              Edit Group
            </Text>
            
            <Text style={[styles.inputLabel, { color: theme.colors.text }]}>Group Name</Text>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.colors.card,
                color: theme.colors.text,
                borderColor: theme.colors.border,
              }]}
              value={editingName}
              onChangeText={setEditingName}
              placeholder="Enter group name"
              placeholderTextColor={theme.colors.textTertiary}
              maxLength={50}
            />
            
            <Text style={[styles.inputLabel, { color: theme.colors.text }]}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea, { 
                backgroundColor: theme.colors.card,
                color: theme.colors.text,
                borderColor: theme.colors.border,
              }]}
              value={editingDescription}
              onChangeText={setEditingDescription}
              placeholder="Enter group description"
              placeholderTextColor={theme.colors.textTertiary}
              multiline
              numberOfLines={3}
              maxLength={200}
            />
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, saving && styles.disabledButton]}
                onPress={saveGroupChanges}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Members Modal */}
      <Modal
        visible={showAddMembersModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddMembersModal(false)}
      >
        <View style={styles.contactsModal}>
          <View style={[styles.contactsContainer, { backgroundColor: theme.colors.background }]}>
            <View style={styles.contactsHeader}>
              <View style={styles.contactsHeaderInfo}>
                <Text style={[styles.contactsTitle, { color: theme.colors.text }]}>
                  Add Members
                </Text>
                <Text style={[styles.forwardingPreview, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                  {addingMembers.length > 0 
                    ? `${addingMembers.length} contact${addingMembers.length > 1 ? 's' : ''} selected`
                    : 'Select contacts to add to the group'
                  }
                </Text>
              </View>
              <View style={styles.contactsHeaderActions}>
                <TouchableOpacity
                  onPress={refreshContacts}
                  style={styles.contactsRefreshButton}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh" size={20} color={theme.colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => {
                    setShowAddMembersModal(false);
                    setAddingMembers([]);
                    setSearchQuery('');
                  }}
                  style={styles.contactsCloseButton}
                >
                  <Ionicons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Search Bar */}
            <View style={styles.searchSection}>
              <View style={[styles.searchContainer, { 
                backgroundColor: theme.colors.card,
                borderColor: searchQuery ? '#43CEA2' : theme.colors.border,
              }]}>
                <Ionicons 
                  name="search" 
                  size={18} 
                  color={searchQuery ? '#43CEA2' : theme.colors.textTertiary} 
                />
                <TextInput
                  style={[styles.searchInput, { color: theme.colors.text }]}
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
            
            {/* Contacts List */}
            {loadingContacts ? (
              <View style={styles.loadingContactsContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.loadingContactsText, { color: theme.colors.textSecondary }]}>
                  Finding your contacts...
                </Text>
              </View>
            ) : filteredContacts.length > 0 ? (
              <FlatList
                data={filteredContacts}
                keyExtractor={(item) => item.uid}
                renderItem={({ item }) => {
                  const isSelected = addingMembers.includes(item.uid);
                  const [color1, color2] = getAvatarGradient(item.displayName);
                  
                  return (
                    <TouchableOpacity
                      style={[
                        styles.contactItem, 
                        { 
                          borderBottomColor: theme.colors.border,
                          backgroundColor: isSelected ? 'rgba(67, 206, 162, 0.1)' : 'transparent',
                        }
                      ]}
                      onPress={() => {
                        if (isSelected) {
                          setAddingMembers(prev => prev.filter(id => id !== item.uid));
                        } else {
                          setAddingMembers(prev => [...prev, item.uid]);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <LinearGradient
                        colors={[color1, color2]}
                        style={styles.contactAvatar}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      >
                        <Text style={styles.contactAvatarText}>
                          {item.displayName?.charAt(0)?.toUpperCase() || 'U'}
                        </Text>
                      </LinearGradient>
                      <View style={styles.contactInfo}>
                        <Text style={[styles.contactName, { color: theme.colors.text }]}>
                          {item.displayName}
                        </Text>
                        <Text style={[styles.contactSubtitle, { color: theme.colors.textSecondary }]}>
                          {item.phoneNumber.replace('+91', '')}
                        </Text>
                      </View>
                      
                      {/* Selection Indicator */}
                      <View style={[
                        styles.contactSelectionIndicator,
                        { 
                          backgroundColor: isSelected ? '#43CEA2' : 'transparent',
                          borderColor: isSelected ? '#43CEA2' : theme.colors.border,
                        }
                      ]}>
                        {isSelected && (
                          <Ionicons name="checkmark" size={16} color="#ffffff" />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                style={styles.contactsList}
                contentContainerStyle={{ flexGrow: 1 }}
                showsVerticalScrollIndicator={true}
                ItemSeparatorComponent={() => <View style={styles.contactSeparator} />}
              />
            ) : (
              <View style={styles.noContactsContainer}>
                <Ionicons name="people-outline" size={48} color={theme.colors.textTertiary} />
                <Text style={[styles.noContactsText, { color: theme.colors.textSecondary }]}>
                  {!hasContactPermission 
                    ? 'Allow contact access to find friends who use Awaaz'
                    : searchQuery 
                      ? 'No contacts found matching your search'
                      : 'No available contacts to add to this group'
                  }
                </Text>
                {!hasContactPermission && (
                  <TouchableOpacity
                    style={styles.requestPermissionButton}
                    onPress={checkContactPermission}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.requestPermissionButtonText, { color: theme.colors.primary }]}>
                      Allow Contact Access
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Action Button */}
            {addingMembers.length > 0 && (
              <View style={styles.addMembersActionContainer}>
                <TouchableOpacity
                  style={[styles.addMembersActionButton, saving && styles.disabledButton]}
                  onPress={addMembersToGroup}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#43CEA2', '#185A9D']}
                    style={styles.addMembersActionButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="person-add" size={18} color="#ffffff" />
                        <Text style={styles.addMembersActionButtonText}>
                          Add {addingMembers.length} Member{addingMembers.length > 1 ? 's' : ''}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    fontWeight: '500',
  },
  
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '500',
  },

  header: {
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
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '20%',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  content: {
    flex: 1,
  },

  section: {
    margin: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },

  groupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  groupImageContainer: {
    position: 'relative',
    marginRight: 12,
  },
  groupImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupImageText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
  },
  editImageOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  groupDescription: {
    fontSize: 12,
    lineHeight: 22,
    marginBottom: 12,
  },
  groupMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '500',
  },

  inviteCodeContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    paddingTop: 20,
  },
  inviteCodeLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  inviteCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.3)',
  },
  inviteCode: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#667eea',
    letterSpacing: 2,
  },
  copyButton: {
    padding: 8,
  },

  addMembersContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  addMembersButton: {
    width: '100%',
    borderRadius: 16,
    shadowColor: '#185A9D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  addMembersButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 8,
  },
  addMembersButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },

  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  memberAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  memberDetails: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  memberBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFD700',
  },
  creatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
  },
  creatorBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFD700',
  },
  memberActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberSeparator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },

  actionButtons: {
    padding: 16,
    gap: 12,
  },
  leaveButton: {
    borderRadius: 16,
    shadowColor: '#ff6b6b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  deleteButton: {
    borderRadius: 16,
    shadowColor: '#ff4757',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 20,
    padding: 25,
    width: width * 0.9,
    maxHeight: height * 0.8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 0,
    textAlign: 'left',
    flex: 1,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 15,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 25,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 15,
    marginBottom: 15,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
    marginLeft: 12,
  },
  searchClearButton: {
    padding: 8,
  },

  // Contact list styles
  loadingContactsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingContactsText: {
    marginTop: 15,
    fontSize: 16,
    textAlign: 'center',
  },
  noContactsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  noContactsText: {
    fontSize: 16,
    marginTop: 15,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  requestPermissionButton: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  requestPermissionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Contact item styles (matching chat.tsx)
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  contactAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  contactSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    opacity: 0.7,
  },
  contactSelectionIndicator: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactSeparator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },

  contactsModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  contactsContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    width: '100%',
    height: height * 0.9, // Make it almost full screen
    maxHeight: height * 0.95,
  },
  contactsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  contactsHeaderInfo: {
    flex: 1,
  },
  contactsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  forwardingPreview: {
    fontSize: 14,
    marginTop: 4,
  },
  contactsCloseButton: {
    padding: 8,
  },
  contactsHeaderActions: {
    flexDirection: 'row',
    gap: 10,
  },
  contactsRefreshButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(67, 206, 162, 0.1)',
  },
  searchSection: {
    marginBottom: 15,
  },
  contactsList: {
    flex: 1,
    marginTop: 10,
  },
  addMembersActionContainer: {
    marginTop: 25,
    alignItems: 'center',
    paddingBottom: 10,
  },
  addMembersActionButton: {
    width: '100%',
    borderRadius: 16,
    shadowColor: '#185A9D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  addMembersActionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 8,
  },
  addMembersActionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
