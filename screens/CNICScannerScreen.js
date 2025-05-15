import React, { useState, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image, ActivityIndicator, Alert, Platform, TextInput, ScrollView, SafeAreaView, Modal, KeyboardAvoidingView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getAuth } from 'firebase/auth';
import { getDatabase, ref, set, get } from 'firebase/database';
import { Ionicons } from '@expo/vector-icons';

const getMimeType = (uri) => {
  const extension = uri.split('.').pop().toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  return 'image/jpeg'; // default fallback
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

export default function CNICScannerScreen({ navigation, route }) {
  const [image, setImage] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rawText, setRawText] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [skillCategory, setSkillCategory] = useState('car'); // 'car' or 'firstAid'

  // Get the full name from signup
  const signupFullName = route.params?.fullName || '';

  // Form state for editable fields
  const [form, setForm] = useState({
    name: '',
    fatherOrHusband: '',
    cnic: '',
    dob: '',
    doi: '',
    doe: ''
  });

  // Date picker state
  const [pickerMode, setPickerMode] = useState(null); // 'dob', 'doi', 'doe' or null
  const [pickerDate, setPickerDate] = useState(new Date());
  const scrollRef = useRef();

  // const validateNameMatch = (extractedName) => {
  //   if (!signupFullName || !extractedName) return false;
    
  //   // Convert both names to lowercase and remove extra spaces
  //   const normalizedSignupName = signupFullName.toLowerCase().replace(/\s+/g, ' ').trim();
  //   const normalizedExtractedName = extractedName.toLowerCase().replace(/\s+/g, ' ').trim();
    
  //   // Check if the extracted name contains the signup name or vice versa
  //   return normalizedExtractedName.includes(normalizedSignupName) || 
  //          normalizedSignupName.includes(normalizedExtractedName);
  // };

  // Update form when extractedData changes
  React.useEffect(() => {
    if (extractedData) {
      const extractedName = extractedData.name || '';
      // const isNameMatch = validateNameMatch(extractedName);
      
      // if (!isNameMatch) {
      //   setNameError('Name does not match the one provided during signup');
      // } else {
      //   setNameError('');
      // }

      setForm({
        name: extractedName,
        fatherOrHusband: extractedData.fatherOrHusband || '',
        cnic: extractedData.cnic || '',
        dob: extractedData.dob || '',
        doi: extractedData.doi || '',
        doe: extractedData.doe || ''
      });
    }
  }, [extractedData]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Sorry, we need camera roll permissions to make this work!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
      processImage(result.assets[0].uri);
    }
  };

  const captureImage = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert('Sorry, we need camera permissions to make this work!');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
      processImage(result.assets[0].uri);
    }
  };

  const processImage = async (uri) => {
    setLoading(true);
    try {
      const base64Image = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const mimeType = getMimeType(uri);
      const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: {
          // apikey: 'K82464613988957',
          apikey: 'K82297643988957',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `base64Image=${encodeURIComponent(`data:${mimeType};base64,${base64Image}`)}&language=eng`,
      });
      const result = await response.json();
      if (result.IsErroredOnProcessing) {
        Alert.alert('OCR Error', result.ErrorMessage?.join('\n') || 'Unknown error');
        setRawText('OCR Error: ' + (result.ErrorMessage?.join('\n') || 'Unknown error'));
        setExtractedData({});
        setLoading(false);
        return;
      }
      const text = result?.ParsedResults?.[0]?.ParsedText || '';
      setRawText(text);
      const extractedInfo = extractCNICInfo(text);
      setExtractedData(extractedInfo);
    } catch (error) {
      console.error('Error processing image:', error);
      Alert.alert('Error', 'Failed to process image. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Helper to add/subtract 10 years from a date string (DD.MM.YYYY)
  const addYears = (dateStr, years) => {
    if (!dateStr || !/\d{2}[.\-]\d{2}[.\-]\d{4}/.test(dateStr)) return '';
    const [d, m, y] = dateStr.split(/[.\-]/);
    const newDate = new Date(Number(y) + years, Number(m) - 1, Number(d));
    return `${('0' + newDate.getDate()).slice(-2)}.${('0' + (newDate.getMonth() + 1)).slice(-2)}.${newDate.getFullYear()}`;
  };

  const extractCNICInfo = (text) => {
    const lines = text.replace(/[|[\]]/g, '').split('\n').map(l => l.trim()).filter(Boolean);
    const allText = lines.join(' ');
    let name = 'Not found';
    let fatherOrHusband = 'Not found';
    let cnic = 'Not found';
    let dob = 'Not found';
    let doi = 'Not found';
    let doe = 'Not found';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^Name$/i.test(line) && lines[i+1] && !/Husband|Father|National|Card/i.test(lines[i+1])) {
        name = lines[i+1];
      }
      if (/Husband Name|Father Name/i.test(line) && lines[i+1] && !/Gender|Country|National|Card/i.test(lines[i+1])) {
        fatherOrHusband = lines[i+1];
      }
    }
    const cnicMatch = allText.match(/\b\d{5}[- ]\d{7}[- ]\d{1}\b/);
    if (cnicMatch) cnic = cnicMatch[0];
    const dateMatches = allText.match(/\b\d{2}[.\-]\d{2}[.\-]\d{4}\b/g) || [];
    if (dateMatches.length === 1) {
      dob = dateMatches[0];
    } else if (dateMatches.length === 2) {
      dob = dateMatches[0];
      doi = dateMatches[1];
    } else if (dateMatches.length >= 3) {
      dob = dateMatches[0];
      doi = dateMatches[1];
      doe = dateMatches[2];
    }
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/(\d{5}[- ]\d{7}[- ]\d{1})\s*[|]?\s*(\d{2}[.\-]\d{2}[.\-]\d{4})?/);
      if (match) {
        cnic = match[1] || cnic;
        if (match[2]) dob = match[2];
      }
    }
    // Add logic for 10-year rule
    if ((!doe || doe === 'Not found') && doi && doi !== 'Not found') {
      doe = addYears(doi, 10);
    }
    if ((!doi || doi === 'Not found') && doe && doe !== 'Not found') {
      doi = addYears(doe, -10);
    }
    return {
      name,
      fatherOrHusband,
      cnic,
      dob,
      doi,
      doe
    };
  };

  // Date picker handlers
  const showDatePicker = (field) => {
    let initialDate = new Date();
    // Try to parse the current value if possible
    const value = form[field];
    if (/\d{2}[.\-]\d{2}[.\-]\d{4}/.test(value)) {
      const [d, m, y] = value.split(/[.\-]/);
      initialDate = new Date(`${y}-${m}-${d}`);
    }
    setPickerDate(initialDate);
    setPickerMode(field);
  };

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setPickerMode(null);
    }
    
    if (event.type === 'dismissed') {
      setPickerMode(null);
      return;
    }
    
    const date = selectedDate || pickerDate;
    // Format as DD.MM.YYYY
    const formatted = `${('0' + date.getDate()).slice(-2)}.${('0' + (date.getMonth() + 1)).slice(-2)}.${date.getFullYear()}`;
    setForm(f => ({ ...f, [pickerMode]: formatted }));
    
    if (Platform.OS === 'ios') {
      setPickerMode(null);
    }
  };

  const validatePhoneNumber = (number) => {
    // Pakistani phone number format: 03XX-XXXXXXX
    const phoneRegex = /^03[0-9]{2}[0-9]{7}$/;
    return phoneRegex.test(number.replace(/-/g, ''));
  };

  const toggleSkill = (skill) => {
    setSelectedSkills(prev => {
      if (prev.includes(skill)) {
        return prev.filter(s => s !== skill);
      } else {
        return [...prev, skill];
      }
    });
  };

  const validateForm = () => {
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter your phone number');
      return false;
    }
    if (!validatePhoneNumber(phoneNumber)) {
      Alert.alert('Error', 'Please enter a valid Pakistani phone number (e.g., 03XX-XXXXXXX)');
      return false;
    }
    if (!form.name || form.name === 'Not found') {
      Alert.alert('Error', 'Please enter your name');
      return false;
    }
    if (!form.fatherOrHusband || form.fatherOrHusband === 'Not found') {
      Alert.alert('Error', 'Please enter father/husband name');
      return false;
    }
    if (!form.cnic || form.cnic === 'Not found') {
      Alert.alert('Error', 'Please enter your CNIC number');
      return false;
    }
    if (!form.dob || form.dob === 'Not found') {
      Alert.alert('Error', 'Please select date of birth');
      return false;
    }
    if (!form.doi || form.doi === 'Not found') {
      Alert.alert('Error', 'Please select date of issue');
      return false;
    }
    if (!form.doe || form.doe === 'Not found') {
      Alert.alert('Error', 'Please select date of expiry');
      return false;
    }
    if (selectedSkills.length === 0) {
      Alert.alert('Error', 'Please select at least one skill');
      return false;
    }
    return true;
  };

  const saveToFirebase = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        Alert.alert('Error', 'You must be logged in to save CNIC data');
        return;
      }

      const db = getDatabase();
      
      // First get the existing user data
      const userRef = ref(db, `users/${user.uid}`);
      const userSnapshot = await get(userRef);
      const existingData = userSnapshot.val() || {};

      const cnicData = {
        name: form.name,
        fatherOrHusband: form.fatherOrHusband,
        cnic: form.cnic,
        dob: form.dob,
        doi: form.doi,
        doe: form.doe,
        timestamp: new Date().toISOString()
      };

      // Update user data while preserving existing data
      await set(userRef, {
        ...existingData,
        phoneNumber: phoneNumber,
        cnic: cnicData,
        cnicVerified: true,
        skills: selectedSkills
      });
      
      Alert.alert(
        'Success',
        'CNIC data saved successfully',
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Home' }],
              });
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error saving CNIC data:', error);
      Alert.alert('Error', 'Failed to save CNIC data. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    // Pass back the signup data
    navigation.navigate('Signup', {
      previousData: route.params?.signupData || {}
    });
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={handleBack}
          >
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>CNIC Verification</Text>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView}
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.imageSection}>
          <TouchableOpacity 
            style={styles.imageContainer}
            onPress={captureImage}
          >
            {image ? (
              <Image source={{ uri: image }} style={styles.image} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="camera" size={40} color="#0286FF" />
                <Text style={styles.imagePlaceholderText}>Tap to capture CNIC</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.captureButton} onPress={captureImage}>
              <Ionicons name="camera" size={20} color="#fff" style={styles.buttonIcon} />
              <Text style={styles.buttonText}>Capture</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
              <Ionicons name="cloud-upload" size={20} color="#0286FF" style={styles.buttonIcon} />
              <Text style={styles.uploadButtonText}>Upload</Text>
            </TouchableOpacity>
          </View>
        </View>

        {extractedData && (
          <View style={styles.formSection}>
            <Text style={styles.formTitle}>Personal Information</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={24} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={form.name}
                  onChangeText={(text) => setForm({ ...form, name: text })}
                  placeholder="Enter your full name"
                  placeholderTextColor="#666"
                />
              </View>
              {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Father/Husband Name</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={24} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={form.fatherOrHusband}
                  onChangeText={(text) => setForm({ ...form, fatherOrHusband: text })}
                  placeholder="Enter father/husband name"
                  placeholderTextColor="#666"
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>CNIC Number</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="card-outline" size={24} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={form.cnic}
                  onChangeText={(text) => setForm({ ...form, cnic: text })}
                  placeholder="Enter CNIC number"
                  keyboardType="numeric"
                  placeholderTextColor="#666"
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Date of Birth</Text>
              <TouchableOpacity
                onPress={() => showDatePicker('dob')}
                style={styles.inputWrapper}
              >
                <Ionicons name="calendar-outline" size={24} color="#666" style={styles.inputIcon} />
                <Text style={[styles.input, { color: form.dob ? '#1a202c' : '#666' }]}>
                  {form.dob || 'Select date of birth'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Date of Issue</Text>
              <TouchableOpacity
                onPress={() => showDatePicker('doi')}
                style={styles.inputWrapper}
              >
                <Ionicons name="calendar-outline" size={24} color="#666" style={styles.inputIcon} />
                <Text style={[styles.input, { color: form.doi ? '#1a202c' : '#666' }]}>
                  {form.doi || 'Select date of issue'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Date of Expiry</Text>
              <TouchableOpacity
                onPress={() => showDatePicker('doe')}
                style={styles.inputWrapper}
              >
                <Ionicons name="calendar-outline" size={24} color="#666" style={styles.inputIcon} />
                <Text style={[styles.input, { color: form.doe ? '#1a202c' : '#666' }]}>
                  {form.doe || 'Select date of expiry'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="call-outline" size={24} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={[
                    styles.input,
                    phoneNumber && !validatePhoneNumber(phoneNumber) && styles.inputError
                  ]}
                  value={phoneNumber}
                  onChangeText={(text) => {
                    setPhoneNumber(text);
                    if (text && !validatePhoneNumber(text)) {
                      setPhoneError('Please enter a valid Pakistani phone number (e.g., 03XX-XXXXXXX)');
                    } else {
                      setPhoneError('');
                    }
                  }}
                  placeholder="Enter your phone number"
                  keyboardType="phone-pad"
                  maxLength={12}
                  placeholderTextColor="#666"
                />
              </View>
              {phoneError ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={14} color="#e53e3e" />
                  <Text style={styles.errorText}>{phoneError}</Text>
                </View>
              ) : null}
            </View>

            <TouchableOpacity 
              style={styles.skillsButton}
              onPress={() => setShowSkillsModal(true)}
            >
              <Ionicons name="construct-outline" size={20} color="#fff" style={styles.buttonIcon} />
              <Text style={styles.skillsButtonText}>Select Skills</Text>
            </TouchableOpacity>

            {selectedSkills.length > 0 && (
              <View style={styles.selectedSkillsContainer}>
                {selectedSkills.map((skill) => (
                  <View key={skill} style={styles.selectedSkill}>
                    <Text style={styles.selectedSkillText}>{skill}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {extractedData && (
          <TouchableOpacity 
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={saveToFirebase}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#fff" style={styles.buttonIcon} />
                <Text style={styles.saveButtonText}>Save Information</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0286FF" />
          <Text style={styles.loadingText}>Processing CNIC...</Text>
        </View>
      )}

      {pickerMode && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      <Modal
        visible={showSkillsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSkillsModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Your Skills</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowSkillsModal(false)}
              >
                <Ionicons name="close" size={24} color="#718096" />
              </TouchableOpacity>
            </View>

            <View style={styles.categoryTabs}>
              <TouchableOpacity
                style={[
                  styles.categoryTab,
                  skillCategory === 'car' && styles.activeCategoryTab
                ]}
                onPress={() => setSkillCategory('car')}
              >
                <Text style={[
                  styles.categoryTabText,
                  skillCategory === 'car' && styles.activeCategoryTabText
                ]}>Car Skills</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.categoryTab,
                  skillCategory === 'firstAid' && styles.activeCategoryTab
                ]}
                onPress={() => setSkillCategory('firstAid')}
              >
                <Text style={[
                  styles.categoryTabText,
                  skillCategory === 'firstAid' && styles.activeCategoryTabText
                ]}>First Aid Skills</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              <View style={styles.skillsList}>
                {(skillCategory === 'car' ? CAR_SKILLS : FIRST_AID_SKILLS).map((skill) => (
                  <TouchableOpacity
                    key={skill}
                    style={[
                      styles.skillItem,
                      selectedSkills.includes(skill) && styles.selectedSkillItem
                    ]}
                    onPress={() => toggleSkill(skill)}
                  >
                    <Text style={[
                      styles.skillText,
                      selectedSkills.includes(skill) && styles.selectedSkillItemText
                    ]}>{skill}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#0286FF',
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: '#0286FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    paddingTop: Platform.OS === 'ios' ? 50 : 50,
    paddingBottom: 15,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  scrollView: {
    flex: 1,
    padding: 15,
  },
  imageSection: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: {
    width: '100%',
    height: 200,
    borderRadius: 15,
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 15,
  },
  imagePlaceholder: {
    alignItems: 'center',
  },
  imagePlaceholderText: {
    color: '#718096',
    fontSize: 16,
    marginTop: 10,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  captureButton: {
    flex: 1,
    backgroundColor: '#0286FF',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0286FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  uploadButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#0286FF',
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadButtonText: {
    color: '#0286FF',
    fontSize: 16,
    fontWeight: '600',
  },
  formSection: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a202c',
    marginBottom: 15,
  },
  inputContainer: {
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4a5568',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  inputIcon: {
    padding: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a202c',
  },
  inputError: {
    borderColor: '#e53e3e',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  errorText: {
    color: '#e53e3e',
    fontSize: 12,
    flex: 1,
  },
  skillsButton: {
    backgroundColor: '#0286FF',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#0286FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  skillsButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  selectedSkillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  selectedSkill: {
    backgroundColor: '#e6f7ff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#0286FF',
  },
  selectedSkillText: {
    color: '#0286FF',
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#0286FF',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    shadowColor: '#0286FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    marginBottom: 20,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#0286FF',
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
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
    fontWeight: '700',
    color: '#1a202c',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryTabs: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 4,
  },
  categoryTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeCategoryTab: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#718096',
  },
  activeCategoryTabText: {
    color: '#0286FF',
  },
  skillsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillItem: {
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  selectedSkillItem: {
    backgroundColor: '#e6f7ff',
    borderColor: '#0286FF',
  },
  skillText: {
    fontSize: 14,
    color: '#4a5568',
  },
  selectedSkillItemText: {
    color: '#0286FF',
  }
}); 