import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity, SafeAreaView, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SOSButton from '../components/SOSButton';

const SOSScreen = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={[styles.header, { 
        paddingTop: Platform.OS === 'ios' ? 0 : StatusBar.currentHeight,
      }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Emergency SOS</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.subtitle}>Press Sos button to capture images</Text>
        <SOSButton />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#000',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF0000',
    marginLeft: 15,
  },
  content: {
    flex: 1,
    backgroundColor: '#000',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#fff',
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
  },
});

export default SOSScreen; 