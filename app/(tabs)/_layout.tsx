import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export default function TabLayout() {
  const { theme } = useTheme();

  // Modern tab icon component with gradient background
  const ModernTabIcon = ({ 
    iconName, 
    color, 
    focused, 
    gradientColors 
  }: { 
    iconName: string; 
    color: string; 
    focused: boolean; 
    gradientColors: [string, string] 
  }) => {
    if (focused) {
      return (
        <View style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <LinearGradient
            colors={gradientColors}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              justifyContent: 'center',
              alignItems: 'center',
              shadowColor: gradientColors[0],
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.3,
              shadowRadius: 4,
              elevation: 4,
            }}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name={iconName as any} size={18} color="#ffffff" />
          </LinearGradient>
        </View>
      );
    }
    
    return (
      <View style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}>
        <Ionicons name={iconName as any} size={18} color={theme.colors.textSecondary} />
      </View>
    );
  };

  return (
    <Tabs 
      screenOptions={{ 
        tabBarActiveTintColor: theme.colors.primary, 
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: { 
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingTop: 8,
          paddingBottom: 8,
          height: 90,
          // marginBottom: 20,
        },
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
          
        },
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          headerShown: false,
          title: 'Chats',
          tabBarIcon: ({ color, focused }) => (
            <ModernTabIcon 
              iconName="chatbubbles" 
              color={color} 
              focused={focused}
              gradientColors={['#667eea', '#764ba2']}
            />
          ),
        }}
      />
      
      <Tabs.Screen
        name="groups"
        options={{
          headerShown: false,
          title: 'Groups',
          tabBarIcon: ({ color, focused }) => (
            <ModernTabIcon 
              iconName="people" 
              color={color} 
              focused={focused}
              gradientColors={['#43e97b', '#38f9d7']}
            />
          ),
        }}
      />
      
      <Tabs.Screen
        name="contacts"
        options={{
          headerShown: false,
          title: 'Contacts',
          tabBarIcon: ({ color, focused }) => (
            <ModernTabIcon 
              iconName="person-add" 
              color={color} 
              focused={focused}
              gradientColors={['#4facfe', '#00f2fe']}
            />
          ),
        }}
      />
      
      <Tabs.Screen
        name="profile"
        options={{
          headerShown: false,
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <ModernTabIcon 
              iconName="person" 
              color={color} 
              focused={focused}
              gradientColors={['#f093fb', '#f5576c']}
            />
          ),
        }}
      />
    </Tabs>
  );
}
