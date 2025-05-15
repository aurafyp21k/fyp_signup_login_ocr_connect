import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

export const themes = {
  light: {
    background: '#f8fafc',
    text: '#1a202c',
    primary: '#00b8ff',
    secondary: '#4A90E2',
    card: '#ffffff',
    border: '#e2e8f0',
    error: '#FF3B30',
    success: '#4CAF50',
    tabBar: '#ffffff',
    header: '#00b8ff',
    headerText: '#ffffff',
    shadow: '#000000',
  },
  dark: {
    background: '#1a202c',
    text: '#f8fafc',
    primary: '#00b8ff',
    secondary: '#4A90E2',
    card: '#2d3748',
    border: '#4a5568',
    error: '#FF3B30',
    success: '#4CAF50',
    tabBar: '#2d3748',
    header: '#2d3748',
    headerText: '#ffffff',
    shadow: '#000000',
  },
};

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(false);
  const [theme, setTheme] = useState(themes.light);

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('theme');
      if (savedTheme) {
        setIsDark(savedTheme === 'dark');
        setTheme(savedTheme === 'dark' ? themes.dark : themes.light);
      }
    } catch (error) {
      console.error('Error loading theme:', error);
    }
  };

  const toggleTheme = async () => {
    try {
      const newTheme = !isDark;
      setIsDark(newTheme);
      setTheme(newTheme ? themes.dark : themes.light);
      await AsyncStorage.setItem('theme', newTheme ? 'dark' : 'light');
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}; 