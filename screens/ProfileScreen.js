import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Image, 
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Keyboard,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ref, onValue, update } from 'firebase/database';
import { database, auth } from '../firebase/config';
import { Ionicons } from '@expo/vector-icons';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

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

const ProfileScreen = ({ navigation }) => {
  const [userInfo, setUserInfo] = useState({
    fullName: '',
    phoneNumber: '',
    email: '',
    skills: [],
    averageRating: 0,
    ratings: []
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editedPhone, setEditedPhone] = useState('');
  const { theme, isDark, toggleTheme } = useTheme();

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
        const newUserData = {
          fullName: data.cnic?.name || '',
          phoneNumber: data.phoneNumber || '',
          email: data.email || '',
          skills: data.skills || [],
          averageRating: data.averageRating || 0,
          ratings: data.ratings || []
        };
        setUserInfo(newUserData);
        setEditedPhone(data.phoneNumber || '');
      }
    });

    return () => unsubscribe();
  }, [navigation]);

  const handleUpdateProfile = async () => {
    try {
      // Validate phone number (simple validation, adjust as needed)
      const phoneRegex = /^\+?[0-9]{10,}$/;
      if (!phoneRegex.test(editedPhone)) {
        Alert.alert('Error', 'Please enter a valid phone number');
        return;
      }

      const userRef = ref(database, `users/${auth.currentUser.uid}`);
      await update(userRef, {
        phoneNumber: editedPhone
      });
      setIsEditing(false);
      Alert.alert('Success', 'Phone number updated successfully');
    } catch (error) {
      console.error('Error updating phone number:', error);
      Alert.alert('Error', 'Failed to update phone number');
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      navigation.replace('Login');
    } catch (error) {
      Alert.alert('Error', 'Failed to logout');
    }
  };

  const InputField = ({ label, value, editable, onChangeText, blurOnSubmit }) => (
    <View style={styles.inputContainer}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          value={value}
          editable={editable}
          onChangeText={onChangeText}
          placeholder={`Enter ${label.toLowerCase()}`}
          placeholderTextColor="#999"
          autoCorrect={false}
          blurOnSubmit={blurOnSubmit}
          returnKeyType={label.toLowerCase() === 'phone' ? 'done' : label.toLowerCase() === 'email' ? 'email-address' : 'default'}
          keyboardType={label.toLowerCase() === 'phone' ? 'phone-pad' : label.toLowerCase() === 'email' ? 'email-address' : 'default'}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.header} />
      
      <View style={[styles.header, { 
        backgroundColor: theme.header,
        paddingTop: Platform.OS === 'ios' ? 0 : StatusBar.currentHeight,
      }]}>
        <View style={styles.headerInfo}>
          <Text style={[styles.title, { color: theme.headerText }]}>Profile</Text>
          {userInfo.fullName && (
            <Text style={[styles.userName, { color: theme.headerText }]}>{userInfo.fullName}</Text>
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
            style={[styles.headerButton, styles.logoutButton]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={22} color={theme.headerText} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content}>
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>
                {userInfo.fullName ? userInfo.fullName.charAt(0).toUpperCase() : '?'}
              </Text>
            </View>
            <View style={styles.ratingContainer}>
              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <MaterialIcons
                    key={star}
                    name={
                      star <= Math.floor(userInfo.averageRating)
                        ? "star"
                        : star === Math.floor(userInfo.averageRating) + 1 && userInfo.averageRating % 1 >= 0.5
                        ? "star-half"
                        : "star-border"
                    }
                    size={24}
                    color={star <= Math.floor(userInfo.averageRating) ? "#FFD700" : "#CBD5E0"}
                    style={styles.ratingStar}
                  />
                ))}
              </View>
              <Text style={[styles.ratingText, { color: theme.text }]}>
                {userInfo.averageRating > 0 
                  ? `${userInfo.averageRating.toFixed(1)} (${userInfo.ratings.length} ratings)`
                  : 'No ratings yet'}
              </Text>
            </View>
          </View>

          <View style={styles.infoContainer}>
            <View style={[styles.infoItem, { borderBottomColor: theme.border }]}>
              <Ionicons name="person-outline" size={24} color={theme.primary} />
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoLabel, { color: theme.text }]}>Full Name</Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>{userInfo.fullName || 'Not set'}</Text>
              </View>
            </View>

            <View style={[styles.infoItem, { borderBottomColor: theme.border }]}>
              <Ionicons name="call-outline" size={24} color={theme.primary} />
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoLabel, { color: theme.text }]}>Phone Number</Text>
                {isEditing ? (
                  <View style={styles.editContainer}>
                    <TextInput
                      style={[styles.editInput, { 
                        color: theme.text,
                        borderColor: theme.border,
                        backgroundColor: theme.card
                      }]}
                      value={editedPhone}
                      onChangeText={setEditedPhone}
                      placeholder="Enter phone number"
                      placeholderTextColor={theme.text + '80'}
                      keyboardType="phone-pad"
                      autoFocus
                    />
                    <View style={styles.editButtons}>
                      <TouchableOpacity 
                        style={[styles.editButton, styles.saveButton]}
                        onPress={handleUpdateProfile}
                      >
                        <Ionicons name="checkmark" size={20} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.editButton, styles.cancelButton]}
                        onPress={() => {
                          setIsEditing(false);
                          setEditedPhone(userInfo.phoneNumber);
                        }}
                      >
                        <Ionicons name="close" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.valueContainer}>
                    <Text style={[styles.infoValue, { color: theme.text }]}>
                      {userInfo.phoneNumber || 'Not set'}
                    </Text>
                    <TouchableOpacity 
                      style={[styles.editIconButton, { backgroundColor: theme.primary }]}
                      onPress={() => {
                        setEditedPhone(userInfo.phoneNumber);
                        setIsEditing(true);
                      }}
                    >
                      <Ionicons name="pencil" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>

            <View style={[styles.infoItem, { borderBottomColor: theme.border }]}>
              <Ionicons name="mail-outline" size={24} color={theme.primary} />
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoLabel, { color: theme.text }]}>Email</Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>{userInfo.email || 'Not set'}</Text>
              </View>
            </View>

            <View style={[styles.infoItem, { borderBottomColor: theme.border }]}>
              <Ionicons name="construct-outline" size={24} color={theme.primary} />
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoLabel, { color: theme.text }]}>Skills</Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>
                  {userInfo.skills.length > 0 ? userInfo.skills.join(', ') : 'No skills added'}
                </Text>
              </View>
            </View>

            <View style={styles.infoItem}>
              <Ionicons name="star-outline" size={24} color={theme.primary} />
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoLabel, { color: theme.text }]}>Rating History</Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>
                  {userInfo.ratings.length > 0 
                    ? `Received ${userInfo.ratings.length} ratings with an average of ${userInfo.averageRating.toFixed(1)} stars`
                    : 'No ratings received yet'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomTab, { 
        backgroundColor: theme.tabBar,
        borderColor: theme.border,
        shadowColor: theme.shadow,
      }]}>
        <TouchableOpacity 
          style={styles.tabItem}
          onPress={() => navigation.navigate('Home')}
        >
          <Ionicons name="people-outline" size={28} color="#666666" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem}
          onPress={() => navigation.navigate('Chatbot')}
        >
          <Ionicons name="chatbubble-outline" size={28} color="#666666" />
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
          <Ionicons name="person-outline" size={28} color="#00b8ff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 15,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: '#000',
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
    marginBottom: 2,
    letterSpacing: -0.5,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 1,
    letterSpacing: -0.3,
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
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  infoContainer: {
    gap: 15,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  infoTextContainer: {
    marginLeft: 15,
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  bottomTab: {
    flexDirection: 'row',
    borderRadius: 50,
    paddingBottom: Platform.OS === 'ios' ? 25 : 10,
    overflow: 'hidden',
    marginHorizontal: 20,
    marginBottom: 20,
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
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  editContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  editButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  ratingContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 5,
    gap: 4,
  },
  ratingStar: {
    marginHorizontal: 2,
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 5,
  },
});

export default ProfileScreen; 