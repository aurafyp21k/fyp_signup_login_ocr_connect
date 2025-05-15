import React, { useState, useEffect, useRef } from 'react';
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
  TextInput,
  AppState,
  Platform,
  StatusBar
} from 'react-native';
import * as Notifications from 'expo-notifications';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { ref, onValue, get, push, set, remove, update } from 'firebase/database';
import { signOut } from 'firebase/auth';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { auth, database } from '../firebase/config';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

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

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const TabIcon = ({ icon, focused }) => (
  <View
    style={[
      styles.tabIconContainer,
      focused && styles.tabIconContainerFocused
    ]}
  >
    <View
      style={[
        styles.tabIconInner,
        focused && styles.tabIconInnerFocused
      ]}
    >
      <Ionicons
        name={icon}
        size={28}
        color={focused ? "#ffffff" : "#666666"}
      />
    </View>
  </View>
);

const HomeScreen = ({ navigation }) => {
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
  const [activeTab, setActiveTab] = useState('nearby');
  const [appState, setAppState] = useState(AppState.currentState);
  const [locationSubscription, setLocationSubscription] = useState(null);
  const processedNotificationIds = useRef(new Set());
  const [recentConnections, setRecentConnections] = useState([]);
  const [connectionHistory, setConnectionHistory] = useState([]);
  const insets = useSafeAreaInsets();
  const { theme, isDark, toggleTheme } = useTheme();
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [currentRating, setCurrentRating] = useState(0);
  const [ratingUser, setRatingUser] = useState(null);
  const [ratingComment, setRatingComment] = useState('');

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

  // Request notification permissions
  useEffect(() => {
    (async () => {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        Alert.alert('Permission Required', 'Please enable notifications to receive chat messages');
        return;
      }

      // Set up notification channels for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('chat-messages', {
          name: 'Chat Messages',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
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
              skills: userData.skills || [],
              averageRating: userData.averageRating || 0,
              ratingCount: userData.ratings ? userData.ratings.length : 0
            };
            users.push(user);
          }
        }
      });
      
      // Sort users by average rating (highest first)
      const sortedUsers = users.sort((a, b) => {
        // If both users have ratings, sort by average rating
        if (a.averageRating > 0 && b.averageRating > 0) {
          return b.averageRating - a.averageRating;
        }
        // If only one user has ratings, prioritize the one with ratings
        if (a.averageRating > 0) return -1;
        if (b.averageRating > 0) return 1;
        // If neither has ratings, sort by distance
        return parseFloat(a.distance) - parseFloat(b.distance);
      });
      
      setNearbyUsers(sortedUsers);
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
      // Get the other user's data before removing the connection
      const otherUserRef = ref(database, `users/${otherUserId}`);
      const otherUserSnap = await get(otherUserRef);
      const otherUserData = otherUserSnap.val();

      // Remove the connection from Firebase
      const connectionRef = ref(database, `connections/${connectionId}`);
      await remove(connectionRef);

      // Remove the route
      const newRoutes = { ...routes };
      delete newRoutes[connectionId];
      setRoutes(newRoutes);

      // Update connections state
      setConnections(connections.filter(conn => conn.id !== connectionId));

      // Show rating modal
      setRatingUser({
        id: otherUserId,
        name: otherUserData.cnic?.name || 'Unknown User'
      });
      setShowRatingModal(true);

      // Show notification
      scheduleNotification(
        'Connection Ended',
        `Your connection with ${otherUserData.cnic?.name || 'Unknown User'} has ended. Please rate your experience.`
      );

      // Send SMS to both users
      try {
        const currentUserRef = ref(database, `users/${auth.currentUser.uid}`);
        const currentUserSnap = await get(currentUserRef);
        const currentUserData = currentUserSnap.val();

        const message = `Connection Ended

Your connection with ${otherUserData.cnic?.name || 'Unknown User'} has ended.
Please rate your experience in the app.

Thank you for using MADADGAR!`;

        await SMS.sendSMSAsync(
          [currentUserData.phoneNumber, otherUserData.phoneNumber],
          message
        );
      } catch (smsError) {
        console.error('Error sending SMS:', smsError);
      }

      Alert.alert('Success', 'Connection ended successfully');
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
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
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

    // Calculate average rating display
    const averageRating = user.averageRating || 0;
    const fullStars = Math.floor(averageRating);
    const hasHalfStar = averageRating % 1 >= 0.5;

    return (
      <View style={styles.userCard}>
        <View style={styles.userCardContent}>
          <View style={styles.userAvatarContainer}>
            <View style={[styles.userAvatar, { backgroundColor: isConnected ? '#4CAF50' : '#4A90E2' }]}>
              <Text style={styles.userAvatarText}>
                {user.fullName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={[styles.connectionStatus, { backgroundColor: isConnected ? '#4CAF50' : '#FF4B4B' }]} />
          </View>
          <View style={styles.userInfo}>
            <View style={styles.userHeader}>
              <Text style={styles.userName} numberOfLines={1} ellipsizeMode="tail">
                {user.fullName}
              </Text>
              <View style={styles.userActions}>
                {isConnected ? (
                  <>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.chatButton]}
                      onPress={() => {
                        const sortedIds = [auth.currentUser.uid, user.id].sort();
                        navigation.navigate('Chat', {
                          chatId: `chat_${sortedIds[0]}_${sortedIds[1]}`,
                          otherUserName: user.fullName
                        });
                      }}
                    >
                      <Ionicons name="chatbubble-outline" size={20} color="#4A90E2" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.disconnectButton]}
                      onPress={() => handleDisconnect(
                        connections.find(c => c.users.includes(user.id))?.id,
                        user.id
                      )}
                    >
                      <Ionicons name="close-circle-outline" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.connectButton]}
                    onPress={() => sendConnectionRequest(user.id)}
                  >
                    <Ionicons name="add-circle-outline" size={20} color="#4CAF50" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={styles.userDetails}>
              <View style={styles.detailItem}>
                <Ionicons name="location-outline" size={16} color="#4A90E2" />
                <Text style={styles.detailText}>{distance} km away</Text>
              </View>
              {user.skills && user.skills.length > 0 && (
                <View style={styles.detailItem}>
                  <Ionicons name="construct-outline" size={16} color="#4A90E2" />
                  <Text style={styles.detailText} numberOfLines={1}>
                    {user.skills.slice(0, 2).join(', ')}
                    {user.skills.length > 2 ? '...' : ''}
                  </Text>
                </View>
              )}
              <View style={styles.detailItem}>
                <View style={styles.ratingStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <MaterialIcons
                      key={star}
                      name={
                        star <= fullStars
                          ? "star"
                          : star === fullStars + 1 && hasHalfStar
                          ? "star-half"
                          : "star-border"
                      }
                      size={16}
                      color={star <= fullStars ? "#FFD700" : "#CBD5E0"}
                      style={styles.ratingStar}
                    />
                  ))}
                  <Text style={styles.ratingText}>
                    {averageRating > 0 ? `${averageRating.toFixed(1)} (${user.ratingCount} ratings)` : 'No ratings'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // Function to update location in Firebase
  const updateLocationInFirebase = async (newLocation) => {
    try {
      if (!auth.currentUser) return;

      const userId = auth.currentUser.uid;
      const userRef = ref(database, `users/${userId}`);
      
      await update(userRef, {
        location: {
          latitude: newLocation.latitude,
          longitude: newLocation.longitude,
          timestamp: Date.now()
        }
      });

      setLocation(newLocation);
    } catch (error) {
      console.error('Error updating location in Firebase:', error);
    }
  };

  // Add this new function to check distances and update history
  const checkAndUpdateConnectionHistory = async (currentLocation) => {
    try {
      if (!currentLocation || !connections.length) return;

      for (const connection of connections) {
        const otherUserId = connection.users.find(id => id !== auth.currentUser.uid);
        const otherUser = nearbyUsers.find(user => user.id === otherUserId);
        
        if (otherUser && otherUser.location) {
          const distance = calculateDistance(
            currentLocation.latitude,
            currentLocation.longitude,
            otherUser.location.latitude,
            otherUser.location.longitude
          );

          console.log(`Distance to ${otherUser.fullName}: ${distance} km`);

          if (distance < 0.005) {
            console.log('Users are very close, checking for existing meeting...');

            const historyRef = ref(database, 'connection_history');
            const snapshot = await get(historyRef);
            const existingMeeting = snapshot.val() ? Object.values(snapshot.val()).find(
              meeting => 
                meeting.users.includes(auth.currentUser.uid) && 
                meeting.users.includes(otherUserId) &&
                Date.now() - meeting.timestamp < 300000
            ) : null;

            if (!existingMeeting) {
              console.log('No existing meeting found, creating new meeting record...');

              const [currentUserSnap, otherUserSnap] = await Promise.all([
                get(ref(database, `users/${auth.currentUser.uid}`)),
                get(ref(database, `users/${otherUserId}`))
              ]);

              const currentUserData = currentUserSnap.val();
              const otherUserData = otherUserSnap.val();

              const meetingData = {
                users: [auth.currentUser.uid, otherUserId],
                userNames: [
                  currentUserData.cnic?.name || 'Unknown User',
                  otherUserData.cnic?.name || 'Unknown User'
                ],
                timestamp: Date.now(),
                location: {
                  latitude: currentLocation.latitude,
                  longitude: currentLocation.longitude
                }
              };

              await push(historyRef, meetingData);

              // End the connection
              console.log('Ending connection...');
              const connectionRef = ref(database, `connections/${connection.id}`);
              await remove(connectionRef);

              // Remove the route
              const newRoutes = { ...routes };
              delete newRoutes[connection.id];
              setRoutes(newRoutes);

              // Update connections state
              setConnections(prevConnections => prevConnections.filter(conn => conn.id !== connection.id));

              // Show rating modal
              setRatingUser({
                id: otherUserId,
                name: otherUserData.cnic?.name || 'Unknown User'
              });
              setShowRatingModal(true);

              // Show notification
              scheduleNotification(
                'Connection Completed!',
                `You have met with ${otherUserData.cnic?.name || 'Unknown User'}. Please rate your experience.`
              );

              // Send SMS to both users
              try {
                const message = `Connection Completed!

You have successfully met with ${otherUserData.cnic?.name || 'Unknown User'}.
The connection has been completed and ended.

Please rate your experience in the app.

Thank you for using MADADGAR!`;

                await SMS.sendSMSAsync(
                  [currentUserData.phoneNumber, otherUserData.phoneNumber],
                  message
                );
              } catch (smsError) {
                console.error('Error sending SMS:', smsError);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error updating connection history:', error);
    }
  };

  // Update the location tracking function to check distances more frequently
  const startLocationTracking = async () => {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        setErrorMsg('Permission to access location in background was denied');
        return;
      }

      // Get initial location
      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High
      });

      const newLocation = {
        latitude: initialLocation.coords.latitude,
        longitude: initialLocation.coords.longitude,
        timestamp: Date.now()
      };

      await updateLocationInFirebase(newLocation);
      await checkAndUpdateConnectionHistory(newLocation);

      // Start watching location with less frequent updates for testing
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 300000, // Check every 5 minutes
          distanceInterval: 10000, // Update every 50 meters
        },
        async (location) => {
          const newLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: Date.now()
          };
          await updateLocationInFirebase(newLocation);
          await checkAndUpdateConnectionHistory(newLocation);
        }
      );

      setLocationSubscription(subscription);
    } catch (error) {
      console.error('Error starting location tracking:', error);
      setErrorMsg('Error starting location tracking');
    }
  };

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground
        startLocationTracking();
      }
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
    };
  }, [appState]);

  // Start location tracking when component mounts
  useEffect(() => {
    startLocationTracking();

    // Cleanup function
    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  // Set up notification listener for incoming messages
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      const { title, body, data } = notification.request.content;
      
      // If it's a chat message notification and we haven't processed it before
      if (data?.type === 'chat_message' && !processedNotificationIds.current.has(data.chatId)) {
        // Add to processed set
        processedNotificationIds.current.add(data.chatId);
        
        // Show local notification even when app is in foreground
        Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data,
            sound: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: null,
        });
      }
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      const { data } = response.notification.request.content;
      
      // If it's a chat message notification
      if (data?.type === 'chat_message') {
        // Remove from processed set when notification is tapped
        processedNotificationIds.current.delete(data.chatId);
        
        // Navigate to the chat screen
        if (data.chatId && data.otherUser) {
          navigation.navigate('Chat', {
            chatId: data.chatId,
            otherUser: data.otherUser
          });
        }
      }
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
      // Clear processed notifications when leaving the screen
      processedNotificationIds.current.clear();
    };
  }, [navigation]);

  // Add this new useEffect to fetch recent connections
  useEffect(() => {
    if (!auth.currentUser) return;

    const connectionsRef = ref(database, 'connections');
    const unsubscribe = onValue(connectionsRef, (snapshot) => {
      const connectionsData = [];
      snapshot.forEach((childSnapshot) => {
        const connection = childSnapshot.val();
        if (connection.users.includes(auth.currentUser.uid)) {
          // Get the other user's ID
          const otherUserId = connection.users.find(id => id !== auth.currentUser.uid);
          
          // Get the other user's data
          const userRef = ref(database, `users/${otherUserId}`);
          get(userRef).then((userSnapshot) => {
            const userData = userSnapshot.val();
            connectionsData.push({
              id: childSnapshot.key,
              timestamp: connection.timestamp,
              otherUser: {
                id: otherUserId,
                name: userData?.cnic?.name || 'Unknown User',
                phoneNumber: userData?.phoneNumber || 'No phone number'
              }
            });
            
            // Sort by timestamp and update state
            const sortedConnections = [...connectionsData].sort((a, b) => b.timestamp - a.timestamp);
            setRecentConnections(sortedConnections);
          });
        }
      });
    });

    return () => unsubscribe();
  }, []);

  // Add useEffect to listen for connection history updates
  useEffect(() => {
    if (!auth.currentUser) return;

    const historyRef = ref(database, 'connection_history');
    const unsubscribe = onValue(historyRef, (snapshot) => {
      const historyData = [];
      snapshot.forEach((childSnapshot) => {
        const meeting = childSnapshot.val();
        if (meeting.users.includes(auth.currentUser.uid)) {
          historyData.push({
            id: childSnapshot.key,
            ...meeting
          });
        }
      });
      setConnectionHistory(historyData.sort((a, b) => b.timestamp - a.timestamp));
    });

    return () => unsubscribe();
  }, []);

  const renderConnectionHistoryItem = (meeting) => {
    const otherUserName = meeting.userNames.find(name => name !== userInfo.fullName);
    const meetingDate = new Date(meeting.timestamp);
    const formattedDate = meetingDate.toLocaleDateString();
    const formattedTime = meetingDate.toLocaleTimeString();

    return (
      <View style={styles.historyItem}>
        <View style={styles.historyHeader}>
          <View style={styles.historyAvatar}>
            <Text style={styles.historyAvatarText}>
              {otherUserName?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <View style={styles.historyInfo}>
            <Text style={styles.historyName}>{otherUserName || 'Unknown User'}</Text>
            <Text style={styles.historyTime}>{formattedDate} at {formattedTime}</Text>
          </View>
        </View>
        <View style={styles.historyLocation}>
          <Ionicons name="location-outline" size={16} color="#4A90E2" />
          <Text style={styles.historyLocationText}>
            Met at: {meeting.location.latitude.toFixed(4)}, {meeting.location.longitude.toFixed(4)}
          </Text>
        </View>
      </View>
    );
  };

  const handleRatingSubmit = async () => {
    try {
      if (!ratingUser || currentRating === 0) return;

      const ratingData = {
        fromUser: auth.currentUser.uid,
        toUser: ratingUser.id,
        rating: currentRating,
        comment: ratingComment,
        timestamp: Date.now(),
        fromUserName: userInfo.fullName,
        toUserName: ratingUser.name
      };

      // Add rating to Firebase
      const ratingsRef = ref(database, 'user_ratings');
      await push(ratingsRef, ratingData);

      // Update user's average rating
      const userRef = ref(database, `users/${ratingUser.id}`);
      const userSnapshot = await get(userRef);
      const userData = userSnapshot.val();
      
      const currentRatings = userData.ratings || [];
      const newRatings = [...currentRatings, currentRating];
      const averageRating = newRatings.reduce((a, b) => a + b, 0) / newRatings.length;

      await update(userRef, {
        ratings: newRatings,
        averageRating: averageRating
      });

      // Reset rating state
      setCurrentRating(0);
      setRatingComment('');
      setRatingUser(null);
      setShowRatingModal(false);

      // Show success message
      Alert.alert('Success', 'Thank you for your rating!');
    } catch (error) {
      console.error('Error submitting rating:', error);
      Alert.alert('Error', 'Failed to submit rating');
    }
  };

  const renderRatingModal = () => (
    <Modal
      visible={showRatingModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowRatingModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { maxHeight: '60%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Rate Your Experience</Text>
            <TouchableOpacity onPress={() => setShowRatingModal(false)}>
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          <View style={styles.ratingContainer}>
            <Text style={styles.ratingTitle}>How was your experience with {ratingUser?.name}?</Text>
            
            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setCurrentRating(star)}
                >
                  <MaterialIcons
                    name={star <= currentRating ? "star" : "star-border"}
                    size={40}
                    color={star <= currentRating ? "#FFD700" : "#666"}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.ratingInput}
              placeholder="Add a comment (optional)"
              value={ratingComment}
              onChangeText={setRatingComment}
              multiline
              numberOfLines={3}
              placeholderTextColor="#666"
            />

            <TouchableOpacity
              style={[styles.submitRatingButton, currentRating === 0 && styles.submitRatingButtonDisabled]}
              onPress={handleRatingSubmit}
              disabled={currentRating === 0}
            >
              <Text style={styles.submitRatingButtonText}>Submit Rating</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: '#f8fafc' }]}>
        <ActivityIndicator size="large" color="#007AFF" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.header} />
      <View style={[styles.header, { 
        paddingTop: Platform.OS === 'ios' ? 0 : StatusBar.currentHeight,
        backgroundColor: theme.header,
      }]}>
        <View style={styles.headerInfo}>
          <Text style={[styles.title, { color: theme.headerText }]}>MADADGAR</Text>
          {userInfo.fullName && (
            <Text style={[styles.userName, { color: theme.headerText }]}>{userInfo.fullName}</Text>
          )}
          {userInfo.phoneNumber && (
            <Text style={[styles.userPhone, { color: theme.headerText }]}>{userInfo.phoneNumber}</Text>
          )}
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={[styles.headerButton, styles.themeButton, { 
              backgroundColor: isDark ? '#FFD700' : '#2C3E50',
              transform: [{ scale: 1.1 }],
              borderWidth: 2,
              borderColor: isDark ? '#FFA500' : '#34495E',
            }]}
            onPress={toggleTheme}
          >
            <Ionicons 
              name={isDark ? "sunny" : "moon"} 
              size={24} 
              color={isDark ? '#FFA500' : '#ECF0F1'} 
            />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.headerButton, styles.skillsButton]}
            onPress={() => {
              setSelectedUserSkills(userInfo.skills || []);
              setShowUpdateSkillsModal(true);
            }}
          >
            <Ionicons name="construct-outline" size={22} color={theme.headerText} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.headerButton, styles.logoutButton]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={22} color={theme.headerText} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.mainContent}>
        <ScrollView style={styles.scrollView}>
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
              <View style={styles.mapContainer}>
                <MapView
                  ref={(ref) => setMapRef(ref)}
                  style={styles.map}
                  initialRegion={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
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
                      source={require('../assets/icons/marker.png')}
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
                          source={require('../assets/icons/marker.png')}
                          style={{ 
                            width: 40, 
                            height: 40,
                            tintColor: connections.some(conn => conn.users.includes(user.id)) ? '#4CAF50' : '#FF4B4B'
                          }}
                        />
                      </Marker>
                    ))}
                  
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

              <View style={styles.tabsContainer}>
                <View style={styles.tabButtons}>
                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'nearby' && styles.activeTabButton]}
                    onPress={() => setActiveTab('nearby')}
                  >
                    <Text style={[styles.tabButtonText, activeTab === 'nearby' && styles.activeTabButtonText]}>
                      Nearby Users
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'requests' && styles.activeTabButton]}
                    onPress={() => setActiveTab('requests')}
                  >
                    <Text style={[styles.tabButtonText, activeTab === 'requests' && styles.activeTabButtonText]}>
                      Connection Requests
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'history' && styles.activeTabButton]}
                    onPress={() => setActiveTab('history')}
                  >
                    <Text style={[styles.tabButtonText, activeTab === 'history' && styles.activeTabButtonText]}>
                      Recent Help
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.tabContent}>
                  {activeTab === 'nearby' ? (
                    <View style={styles.tabSection}>
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
                  ) : activeTab === 'requests' ? (
                    <View style={styles.tabSection}>
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
                  ) : (
                    <View style={styles.tabSection}>
                      {connectionHistory.length > 0 ? (
                        connectionHistory.map((meeting) => (
                          <View key={meeting.id}>
                            {renderConnectionHistoryItem(meeting)}
                          </View>
                        ))
                      ) : (
                        <Text style={styles.emptyText}>No recent help history</Text>
                      )}
                    </View>
                  )}
                </View>
              </View>
            </>
          ) : (
            <Text>Loading location data...</Text>
          )}
          {renderUpdateSkillsModal()}
          {renderRatingModal()}
        </ScrollView>
      </View>

      <View style={[styles.bottomTab, { 
        backgroundColor: theme.tabBar,
        borderColor: theme.border,
        shadowColor: theme.shadow,
      }]}>
        <TouchableOpacity 
          style={styles.tabItem}
          onPress={() => setActiveTab('nearby')}
        >
          <TabIcon icon="people-outline" focused={activeTab === 'nearby'} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem}
          onPress={() => navigation.navigate('Chatbot')}
        >
          <TabIcon icon="chatbubble-outline" focused={false} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabItem, styles.sosButton]}
          onPress={() => navigation.navigate('SOS')}
        >
          <MaterialIcons name="sos" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem}
          onPress={() => navigation.navigate('Profile')}
        >
          <TabIcon icon="person-outline" focused={false} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  mainContent: {
    flex: 1,
    position: 'relative',
    // paddingBottom: 100, // Add padding to prevent content from being hidden
  },
  scrollView: {
    flex: 1,
  },
  bottomTab: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 50,
    paddingBottom: Platform.OS === 'ios' ? 25 : 10,
    overflow: 'hidden',
    marginHorizontal: 20,
    marginBottom: 10,
    height: 78,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexDirection: 'row',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 15,
    backgroundColor: '#00b8ff',
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: '#00b8ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  headerInfo: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 2,
    letterSpacing: -0.5,
  },
  userName: {
  // flex:1,
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 1,
    letterSpacing: -0.3,
  },
  userPhone: {
    fontSize: 14,
    color: '#e2e8f0',
    fontWeight: '500',
  },
  logoutButton: {
    backgroundColor: '#f43f77',
    padding: 12,
    borderRadius: 30,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#f43f77',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  connectAllButton: {
    backgroundColor: '#7e22ce',
    padding: 18,
    borderRadius: 20,
    margin: 20,
    alignItems: 'center',
    shadowColor: '#7e22ce',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    transform: [{ scale: 1.02 }],
  },
  connectingButton: {
    backgroundColor: '#718096',
    transform: [{ scale: 1 }],
  },
  connectAllButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  locationContainer: {
    backgroundColor: '#ffffff',
    padding: 25,
    borderRadius: 25,
    margin: 20,
    shadowColor: '#00b8ff',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  locationText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#00b8ff',
    marginBottom: 15,
    letterSpacing: -0.5,
  },
  mapContainer: {
    height: 250,
    borderRadius: 20,
    margin: 15,
    overflow: 'hidden',
    shadowColor: '#00b8ff',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#00b8ff',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  section: {
    margin: 20,
    padding: 25,
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#4A90E2',
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  userItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  userCard: {
    marginBottom: 20,
    paddingHorizontal: 5,
  },
  userCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatarContainer: {
    position: 'relative',
    marginRight: 15,
  },
  userAvatar: {
    width: 55,
    height: 55,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00b8ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  userAvatarText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
  connectionStatus: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  userInfo: {
    flex: 1,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a202c',
    letterSpacing: -0.5,
    flex: 1,
    marginRight: 8,
  },
  userDetails: {
    gap: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#718096',
    fontWeight: '500',
  },
  userActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  actionButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  connectButton: {
    backgroundColor: '#e6f6ff',
  },
  disconnectButton: {
    backgroundColor: '#fee2e2',
  },
  chatButton: {
    backgroundColor: '#f0f9ff',
  },
  requestItem: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  requestButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 15,
  },
  responseButton: {
    padding: 12,
    borderRadius: 15,
    marginLeft: 15,
    minWidth: 100,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  acceptButton: {
    backgroundColor: '#4CD964',
    shadowColor: '#4CD964',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
    shadowColor: '#FF3B30',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  emptyText: {
    textAlign: 'center',
    fontStyle: 'italic',
    color: '#666',
    padding: 25,
    fontSize: 17,
    fontWeight: '500',
  },
  errorText: {
    color: '#ff3b30',
    textAlign: 'center',
    margin: 15,
    fontSize: 15,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F4FF',
  },
  categoryButtons: {
    flexDirection: 'row',
    marginBottom: 20,
    justifyContent: 'space-between',
  },
  categoryButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 25,
    marginHorizontal: 5,
    backgroundColor: '#F0F4FF',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4A90E2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  activeCategoryButton: {
    backgroundColor: '#4A90E2',
    borderColor: '#4A90E2',
    shadowColor: '#4A90E2',
    shadowOpacity: 0.3,
  },
  categoryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4A90E2',
  },
  activeCategoryButtonText: {
    color: '#FFFFFF',
  },
  skillFilterContainer: {
    marginBottom: 25,
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#00b8ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  filterLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#00b8ff',
    letterSpacing: -0.5,
  },
  clearFilterButton: {
    paddingHorizontal: 12,
  },
  clearFilterText: {
    color: '#00b8ff',
    fontSize: 15,
    fontWeight: '700',
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 18,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#00b8ff',
    shadowColor: '#00b8ff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dropdownButtonText: {
    fontSize: 17,
    color: '#00b8ff',
    fontWeight: '600',
  },
  placeholderText: {
    color: '#718096',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#4A90E2',
    letterSpacing: -0.5,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F4FF',
    borderRadius: 15,
    paddingHorizontal: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#4A90E2',
  },
  searchIcon: {
    marginRight: 10,
    color: '#4A90E2',
  },
  searchInput: {
    flex: 1,
    height: 45,
    fontSize: 17,
    color: '#4A90E2',
    fontWeight: '500',
  },
  skillsList: {
    maxHeight: 450,
  },
  skillItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  selectedSkillItem: {
    backgroundColor: '#4A90E2',
  },
  skillText: {
    fontSize: 17,
    color: '#4A90E2',
    fontWeight: '500',
  },
  selectedSkillText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  requestText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#4A90E2',
    marginBottom: 10,
  },
  returnToLocationButton: {
    position: 'absolute',
    bottom: 15,
    right: 15,
    backgroundColor: '#00b8ff',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00b8ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginLeft: 10,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  skillsButton: {
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
  },
  themeButton: {
    backgroundColor: 'transparent',
    padding: 12,
    borderRadius: 30,
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    transform: [{ scale: 1.1 }],
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    shadowColor: '#FF3B30',
  },
  updateSkillsButton: {
    backgroundColor: '#7e22ce',
    padding: 12,
    borderRadius: 50,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#7e22ce',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  updateSkillsButtonText:{
    fontSize: 20,
  },

  chatbotButton: {
    backgroundColor: '#00b8ff',
    padding: 12,
    borderRadius: 30,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00b8ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  tabsContainer: {
    margin: 20,
    marginBottom: 40, // Add extra margin at bottom
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#00b8ff',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  tabButtons: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  activeTabButton: {
    backgroundColor: '#00b8ff',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#00b8ff',
  },
  activeTabButtonText: {
    color: '#ffffff',
  },
  tabContent: {
    padding: 15,
    paddingBottom: 20, // Add extra padding at bottom
  },
  tabSection: {
    minHeight: 180,
    marginBottom: 20, // Add margin to ensure last item is visible
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  requestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00b8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  requestAvatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  requestInfo: {
    flex: 1,
  },
  requestName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a202c',
    marginBottom: 1,
  },
  requestEmail: {
    fontSize: 13,
    color: '#718096',
  },
  requestButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  connectionItem: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginVertical: 10,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00b8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  connectionAvatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  connectionInfo: {
    flex: 1,
  },
  connectionName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a202c',
    marginBottom: 1,
  },
  connectionPhone: {
    fontSize: 13,
    color: '#718096',
  },
  connectionTime: {
    fontSize: 13,
    color: '#718096',
    fontWeight: '500',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  tabIconContainerFocused: {
    backgroundColor: '#00b8ff',
  },
  tabIconInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIconInnerFocused: {
    backgroundColor: '#00b8ff',
  },
  sosButton: {
    marginTop: 25,
    backgroundColor: '#FF0000',
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  historyItem: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  historyAvatar: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: '#4A90E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyAvatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  historyInfo: {
    flex: 1,
  },
  historyName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a202c',
    marginBottom: 4,
  },
  historyTime: {
    fontSize: 14,
    color: '#718096',
    fontWeight: '500',
  },
  historyLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  historyLocationText: {
    fontSize: 14,
    color: '#4A90E2',
    marginLeft: 8,
    fontWeight: '500',
  },
  ratingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  ratingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a202c',
    marginBottom: 20,
    textAlign: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 10,
  },
  ratingInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    fontSize: 16,
    color: '#1a202c',
    backgroundColor: '#F8FAFC',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitRatingButton: {
    backgroundColor: '#4A90E2',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    width: '100%',
    alignItems: 'center',
  },
  submitRatingButtonDisabled: {
    backgroundColor: '#CBD5E0',
  },
  submitRatingButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  ratingStars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingStar: {
    marginRight: 1,
  },
  ratingText: {
    fontSize: 14,
    color: '#718096',
    marginLeft: 4,
    fontWeight: '500',
  },
});

export default HomeScreen;