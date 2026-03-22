import { useEffect, useState } from 'react';
import socket from '../../utils/socket';

/**
 * Custom hook to manage socket connection for live pose updates.
 * @param {Function} callback - Function to call when pose-data is received.
 */
export const usePoseSocket = (callback) => {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    if (callback) {
      socket.on('pose-data', callback);
    }

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      if (callback) {
        socket.off('pose-data', callback);
      }
    };
  }, [callback]);

  return { isConnected };
};
