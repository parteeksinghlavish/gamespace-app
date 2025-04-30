'use client';

import React, { useState, useEffect } from 'react';
import { api } from '~/trpc/react';

// Define a Device type for better type safety
interface Device {
  id: number;
  type: string;
  counterNo: number;
  maxPlayers: number;
  hourlyRate: number;
}

// Define a Token type
interface Token {
  id: number;
  tokenNo: number;
}

interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function NewSessionModal({ isOpen, onClose, onSuccess }: NewSessionModalProps) {
  const [tokenNo, setTokenNo] = useState<number>(1);
  const [deviceId, setDeviceId] = useState<string>('');
  const [playerCount, setPlayerCount] = useState<number>(1);
  const [comments, setComments] = useState<string>('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);

  // Query to get available devices
  const { data: availableDevices, isLoading: isLoadingAvailable, refetch: refetchAvailableDevices } = api.playerManagement.getAvailableDevices.useQuery(
    undefined, 
    {
      refetchInterval: 30000, // Refetch every 30 seconds
      refetchOnWindowFocus: true, // Refetch when window regains focus
    }
  );
  
  // Query to get all devices (including unavailable ones)
  const { data: allDevices, isLoading: isLoadingAll, refetch: refetchAllDevices } = api.playerManagement.getAllDevices.useQuery(
    undefined,
    {
      refetchInterval: 30000, // Refetch every 30 seconds
      refetchOnWindowFocus: true, // Refetch when window regains focus
    }
  );
  
  // Query to get existing tokens
  const { data: existingTokens, refetch: refetchTokens } = api.playerManagement.getTodaySessions.useQuery(
    undefined,
    {
      refetchInterval: 30000, // Refetch every 30 seconds
      refetchOnWindowFocus: true, // Refetch when window regains focus
    }
  );

  // Get utilities for manual invalidation
  const utils = api.useUtils();

  // Mutation to create a session
  const createSessionMutation = api.playerManagement.createSession.useMutation({
    onSuccess: () => {
      // Immediately invalidate and refetch data to update UI
      utils.playerManagement.getAvailableDevices.invalidate();
      utils.playerManagement.getAllDevices.invalidate();
      utils.playerManagement.getTodaySessions.invalidate();
      
      resetForm();
      onSuccess();
      showToast('Session created', 'success');
    },
    onError: (error) => {
      showToast('Error creating session: ' + error.message, 'error');
    },
  });

  // Simple toast notification
  const showToast = (message: string, type: 'success' | 'error') => {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 p-4 rounded-xl text-white ${
      type === 'success' ? 'bg-green-500' : 'bg-red-500'
    } shadow-lg z-50 transition-opacity duration-300`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('opacity-0');
      setTimeout(() => document.body.removeChild(toast), 500);
    }, 3000);
  };

  const resetForm = () => {
    setTokenNo(1);
    setDeviceId('');
    setPlayerCount(1);
    setComments('');
    setErrors({});
  };

  // Validate the form
  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!deviceId) {
      newErrors.deviceId = 'Please select a device';
    } else if (isNaN(parseInt(deviceId))) {
      newErrors.deviceId = 'Invalid device ID format';
    }

    if (!tokenNo || tokenNo < 1) {
      newErrors.tokenNo = 'Please enter a valid token number';
    }

    if (!playerCount || playerCount < 1) {
      newErrors.playerCount = 'Please enter a valid number of players';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      createSessionMutation.mutate({
        deviceId: parseInt(deviceId),
        tokenNo,
        playerCount,
        comments,
      });
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Get references to dropdown containers
      const dropdownContainers = document.querySelectorAll('.dropdown-container');
      
      // Check if click was outside all dropdown containers
      let outsideClick = true;
      dropdownContainers.forEach(container => {
        if (container.contains(event.target as Node)) {
          outsideClick = false;
        }
      });
      
      // Only close dropdowns if click was outside
      if (outsideClick) {
        setShowDeviceDropdown(false);
        setShowPlayerDropdown(false);
        setShowTokenDropdown(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Get selected device to determine max players
  const selectedDevice = React.useMemo(() => {
    // If we have a deviceId but it's not in availableDevices, check allDevices
    if (deviceId) {
      // First check in available devices
      const availableDevice = availableDevices?.find(
        (device: Device) => device.id.toString() === deviceId
      );
      
      if (availableDevice) {
        return availableDevice;
      }
      
      // If not found in available devices, it might be in use
      // Show it anyway so the form doesn't reset
      return allDevices?.find(
        (device: Device) => device.id.toString() === deviceId
      );
    }
    return undefined;
  }, [deviceId, availableDevices, allDevices]);

  // Effect to update UI when a selected device becomes available/unavailable 
  useEffect(() => {
    if (deviceId && availableDevices) {
      // Check if our selected device is still available
      const isStillAvailable = isDeviceAvailable({ id: parseInt(deviceId) } as Device);
      
      // If the device availability changes, we can optionally do something,
      // like showing a notification, but we don't reset the selection
      if (!isStillAvailable) {
        console.log("Selected device is now in use elsewhere");
        // We don't reset the selection, but we could show a warning
      }
    }
  }, [deviceId, availableDevices]);

  // Format device label
  const getDeviceLabel = (device: Device) => {
    return `${device.type} ${device.counterNo}`;
  };

  // Check if a device is available
  const isDeviceAvailable = (device: Device) => {
    if (!availableDevices) return true;
    return availableDevices.some((d: Device) => d.id === device.id);
  };

  // Check if a token number is assigned (unavailable)
  const isTokenAssigned = (tokenNumber: number) => {
    if (!existingTokens) return false;

    // A token is considered "in use" if ANY token with this number either:
    // 1. Has active sessions, OR
    // 2. Has pending bills with no completed bills
    // This exactly matches the filteringIn PlayerManagementContent
    
    for (const token of existingTokens) {
      // Skip tokens with different numbers
      if (token.tokenNo !== tokenNumber) continue;
      
      // Step 1: Check for active sessions
      const hasActiveSession = token.sessions.some(
        (session: any) => session.status === "ACTIVE"
      );
      
      if (hasActiveSession) {
        // Has active sessions - token is in use
        return true;
      }
      
      // Step 2: If no active sessions, check bill status
      const hasCompletedBill = token.bills?.some(
        (bill: any) => bill.status === 'PAID' || bill.status === 'DUE'
      );
      
      // If all sessions ended but no completed bills, token is in use
      const allSessionsEnded = token.sessions.every(
        (session: any) => session.status !== "ACTIVE"
      );
      
      if (allSessionsEnded && !hasCompletedBill) {
        // Has no active sessions but also no completed bills - still in use
        return true;
      }
    }
    
    // If we got here, the token number is available for use
    return false;
  };

  // Find the next available token number
  const getNextAvailableToken = () => {
    if (!existingTokens || existingTokens.length === 0) return 1;
    
    // Check each number from 1 to 50
    for (let i = 1; i <= 50; i++) {
      // If this token number is not assigned (using our updated logic), it's available
      if (!isTokenAssigned(i)) {
        return i;
      }
    }
    
    // If no available token found, return the next higher number
    return 1;
  };

  const assignNextAvailableToken = () => {
    const nextToken = getNextAvailableToken();
    setTokenNo(nextToken);
    setShowTokenDropdown(false);
  };

  if (!isOpen) return null;

  // Generate numbers 1 to max for dropdowns
  const generateNumbers = (max: number) => {
    return Array.from({ length: max }, (_, i) => i + 1);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl overflow-hidden">
        <div className="bg-blue-600 p-4 sm:p-5">
          <h3 className="text-xl font-semibold text-white">New Gaming Session</h3>
        </div>
        <div className="p-4 sm:p-6">
          {/* Device Dropdown */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Device
            </label>
            <div className="relative dropdown-container">
              <button
                type="button"
                className="block w-full text-left px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:bg-gray-50 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeviceDropdown(!showDeviceDropdown);
                  setShowPlayerDropdown(false);
                  setShowTokenDropdown(false);
                }}
              >
                {selectedDevice ? getDeviceLabel(selectedDevice) : "Select device"}
                <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                    <path d="M7 7l3 3 3-3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
              
              {showDeviceDropdown && allDevices && (
                <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-xl py-1 overflow-auto border border-gray-200">
                  {isLoadingAll ? (
                    <div className="p-2 text-center text-gray-500">Loading devices...</div>
                  ) : allDevices.length === 0 ? (
                    <div className="p-2 text-center text-gray-500">No devices found</div>
                  ) : (
                    <>
                      {isLoadingAvailable && (
                        <div className="p-1 text-xs text-center text-blue-500 bg-blue-50 border-b border-blue-100">
                          Refreshing availability status...
                        </div>
                      )}
                      {allDevices.map((device: Device) => {
                        const deviceIdString = String(device.id);
                        const isAvailable = isDeviceAvailable(device);
                        
                        return (
                          <button
                            key={deviceIdString}
                            type="button"
                            className={`block w-full text-left px-4 py-3 text-sm ${
                              !isAvailable ? 'bg-gray-50 cursor-not-allowed opacity-60' : 'bg-white hover:bg-blue-50'
                            } ${deviceId === deviceIdString ? 'bg-blue-100 font-medium' : ''}`}
                            onClick={() => {
                              if (isAvailable) {
                                setDeviceId(deviceIdString);
                                setPlayerCount(1);
                                setShowDeviceDropdown(false);
                              }
                            }}
                            disabled={!isAvailable}
                          >
                            <div className="flex justify-between items-center">
                              <span className={!isAvailable ? 'text-gray-500' : ''}>
                                {getDeviceLabel(device)}
                              </span>
                              {!isAvailable && (
                                <span className="text-orange-600 text-xs font-medium bg-orange-100 px-2 py-1 rounded-full">
                                  In Use
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
            {errors.deviceId && (
              <p className="mt-1 text-sm text-red-600">{errors.deviceId}</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mb-5">
            {/* Number of Players Dropdown */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Players
              </label>
              <div className="relative dropdown-container">
                <button
                  type="button"
                  className="block w-full text-left px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:bg-gray-50 transition-colors disabled:bg-gray-100 disabled:text-gray-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPlayerDropdown(!showPlayerDropdown);
                    setShowDeviceDropdown(false);
                    setShowTokenDropdown(false);
                  }}
                  disabled={!selectedDevice}
                >
                  {playerCount}
                  <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                      <path d="M7 7l3 3 3-3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
                
                {showPlayerDropdown && selectedDevice && (
                  <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-xl py-1 overflow-auto border border-gray-200">
                    {generateNumbers(selectedDevice.maxPlayers).map((num) => (
                      <button
                        key={num}
                        type="button"
                        className={`block w-full text-left px-4 py-3 text-sm hover:bg-blue-50 ${
                          playerCount === num ? 'bg-blue-100' : ''
                        }`}
                        onClick={() => {
                          setPlayerCount(num);
                          setShowPlayerDropdown(false);
                        }}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Token Number Dropdown */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Token Number
              </label>
              <div className="relative dropdown-container">
                <button
                  type="button"
                  className="block w-full text-left px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:bg-gray-50 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTokenDropdown(!showTokenDropdown);
                    setShowDeviceDropdown(false);
                    setShowPlayerDropdown(false);
                  }}
                >
                  {tokenNo}
                  <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                      <path d="M7 7l3 3 3-3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
                
                {showTokenDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-xl py-1 overflow-auto border border-gray-200">
                    {generateNumbers(20).map((num) => {
                      const assigned = isTokenAssigned(num);
                      
                      // Find the matching tokens for additional info
                      const tokensWithThisNumber = existingTokens?.filter(
                        (t: any) => t.tokenNo === num
                      ) || [];
                      
                      // Count tokens with active sessions
                      const tokensWithActiveSessions = tokensWithThisNumber.filter((t: any) => 
                        t.sessions.some((s: any) => s.status === "ACTIVE")
                      ).length;
                      
                      // Count tokens with pending bills
                      const tokensWithPendingBills = tokensWithThisNumber.filter((t: any) => 
                        t.bills?.some((b: any) => b.status === "PENDING")
                      ).length;
                      
                      return (
                        <button
                          key={num}
                          type="button"
                          className={`block w-full text-left px-4 py-3 text-sm ${
                            assigned ? 'bg-orange-50' : 'bg-white hover:bg-green-50'
                          } ${tokenNo === num ? 'bg-blue-100' : ''}`}
                          onClick={() => {
                            setTokenNo(num);
                            setShowTokenDropdown(false);
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className={assigned ? 'text-gray-700' : 'text-gray-900'}>
                              {num}
                            </span>
                            {assigned ? (
                              <span className="text-orange-600 text-xs font-medium bg-orange-100 px-2 py-1 rounded-full">
                                {tokensWithActiveSessions > 0 ? 'Active Sessions' : 'Pending Bill'}
                              </span>
                            ) : (
                              <span className="text-green-600 text-xs font-medium bg-green-100 px-2 py-1 rounded-full">
                                Available
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button 
                type="button"
                className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                onClick={assignNextAvailableToken}
              >
                ASSIGN NEXT AVAILABLE TOKEN
              </button>
            </div>
          </div>

          {/* Comments */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Comments
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Add any notes about this session"
              rows={4}
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>
        </div>

        <div className="bg-gray-50 px-4 sm:px-6 py-4 flex justify-end space-x-4 border-t">
          <button
            className="px-4 py-2 text-blue-600 hover:text-blue-800 font-medium focus:outline-none transition-colors"
            onClick={onClose}
          >
            CANCEL
          </button>
          <button
            className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium focus:outline-none disabled:opacity-50 transition-colors shadow-sm"
            onClick={handleSubmit}
            disabled={createSessionMutation.isPending}
          >
            {createSessionMutation.isPending ? 'CREATING...' : 'CREATE SESSION'}
          </button>
        </div>
      </div>
    </div>
  );
} 