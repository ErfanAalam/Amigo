// Test utility to verify Agora token generation
export const testAgoraToken = async (channelId: string, uid: string) => {
  try {
    console.log('🧪 Testing Agora token generation...');
    
    const response = await fetch('https://amigo-admin-eight.vercel.app/api/agora/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channelName: channelId,
        uid: uid,
        role: 'publisher'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Token test failed:', response.status, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }
    
    const data = await response.json();
    console.log('✅ Token test successful:', {
      channelName: data.channelName,
      uid: data.uid,
      expiresIn: data.expiresIn,
      tokenLength: data.token?.length || 0
    });
    
    return { success: true, data };
  } catch (error) {
    console.error('❌ Token test error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// Test the GET endpoint
export const testAgoraEndpoint = async () => {
  try {
    console.log('🧪 Testing Agora endpoint availability...');
    
    const response = await fetch('https://amigo-admin-eight.vercel.app/api/agora/token');
    
    if (!response.ok) {
      console.error('❌ Endpoint test failed:', response.status);
      return { success: false, error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    console.log('✅ Endpoint test successful:', data);
    
    return { success: true, data };
  } catch (error) {
    console.error('❌ Endpoint test error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};
