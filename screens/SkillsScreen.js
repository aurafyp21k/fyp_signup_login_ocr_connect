import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert
} from 'react-native';
import { auth, database } from '../firebase/config';
import { ref, get, set } from 'firebase/database';

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
  'Cloud Computing',
  'Cybersecurity'
];

export default function SkillsScreen({ navigation }) {
  const [selectedSkills, setSelectedSkills] = useState([]);

  // Load user's existing skills when screen mounts
  useEffect(() => {
    loadUserSkills();
  }, []);

  const loadUserSkills = async () => {
    try {
      const skillsRef = ref(database, `users/${auth.currentUser.uid}/skills`);
      const snapshot = await get(skillsRef);
      if (snapshot.exists()) {
        setSelectedSkills(snapshot.val());
      }
    } catch (error) {
      console.error('Error loading skills:', error);
      Alert.alert('Error', 'Failed to load skills');
    }
  };

  const toggleSkill = (skill) => {
    setSelectedSkills(prevSkills => {
      if (prevSkills.includes(skill)) {
        return prevSkills.filter(s => s !== skill);
      } else {
        return [...prevSkills, skill];
      }
    });
  };

  const saveSkills = async () => {
    try {
      const skillsRef = ref(database, `users/${auth.currentUser.uid}/skills`);
      await set(skillsRef, selectedSkills);
      Alert.alert('Success', 'Skills saved successfully!');
      navigation.goBack();
    } catch (error) {
      console.error('Error saving skills:', error);
      Alert.alert('Error', 'Failed to save skills');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Your Skills</Text>
      <Text style={styles.subtitle}>
        Selected: {selectedSkills.length} / {AVAILABLE_SKILLS.length}
      </Text>

      <ScrollView style={styles.skillsContainer}>
        {AVAILABLE_SKILLS.map((skill) => (
          <TouchableOpacity
            key={skill}
            style={[
              styles.skillItem,
              selectedSkills.includes(skill) && styles.selectedSkill
            ]}
            onPress={() => toggleSkill(skill)}
          >
            <Text style={[
              styles.skillText,
              selectedSkills.includes(skill) && styles.selectedSkillText
            ]}>
              {skill}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={styles.saveButton}
        onPress={saveSkills}
      >
        <Text style={styles.saveButtonText}>Save Skills</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  skillsContainer: {
    flex: 1,
    marginBottom: 20,
  },
  skillItem: {
    padding: 15,
    marginVertical: 5,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  selectedSkill: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  skillText: {
    fontSize: 16,
    color: '#333',
  },
  selectedSkillText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
