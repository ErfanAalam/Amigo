// app/(tabs)/groups.tsx
import { Ionicons } from '@expo/vector-icons';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from '../../context/ThemeContext';

const { width, height } = Dimensions.get('window');

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
}

export default function Groups() {
  const router = useRouter();
  const { theme } = useTheme();
  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinGroupId, setJoinGroupId] = useState("");

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const user = auth().currentUser;
      if (!user) return;

      const userGroupsSnapshot = await firestore()
        .collection('groups')
        .where('members', 'array-contains', user.uid)
        .get();

      const userGroupsData: Group[] = [];
      userGroupsSnapshot.forEach(doc => {
        userGroupsData.push({ id: doc.id, ...doc.data() } as Group);
      });

      setUserGroups(userGroupsData);
    } catch (error: any) {
      console.error("Error fetching groups:", error);
      Alert.alert("Error", "Failed to load groups. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert("Error", "Please enter a group name");
      return;
    }

    try {
      setCreating(true);
      const user = auth().currentUser;
      if (!user) return;

      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      const groupData = {
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || "No description",
        createdBy: user.uid,
        createdAt: new Date(),
        memberCount: 1,
        isPrivate: true,
        members: [user.uid],
        admins: [user.uid],
        inviteCode,
      };

      await firestore().collection('groups').add(groupData);

      Alert.alert("Success", "Group created successfully!", [
        {
          text: "OK",
          onPress: () => {
            setShowCreateModal(false);
            setNewGroupName("");
            setNewGroupDescription("");
            fetchGroups();
          }
        }
      ]);
    } catch (error) {
      console.error("Error creating group:", error);
      Alert.alert("Error", "Failed to create group");
    } finally {
      setCreating(false);
    }
  };

  const joinGroup = async () => {
    if (!joinGroupId.trim()) {
      Alert.alert("Error", "Please enter a group invite code");
      return;
    }

    try {
      setJoining(true);
      const user = auth().currentUser;
      if (!user) return;

      const groupsSnapshot = await firestore()
        .collection('groups')
        .where('inviteCode', '==', joinGroupId.trim().toUpperCase())
        .get();
      
      if (groupsSnapshot.empty) {
        Alert.alert("Error", "Invalid invite code");
        return;
      }

      const groupDoc = groupsSnapshot.docs[0];
      const groupData = groupDoc.data() as Group;
      
      if (groupData.members.includes(user.uid)) {
        Alert.alert("Error", "You are already a member of this group");
        return;
      }

      await firestore().collection('groups').doc(groupDoc.id).update({
        members: firestore.FieldValue.arrayUnion(user.uid),
        memberCount: firestore.FieldValue.increment(1)
      });

      Alert.alert("Success", "Joined group successfully!", [
        {
          text: "OK",
          onPress: () => {
            setShowJoinModal(false);
            setJoinGroupId("");
            fetchGroups();
          }
        }
      ]);
    } catch (error) {
      console.error("Error joining group:", error);
      Alert.alert("Error", "Failed to join group");
    } finally {
      setJoining(false);
    }
  };

  const leaveGroup = async (groupId: string) => {
    Alert.alert(
      "Leave Group",
      "Are you sure you want to leave this group?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              const user = auth().currentUser;
              if (!user) return;

              await firestore().collection('groups').doc(groupId).update({
                members: firestore.FieldValue.arrayRemove(user.uid),
                memberCount: firestore.FieldValue.increment(-1)
              });

              fetchGroups();
            } catch (error) {
              console.error("Error leaving group:", error);
              Alert.alert("Error", "Failed to leave group");
            }
          }
        }
      ]
    );
  };

  const openGroupChat = (group: Group) => {
    router.push({
      pathname: '/groupChat',
      params: {
        groupId: group.id,
        groupName: group.name
      }
    });
  };

  const openGroupDetails = (group: Group) => {
    router.push({
      pathname: '/groupDetails',
      params: {
        groupId: group.id,
        groupName: group.name
      }
    });
  };

  const getGroupGradient = (groupName: string) => {
    const gradients = [
      ['#667eea', '#764ba2']
    ];
    const index = groupName.charCodeAt(0) % gradients.length;
    return gradients[index];
  };

  const renderGroupItem = ({ item }: { item: Group }) => {
    const [color1, color2] = getGroupGradient(item.name);
    const isAdmin = item.admins.includes(auth().currentUser?.uid || '');
    
    return (
      <TouchableOpacity 
        style={[styles.modernGroupCard, { borderBottomWidth: 1, borderBottomColor: theme.colors.border }]}
        onPress={() => openGroupChat(item)}
        onLongPress={() => openGroupDetails(item)}
        activeOpacity={0.8}
      >
        <View style={styles.modernGroupHeader}>
          <LinearGradient
            colors={[color1, color2]}
            style={styles.modernGroupAvatar}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.modernGroupAvatarText}>
              {item.name.charAt(0).toUpperCase()}
            </Text>
          </LinearGradient>
          <View style={styles.modernGroupInfo}>
            <View style={styles.groupNameRow}>
              <Text style={[styles.modernGroupName, { color: theme.colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {isAdmin && (
                <View style={styles.adminBadge}>
                  <Ionicons name="shield" size={12} color="#FFD700" />
                </View>
              )}
            </View>
            <Text style={[styles.modernGroupDescription, { color: theme.colors.textSecondary }]} numberOfLines={2}>
              {item.description}
            </Text>
            {/* <View style={styles.groupMetaRow}>
              <View style={[styles.memberBadge, { backgroundColor: theme.colors.surface }]}>
                <Ionicons name="people" size={12} color={theme.colors.textTertiary} />
                <Text style={[styles.memberCount, { color: theme.colors.textTertiary }]}>
                  {item.memberCount}
                </Text>
              </View>
              <View style={[styles.privacyBadge, { backgroundColor: 'rgba(255, 107, 107, 0.1)' }]}>
                <Ionicons name="lock-closed" size={12} color="#ff6b6b" />
                <Text style={[styles.privacyText, { color: '#ff6b6b' }]}>Private</Text>
              </View>
            </View> */}
          </View>
        </View>
        {/* <TouchableOpacity 
          style={styles.modernLeaveButton}
          onPress={() => leaveGroup(item.id)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#ff6b6b', '#ff8e8e']}
            style={styles.leaveButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="exit" size={16} color="#ffffff" />
          </LinearGradient>
        </TouchableOpacity> */}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.loadingCard, { backgroundColor: theme.colors.surface }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Loading groups...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Modern Header */}
      <View style={[styles.modernHeader, { backgroundColor: theme.colors.surface }]}>
        <LinearGradient
          colors={theme.isDark ? ['#1a1a2e', '#16213e'] : ['#667eea', '#764ba2']}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>Groups</Text>
              <Text style={styles.headerSubtitle}>
                Connect with communities and friends
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.headerActionButton}
              onPress={fetchGroups}
              disabled={loading}
              activeOpacity={0.7}
            >
              {loading ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.9)" />
              ) : (
                <Ionicons name="refresh" size={20} color="rgba(255,255,255,0.9)" />
              )}
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {/* Modern Action Buttons */}
      <View style={styles.modernActionContainer}>
        <TouchableOpacity 
          style={styles.modernActionButton}
          onPress={() => setShowCreateModal(true)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.actionButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="add-circle" size={20} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.actionButtonText}>Create Group</Text>
          </LinearGradient>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.modernActionButton}
          onPress={() => setShowJoinModal(true)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#DA22FF', '#9733EE']}
            style={styles.actionButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="link" size={20} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.actionButtonText}>Join Group</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Groups List */}
      {userGroups.length > 0 ? (
        <FlatList
          data={userGroups}
          renderItem={renderGroupItem}
          keyExtractor={(item) => item.id}
          style={styles.groupsList}
          contentContainerStyle={styles.groupsListContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.groupSeparator} />}
        />
      ) : (
        <View style={styles.modernEmptyState}>
          <View style={[styles.emptyIconContainer, { backgroundColor: theme.colors.surface }]}>
            <Ionicons name="people-outline" size={48} color={theme.colors.primary} />
          </View>
          <Text style={[styles.emptyStateTitle, { color: theme.colors.text }]}>
            No Groups Yet
          </Text>
          <Text style={[styles.emptyStateSubtext, { color: theme.colors.textSecondary }]}>
            Create your first group and start building your community!
          </Text>
          <TouchableOpacity 
            style={styles.ctaButton}
            onPress={() => setShowCreateModal(true)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              style={styles.ctaButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="add-circle" size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.ctaButtonText}>Create Group</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* Create Group Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Group</Text>
            
            <Text style={styles.inputLabel}>Group Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter group name"
              value={newGroupName}
              onChangeText={setNewGroupName}
              maxLength={50}
            />
            
            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Enter group description (optional)"
              value={newGroupDescription}
              onChangeText={setNewGroupDescription}
              multiline
              numberOfLines={3}
              maxLength={200}
            />
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.confirmButton, creating && styles.disabledButton]}
                onPress={createGroup}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>Create Group</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Join Group Modal */}
      <Modal
        visible={showJoinModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowJoinModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Join Group</Text>
            
            <Text style={styles.inputLabel}>Invite Code *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter group invite code"
              value={joinGroupId}
              onChangeText={setJoinGroupId}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            
            <Text style={styles.joinInfo}>
              Ask the group admin for the invite code to join
            </Text>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowJoinModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.confirmButton, joining && styles.disabledButton]}
                onPress={joinGroup}
                disabled={joining}
              >
                {joining ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>Join Group</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  loadingCard: {
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    fontWeight: '500',
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

  // Modern action buttons
  modernActionContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 15,
  },
  modernActionButton: {
    flex: 1,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Groups list styles
  groupsList: {
    flex: 1,
  },
  groupsListContent: {
    // paddingHorizontal: 20,
    paddingVertical: 16,
  },
  groupSeparator: {
    height: 12,
  },

  // Modern group cards
  modernGroupCard: {
    borderRadius: 18,
    borderBottomWidth: 1,
    // borderBottomColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 12,
    // shadowColor: '#000',
    // shadowOffset: { width: 0, height: 4 },
    // shadowOpacity: 0.08,
    // shadowRadius: 12,
    // elevation: 6,
    // borderWidth: 0.5,
    // borderColor: 'rgba(0,0,0,0.05)',
  },
  modernGroupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modernGroupAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  modernGroupAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  modernGroupInfo: {
    flex: 1,
  },
  groupNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  modernGroupName: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  adminBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
  },
  modernGroupDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
    opacity: 0.8,
  },
  groupMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  memberCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  privacyText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Modern action buttons for groups
  modernLeaveButton: {
    alignSelf: 'flex-end',
    borderRadius: 16,
    shadowColor: '#ff6b6b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  leaveButtonGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Modern empty state
  modernEmptyState: {
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
    opacity: 0.8,
  },
  ctaButton: {
    borderRadius: 16,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    marginTop: 20,
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
    width: width * 0.9,
    maxHeight: height * 0.8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 15,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  joinInfo: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 10,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 25,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
}); 
