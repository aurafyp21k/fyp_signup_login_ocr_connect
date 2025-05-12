import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  // Replace with your Firebase config object
  // apiKey: "AIzaSyCIE0Ose4mXQOy2aleBLvzwVIJ9UtuF8L0",
  // authDomain: "travel-assist-74910.firebaseapp.com",
  // databaseURL: "https://travel-assist-74910-default-rtdb.firebaseio.com",
  // projectId: "travel-assist-74910",
  // storageBucket: "travel-assist-74910.firebasestorage.app",
  // messagingSenderId: "111013676188",
  // appId: "1:111013676188:web:c1821d25e2517674165959",
  // measurementId: "G-GSYVQ38V5N"
    apiKey: "AIzaSyCzHxeg43R_kXqKP-4vzW0SfH9I_fgKUgU",
    authDomain: "fire-connect-4b904.firebaseapp.com",
    databaseURL: "https://fire-connect-4b904-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "fire-connect-4b904",
    storageBucket: "fire-connect-4b904.firebasestorage.app",
    messagingSenderId: "885227533533",
    appId: "1:885227533533:web:b360bc04562dbc82351734",
    measurementId: "G-2H12KMNGCZ"
  
};

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
export const database = getDatabase(app);
