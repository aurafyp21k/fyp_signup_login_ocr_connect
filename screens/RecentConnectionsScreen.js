import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { ref, onValue, get } from 'firebase/database';
import { auth, database } from '../firebase/config';
import { Ionicons } from '@expo/vector-icons';

export default function RecentConnectionsScreen({ navigation }) {
  const [recentConnections, setRecentConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConnections = async () => {
    if (!auth.currentUser) return;

    try {
      const connectionsRef = ref(database, 'connections');
      const unsubscribe = onValue(connectionsRef, async (snapshot) => {
        const connectionsData = [];
        const promises = [];

        snapshot.forEach((childSnapshot) => {
          const connection = childSnapshot.val();
          if (connection.users.includes(auth.currentUser.uid)) {
            // Get the other user's ID
            const otherUserId = connection.users.find(id => id !== auth.currentUser.uid);
            
            // Create a promise to fetch user data
            const promise = get(ref(database, `users/${otherUserId}`)).then((userSnapshot) => {
              const userData = userSnapshot.val();
              return {
                id: childSnapshot.key,
                timestamp: connection.timestamp,
                otherUser: {
                  id: otherUserId,
                  name: userData?.cnic?.name || 'Unknown User',
                  phoneNumber: userData?.phoneNumber || 'No phone number',
                  skills: userData?.skills || []
                }
              };
            });
            promises.push(promise);
          }
        });

        // Wait for all user data to be fetched
        const results = await Promise.all(promises);
        const sortedConnections = results.sort((a, b) => b.timestamp - a.timestamp);
        setRecentConnections(sortedConnections);
        setLoading(false);
        setRefreshing(false);
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error fetching connections:', error);
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const unsubscribe = fetchConnections();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchConnections();
  };

  const renderConnectionItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.connectionItem}
      onPress={() => {
        // Navigate to chat with this user
        const sortedIds = [auth.currentUser.uid, item.otherUser.id].sort();
        navigation.navigate('Chat', {
          chatId: `chat_${sortedIds[0]}_${sortedIds[1]}`,
          otherUser: item.otherUser
        });
      }}
    >
      <View style={styles.connectionHeader}>
        <View style={styles.connectionAvatar}>
          <Text style={styles.connectionAvatarText}>
            {item.otherUser.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.connectionInfo}>
          <Text style={styles.connectionName}>{item.otherUser.name}</Text>
          <Text style={styles.connectionPhone}>{item.otherUser.phoneNumber}</Text>
          {item.otherUser.skills && item.otherUser.skills.length > 0 && (
            <View style={styles.skillsContainer}>
              {item.otherUser.skills.slice(0, 3).map((skill, index) => (
                <View key={index} style={styles.skillTag}>
                  <Text style={styles.skillText}>{skill}</Text>
                </View>
              ))}
              {item.otherUser.skills.length > 3 && (
                <Text style={styles.moreSkills}>+{item.otherUser.skills.length - 3} more</Text>
              )}
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={24} color="#718096" />
      </View>
      <Text style={styles.connectionTime}>
        Connected {new Date(item.timestamp).toLocaleString()}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00b8ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.navigate('Home')}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Recent Connections</Text>
          <Text style={styles.subtitle}>Your connected helpers</Text>
        </View>
      </View>

      <FlatList
        data={recentConnections}
        renderItem={renderConnectionItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#00b8ff']}
            tintColor="#00b8ff"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#718096" />
            <Text style={styles.emptyText}>No recent connections</Text>
            <Text style={styles.emptySubtext}>
              Connect with nearby helpers to see them here
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#00b8ff',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: '#00b8ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#e2e8f0',
    fontWeight: '500',
  },
  listContainer: {
    padding: 15,
  },
  connectionItem: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  connectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  connectionAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#00b8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    shadowColor: '#00b8ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  connectionAvatarText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
  connectionInfo: {
    flex: 1,
  },
  connectionName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a202c',
    marginBottom: 4,
  },
  connectionPhone: {
    fontSize: 14,
    color: '#718096',
    fontWeight: '500',
    marginBottom: 8,
  },
  skillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillTag: {
    backgroundColor: '#e6f6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  skillText: {
    color: '#00b8ff',
    fontSize: 12,
    fontWeight: '600',
  },
  moreSkills: {
    color: '#718096',
    fontSize: 12,
    fontWeight: '500',
    alignSelf: 'center',
  },
  connectionTime: {
    fontSize: 13,
    color: '#718096',
    fontWeight: '500',
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a202c',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#718096',
    textAlign: 'center',
    lineHeight: 24,
  },
}); 