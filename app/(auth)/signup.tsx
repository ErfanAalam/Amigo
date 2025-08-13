
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useTheme } from '../../context/ThemeContext';

const { width, height } = Dimensions.get('window');

export default function SignupScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'details' | 'otp'>('details');

  const sendOTP = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert("Error", "Please enter your first name and last name");
      return;
    }

    if (!phoneNumber || phoneNumber.length < 10) {
      Alert.alert("Error", "Please enter a valid phone number");
      return;
    }

    try {
      setLoading(true);
      const formattedPhone = phoneNumber.startsWith("+")
        ? phoneNumber
        : `+91${phoneNumber}`;
      console.log("formattedPhone", formattedPhone);
      const confirmation = await auth().signInWithPhoneNumber(formattedPhone,true);
      setVerificationId(confirmation.verificationId);
      setStep('otp');
      Alert.alert("OTP Sent", "Check your phone for the OTP.");
    } catch (error: any) {
      console.error("sendOTP error:", error);
      Alert.alert("Error", error.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (!otp || otp.length !== 6 || !verificationId) {
      Alert.alert("Error", "Please enter a valid 6-digit OTP");
      return;
    }

    try {
      setLoading(true);
      const credential = auth.PhoneAuthProvider.credential(verificationId, otp);
      const userCredential = await auth().signInWithCredential(credential);
      
      // Store user details in Firestore
      const user = userCredential.user;
      const userData = {
        uid: user.uid,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName: `${firstName.trim()} ${lastName.trim()}`,
        phoneNumber: phoneNumber.startsWith("+") ? phoneNumber : `+91${phoneNumber}`,
        email: user.email || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await firestore().collection('users').doc(user.uid).set(userData);
      
      Alert.alert("Success", "Account created successfully!");
      router.replace("/(tabs)/home");
    } catch (error: any) {
      console.error("OTP Verification Error:", error);
      Alert.alert("Error", "Incorrect OTP");
    } finally {
      setLoading(false);
    }
  };

  const resendOTP = async () => {
    if (!phoneNumber) {
      Alert.alert("Error", "Please enter a phone number first");
      return;
    }
    await sendOTP();
  };

  const goBackToDetails = () => {
    setStep('details');
    setOtp('');
    setVerificationId(null);
  };

  const navigateToLogin = () => {
    router.replace("/login");
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* Theme Toggle Button */}
            

            {/* Header Section */}
            <View style={styles.headerSection}>
              <Text style={[styles.welcomeText, { color: theme.colors.text }]}>
                {step === 'details' ? 'Create Account' : 'Enter OTP'}
              </Text>
              <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
                {step === 'details' 
                  ? 'Sign up with your details' 
                  : `OTP sent to ${phoneNumber}`
                }
              </Text>
            </View>

            {/* Form Section */}
            <View style={styles.formSection}>
              {step === 'details' ? (
                // User Details Input
                <View style={styles.inputContainer}>
                  <Text style={[styles.inputLabel, { color: theme.colors.text }]}>First Name</Text>
                  <TextInput
                    placeholder="Enter your first name"
                    placeholderTextColor={theme.colors.inputPlaceholder}
                    style={[styles.input, { 
                      backgroundColor: theme.colors.inputBackground, 
                      borderColor: theme.colors.inputBorder,
                      color: theme.colors.inputText 
                    }]}
                    value={firstName}
                    onChangeText={setFirstName}
                    maxLength={30}
                  />

                  <Text style={[styles.inputLabel, { color: theme.colors.text }]}>Last Name</Text>
                  <TextInput
                    placeholder="Enter your last name"
                    placeholderTextColor={theme.colors.inputPlaceholder}
                    style={[styles.input, { 
                      backgroundColor: theme.colors.inputBackground, 
                      borderColor: theme.colors.inputBorder,
                      color: theme.colors.inputText 
                    }]}
                    value={lastName}
                    onChangeText={setLastName}
                    maxLength={30}
                  />

                  <Text style={[styles.inputLabel, { color: theme.colors.text }]}>Phone Number</Text>
                  <View style={[styles.phoneInputContainer, { 
                    backgroundColor: theme.colors.inputBackground, 
                    borderColor: theme.colors.inputBorder 
                  }]}>
                    <Text style={[styles.countryCode, { color: theme.colors.text }]}>+91</Text>
                    <TextInput
                      placeholder="Enter your phone number"
                      placeholderTextColor={theme.colors.inputPlaceholder}
                      style={[styles.phoneInput, { color: theme.colors.inputText }]}
                      keyboardType="phone-pad"
                      value={phoneNumber}
                      onChangeText={setPhoneNumber}
                      maxLength={10}
                    />
                  </View>
                  
                  <TouchableOpacity
                    style={[styles.signupButton, { backgroundColor: theme.colors.primary }, loading && styles.disabledButton]}
                    onPress={sendOTP}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color={theme.colors.onPrimary} size="small" />
                    ) : (
                      <Text style={[styles.signupButtonText, { color: theme.colors.onPrimary }]}>Send OTP</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                // OTP Input
                <View style={styles.inputContainer}>
                  <Text style={[styles.inputLabel, { color: theme.colors.text }]}>OTP Code</Text>
                  <TextInput
                    placeholder="Enter 6-digit OTP"
                    placeholderTextColor={theme.colors.inputPlaceholder}
                    style={[styles.input, { 
                      backgroundColor: theme.colors.inputBackground, 
                      borderColor: theme.colors.inputBorder,
                      color: theme.colors.inputText 
                    }]}
                    keyboardType="number-pad"
                    value={otp}
                    onChangeText={setOtp}
                    maxLength={6}
                  />
                  
                  <TouchableOpacity
                    style={[styles.signupButton, { backgroundColor: theme.colors.primary }, loading && styles.disabledButton]}
                    onPress={verifyOTP}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color={theme.colors.onPrimary} size="small" />
                    ) : (
                      <Text style={[styles.signupButtonText, { color: theme.colors.onPrimary }]}>Verify & Create Account</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.resendButton}
                    onPress={resendOTP}
                    disabled={loading}
                  >
                    <Text style={[styles.resendButtonText, { color: theme.colors.primary }]}>Resend OTP</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={goBackToDetails}
                  >
                    <Text style={[styles.backButtonText, { color: theme.colors.textSecondary }]}>← Back to Details</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />
                <Text style={[styles.dividerText, { color: theme.colors.textSecondary }]}>or</Text>
                <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />
              </View>

              {/* Login Button */}
              <TouchableOpacity
                style={[styles.loginButton, { 
                  backgroundColor: theme.colors.surfaceVariant, 
                  borderColor: theme.colors.border 
                }]}
                onPress={navigateToLogin}
              >
                <Text style={[styles.loginButtonText, { color: theme.colors.text }]}>Already have an account? Login</Text>
              </TouchableOpacity>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: height * 0.9,
  },
  container: {
    flex: 1,
    paddingHorizontal: Math.min(30, width * 0.08),
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    paddingBottom: 40,
  },
  headerSection: {
    alignItems: 'center',
    paddingTop: height * 0.05,
    paddingBottom: height * 0.03,
    minHeight: height * 0.15,
  },
  welcomeText: {
    fontSize: Math.min(28, width * 0.07),
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: Math.min(16, width * 0.04),
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  formSection: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: Math.min(14, width * 0.035),
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginLeft: 5,
    marginTop: 15,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  countryCode: {
    fontSize: Math.min(16, width * 0.04),
    fontWeight: '600',
    color: '#333',
    paddingHorizontal: 15,
    paddingVertical: 16,
  },
  phoneInput: {
    flex: 1,
    fontSize: Math.min(16, width * 0.04),
    color: '#333',
    paddingVertical: 16,
    paddingRight: 15,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    fontSize: Math.min(16, width * 0.04),
    color: '#333',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  signupButton: {
    backgroundColor: '#007AFF',
    marginTop: 20,
    marginBottom: 20,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  signupButtonText: {
    color: '#FFFFFF',
    fontSize: Math.min(16, width * 0.04),
    fontWeight: '600',
  },
  resendButton: {
    alignItems: 'center',
    marginTop: 15,
    paddingVertical: 10,
  },
  resendButtonText: {
    color: '#007AFF',
    fontSize: Math.min(14, width * 0.035),
    textDecorationLine: 'underline',
  },
  backButton: {
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 10,
  },
  backButtonText: {
    color: '#666',
    fontSize: Math.min(14, width * 0.035),
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 25,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#e9ecef',
  },
  dividerText: {
    color: '#666',
    paddingHorizontal: 15,
    fontSize: Math.min(14, width * 0.035),
  },
  loginButton: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
    minHeight: 50,
  },
  loginButtonText: {
    color: '#333',
    fontSize: Math.min(16, width * 0.04),
    fontWeight: '600',
  },

});