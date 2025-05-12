import React, { useState, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image, ActivityIndicator, Alert, Platform, TextInput, ScrollView, SafeAreaView, Modal } from 'react-native';
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

  const renderSkillsModal = () => (
    <Modal
      visible={showSkillsModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowSkillsModal(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {skillCategory === 'car' ? 'Car Skills' : 'First Aid Skills'}
            </Text>
            <TouchableOpacity onPress={() => setShowSkillsModal(false)}>
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.skillsList}>
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
                  selectedSkills.includes(skill) && styles.selectedSkillText
                ]}>
                  {skill}
                </Text>
                {selectedSkills.includes(skill) && (
                  <Ionicons name="checkmark" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

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
    <SafeAreaView style={{flex: 1, backgroundColor: '#f6f8fa'}}>
      <StatusBar style="light" backgroundColor="#007AFF" />
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={handleBack}
        >
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Pakistani ID Card Scanner</Text>
          <Text style={styles.subtitle}>Required for Account Verification</Text>
        </View>
      </View>
      {!image ? (
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
          <TouchableOpacity style={styles.button} onPress={pickImage}>
            <Text style={styles.buttonText}>Upload ID Card Image</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, {backgroundColor: '#34C759', marginTop: 10}]} onPress={captureImage}>
            <Text style={styles.buttonText}>Capture ID Card Image</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView ref={scrollRef} style={{flex: 1, width: '100%'}} contentContainerStyle={{alignItems: 'center', paddingBottom: 40}}>
          <Image source={{ uri: image }} style={styles.image} />
          {loading ? (
            <ActivityIndicator size="large" color="#007AFF" style={{marginVertical: 30}} />
          ) : extractedData ? (
            <View style={styles.card}>
              <Text style={styles.formLabel}>Phone Number</Text>
              <TextInput
                style={[styles.input, phoneError ? styles.inputError : null]}
                value={phoneNumber}
                onChangeText={text => {
                  setPhoneNumber(text);
                  if (text && !validatePhoneNumber(text)) {
                    setPhoneError('Please enter a valid Pakistani phone number (e.g., 03XX-XXXXXXX)');
                  } else {
                    setPhoneError('');
                  }
                }}
                placeholder="03XX-XXXXXXX"
                placeholderTextColor="#aaa"
                keyboardType="phone-pad"
                maxLength={12}
              />
              {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}

              <Text style={styles.formLabel}>Name</Text>
              <TextInput
                style={[styles.input, nameError ? styles.inputError : null]}
                value={form.name}
                onChangeText={text => {
                  setForm(f => ({ ...f, name: text }));
                }}
                placeholder="Name"
                placeholderTextColor="#aaa"
              />
              {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}

              <Text style={styles.formLabel}>Father/Husband Name</Text>
              <TextInput
                style={styles.input}
                value={form.fatherOrHusband}
                onChangeText={text => setForm(f => ({ ...f, fatherOrHusband: text }))}
                placeholder="Father/Husband Name"
                placeholderTextColor="#aaa"
              />
              <Text style={styles.formLabel}>CNIC</Text>
              <TextInput
                style={styles.input}
                value={form.cnic}
                onChangeText={text => setForm(f => ({ ...f, cnic: text }))}
                placeholder="CNIC"
                placeholderTextColor="#aaa"
              />
              <Text style={styles.formLabel}>Date of Birth</Text>
              <TouchableOpacity style={styles.input} onPress={() => showDatePicker('dob')}>
                <Text style={{color: form.dob ? '#222' : '#aaa'}}>{form.dob || 'Select Date of Birth'}</Text>
              </TouchableOpacity>
              <Text style={styles.formLabel}>Date of Issue</Text>
              <TouchableOpacity style={styles.input} onPress={() => showDatePicker('doi')}>
                <Text style={{color: form.doi ? '#222' : '#aaa'}}>{form.doi || 'Select Date of Issue'}</Text>
              </TouchableOpacity>
              <Text style={styles.formLabel}>Date of Expiry</Text>
              <TouchableOpacity style={styles.input} onPress={() => showDatePicker('doe')}>
                <Text style={{color: form.doe ? '#222' : '#aaa'}}>{form.doe || 'Select Date of Expiry'}</Text>
              </TouchableOpacity>

              <Text style={styles.formLabel}>Skills</Text>
              <View style={styles.skillButtonsContainer}>
                <TouchableOpacity 
                  style={[styles.skillCategoryButton, skillCategory === 'car' && styles.activeSkillCategoryButton]} 
                  onPress={() => {
                    setSkillCategory('car');
                    setShowSkillsModal(true);
                  }}
                >
                  <Text style={[styles.skillCategoryText, skillCategory === 'car' && styles.activeSkillCategoryText]}>
                    Car Skills
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.skillCategoryButton, skillCategory === 'firstAid' && styles.activeSkillCategoryButton]} 
                  onPress={() => {
                    setSkillCategory('firstAid');
                    setShowSkillsModal(true);
                  }}
                >
                  <Text style={[styles.skillCategoryText, skillCategory === 'firstAid' && styles.activeSkillCategoryText]}>
                    First Aid Skills
                  </Text>
                </TouchableOpacity>
              </View>
              
              {selectedSkills.length > 0 && (
                <View style={styles.selectedSkillsContainer}>
                  <Text style={styles.selectedSkillsTitle}>Selected Skills:</Text>
                  <View style={styles.selectedSkillsList}>
                    {selectedSkills.map((skill) => (
                      <View key={skill} style={styles.selectedSkillTag}>
                        <Text style={styles.selectedSkillTagText}>{skill}</Text>
                        <TouchableOpacity onPress={() => toggleSkill(skill)}>
                          <Ionicons name="close-circle" size={16} color="#007AFF" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <TouchableOpacity 
                style={[styles.button, { marginTop: 20 }]} 
                onPress={saveToFirebase}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.buttonText}>Save & Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
          <TouchableOpacity style={styles.button} onPress={() => {
            setImage(null);
            setExtractedData(null);
          }}>
            <Text style={styles.buttonText}>Upload Different Image</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, {backgroundColor: '#34C759', marginTop: 10}]} onPress={() => {
            setImage(null);
            setExtractedData(null);
          }}>
            <Text style={styles.buttonText}>Capture Different Image</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
      {renderSkillsModal()}
      {pickerMode && (
        <DateTimePicker
          testID="dateTimePicker"
          value={pickerDate}
          mode="date"
          is24Hour={true}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
          style={Platform.OS === 'ios' ? { backgroundColor: 'white' } : {}}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#007AFF',
    paddingTop: 20,
    paddingBottom: 15,
    marginBottom: 10,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    position: 'relative',
  },
  headerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    left: 15,
    top: 50,
    padding: 5,
    zIndex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 5,
    // marginTop: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
    textAlign: 'center',
    marginTop: 5,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    marginVertical: 10,
    minWidth: 200,
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  image: {
    width: 320,
    height: 210,
    resizeMode: 'contain',
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    marginTop: 10,
  },
  card: {
    width: '95%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#f8f8f8',
  },
  formLabel: {
    fontWeight: 'bold',
    marginBottom: 5,
    marginTop: 10,
    color: '#007AFF',
    fontSize: 15,
  },
  rawTextContainer: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
  },
  rawTextTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  rawText: {
    fontSize: 12,
    color: '#666',
  },
  inputError: {
    borderColor: '#ff3b30',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 12,
    marginTop: -10,
    marginBottom: 10,
    marginLeft: 5,
  },
  modalContainer: {
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
    color: '#007AFF',
  },
  skillsList: {
    maxHeight: '80%',
  },
  skillItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectedSkillItem: {
    backgroundColor: '#007AFF',
  },
  skillText: {
    fontSize: 16,
    color: '#333',
  },
  selectedSkillText: {
    color: '#fff',
  },
  skillButtonsContainer: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  skillCategoryButton: {
    flex: 1,
    padding: 10,
    marginHorizontal: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    alignItems: 'center',
  },
  activeSkillCategoryButton: {
    backgroundColor: '#007AFF',
  },
  skillCategoryText: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  activeSkillCategoryText: {
    color: '#fff',
  },
  selectedSkillsContainer: {
    marginTop: 10,
  },
  selectedSkillsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#007AFF',
  },
  selectedSkillsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  selectedSkillTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F2FF',
    padding: 8,
    borderRadius: 16,
    margin: 4,
  },
  selectedSkillTagText: {
    color: '#007AFF',
    marginRight: 4,
  },
}); 