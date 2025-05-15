import React, { createContext, useContext, useState } from 'react';
import { DefaultTheme, DarkTheme } from '@react-navigation/native';

const LightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#00b8ff', // Light blue 
    secondary: '#7e22ce', // Purple
    accent: '#f43f77', // Pink
    background: '#ffffff',
    card: '#ffffff',
    text: '#1a202c',
    border: '#e2e8f0',
    notification: '#f43f77',
    muted: '#718096',
    success: '#38a169',
    error: '#e53e3e',
  },
};

const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#3b82f6', // Blue
    secondary: '#7e22ce', // Purple
    accent: '#ec4899', // Pink
    background: '#111827',
    card: '#1f2937',
    text: '#f3f4f6',
    border: '#374151',
    notification: '#ec4899',
    muted: '#6b7280',
    success: '#10b981',
    error: '#ef4444',
  },
};

const ThemeContext = createContext({
  theme: 'light',
  toggleTheme: () => {},
  colors: LightTheme.colors
});

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('light');
  const colors = theme === 'light' ? LightTheme.colors : CustomDarkTheme.colors;

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
