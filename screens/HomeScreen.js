import React, { useState, useEffect } from 'react';
import * as SMS from 'expo-sms';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  Alert, 
  useWindowDimensions,
  ActivityIndicator,
  ScrollView,
  Image
} from 'react-native';
import * as Notifications from 'expo-notifications';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { ref, onValue, get, push, set, remove } from 'firebase/database';
import { signOut } from 'firebase/auth';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { auth, database } from '../firebase/config';

// Calculate distance between two points in kilometers
const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
};

const deg2rad = (deg) => {
  return deg * (Math.PI/180);
};

const AVAILABLE_SKILLS = [
  'JavaScript',
  'Python',
  'Java',
  'React Native',
  'Node.js',
  'Data Science',
  'Machine Learning',
  'UI/UX Design',
  'Project Management',
  'Digital Marketing',
  'Content Writing',
  'Mobile Development',
  'Web Development',
  'Cybersecurity'
];

export default function HomeScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const [location, setLocation] = useState(null);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connections, setConnections] = useState([]);
  const [routes, setRoutes] = useState({});
  const [selectedSkill, setSelectedSkill] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(true);

  // Request location permission
  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          return;
        }
      } catch (error) {
        setErrorMsg('Error requesting location permission');
        console.error(error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const getDirections = async (origin, destination) => {
    const apiKey = Constants.manifest?.config?.googleMaps?.apiKey || 'AIzaSyA3FzKFHiA7bUcmOaubinG6wqCZt8Dw7Yk';
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&mode=walking&key=${apiKey}`;
      // console.log('Fetching directions from:', url);
      
      const response = await fetch(url);
      const data = await response.json();
      // console.log('Directions API response:', data);

      if (data.status === 'OK' && data.routes.length > 0) {
        const points = data.routes[0].overview_polyline.points;
        const decodedPoints = decodePolyline(points);
        // console.log('Decoded route points:', decodedPoints);
        return decodedPoints;
      }
      console.warn('No route found in response');
      return null;
    } catch (error) {
      // console.error('Error getting directions:', error);
      return null;
    }
  };

  const decodePolyline = (encoded) => {
    const points = [];
    let index = 0, lat = 0, lng = 0;

    while (index < encoded.length) {
      let shift = 0, result = 0;
      let byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      points.push({
        latitude: lat * 1e-5,
        longitude: lng * 1e-5
      });
    }
    return points;
  };

  // Update routes when connections change
  useEffect(() => {
   // console.log('Updating routes for connections:', connections);
    const updateRoutes = async () => {
      const newRoutes = {};
      for (const connection of connections) {
        const connectedUser = nearbyUsers.find(user => 
          connection.users.includes(user.id)
        );
        if (connectedUser && location) {
          const routePoints = await getDirections(
            { latitude: location.latitude, longitude: location.longitude },
            { latitude: connectedUser.location.latitude, longitude: connectedUser.location.longitude }
          );
          if (routePoints) {
            newRoutes[connection.id] = routePoints;
          }
        }
      }
      // console.log('New routes:', newRoutes);
      setRoutes(newRoutes);
    };

    if (connections.length > 0 && location && nearbyUsers.length > 0) {
      updateRoutes();
    }
  }, [connections, location, nearbyUsers]);

  // Listen for connections
  useEffect(() => {
    if (!auth.currentUser) return;

    const connectionsRef = ref(database, 'connections');
    const unsubscribe = onValue(connectionsRef, (snapshot) => {
      const connectionsData = [];
      snapshot.forEach((childSnapshot) => {
        const connection = childSnapshot.val();
        if (connection.users.includes(auth.currentUser.uid)) {
          connectionsData.push({
            id: childSnapshot.key,
            ...connection
          });
        }
      });
      setConnections(connectionsData);
    });

    return () => unsubscribe();
  }, []);

  // Auto refresh nearby users every 10 seconds
  useEffect(() => {
    if (location) {
      // Initial check
      findNearbyUsers(location);

      // Set up interval
      const intervalId = setInterval(() => {
        findNearbyUsers(location);
      }, 10000); // 10 seconds

      return () => clearInterval(intervalId);
    }
  }, [location]);

  // Check auth state and fetch user data
  useEffect(() => {
    if (!auth.currentUser) {
      navigation.replace('Login');
      return;
    }

    const userId = auth.currentUser.uid;
    const userRef = ref(database, `users/${userId}`);
    const unsubscribe = onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      if (data?.location) {
        setLocation(data.location);
      }
    });

    // Fetch connection requests
    const requestsRef = ref(database, 'connection_requests');
    const requestsUnsubscribe = onValue(requestsRef, async (snapshot) => {
      const requestsData = [];
      snapshot.forEach((childSnapshot) => {
        const request = childSnapshot.val();
        if (request.to === auth.currentUser.uid) {
          const requestWithId = {
            id: childSnapshot.key,
            ...request
          };
          requestsData.push(requestWithId);

          // Show notification for new pending requests
          if (request.status === 'pending' && !requests.some(r => r.id === childSnapshot.key)) {
            scheduleNotification(
              'New Connection Request',
              `${request.fromEmail} wants to connect with you!`
            );
          }
        }
      });
      setRequests(requestsData);
    });

    return () => {
      unsubscribe();
      requestsUnsubscribe();
    };
  }, [navigation]);

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const connectToAllNearbyUsers = async () => {
    setIsConnecting(true);
    try {
      // Send connection requests to all nearby users
      for (const user of nearbyUsers) {
        await sendConnectionRequest(user.id);
      }
      Alert.alert('Success', 'Connection requests sent to all nearby users');
    } catch (error) {
      console.error('Error sending connection requests:', error);
      Alert.alert('Error', 'Failed to send some connection requests');
    }
    setIsConnecting(false);
  };

  const isUserConnected = (userId) => {
    return connections.some(conn => conn.users.includes(userId));
  };

  const findNearbyUsers = async (currentLocation) => {
    try {
      const usersRef = ref(database, 'users');
      const snapshot = await get(usersRef);
      const users = [];
      
      snapshot.forEach((childSnapshot) => {
        const userData = childSnapshot.val();
        const userId = childSnapshot.key;
        
        if (userId !== auth.currentUser.uid && userData.location) {
          const distance = calculateDistance(
            currentLocation.latitude,
            currentLocation.longitude,
            userData.location.latitude,
            userData.location.longitude
          );
          
          // Only filter by distance initially
          if (distance <= 3) {
            const userSkills = userData.skills || [];
            const user = {
              id: userId,
              email: userData.email,
              location: userData.location,
              distance: distance.toFixed(2),
              skills: userData.skills || [] // Include skills in user data
            };
            users.push(user);
          }
        }
      });
      
      setNearbyUsers(users);
    } catch (error) {
      console.error("Error finding nearby users:", error);
      Alert.alert("Error", "Couldn't fetch nearby users");
    }
  };

  const scheduleNotification = async (title, body) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title,
        body: body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });
  };

  const sendConnectionRequest = async (toUserId) => {
    try {
      const fromUserId = auth.currentUser.uid;
      const requestsRef = ref(database, 'connection_requests');
      
      // Get sender's email
      const userRef = ref(database, `users/${fromUserId}`);
      const userSnapshot = await get(userRef);
      const userEmail = userSnapshot.val().email; 
      const username = userSnapshot.val().fullName;
      
      await push(requestsRef, {
        from: fromUserId,
        fromEmail: userEmail,
        fromusername: username,
        to: toUserId,
        status: 'pending',
        timestamp: Date.now()
      });
      Alert.alert('Success', 'Connection request sent!');
    } catch (error) {
      console.error("Error sending request:", error);
      Alert.alert('Error', 'Failed to send connection request');
    }
  };

  const handleDisconnect = async (connectionId, otherUserId) => {
    try {
      // Remove the connection from Firebase
      const connectionRef = ref(database, `connections/${connectionId}`);
      await remove(connectionRef);

      // Remove the route
      const newRoutes = { ...routes };
      delete newRoutes[connectionId];
      setRoutes(newRoutes);

      // Update connections state
      setConnections(connections.filter(conn => conn.id !== connectionId));

      Alert.alert('Success', 'Successfully disconnected');
    } catch (error) {
      console.error('Error disconnecting:', error);
      Alert.alert('Error', 'Failed to disconnect');
    }
  };

  const sendLocationSMS = async (toPhoneNumber, otherUserName, otherUserData, distance) => {
    try {
      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'SMS is not available on this device');
        return;
      }

      const currentUserRef = ref(database, `users/${auth.currentUser.uid}`);
      const currentUserSnap = await get(currentUserRef);
      const currentUserData = currentUserSnap.val();

      // Create a more informative message
      const message = `Travel Assist Connection!

👋 ${currentUserData.fullName} (${currentUserData.phoneNumber}) wants to connect with you.

📍 They are ${distance}km away from you.

🗺️ Their location: https://www.google.com/maps?q=${otherUserData.location.latitude},${otherUserData.location.longitude}

✨ Their skills: ${currentUserData.skills ? currentUserData.skills.join(', ') : 'None listed'}

Open Travel Assist app to accept the connection!`;

      const { result } = await SMS.sendSMSAsync(
        [toPhoneNumber],
        message
      );

      if (result === 'sent') {
        console.log('SMS sent successfully');
      }
    } catch (error) {
      console.error('Error sending SMS:', error);
      Alert.alert('Error', 'Failed to send SMS');
    }
  };

  const handleRequestResponse = async (requestId, fromUserId, accept) => {
    try {
      const requestRef = ref(database, `connection_requests/${requestId}`);

      // Remove the request first
      await remove(requestRef);
      setRequests(requests.filter(req => req.id !== requestId));

      if (accept) {
        // Get both users' data
        const [fromUserSnap, currentUserSnap] = await Promise.all([
          get(ref(database, `users/${fromUserId}`)),
          get(ref(database, `users/${auth.currentUser.uid}`))
        ]);

        const fromUserData = fromUserSnap.val();
        const currentUserData = currentUserSnap.val();

        // Find requesting user in nearbyUsers to get their distance
        const fromUserNearby = nearbyUsers.find(u => u.id === fromUserId);
        if (!fromUserNearby) {
          throw new Error('User not found in nearby users');
        }

        // Create a new connection in the database
        const connectionsRef = ref(database, 'connections');
        await push(connectionsRef, {
          users: [auth.currentUser.uid, fromUserId],
          timestamp: Date.now()
        });

        // Send SMS to both users with the same distance
        await Promise.all([
          // Send SMS to the user who sent the request
          sendLocationSMS(
            fromUserData.phoneNumber,
            currentUserData.fullName,
            currentUserData,
            fromUserNearby.distance
          ),
          // Send SMS to the current user
          sendLocationSMS(
            currentUserData.phoneNumber,
            fromUserData.fullName,
            fromUserData,
            fromUserNearby.distance
          )
        ]);
      }
      
      Alert.alert('Success', `Request ${accept ? 'accepted' : 'rejected'}`);
    } catch (error) {
      console.error("Error handling request:", error);
      Alert.alert('Error', 'Failed to respond to request');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigation.replace('Login');
    } catch (error) {
      console.error('Logout error:', error);
      Alert.alert('Error', 'Failed to logout');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView>
      <View style={styles.container}>
        <TouchableOpacity 
          style={[styles.connectAllButton, isConnecting && styles.connectingButton]} 
          onPress={connectToAllNearbyUsers}
          disabled={isConnecting || nearbyUsers.length === 0}
        >
          <Text style={styles.connectAllButtonText}>
            {isConnecting ? 'Connecting...' : `Connect to All Nearby Users (${nearbyUsers.length})`}
          </Text>
        </TouchableOpacity>
        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
        
        <Text style={styles.title}>Welcome </Text>
        
        {location ? (
          <>
            <View style={styles.locationContainer}>
              <Text style={styles.locationText}>Your Location:</Text>
              <Text>Latitude: {location.latitude}</Text>
              <Text>Longitude: {location.longitude}</Text>
              <Text>Last Updated: {new Date(location.timestamp).toLocaleString()}</Text>
            </View>
  
            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                initialRegion={{
                  latitude: location.latitude,
                  longitude: location.longitude,
                  latitudeDelta: 0.0922,
                  longitudeDelta: 0.0421,
                }}
              >
                <Marker
                  coordinate={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                  }}
                  title="Your Location"
                >
                  <Image
                    source={require('../assets/marker.png')}
                    style={{ width: 40, height: 40 }}
                  />
                </Marker>
                {nearbyUsers
                  .filter(user => !selectedSkill || (user.skills && user.skills.includes(selectedSkill)))
                  .map((user) => (
                    <Marker
                      key={user.id}
                      coordinate={{
                        latitude: user.location.latitude,
                        longitude: user.location.longitude,
                      }}
                      title={user.email}
                      description={`${user.distance} km away${user.skills ? ` • Skills: ${user.skills.join(', ')}` : ''}`}
                    >
                      <Image
                        source={require('../assets/marker.png')}
                        style={{ 
                          width: 40, 
                          height: 40,
                          tintColor: connections.some(conn => conn.users.includes(user.id)) ? '#4CAF50' : '#FF4B4B'
                        }}
                      />
                    </Marker>
                  ))}
                
                {/* Draw walking routes only for connected users */}
                {connections.map(connection => {
                  const routePoints = routes[connection.id];
                  return routePoints ? (
                    <Polyline
                      key={connection.id}
                      coordinates={routePoints}
                      strokeColor="#4CAF50"
                      strokeWidth={4}
                      lineDashPattern={[5]}
                    />
                  ) : null;
                })}
              </MapView>
            </View>
  
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Nearby Users</Text>
              <View style={styles.skillFilterContainer}>
                <View style={styles.filterHeader}>
                  <Text style={styles.filterLabel}>Filter by Skill</Text>
                  {selectedSkill && (
                    <TouchableOpacity 
                      style={styles.clearFilterButton} 
                      onPress={() => setSelectedSkill('')}
                    >
                      <Text style={styles.clearFilterText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false} 
                  style={styles.skillsScroll}
                  contentContainerStyle={styles.skillsScrollContent}
                >
                  {AVAILABLE_SKILLS.map((skill) => (
                    <TouchableOpacity
                      key={skill}
                      style={[styles.skillFilterChip, selectedSkill === skill && styles.selectedFilterChip]}
                      onPress={() => setSelectedSkill(skill)}
                    >
                      <Text 
                        style={[styles.skillFilterChipText, selectedSkill === skill && styles.selectedFilterChipText]}
                        numberOfLines={1}
                      >
                        {skill}
                      </Text>
                      {selectedSkill === skill && (
                        <View style={styles.activeFilterDot} />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              {nearbyUsers.length > 0 ? (
                nearbyUsers
                  .filter(user => !selectedSkill || (user.skills && user.skills.includes(selectedSkill)))
                  .map((item) => (
                  <View key={item.id} style={styles.userItem}>
                    <View style={styles.userInfo}>
                      <Text style={styles.userEmail}>{item.email}</Text>
                      <View style={styles.distanceContainer}>
                        <Text style={styles.distanceText}>{item.distance} km away</Text>
                      </View>
                      
                      <View style={styles.userSkillsContainer}>
                        {item.skills && item.skills.length > 0 ? (
                          <ScrollView 
                            horizontal 
                            showsHorizontalScrollIndicator={false} 
                            style={styles.skillsScroll}
                          >
                            {item.skills.map((skill, index) => (
                              <View 
                                key={index} 
                                style={[styles.skillBadge, selectedSkill === skill && styles.selectedSkillBadge]}
                              >
                                <Text style={[styles.skillBadgeText, selectedSkill === skill && styles.selectedSkillBadgeText]}>
                                  {skill}
                                </Text>
                              </View>
                            ))}
                          </ScrollView>
                        ) : (
                          <Text style={styles.noSkillsText}>No skills listed</Text>
                        )}
                      </View>
                    </View>

                    {isUserConnected(item.id) ? (
                      <TouchableOpacity
                        style={[styles.connectButton, styles.disconnectButton]}
                        onPress={() => {
                          const connection = connections.find(conn => 
                            conn.users.includes(item.id) && conn.users.includes(auth.currentUser.uid)
                          );
                          if (connection) {
                            handleDisconnect(connection.id, item.id);
                          }
                        }}
                      >
                        <Text style={styles.buttonText}>Disconnect</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.connectButton}
                        onPress={() => sendConnectionRequest(item.id)}
                      >
                        <Text style={styles.buttonText}>Connect</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No nearby users found</Text>
              )}
            </View>
  
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Connection Requests</Text>
              {requests.length > 0 ? (
                requests.map((item) => (
                  <View key={item.id} style={styles.requestItem}>
                    <Text>From: {item.fromusername}</Text>
                    <View style={styles.requestButtons}>
                      <TouchableOpacity
                        style={[styles.responseButton, styles.acceptButton]}
                        onPress={() => handleRequestResponse(item.id, item.from, true)}
                      >
                        <Text style={styles.buttonText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.responseButton, styles.rejectButton]}
                        onPress={() => handleRequestResponse(item.id, item.from, false)}
                      >
                        <Text style={styles.buttonText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No pending requests</Text>
              )}
            </View>
          </>
        ) : (
          <Text>Loading location data...</Text>
        )}
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => navigation.navigate('Skills')}
          >
            <Text style={styles.actionButtonText}>My Skills</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, styles.logoutButton]}
            onPress={handleLogout}
          >
            <Text style={styles.actionButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  userItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  userInfo: {
    flex: 1,
    marginBottom: 10,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  distanceContainer: {
    marginBottom: 8,
  },
  distanceText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  userSkillsContainer: {
    marginTop: 8,
  },
  skillsScroll: {
    flexGrow: 0,
    marginBottom: 4,
  },
  skillBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  selectedSkillBadge: {
    backgroundColor: '#4CAF50',
    borderColor: '#43A047',
  },
  skillBadgeText: {
    fontSize: 12,
    color: '#666',
  },
  selectedSkillBadgeText: {
    color: '#fff',
    fontWeight: '600',
  },
  noSkillsText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  connectButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-end',
  },
  disconnectButton: {
    backgroundColor: '#ff3b30',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  skillsText: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  skillFilterContainer: {
    marginBottom: 15,
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 12,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  clearFilterButton: {
    paddingHorizontal: 8,
  },
  clearFilterText: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '500',
  },
  skillsScroll: {
    flexGrow: 0,
  },
  skillsScrollContent: {
    paddingRight: 12,
  },
  skillFilterChip: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedFilterChip: {
    backgroundColor: '#EBF7ED',
    borderColor: '#4CAF50',
  },
  skillFilterChipText: {
    fontSize: 14,
    color: '#666',
    marginRight: 4,
  },
  selectedFilterChipText: {
    color: '#2E7D32',
    fontWeight: '600',
  },
  activeFilterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
    marginLeft: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  actionButton: {
    backgroundColor: '#2196F3',
    padding: 10,
    borderRadius: 5,
    flex: 0.48,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  connectAllButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
    margin: 15,
    alignItems: 'center',
    marginTop: 50,
    marginBlockEnd:-25,
  },
  connectingButton: {
    backgroundColor: '#888',
  },
  connectAllButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 40,
    marginBottom: 20,
    textAlign: 'center',
  },
  locationContainer: {
    backgroundColor: '#f5f5f5',
    padding: 20,
    borderRadius: 10,
    marginVertical: 10,
  },
  locationText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  mapContainer: {
    height: 300,
    overflow: 'hidden',
    borderRadius: 10,
    marginVertical: 10,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  section: {
    marginVertical: 10,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  userItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#fff',
    marginVertical: 5,
    borderRadius: 5,
  },
  connectButton: {
    backgroundColor: '#007AFF',
    padding: 8,
    borderRadius: 5,
  },
  requestItem: {
    backgroundColor: '#fff',
    padding: 10,
    marginVertical: 5,
    borderRadius: 5,
  },
  requestButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 5,
  },
  responseButton: {
    padding: 8,
    borderRadius: 5,
    marginLeft: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#4CD964',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
  },
  emptyText: {
    textAlign: 'center',
    fontStyle: 'italic',
    color: '#666',
    padding: 10,
  },
  logoutButton: {
    backgroundColor: '#ff3b30',
    padding: 15,
    borderRadius: 5,
    marginTop: 20,
    marginBottom: 10,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
});