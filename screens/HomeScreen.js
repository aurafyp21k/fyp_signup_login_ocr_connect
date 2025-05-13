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
  Image,
  Modal,
  TextInput
} from 'react-native';
import * as Notifications from 'expo-notifications';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { ref, onValue, get, push, set, remove } from 'firebase/database';
import { signOut } from 'firebase/auth';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { auth, database } from '../firebase/config';
import { Ionicons } from '@expo/vector-icons';

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

const CAR_SKILLS = [
  'Tire Change', 'Jump Start', 'Battery Check', 'Coolant Refill', 'Brake Handling',
  'Engine Reset', 'Fuel Leak', 'Tire Inflate', 'Light Replace', 'Car Unlock',
  'Gear Shift', 'Clutch Fix', 'Smoke Diagnosis', 'Power Steering', 'Oil Check',
  'Fuse Replace', 'Wiper Fix', 'AC Repair', 'Window Fix', 'Fluid Top-up',
  'Pedal Release', 'Noise Check', 'Vibration Fix', 'Alignment Check', 'Jack Use',
  'Horn Repair', 'Headlight Align', 'Mirror Replace', 'Sunroof Fix', 'Lock Lubricate',
  'Seatbelt Fix', 'Muffler Secure', 'Bumper Repair', 'Radiator Seal', 'Belt Check',
  'Hubcap Secure', 'Gas Cap', 'Speedometer Fix', 'Alternator Check', 'Tire Balance',
  'Car Stall', 'Heater Repair', 'Dashboard Check', 'Transmission Fix', 'Car Tow',
  'Exhaust Repair', 'Ignition Fix', 'Switch Replace'
];

const FIRST_AID_SKILLS = [
  'Wound Clean', 'Burn Treat', 'Nosebleed Stop', 'Sting Care', 'Ankle Wrap',
  'Choking Help', 'CPR Perform', 'Stroke Detect', 'Shock Treat', 'Allergy Assist',
  'Poison Handle', 'Cut Dress', 'Fracture Support', 'Bleeding Control', 'Seizure Aid',
  'Sunburn Soothe', 'Bite Treat', 'Blister Cover', 'Panic Calm', 'Faint Recover',
  'Heat Cool', 'Cold Warm', 'Lice Remove', 'Eye Rinse', 'Tooth Save',
  'Burn Cool', 'Insect Bite', 'Spider Bite', 'Snake Bite', 'Scorpion Sting',
  'Head Injury', 'Joint Immobilize', 'Concussion Watch', 'Tetanus Prevent', 'Splinter Remove',
  'Asthma Help', 'Diabetic Assist', 'Frostbite Care', 'Ear Blockage', 'Vomit Control'
];

