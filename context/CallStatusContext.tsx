import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Call } from '../types/CallTypes';

interface CallStatusContextType {
  currentCall: Call | null;
  isInCall: boolean;
  callStatus: 'ringing' | 'connecting' | 'connected' | 'ended';
  setCurrentCall: (call: Call | null) => void;
  setCallStatus: (status: 'ringing' | 'connecting' | 'connected' | 'ended') => void;
  clearCall: () => void;
}

const CallStatusContext = createContext<CallStatusContextType | undefined>(undefined);

export const CallStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentCall, setCurrentCall] = useState<Call | null>(null);
  const [callStatus, setCallStatus] = useState<'ringing' | 'connecting' | 'connected' | 'ended'>('ended');
  const [isInCall, setIsInCall] = useState(false);

  const clearCall = useCallback(() => {
    setCurrentCall(null);
    setCallStatus('ended');
    setIsInCall(false);
  }, []);

  useEffect(() => {
    setIsInCall(currentCall !== null && callStatus !== 'ended');
  }, [currentCall, callStatus]);

  return (
    <CallStatusContext.Provider
      value={{
        currentCall,
        isInCall,
        callStatus,
        setCurrentCall,
        setCallStatus,
        clearCall,
      }}
    >
      {children}
    </CallStatusContext.Provider>
  );
};

export const useCallStatus = () => {
  const context = useContext(CallStatusContext);
  if (context === undefined) {
    throw new Error('useCallStatus must be used within a CallStatusProvider');
  }
  return context;
};
