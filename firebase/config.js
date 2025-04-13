import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  // Replace with your Firebase config object
  apiKey: "AIzaSyCIE0Ose4mXQOy2aleBLvzwVIJ9UtuF8L0",
  authDomain: "travel-assist-74910.firebaseapp.com",
  databaseURL: "https://travel-assist-74910-default-rtdb.firebaseio.com",
  projectId: "travel-assist-74910",
  storageBucket: "travel-assist-74910.firebasestorage.app",
  messagingSenderId: "111013676188",
  appId: "1:111013676188:web:c1821d25e2517674165959",
  measurementId: "G-GSYVQ38V5N"
};

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
export const database = getDatabase(app);