const AVAILABLE_SKILLS = [...CAR_SKILLS, ...FIRST_AID_SKILLS];

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
  const [skillCategory, setSkillCategory] = useState('all'); // 'all', 'car', 'firstAid'
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSkills, setFilteredSkills] = useState([]);
  const [userInfo, setUserInfo] = useState({ fullName: '', phoneNumber: '' });
  const [mapRef, setMapRef] = useState(null);
  const [showUpdateSkillsModal, setShowUpdateSkillsModal] = useState(false);
  const [selectedUserSkills, setSelectedUserSkills] = useState([]);

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
      if (data) {
        // Get name from CNIC data
        const name = data.cnic?.name || '';
        setUserInfo({
          fullName: name,
          phoneNumber: data.phoneNumber || '',
          skills: data.skills || []
        });
        if (data.location) {
          setLocation(data.location);
        }
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

  // Update filtered skills when search query or category changes
  useEffect(() => {
    const skills = skillCategory === 'all' ? AVAILABLE_SKILLS :
                  skillCategory === 'car' ? CAR_SKILLS : FIRST_AID_SKILLS;
    
    if (searchQuery.trim() === '') {
      setFilteredSkills(skills);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredSkills(skills.filter(skill => 
        skill.toLowerCase().includes(query)
      ));
    }
  }, [searchQuery, skillCategory]);

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
          
          if (distance <= 3) {
            const userSkills = userData.skills || [];
            const user = {
              id: userId,
              email: userData.email,
              fullName: userData.cnic?.name || 'Unknown User',
              location: userData.location,
              distance: distance.toFixed(2),
              skills: userData.skills || []
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
      
      // Get sender's data
      const userRef = ref(database, `users/${fromUserId}`);
      const userSnapshot = await get(userRef);
      const userData = userSnapshot.val();
      
      if (!userData) {
        throw new Error('User data not found');
      }

      // Create request data with proper error handling
      const requestData = {
        from: fromUserId,
        fromEmail: userData.email || '',
        fromusername: userData.cnic?.name || 'Unknown User', // Get name from CNIC data
        to: toUserId,
        status: 'pending',
        timestamp: Date.now()
      };

      // Validate request data before sending
      if (!requestData.from || !requestData.to) {
        throw new Error('Invalid request data');
      }

      await push(requestsRef, requestData);
      Alert.alert('Success', 'Connection request sent!');
    } catch (error) {
      console.error("Error sending request:", error);
      Alert.alert('Error', 'Failed to send connection request. Please try again.');
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

 ${currentUserData.cnic?.name || 'Unknown User'} (${currentUserData.phoneNumber}) wants to connect with you.

📍 They are ${distance}km away from you.

🗺️ Their location: https://www.google.com/maps?q=${otherUserData.location.latitude},${otherUserData.location.longitude}

✨ Their skills: ${currentUserData.skills ? currentUserData.skills.join(', ') : 'None listed'}

Open Travel Assist app to see their live location!`;

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

  const renderSkillModal = () => (
    <Modal
      visible={showSkillModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowSkillModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Skill</Text>
            <TouchableOpacity onPress={() => setShowSkillModal(false)}>
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          <View style={styles.categoryButtons}>
            <TouchableOpacity
              style={[styles.categoryButton, skillCategory === 'all' && styles.activeCategoryButton]}
              onPress={() => setSkillCategory('all')}
            >
              <Text style={[styles.categoryButtonText, skillCategory === 'all' && styles.activeCategoryButtonText]}>
                All Skills
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.categoryButton, skillCategory === 'car' && styles.activeCategoryButton]}
              onPress={() => setSkillCategory('car')}
            >
              <Text style={[styles.categoryButtonText, skillCategory === 'car' && styles.activeCategoryButtonText]}>
                Car Skills
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.categoryButton, skillCategory === 'firstAid' && styles.activeCategoryButton]}
              onPress={() => setSkillCategory('firstAid')}
            >
              <Text style={[styles.categoryButtonText, skillCategory === 'firstAid' && styles.activeCategoryButtonText]}>
                First Aid Skills
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search skills..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#999"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#666" />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView style={styles.skillsList}>
            {filteredSkills.map((skill) => (
              <TouchableOpacity
                key={skill}
                style={[styles.skillItem, selectedSkill === skill && styles.selectedSkillItem]}
                onPress={() => {
                  setSelectedSkill(skill);
                  setShowSkillModal(false);
                }}
              >
                <Text style={[styles.skillText, selectedSkill === skill && styles.selectedSkillText]}>
                  {skill}
                </Text>
                {selectedSkill === skill && (
                  <Ionicons name="checkmark" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderSkillFilter = () => (
    <View style={styles.skillFilterContainer}>
      <View style={styles.filterHeader}>
        <Text style={styles.filterLabel}>Filter by Skill</Text>
        {selectedSkill && (
          <TouchableOpacity 
            style={styles.clearFilterButton} 
            onPress={() => {
              setSelectedSkill('');
              setSkillCategory('all');
              setSearchQuery('');
            }}
          >
            <Text style={styles.clearFilterText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>
      
      <TouchableOpacity 
        style={styles.dropdownButton}
        onPress={() => setShowSkillModal(true)}
      >
        <Text style={[styles.dropdownButtonText, !selectedSkill && styles.placeholderText]}>
          {selectedSkill || 'Select a skill'}
        </Text>
        <Ionicons name="chevron-down" size={20} color="#666" />
      </TouchableOpacity>
    </View>
  );

  const returnToCurrentLocation = () => {
    if (mapRef && location) {
      mapRef.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      }, 1000);
    }
  };

  const updateUserSkills = async () => {
    try {
      const userId = auth.currentUser.uid;
      const userRef = ref(database, `users/${userId}`);
      
      // Get current user data
      const userSnapshot = await get(userRef);
      const currentData = userSnapshot.val() || {};
      
      // Update only the skills while preserving other data
      await set(userRef, {
        ...currentData,
        skills: selectedUserSkills
      }, { merge: true });
      
      // Update local state
      setUserInfo(prev => ({
        ...prev,
        skills: selectedUserSkills
      }));
      
      Alert.alert('Success', 'Skills updated successfully!');
      setShowUpdateSkillsModal(false);
    } catch (error) {
      console.error('Error updating skills:', error);
      Alert.alert('Error', 'Failed to update skills');
    }
  };

  const renderUpdateSkillsModal = () => (
    <Modal
      visible={showUpdateSkillsModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowUpdateSkillsModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Update Your Skills</Text>
            <TouchableOpacity onPress={() => setShowUpdateSkillsModal(false)}>
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          <View style={styles.categoryButtons}>
            <TouchableOpacity
              style={[styles.categoryButton, skillCategory === 'all' && styles.activeCategoryButton]}
              onPress={() => setSkillCategory('all')}
            >
              <Text style={[styles.categoryButtonText, skillCategory === 'all' && styles.activeCategoryButtonText]}>
                All Skills
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.categoryButton, skillCategory === 'car' && styles.activeCategoryButton]}
              onPress={() => setSkillCategory('car')}
            >
              <Text style={[styles.categoryButtonText, skillCategory === 'car' && styles.activeCategoryButtonText]}>
                Car Skills
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.categoryButton, skillCategory === 'firstAid' && styles.activeCategoryButton]}
              onPress={() => setSkillCategory('firstAid')}
            >
              <Text style={[styles.categoryButtonText, skillCategory === 'firstAid' && styles.activeCategoryButtonText]}>
                First Aid Skills
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search skills..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#999"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#666" />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView style={styles.skillsList}>
            {filteredSkills.map((skill) => (
              <TouchableOpacity
                key={skill}
                style={[styles.skillItem, selectedUserSkills.includes(skill) && styles.selectedSkillItem]}
                onPress={() => {
                  setSelectedUserSkills(prev => 
                    prev.includes(skill) 
                      ? prev.filter(s => s !== skill)
                      : [...prev, skill]
                  );
                }}
              >
                <Text style={[styles.skillText, selectedUserSkills.includes(skill) && styles.selectedSkillText]}>
                  {skill}
                </Text>
                {selectedUserSkills.includes(skill) && (
                  <Ionicons name="checkmark" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity 
            style={styles.updateSkillsButton}
            onPress={updateUserSkills}
          >
            <Text style={styles.updateSkillsButtonText}>Update Skills</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderUserCard = (user) => {
    const isConnected = isUserConnected(user.id);
    const distance = location ? getDistanceFromLatLonInKm(
      location.latitude,
      location.longitude,
      user.location.latitude,
      user.location.longitude
    ).toFixed(1) : 'N/A';

    return (
      <View style={styles.userCard}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user.fullName}</Text>
          <Text style={styles.userDistance}>{distance} km away</Text>
          <Text style={styles.userSkills}>
            Skills: {user.skills ? user.skills.join(', ') : 'No skills listed'}
          </Text>
        </View>
        <View style={styles.userActions}>
          {isConnected ? (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.chatButton]}
                onPress={() => {
                  // Sort user IDs to ensure consistent chat ID regardless of who initiates
                  const sortedIds = [auth.currentUser.uid, user.id].sort();
                  navigation.navigate('Chat', {
                    chatId: `chat_${sortedIds[0]}_${sortedIds[1]}`,
                    otherUserName: user.fullName
                  });
                }}
              >
                <Ionicons name="chatbubble-outline" size={24} color="#007AFF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.disconnectButton]}
                onPress={() => handleDisconnect(
                  connections.find(c => c.users.includes(user.id))?.id,
                  user.id
                )}
              >
                <Ionicons name="close-circle-outline" size={24} color="#FF3B30" />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.actionButton, styles.connectButton]}
              onPress={() => sendConnectionRequest(user.id)}
            >
              <Ionicons name="add-circle-outline" size={24} color="#4CAF50" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
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
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.title}>Welcome</Text>
            {userInfo.fullName && (
              <Text style={styles.userName}>{userInfo.fullName}</Text>
            )}
            {userInfo.phoneNumber && (
              <Text style={styles.userPhone}>{userInfo.phoneNumber}</Text>
            )}
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity 
              style={styles.chatbotButton}
              onPress={() => navigation.navigate('Chatbot')}
            >
              <Ionicons name="chatbubble-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.updateSkillsButton}
              onPress={() => {
                setSelectedUserSkills(userInfo.skills || []);
                setShowUpdateSkillsModal(true);
              }}
            >
              <Ionicons name="add-circle-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.logoutButton}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

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
                ref={(ref) => setMapRef(ref)}
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
                      title={user.fullName}
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
              <TouchableOpacity 
                style={styles.returnToLocationButton}
                onPress={returnToCurrentLocation}
              >
                <Ionicons name="locate" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
  
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Nearby Users</Text>
              {renderSkillFilter()}
              {renderSkillModal()}
              {nearbyUsers.length > 0 ? (
                nearbyUsers
                  .filter(user => !selectedSkill || (user.skills && user.skills.includes(selectedSkill)))
                  .map((item) => (
                  <View key={item.id} style={styles.userItem}>
                    {renderUserCard(item)}
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
                    <Text style={styles.requestText}>From: {item.fromusername || 'Unknown User'}</Text>
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
        {renderUpdateSkillsModal()}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  headerInfo: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  userPhone: {
    fontSize: 14,
    color: '#666',
  },
  logoutButton: {
    backgroundColor: '#ff3b30',
    padding: 10,
    borderRadius: 25,
    width: 45,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff3b30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  connectAllButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 15,
    margin: 20,
    alignItems: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  connectingButton: {
    backgroundColor: '#888',
  },
  connectAllButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  locationContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 15,
    margin: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  locationText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  mapContainer: {
    height: 300,
    borderRadius: 20,
    margin: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  section: {
    margin: 20,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 15,
  },
  userItem: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userInfo: {
    flex: 1,
  },
  userDistance: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  userSkills: {
    fontSize: 14,
    color: '#666',
  },
  userActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 20,
  },
  connectButton: {
    backgroundColor: '#E8F5E9',
  },
  disconnectButton: {
    backgroundColor: '#FFEBEE',
  },
  chatButton: {
    backgroundColor: '#E3F2FD',
  },
  requestItem: {
    backgroundColor: '#fff',
    padding: 15,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  requestButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  responseButton: {
    padding: 10,
    borderRadius: 12,
    marginLeft: 12,
    minWidth: 90,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  acceptButton: {
    backgroundColor: '#4CD964',
    shadowColor: '#4CD964',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
    shadowColor: '#FF3B30',
  },
  emptyText: {
    textAlign: 'center',
    fontStyle: 'italic',
    color: '#666',
    padding: 20,
    fontSize: 16,
  },
  errorText: {
    color: '#ff3b30',
    textAlign: 'center',
    margin: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  skillsScroll: {
    flexGrow: 0,
  },
  skillsScrollContent: {
    paddingRight: 12,
  },
  activeFilterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
    marginLeft: 4,
  },
  categoryButtons: {
    flexDirection: 'row',
    marginBottom: 15,
    justifyContent: 'space-between',
  },
  categoryButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginHorizontal: 4,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  activeCategoryButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeCategoryButtonText: {
    color: '#fff',
  },
  skillFilterContainer: {
    marginBottom: 20,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  filterLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  clearFilterButton: {
    paddingHorizontal: 10,
  },
  clearFilterText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dropdownButtonText: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  placeholderText: {
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 15,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: '#1a1a1a',
  },
  skillsList: {
    maxHeight: 400,
  },
  skillItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  selectedSkillItem: {
    backgroundColor: '#007AFF',
  },
  skillText: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  selectedSkillText: {
    color: '#fff',
    fontWeight: '600',
  },
  requestText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  returnToLocationButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#007AFF',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  updateSkillsButton: {
    backgroundColor: '#4CAF50',
    padding: 10,
    borderRadius: 25,
    width: 45,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  updateSkillsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  chatbotButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 25,
    width: 45,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
});