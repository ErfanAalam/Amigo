
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
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
      
      // For production, Firebase will automatically handle reCAPTCHA
      const confirmation = await auth().signInWithPhoneNumber(formattedPhone);
      setVerificationId(confirmation.verificationId);
      setStep('otp');
      Alert.alert("OTP Sent", "Check your phone for the OTP.");
    } catch (error: any) {
      console.error("sendOTP error:", error);
      let errorMessage = "Failed to send OTP";
      
      // Handle specific Firebase errors
      if (error.code === 'auth/invalid-phone-number') {
        errorMessage = "Invalid phone number format";
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = "Too many requests. Please try again later.";
      } else if (error.code === 'auth/quota-exceeded') {
        errorMessage = "SMS quota exceeded. Please try again later.";
      } else if (error.code === 'auth/missing-client-identifier') {
        errorMessage = "Security check failed. Please try again or restart the app.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert("Error", errorMessage);
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
            {/* Header Section with Gradient */}
            <View style={styles.headerSection}>
              <LinearGradient
                colors={theme.isDark ? ['#2C3E50', '#34495E'] : ['#0d9488', '#10b981']}
                style={styles.headerGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.logoContainer}>
                  <View style={styles.logoCircle}>
                    {/* <Text style={styles.logoText}>A</Text> */}
                    <Image source={require('../../assets/images/amigo.png')} style={styles.logoImage} />
                  </View>
                </View>
                <Text style={styles.welcomeText}>
                  {step === 'details' ? 'Create Account' : 'Enter OTP'}
                </Text>
                <Text style={styles.subtitle}>
                  {step === 'details' 
                    ? 'Sign up with your details' 
                    : `OTP sent to ${phoneNumber}`
                  }
                </Text>
              </LinearGradient>
            </View>

            {/* Form Section */}
            <View style={styles.formSection}>
              {step === 'details' ? (
                // User Details Input
                <View style={styles.inputContainer}>
                  <View style={styles.inputWrapper}>
                    <Text style={[styles.inputLabel, { color: theme.colors.text }]}>First Name</Text>
                    <View style={[styles.textInputContainer, { 
                      backgroundColor: theme.isDark ? 'rgba(52, 73, 94, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
                    }]}>
                      <TextInput
                        placeholder="Enter your first name"
                        placeholderTextColor={theme.colors.inputPlaceholder}
                        style={[styles.textInput, { color: theme.colors.text }]}
                        value={firstName}
                        onChangeText={setFirstName}
                        maxLength={30}
                      />
                    </View>
                  </View>

                  <View style={styles.inputWrapper}>
                    <Text style={[styles.inputLabel, { color: theme.colors.text }]}>Last Name</Text>
                    <View style={[styles.textInputContainer, { 
                      backgroundColor: theme.isDark ? 'rgba(52, 73, 94, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
                    }]}>
                      <TextInput
                        placeholder="Enter your last name"
                        placeholderTextColor={theme.colors.inputPlaceholder}
                        style={[styles.textInput, { color: theme.colors.text }]}
                        value={lastName}
                        onChangeText={setLastName}
                        maxLength={30}
                      />
                    </View>
                  </View>

                  <View style={styles.inputWrapper}>
                    <Text style={[styles.inputLabel, { color: theme.colors.text }]}>Phone Number</Text>
                    <View style={[styles.phoneInputContainer, { 
                      backgroundColor: theme.isDark ? 'rgba(52, 73, 94, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
                      shadowColor: theme.isDark ? '#000' : '#0d9488',
                    }]}>
                      <View style={[styles.countryCodeContainer, { backgroundColor: theme.colors.primary }]}>
                        <Text style={styles.countryCode}>+91</Text>
                      </View>
                      <TextInput
                        placeholder="Enter your phone number"
                        placeholderTextColor={theme.colors.inputPlaceholder}
                        style={[styles.phoneInput, { color: theme.colors.text }]}
                        keyboardType="phone-pad"
                        value={phoneNumber}
                        onChangeText={setPhoneNumber}
                        maxLength={10}
                      />
                    </View>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.signupButton}
                    onPress={sendOTP}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={loading ? ['#ccc', '#ccc'] : ['#0d9488', '#10b981']}
                      style={styles.buttonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      {loading ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <Text style={styles.signupButtonText}>Send OTP</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : (
                // OTP Input
                <View style={styles.inputContainer}>
                  <View style={styles.inputWrapper}>
                    <Text style={[styles.inputLabel, { color: theme.colors.text }]}>OTP Code</Text>
                    <View style={[styles.otpInputContainer, { 
                      backgroundColor: theme.isDark ? 'rgba(52, 73, 94, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                      borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
                    }]}>
                      <TextInput
                        placeholder="Enter 6-digit OTP"
                        placeholderTextColor={theme.colors.inputPlaceholder}
                        style={[styles.otpInput, { color: theme.colors.text }]}
                        keyboardType="number-pad"
                        value={otp}
                        onChangeText={setOtp}
                        maxLength={6}
                        textAlign="center"
                      />
                    </View>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.signupButton}
                    onPress={verifyOTP}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={loading ? ['#ccc', '#ccc'] : ['#0d9488', '#10b981']}
                      style={styles.buttonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      {loading ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <Text style={styles.signupButtonText}>Verify & Create Account</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.resendButton}
                    onPress={resendOTP}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.resendButtonText, { color: theme.colors.primary }]}>Resend OTP</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={goBackToDetails}
                    activeOpacity={0.7}
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
                  backgroundColor: theme.isDark ? 'rgba(52, 73, 94, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                  borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
                }]}
                onPress={navigateToLogin}
                activeOpacity={0.8}
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
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
  },
  headerSection: {
    marginBottom: 40,
  },
  headerGradient: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 30,
    alignItems: 'center',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  logoContainer: {
    marginBottom: 20,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  logoImage: {
    width: 120,
    height: 120,
    borderRadius: 30,
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  formSection: {
    flex: 1,
    paddingHorizontal: 30,
    paddingBottom: 40,
  },
  inputContainer: {
    marginBottom: 10,
  },
  inputWrapper: {
    marginBottom: 25,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    marginLeft: 4,
  },
  textInputContainer: {
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  textInput: {
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  countryCodeContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopLeftRadius: 15,
    borderBottomLeftRadius: 15,
  },
  countryCode: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  otpInputContainer: {
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  otpInput: {
    fontSize: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontWeight: '600',
  },
  signupButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonGradient: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  signupButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  resendButton: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 12,
  },
  resendButtonText: {
    fontSize: 16,
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  backButton: {
    alignItems: 'center',
    marginTop: 15,
    paddingVertical: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: 20,
    fontSize: 16,
    fontWeight: '500',
  },
  loginButton: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 30,
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 56,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  loginButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});