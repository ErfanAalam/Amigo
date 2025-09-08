import { Audio } from 'expo-av';

class RingSoundManager {
  private sound: Audio.Sound | null = null;
  private isPlaying = false;

  async initialize() {
    if (this.sound) return;
    
    try {
      // Create a simple ring tone using expo-av
      // Using a system sound or creating a simple tone
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav' },
        { shouldPlay: false, isLooping: true, volume: 0.8 }
      );
      
      this.sound = sound;
      
    } catch (error) {
      
      // Fallback to system sound or haptic feedback
    }
  }

  async startRinging() {
    if (this.isPlaying) return;
    
    try {
      await this.initialize();
      
      if (this.sound) {
        await this.sound.setPositionAsync(0);
        await this.sound.playAsync();
        this.isPlaying = true;
        
      } else {
        // Fallback: Use haptic feedback or system sound
        
      }
    } catch (error) {
      
    }
  }

  async stopRinging() {
    if (!this.isPlaying) return;
    
    try {
      if (this.sound) {
        await this.sound.stopAsync();
        this.isPlaying = false;
        
      }
    } catch (error) {
      
    }
  }

  async dispose() {
    try {
      if (this.sound) {
        await this.sound.unloadAsync();
        this.sound = null;
      }
      this.isPlaying = false;
      
    } catch (error) {
      
    }
  }

  getIsPlaying() {
    return this.isPlaying;
  }
}

// Singleton instance
export const ringSoundManager = new RingSoundManager();
