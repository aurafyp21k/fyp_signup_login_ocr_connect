import React, { useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Alert, Text, ActivityIndicator, Platform, Modal, TextInput, FlatList, Keyboard, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as Location from 'expo-location';
import { getDatabase, ref, push, set, get, remove } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import * as Contacts from 'expo-contacts';

const SOSButton = () => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [cameraReady, setCameraReady] = useState(false);
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [trustedContacts, setTrustedContacts] = useState([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, setMediaPermission] = useState(null);
  const [locationPermission, setLocationPermission] = useState(null);
  const [contactsPermission, setContactsPermission] = useState(null);
  const captureIntervalRef = useRef(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [allContacts, setAllContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const requestPermissions = async () => {
      try {
        // Request camera permissions
        const cameraResult = await requestPermission();
        console.log('Camera permission status:', cameraResult.status);
        
        // Request media library permissions
        const mediaResult = await MediaLibrary.requestPermissionsAsync();
        setMediaPermission(mediaResult.status);
        console.log('Media library permission status:', mediaResult.status);

        // Request location permissions
        const locationResult = await Location.requestForegroundPermissionsAsync();
        setLocationPermission(locationResult.status);
        console.log('Location permission status:', locationResult.status);

        // Request contacts permissions
        const contactsResult = await Contacts.requestPermissionsAsync();
        setContactsPermission(contactsResult.status);
        console.log('Contacts permission status:', contactsResult.status);

        // Load contacts if permission is granted
        if (contactsResult.status === 'granted') {
          loadDeviceContacts();
        }
      } catch (error) {
        console.error('Error requesting permissions:', error);
        Alert.alert('Error', 'Failed to get required permissions');
      }
    };

    requestPermissions();
    loadTrustedContacts();

    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    };
  }, []);

  const loadTrustedContacts = async () => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) return;

      const db = getDatabase();
      const contactsRef = ref(db, `users/${user.uid}/trusted_contacts`);
      const snapshot = await get(contactsRef);
      
      if (snapshot.exists()) {
        setTrustedContacts(Object.values(snapshot.val()));
      }
    } catch (error) {
      console.error('Error loading trusted contacts:', error);
    }
  };

  const loadDeviceContacts = async () => {
    try {
      setIsLoadingContacts(true);
      console.log('Loading device contacts...');

      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
        ],
      });

      console.log('Contacts loaded:', data.length);

      // Sort contacts alphabetically by name
      const sortedContacts = data.sort((a, b) => {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      setAllContacts(sortedContacts);
    } catch (error) {
      console.error('Error loading contacts:', error);
      Alert.alert('Error', 'Failed to load contacts');
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const filteredContacts = allContacts.filter(contact => {
    const searchLower = searchQuery.toLowerCase();
    const name = (contact.name || '').toLowerCase();
    const phone = contact.phoneNumbers?.[0]?.number || '';
    const email = contact.emails?.[0]?.email || '';
    
    return name.includes(searchLower) || 
           phone.includes(searchLower) || 
           email.includes(searchLower);
  }).sort((a, b) => {
    // Sort trusted contacts to the top
    const aIsTrusted = trustedContacts.some(tc => tc.id === a.id);
    const bIsTrusted = trustedContacts.some(tc => tc.id === b.id);
    if (aIsTrusted && !bIsTrusted) return -1;
    if (!aIsTrusted && bIsTrusted) return 1;
    return 0;
  });

  const renderContactItem = ({ item: contact }) => {
    const isTrusted = trustedContacts.some(tc => tc.id === contact.id);
    
    return (
      <TouchableOpacity 
        style={[styles.contactItem, isTrusted && styles.trustedContactItem]}
        onPress={() => isTrusted ? removeTrustedContact(contact.id) : addTrustedContact(contact)}
      >
        <View style={styles.contactAvatar}>
          <Text style={styles.contactAvatarText}>
            {(contact.name || '?')[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.contactInfo}>
          <View style={styles.contactNameContainer}>
            <Text style={styles.contactName}>{contact.name || 'Unnamed Contact'}</Text>
            {isTrusted && (
              <View style={styles.trustedBadge}>
                <MaterialIcons name="verified" size={16} color="#fff" />
                <Text style={styles.trustedText}>Trusted</Text>
              </View>
            )}
          </View>
          {contact.phoneNumbers?.[0] && (
            <Text style={styles.contactPhone}>
              <MaterialIcons name="phone" size={14} color="#666" /> {contact.phoneNumbers[0].number}
            </Text>
          )}
          {contact.emails?.[0] && (
            <Text style={styles.contactEmail}>
              <MaterialIcons name="email" size={14} color="#666" /> {contact.emails[0].email}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.actionButton, isTrusted ? styles.removeButton : styles.addButton]}
          onPress={() => isTrusted ? removeTrustedContact(contact.id) : addTrustedContact(contact)}
        >
          <MaterialIcons 
            name={isTrusted ? "remove-circle" : "add-circle"} 
            size={24} 
            color="#fff" 
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const selectContact = async () => {
    try {
      if (contactsPermission !== 'granted') {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Please grant contacts permission to add trusted contacts');
          return;
        }
      }

      // Get all contacts
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
        ],
      });

      if (data.length > 0) {
        // Create a list of contact names for selection
        const contactNames = data.map(contact => contact.name);
        
        // Show contact selection alert
        Alert.alert(
          'Select Contact',
          'Choose a contact to add as trusted contact',
          [
            ...data.map((contact, index) => ({
              text: contact.name || 'Unnamed Contact',
              onPress: () => addTrustedContact(contact)
            })),
            {
              text: 'Cancel',
              style: 'cancel'
            }
          ]
        );
      } else {
        Alert.alert('No Contacts', 'No contacts found on your device');
      }
    } catch (error) {
      console.error('Error selecting contact:', error);
      Alert.alert('Error', 'Failed to access contacts');
    }
  };

  const addTrustedContact = async (contact) => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Check if contact already exists
      const existingContacts = trustedContacts.filter(c => c.id === contact.id);
      if (existingContacts.length > 0) {
        Alert.alert('Error', 'This contact is already in your trusted contacts');
        return;
      }

      const db = getDatabase();
      const contactsRef = ref(db, `users/${user.uid}/trusted_contacts`);
      const newContactRef = push(contactsRef);

      const contactData = {
        id: contact.id,
        name: contact.name || 'Unnamed Contact',
        phoneNumbers: contact.phoneNumbers || [],
        email: contact.emails?.[0]?.email || null,
        addedAt: Date.now()
      };

      await set(newContactRef, contactData);
      await loadTrustedContacts();
      Alert.alert('Success', 'Contact added to trusted contacts');
    } catch (error) {
      console.error('Error adding trusted contact:', error);
      Alert.alert('Error', 'Failed to add trusted contact');
    }
  };

  const removeTrustedContact = async (contactId) => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const db = getDatabase();
      const contactsRef = ref(db, `users/${user.uid}/trusted_contacts`);
      const snapshot = await get(contactsRef);
      
      if (snapshot.exists()) {
        const contacts = snapshot.val();
        const contactKey = Object.keys(contacts).find(key => contacts[key].id === contactId);
        
        if (contactKey) {
          await remove(ref(db, `users/${user.uid}/trusted_contacts/${contactKey}`));
          await loadTrustedContacts();
          Alert.alert('Success', 'Contact removed from trusted contacts');
        }
      }
    } catch (error) {
      console.error('Error removing trusted contact:', error);
      Alert.alert('Error', 'Failed to remove trusted contact');
    }
  };

  const getCurrentLocation = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setCurrentLocation(location);
      return location;
    } catch (error) {
      console.error('Error getting location:', error);
      return null;
    }
  };

  const shareWithContacts = async (photoPaths, location) => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Save to Firebase
      const db = getDatabase();
      const sosRef = ref(db, 'sos_alerts');
      const newSosRef = push(sosRef);

      const sosData = {
        userId: user.uid,
        timestamp: Date.now(),
        location: location ? {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
        } : null,
        photoPaths: photoPaths,
        status: 'active'
      };

      await set(newSosRef, sosData);
      console.log('SOS alert saved to database');

      // Share with trusted contacts via WhatsApp
      if (photoPaths.length > 0 && trustedContacts.length > 0) {
        const locationLink = location 
          ? `https://maps.google.com/?q=${location.coords.latitude},${location.coords.longitude}`
          : 'Location not available';

        const message = `🚨 SOS ALERT! 🚨\n\n` +
          `I need help! This is an emergency.\n\n` +
          `📍 My current location: ${locationLink}\n\n` +
          `Please check the attached photos and respond immediately.`;

        // Share via WhatsApp for each trusted contact
        for (const contact of trustedContacts) {
          if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
            const phoneNumber = contact.phoneNumbers[0].number.replace(/[^0-9]/g, '');
            
            // Create WhatsApp URL
            const whatsappUrl = `whatsapp://send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;
            console.log('Opening WhatsApp with URL:', whatsappUrl);
            
            try {
              // Check if WhatsApp can be opened
              const canOpen = await Linking.canOpenURL(whatsappUrl);
              console.log('Can open WhatsApp:', canOpen);
              
              if (canOpen) {
                // Open WhatsApp
                await Linking.openURL(whatsappUrl);
                console.log('WhatsApp opened successfully for:', contact.name);
                
                // Wait before opening next contact
                await new Promise(resolve => setTimeout(resolve, 2000));
              } else {
                console.log('Cannot open WhatsApp for:', contact.name);
                Alert.alert(
                  'WhatsApp Not Available',
                  `Could not open WhatsApp for ${contact.name}. Please make sure WhatsApp is installed.`,
                  [{ text: 'OK' }]
                );
              }
            } catch (error) {
              console.error('Error opening WhatsApp:', error);
              Alert.alert(
                'Error',
                `Failed to open WhatsApp for ${contact.name}. Please try again.`,
                [{ text: 'OK' }]
              );
            }
          } else {
            console.log('No phone number found for contact:', contact.name);
            Alert.alert(
              'Missing Phone Number',
              `No phone number found for ${contact.name}. Please add a phone number to share via WhatsApp.`,
              [{ text: 'OK' }]
            );
          }
        }

        // After opening WhatsApp for all contacts, share the photo
        try {
          await Sharing.shareAsync(photoPaths[0], {
            mimeType: 'image/jpeg',
            dialogTitle: 'Share SOS Alert Photo',
            UTI: 'public.jpeg'
          });
        } catch (error) {
          console.error('Error sharing photo:', error);
        }
      } else {
        if (trustedContacts.length === 0) {
          Alert.alert(
            'No Trusted Contacts',
            'Please add trusted contacts to share SOS alerts.',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert(
            'No Photos Captured',
            'No photos were captured. Please try again.',
            [{ text: 'OK' }]
          );
        }
      }
    } catch (error) {
      console.error('Error in shareWithContacts:', error);
      Alert.alert('Error', 'Failed to share with trusted contacts. Please try again.');
    }
  };

  const handleCameraReady = () => {
    setCameraReady(true);
  };

  const ensureDirExists = async () => {
    const dir = `${FileSystem.documentDirectory}SOS_Photos/`;
    const dirInfo = await FileSystem.getInfoAsync(dir);
    
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    return dir;
  };

  const captureAndSavePhoto = async () => {
    if (!cameraReady || !cameraRef.current) return null;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: true,
        exif: true,
      });

      const dir = await ensureDirExists();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const photoFileName = `SOS_${timestamp}.jpg`;
      const newPath = `${dir}${photoFileName}`;

      await FileSystem.moveAsync({
        from: photo.uri,
        to: newPath,
      });

      if (mediaPermission === 'granted') {
        try {
          await MediaLibrary.saveToLibraryAsync(newPath);
        } catch (saveError) {
          console.log('Could not save to gallery, but saved locally:', saveError);
        }
      }

      const fileInfo = await FileSystem.getInfoAsync(newPath);
      if (!fileInfo.exists) {
        throw new Error('File was not saved properly');
      }

      return newPath;
    } catch (error) {
      console.error('Error capturing/saving photo:', error);
      throw error;
    }
  };

  const startCaptureSequence = async () => {
    if (isCapturing || !cameraReady) return;

    setIsCapturing(true);
    setStatus('Preparing...');
    
    const maxPhotos = 10;
    const captureDelay = 800;
    const capturedPaths = [];
    let captureCount = 0;

    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      // Get current location
      const location = await getCurrentLocation();
      
      captureIntervalRef.current = setInterval(async () => {
        if (captureCount >= maxPhotos) {
          clearInterval(captureIntervalRef.current);
          setIsCapturing(false);
          setStatus(`Saved ${maxPhotos} photos`);
          
          // Share with trusted contacts
          await shareWithContacts(capturedPaths.filter(Boolean), location);
          
          Alert.alert(
            'Capture Complete',
            `Successfully saved ${captureCount} photos and shared with trusted contacts.`,
            [
              { text: 'OK' },
              {
                text: 'View Files',
                onPress: () => viewSavedPhotos(capturedPaths.filter(Boolean))
              }
            ]
          );
          return;
        }

        try {
          setStatus(`Capturing (${captureCount + 1}/${maxPhotos})`);
          const photoPath = await captureAndSavePhoto();
          capturedPaths.push(photoPath);
          captureCount++;
        } catch (error) {
          console.error(`Error capturing photo ${captureCount + 1}:`, error);
        }
      }, captureDelay);
    } catch (error) {
      console.error('Error in capture sequence:', error);
      clearInterval(captureIntervalRef.current);
      setIsCapturing(false);
      setStatus('Error occurred');
      Alert.alert('Error', 'Failed to complete photo capture sequence');
    }
  };

  const viewSavedPhotos = async (photoPaths) => {
    if (Platform.OS === 'android') {
      const dir = `${FileSystem.documentDirectory}SOS_Photos/`;
      try {
        await Sharing.shareAsync(dir);
      } catch (error) {
        Alert.alert('Info', `Photos saved to: ${dir}`);
      }
    } else {
      if (photoPaths.length > 0) {
        try {
          await Sharing.shareAsync(photoPaths[0]);
        } catch (error) {
          Alert.alert('Info', `Photos saved to your device storage`);
        }
      }
    }
  };

  const renderContactsModal = () => (
    <Modal
      visible={showContactsModal}
      animationType="slide"
      onRequestClose={() => setShowContactsModal(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <View style={styles.headerTitleContainer}>
            <MaterialIcons name="people" size={24} color="#FF0000" />
            <Text style={styles.modalTitle}>Trusted Contacts</Text>
          </View>
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={() => setShowContactsModal(false)}
          >
            <MaterialIcons name="close" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={24} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search contacts..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="#999"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity 
              onPress={() => setSearchQuery('')}
              style={styles.clearSearchButton}
            >
              <MaterialIcons name="close" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>

        {isLoadingContacts ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF0000" />
            <Text style={styles.loadingText}>Loading contacts...</Text>
          </View>
        ) : allContacts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="people-outline" size={64} color="#666" />
            <Text style={styles.noContactsText}>No contacts available</Text>
            <TouchableOpacity 
              style={styles.retryButton}
              onPress={loadDeviceContacts}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filteredContacts}
            renderItem={renderContactItem}
            keyExtractor={item => item.id}
            style={styles.contactsList}
            contentContainerStyle={styles.contactsListContent}
            ListEmptyComponent={
              <View style={styles.emptySearchContainer}>
                <MaterialIcons name="search-off" size={64} color="#666" />
                <Text style={styles.noContactsText}>No contacts found</Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );

  if (!permission || !mediaPermission || !locationPermission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#FF0000" />
        <Text style={styles.statusText}>Requesting permissions...</Text>
      </View>
    );
  }
  
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Camera access required</Text>
        <Text style={styles.errorSubText}>Please enable camera access in your device settings</Text>
        <TouchableOpacity 
          style={styles.permissionButton}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        type="back"
        onCameraReady={handleCameraReady}
      >
        <View style={styles.overlay}>
          <Text style={styles.statusText}>{status}</Text>
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.recordButton, isCapturing && styles.recordingButton]}
              onPress={startCaptureSequence}
              disabled={isCapturing || !cameraReady}
            >
              <MaterialIcons 
                name={isCapturing ? "stop" : "camera"} 
                size={40} 
                color={isCapturing ? "#FF0000" : "#fff"} 
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.contactsButton}
              onPress={() => {
                setShowContactsModal(true);
                if (allContacts.length === 0) {
                  loadDeviceContacts();
                }
              }}
            >
              <MaterialIcons name="people" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>
      {renderContactsModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 50,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 50,
  },
  recordButton: {
    backgroundColor: 'rgba(255, 0, 0, 0.8)',
    padding: 20,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  recordingButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 10,
    borderRadius: 5,
    marginTop: 20,
  },
  errorText: {
    color: '#FF0000',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  errorSubText: {
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#FF0000',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  closeButton: {
    padding: 5,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    marginHorizontal: 20,
    marginVertical: 15,
    paddingHorizontal: 15,
    height: 45,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: 45,
    fontSize: 16,
    color: '#333',
  },
  clearSearchButton: {
    padding: 5,
  },
  contactsList: {
    flex: 1,
  },
  contactsListContent: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  trustedContactItem: {
    backgroundColor: '#fff5f5',
    borderLeftWidth: 4,
    borderLeftColor: '#FF0000',
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF0000',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  contactAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  contactInfo: {
    flex: 1,
  },
  contactNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  contactName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  trustedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF0000',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  trustedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  contactPhone: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  contactEmail: {
    fontSize: 14,
    color: '#666',
  },
  actionButton: {
    padding: 8,
    borderRadius: 20,
    marginLeft: 10,
  },
  addButton: {
    backgroundColor: '#4CAF50',
  },
  removeButton: {
    backgroundColor: '#FF0000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptySearchContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 40,
  },
  noContactsText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 10,
    fontSize: 16,
  },
  retryButton: {
    marginTop: 15,
    backgroundColor: '#FF0000',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SOSButton;