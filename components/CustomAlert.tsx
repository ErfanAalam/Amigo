import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  onConfirm?: () => void;
  onClose: () => void;
  showCancelButton?: boolean;
  confirmText?: string;
  cancelText?: string;
}

export default function CustomAlert({
  visible,
  title,
  message,
  type,
  onConfirm,
  onClose,
  showCancelButton = false,
  confirmText = 'OK',
  cancelText = 'Cancel',
}: CustomAlertProps) {
  const { theme } = useTheme();

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.customAlertOverlay}>
        <View style={[styles.customAlertContainer, { backgroundColor: theme.colors.surface }]}>
          {/* Alert Icon */}
          <View style={[
            styles.alertIconContainer,
            {
              backgroundColor: type === 'success' ? '#4CAF50' :
                type === 'error' ? '#F44336' :
                  type === 'warning' ? '#FF9800' : '#2196F3'
            }
          ]}>
            <Ionicons
              name={
                type === 'success' ? 'checkmark-circle' :
                  type === 'error' ? 'close-circle' :
                    type === 'warning' ? 'warning' : 'information-circle'
              }
              size={32}
              color="#ffffff"
            />
          </View>

          {/* Alert Title */}
          <Text style={[styles.alertTitle, { color: theme.colors.text }]}>
            {title}
          </Text>

          {/* Alert Message */}
          <Text style={[styles.alertMessage, { color: theme.colors.textSecondary }]}>
            {message}
          </Text>

          {/* Action Buttons */}
          <View style={styles.alertButtonsContainer}>
            {showCancelButton && (
              <TouchableOpacity
                style={[styles.alertButton, styles.alertCancelButton]}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.alertCancelButtonText}>{cancelText}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.alertButton,
                {
                  backgroundColor: type === 'success' ? '#4CAF50' :
                    type === 'error' ? '#F44336' :
                      type === 'warning' ? '#FF9800' : '#2196F3'
                }
              ]}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.alertButtonText}>
                {showCancelButton && onConfirm ? 'Delete' : confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Custom Alert Styles
  customAlertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  customAlertContainer: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  alertIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 28,
  },
  alertMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  alertButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  alertButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    minWidth: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  alertCancelButton: {
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
  },
  alertButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  alertCancelButtonText: {
    color: '#666666',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
