import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

export interface ThemeColors {
  // Background colors
  background: string;
  surface: string;
  surfaceVariant: string;
  
  // Text colors
  text: string;
  textSecondary: string;
  textTertiary: string;
  
  // Primary colors
  primary: string;
  primaryVariant: string;
  onPrimary: string;
  
  // Secondary colors
  secondary: string;
  secondaryVariant: string;
  onSecondary: string;
  
  // Status colors
  success: string;
  warning: string;
  error: string;
  info: string;
  
  // Border and divider colors
  border: string;
  divider: string;
  
  // Card and shadow colors
  card: string;
  shadow: string;
  
  // Input colors
  inputBackground: string;
  inputBorder: string;
  inputText: string;
  inputPlaceholder: string;
}

export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
}

const lightTheme: Theme = {
  isDark: false,
  colors: {
    background: '#f8f9fa',
    surface: '#ffffff',
    surfaceVariant: '#f0f2f5',
    
    text: '#1a1a1a',
    textSecondary: '#666666',
    textTertiary: '#999999',
    
    primary: '#a8edea',
    primaryVariant: '#0056CC',
    onPrimary: '#ffffff',
    
    secondary: '#5856D6',
    secondaryVariant: '#3A3A9E',
    onSecondary: '#ffffff',
    
    success: '#34C759',
    warning: '#FF9500',
    error: '#FF3B30',
    info: '#007AFF',
    
    border: '#e9ecef',
    divider: '#f0f0f0',
    
    card: '#ffffff',
    shadow: '#000000',
    
    inputBackground: '#f8f9fa',
    inputBorder: '#e9ecef',
    inputText: '#1a1a1a',
    inputPlaceholder: '#999999',
  },
};

const darkTheme: Theme = {
  isDark: true,
  colors: {
    background: '#121212',
    surface: '#1e1e1e',
    surfaceVariant: '#2d2d2d',
    
    text: '#ffffff',
    textSecondary: '#b0b0b0',
    textTertiary: '#808080',
    
    primary: '#fed6e3',
    primaryVariant: '#0056CC',
    onPrimary: '#ffffff',
    
    secondary: '#5E5CE6',
    secondaryVariant: '#3A3A9E',
    onSecondary: '#ffffff',
    
    success: '#30D158',
    warning: '#FF9F0A',
    error: '#FF453A',
    info: '#0A84FF',
    
    border: '#38383A',
    divider: '#2d2d2d',
    
    card: '#1e1e1e',
    shadow: '#000000',
    
    inputBackground: '#2d2d2d',
    inputBorder: '#38383A',
    inputText: '#ffffff',
    inputPlaceholder: '#808080',
  },
};

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (isDark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [isDark, setIsDark] = useState<boolean>(systemColorScheme === 'dark');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadThemePreference();
  }, []);

  const loadThemePreference = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('theme-preference');
      if (savedTheme !== null) {
        setIsDark(savedTheme === 'dark');
      } else {
        // Use system preference if no saved preference
        setIsDark(systemColorScheme === 'dark');
      }
    } catch (error) {
      console.error('Error loading theme preference:', error);
      setIsDark(systemColorScheme === 'dark');
    } finally {
      setIsLoaded(true);
    }
  };

  const saveThemePreference = async (isDarkMode: boolean) => {
    try {
      await AsyncStorage.setItem('theme-preference', isDarkMode ? 'dark' : 'light');
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    saveThemePreference(newTheme);
  };

  const setTheme = (isDarkMode: boolean) => {
    setIsDark(isDarkMode);
    saveThemePreference(isDarkMode);
  };

  const theme = isDark ? darkTheme : lightTheme;

  if (!isLoaded) {
    return null; // Or a loading screen
  }

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
