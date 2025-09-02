import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { useCallManager } from './CallManager';

interface CallButtonProps {
  receiverId: string;
  receiverName: string;
  receiverPhone?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'filled' | 'outline' | 'ghost';
  style?: ViewStyle;
  disabled?: boolean;
}

export default function CallButton({
  receiverId,
  receiverName,
  receiverPhone,
  size = 'medium',
  variant = 'filled',
  style,
  disabled = false,
}: CallButtonProps) {
  const { startCall } = useCallManager();

  const handleCallPress = async () => {
    if (disabled) return;
    
    try {
      await startCall(receiverId, receiverName);
    } catch (error) {
      console.error('Error starting call:', error);
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          width: 36,
          height: 36,
          borderRadius: 18,
          iconSize: 16,
        };
      case 'large':
        return {
          width: 56,
          height: 56,
          borderRadius: 28,
          iconSize: 24,
        };
      default: // medium
        return {
          width: 44,
          height: 44,
          borderRadius: 22,
          iconSize: 20,
        };
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'outline':
        return {
          colors: ['#0d9488', '#10b981'] as const,
          borderWidth: 2,
          backgroundColor: 'transparent',
        };
      case 'ghost':
        return {
          colors: ['rgba(13, 148, 136, 0.1)', 'rgba(16, 185, 129, 0.1)'] as const,
          borderWidth: 0,
          backgroundColor: 'transparent',
        };
      default: // filled
        return {
          colors: ['#0d9488', '#10b981'] as const,
          borderWidth: 0,
          backgroundColor: 'transparent',
        };
    }
  };

  const sizeStyles = getSizeStyles();
  const variantStyles = getVariantStyles();

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          width: sizeStyles.width,
          height: sizeStyles.height,
          borderRadius: sizeStyles.borderRadius,
          borderWidth: variantStyles.borderWidth,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      onPress={handleCallPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={variantStyles.colors}
        style={[
          styles.gradient,
          {
            width: sizeStyles.width,
            height: sizeStyles.height,
            borderRadius: sizeStyles.borderRadius,
          },
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Ionicons
          name="call"
          size={sizeStyles.iconSize}
          color={variant === 'ghost' ? '#0d9488' : '#ffffff'}
        />
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    // shadowColor: '#000',
    // shadowOffset: { width: 0, height: 2 },
    // shadowOpacity: 0.1,
    // shadowRadius: 4,
    // elevation: 3,
  },
  gradient: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
