// lib/NetworkContext.tsx — Zero-Native-Dependency Network Reliability Monitor and Popup Controller
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

interface NetworkContextValue {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  isReliable: boolean;
  connectionType: string;
  isModalVisible: boolean;
  isChecking: boolean;
  justRestored: boolean;
  showNoNetworkModal: () => void;
  hideNoNetworkModal: () => void;
  checkConnection: () => Promise<boolean>;
}

const NetworkContext = createContext<NetworkContextValue>({
  isConnected: true,
  isInternetReachable: true,
  isReliable: true,
  connectionType: 'internet',
  isModalVisible: false,
  isChecking: false,
  justRestored: false,
  showNoNetworkModal: () => {},
  hideNoNetworkModal: () => {},
  checkConnection: async () => true,
});

// Standalone global trigger for non-React functions or background adapters
let globalShowNoNetwork: (() => void) | null = null;
export function triggerGlobalNoNetworkModal() {
  if (globalShowNoNetwork) {
    globalShowNoNetwork();
  }
}

/**
 * Pure JavaScript probe for actual external internet reachability.
 * Uses standard fetch with an AbortController timeout.
 * Tolerant to high-latency networks like Ethio Telecom in Ethiopia (7-10s timeout).
 */
export async function probeActualInternetReachability(timeoutMs = 7000): Promise<boolean> {
  // Check standard navigator.onLine if available
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' && !navigator.onLine) {
    return false;
  }

  // Probe 1: Google Connectivity 204 endpoint (ultra lightweight, no payload)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const resp = await fetch('https://connectivitycheck.gstatic.com/generate_204', {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (resp.status === 204 || resp.ok) {
      return true;
    }
  } catch {
    // Probe 1 timed out or failed, try secondary probe
  }

  // Probe 2: Public fallback
  try {
    const fallbackCtrl = new AbortController();
    const fallbackTimer = setTimeout(() => fallbackCtrl.abort(), timeoutMs);

    const resp2 = await fetch('https://www.google.com', {
      method: 'HEAD',
      cache: 'no-store',
      signal: fallbackCtrl.signal,
    });
    clearTimeout(fallbackTimer);
    return resp2.ok || (resp2.status >= 200 && resp2.status < 400);
  } catch {
    return false;
  }
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(true);
  const [isReliable, setIsReliable] = useState<boolean>(true);
  const [connectionType, setConnectionType] = useState<string>('internet');
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [justRestored, setJustRestored] = useState<boolean>(false);

  const userDismissedRef = useRef<boolean>(false);
  const consecutiveFailuresRef = useRef<number>(0);
  const modalVisibleRef = useRef<boolean>(false);
  modalVisibleRef.current = isModalVisible;

  const showNoNetworkModal = useCallback(() => {
    userDismissedRef.current = false;
    setIsReliable(false);
    setIsModalVisible(true);
  }, []);

  const hideNoNetworkModal = useCallback(() => {
    userDismissedRef.current = true;
    setIsModalVisible(false);
  }, []);

  // Register the global trigger
  useEffect(() => {
    globalShowNoNetwork = showNoNetworkModal;
    return () => {
      globalShowNoNetwork = null;
    };
  }, [showNoNetworkModal]);

  const testConnectionSilently = useCallback(async () => {
    const reachable = await probeActualInternetReachability(7000);

    if (reachable) {
      consecutiveFailuresRef.current = 0;
      setIsConnected(true);
      setIsInternetReachable(true);
      setIsReliable(true);
      setConnectionType('internet');

      userDismissedRef.current = false;
      if (modalVisibleRef.current) {
        setJustRestored(true);
        setTimeout(() => {
          setJustRestored(false);
          setIsModalVisible(false);
        }, 1200);
      }
    } else {
      consecutiveFailuresRef.current += 1;
      // In Ethiopia, mobile data can be temporarily slow or spike in latency.
      // Require at least 2 consecutive failed probes before flagging the network as down.
      if (consecutiveFailuresRef.current >= 2) {
        setIsConnected(false);
        setIsInternetReachable(false);
        setIsReliable(false);
        setConnectionType('none');

        if (!userDismissedRef.current) {
          setIsModalVisible(true);
        }
      }
    }
  }, []);

  // Run initial check and heartbeat poll every 15 seconds while active (gentle on mobile data)
  useEffect(() => {
    testConnectionSilently();

    const intervalId = setInterval(() => {
      testConnectionSilently();
    }, 15000);

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        testConnectionSilently();
      }
    });

    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [testConnectionSilently]);

  // Manual Check / Retry connection
  const checkConnection = useCallback(async (): Promise<boolean> => {
    setIsChecking(true);
    try {
      const reachable = await probeActualInternetReachability(9000);

      setIsConnected(reachable);
      setIsInternetReachable(reachable);
      setIsReliable(reachable);
      setConnectionType(reachable ? 'internet' : 'none');

      if (reachable) {
        consecutiveFailuresRef.current = 0;
        userDismissedRef.current = false;
        setJustRestored(true);
        setTimeout(() => {
          setJustRestored(false);
          setIsModalVisible(false);
        }, 1000);
        return true;
      } else {
        setIsModalVisible(true);
        return false;
      }
    } catch {
      setIsReliable(false);
      setIsModalVisible(true);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, []);

  return (
    <NetworkContext.Provider
      value={{
        isConnected,
        isInternetReachable,
        isReliable,
        connectionType,
        isModalVisible,
        isChecking,
        justRestored,
        showNoNetworkModal,
        hideNoNetworkModal,
        checkConnection,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
