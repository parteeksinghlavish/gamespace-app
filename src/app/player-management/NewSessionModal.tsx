'use client';

import React, { useState, useEffect } from 'react';
import { api } from '~/trpc/react';

// Define a Device type for better type safety
interface Device {
  id: number;
  type: string;
  counterNo: number;
  maxPlayers: number;
  hourlyRate: number | any; // Allow for Decimal type from the backend
}

// Define a Token type
interface Token {
  id: number;
  tokenNo: number;
  createdAt: Date;
  updatedAt: Date;
  sessions?: any[]; // Add sessions property
  orders?: any[];   // Add orders property
  bills?: any[];    // Add bills property
}

// Define an Order type
interface Order {
  id: string;
  orderNumber: string;
  status: string;
}

interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingOrderId?: string; // New prop to specify an existing order ID
  isMainButton?: boolean; // New prop to indicate modal opened from main button
}

export default function NewSessionModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  existingOrderId,
  isMainButton = false // Default to false
}: NewSessionModalProps) {
  const [tokenNo, setTokenNo] = useState<number>(1);
  const [deviceId, setDeviceId] = useState<string>('');
  const [playerCount, setPlayerCount] = useState<number>(1);
  const [comments, setComments] = useState<string>('');
  const [orderId, setOrderId] = useState<string>('new'); // 'new' for new order, or actual ID
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [showOrderDropdown, setShowOrderDropdown] = useState(false);

  // Query to get available devices
  const { data: availableDevices, isLoading: isLoadingAvailable, refetch: refetchAvailableDevices } = api.playerManagement.getAvailableDevices.useQuery(
    undefined, 
    {
      refetchInterval: 10000, // Refetch every 30 seconds
      refetchOnWindowFocus: true, // Refetch when window regains focus
    }
  );
  
  // Query to get all devices (including unavailable ones)
  const { data: allDevices, isLoading: isLoadingAll, refetch: refetchAllDevices } = api.playerManagement.getAllDevices.useQuery(
    undefined,
    {
      refetchInterval: 10000, // Refetch every 30 seconds
      refetchOnWindowFocus: true, // Refetch when window regains focus
    }
  );
  
  // Query to get existing tokens
  const { data: existingTokens, refetch: refetchTokens } = api.playerManagement.getTodaySessions.useQuery(
    undefined,
    {
      refetchInterval: 10000, // Refetch every 30 seconds
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
    setOrderId('new');
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

  // Initialize orderId from prop if provided
  useEffect(() => {
    if (existingOrderId) {
      setOrderId(existingOrderId);
      
      // If we have an existing order, find its token number
      if (existingTokens) {
        for (const token of existingTokens) {
          const orderWithId = (token as Token).orders?.find((o: any) => o.id === existingOrderId);
          if (orderWithId) {
            setTokenNo(token.tokenNo);
            break;
          }
        }
      }
    } else if (isMainButton) {
      // Always set to 'new' when opened from main button
      setOrderId('new');
      // Auto-select first available token
      assignNextAvailableToken();
    }
  }, [existingOrderId, existingTokens, isMainButton]);

  // Handle form submission
  const handleSubmit = () => {
    if (validateForm()) {
      const sessionData: any = {
        deviceId: parseInt(deviceId),
        tokenNo,
        playerCount,
        comments,
      };

      // Add orderId if not creating a new order
      if (orderId !== 'new') {
        sessionData.orderId = orderId;
      } else if (existingOrderId) {
        // If modal was opened with an existing order ID, use that
        sessionData.orderId = existingOrderId;
      }

      createSessionMutation.mutate(sessionData);
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
        setShowOrderDropdown(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Get active orders for the selected token
  const activeOrders = React.useMemo(() => {
    if (!existingTokens || !tokenNo) return [];
    
    // Find the token with the matching number
    const selectedToken = existingTokens.find(
      (token: any) => token.tokenNo === tokenNo
    );
    
    if (!selectedToken) return [];
    
    // Get active orders for this token
    return (selectedToken as Token).orders?.filter(
      (order: any) => order.status === 'ACTIVE'
    ) || [];
  }, [existingTokens, tokenNo]);

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

  // Reset order when token changes
  useEffect(() => {
    setOrderId('new');
  }, [tokenNo]);

  // Format device label
  const getDeviceLabel = (device: Device) => {
    return `${device.type} ${device.counterNo}`;
  };

  // Check if a device is available
  const isDeviceAvailable = (device: Device) => {
    if (!availableDevices) return true;
    
    // A device is available if it's in the availableDevices array
    // The server should be filtering this list to only include devices 
    // not currently in active use today
    return availableDevices.some((d: any) => d.id === device.id);
  };

  // Format order label
  const getOrderLabel = (order: Order) => {
    return `${order.orderNumber}`;
  };

  // Check if a token number is assigned (unavailable)
  const isTokenAssigned = (tokenNumber: number) => {
    if (!existingTokens) return false;

    // A token is considered "in use" if ANY token with this number
    // has active sessions TODAY
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    for (const token of existingTokens) {
      // Skip tokens with different numbers
      if (token.tokenNo !== tokenNumber) continue;
      
      // Check only for active sessions
      const hasActiveSession = (token as Token).sessions?.some(
        (session: any) => session.status === "ACTIVE"
      );
      
      if (hasActiveSession) {
        // Has active sessions - token is in use
        return true;
      }
    }
    
    return false; // Token is available
  };

  // Get next available token number
  const getNextAvailableToken = () => {
    if (!existingTokens) return 1;
    
    // Simplify: Use 1-10 as token numbers
    for (let i = 1; i <= 10; i++) {
      if (!isTokenAssigned(i)) {
        return i;
      }
    }
    
    // If all 1-10 are in use, suggest token #1 as a fallback
    return 1;
  };

  // Assign next available token
  const assignNextAvailableToken = () => {
    setTokenNo(getNextAvailableToken());
  };

  // Helper to generate array of numbers
  const generateNumbers = (max: number) => {
    return Array.from({ length: max }, (_, i) => i + 1);
  };

  // Modified to get only available token numbers
  const getAvailableTokenNumbers = () => {
    if (!existingTokens) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    
    // Only include numbers that are not assigned
    return generateNumbers(10).filter(num => !isTokenAssigned(num));
  };

  // If the modal is not open, don't render anything
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-xl w-full overflow-hidden">
        <div className="bg-blue-600 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-white">
            {existingOrderId ? "Add Session to Order" : "New Gaming Session"}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6">
          <div className="space-y-6">
            {/* Device Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Device</label>
              <div className="relative dropdown-container">
                <div 
                  className="flex p-3 border border-gray-300 rounded-lg cursor-pointer bg-white hover:border-blue-500 transition-colors"
                  onClick={() => setShowDeviceDropdown(!showDeviceDropdown)}
                >
                  <span className="flex-grow">
                    {deviceId 
                      ? (selectedDevice 
                          ? `${getDeviceLabel(selectedDevice)}${!isDeviceAvailable(selectedDevice) ? ' (in use)' : ''}` 
                          : 'Loading...')
                      : 'Select device'}
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                {showDeviceDropdown && (
                  <div className="absolute mt-1 w-full bg-white shadow-lg rounded-lg z-10 max-h-60 overflow-auto border border-gray-200">
                    <div className="p-2 border-b border-gray-100">
                      <p className="text-xs text-gray-500">Available Devices</p>
                    </div>
                    {isLoadingAvailable ? (
                      <div className="p-2 text-center">
                        <span className="inline-block h-4 w-4 border-2 border-t-blue-500 rounded-full animate-spin"></span>
                        <span className="ml-2">Loading devices...</span>
                      </div>
                    ) : availableDevices?.length ? (
                      availableDevices.map((device: any) => (
                        <div 
                          key={device.id}
                          className="p-2 hover:bg-blue-50 cursor-pointer"
                          onClick={() => { 
                            setDeviceId(device.id.toString()); 
                            setShowDeviceDropdown(false);
                            setPlayerCount(1); // Reset to minimum when changing device
                          }}
                        >
                          {getDeviceLabel(device)}
                        </div>
                      ))
                    ) : (
                      <div className="p-2 text-center text-gray-500">No available devices</div>
                    )}
                    
                    {allDevices && allDevices.length > (availableDevices?.length || 0) && (
                      <>
                        <div className="p-2 border-t border-b border-gray-100">
                          <p className="text-xs text-gray-500">In-Use Devices</p>
                        </div>
                        {allDevices
                          .filter((device: any) => !isDeviceAvailable(device))
                          .map((device: any) => (
                            <div 
                              key={device.id}
                              className="p-2 text-gray-400 bg-gray-50 cursor-not-allowed"
                            >
                              {getDeviceLabel(device)} - Currently in use
                            </div>
                          ))
                        }
                      </>
                    )}
                  </div>
                )}
              </div>
              {errors.deviceId && <p className="mt-1 text-sm text-red-600">{errors.deviceId}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Number of Players */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Number of Players</label>
                <div className="relative dropdown-container">
                  <div 
                    className={`flex p-3 border border-gray-300 rounded-lg cursor-pointer bg-white ${selectedDevice ? 'hover:border-blue-500' : 'opacity-75'} transition-colors`}
                    onClick={() => { 
                      // Only show dropdown if we have a device selected
                      if (selectedDevice) setShowPlayerDropdown(!showPlayerDropdown);
                    }}
                  >
                    <span className="flex-grow">{playerCount}</span>
                    {selectedDevice && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>
                  {showPlayerDropdown && selectedDevice && (
                    <div className="absolute mt-1 w-full bg-white shadow-lg rounded-lg z-10 max-h-60 overflow-auto border border-gray-200">
                      {generateNumbers(selectedDevice.maxPlayers).map((num) => (
                        <div 
                          key={num}
                          className="p-2 hover:bg-blue-50 cursor-pointer"
                          onClick={() => { setPlayerCount(num); setShowPlayerDropdown(false); }}
                        >
                          {num}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {errors.playerCount && <p className="mt-1 text-sm text-red-600">{errors.playerCount}</p>}
              </div>

              {/* Token Number */}
              {!existingOrderId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Token Number</label>
                  <div className="relative dropdown-container">
                    <div 
                      className="flex p-3 border border-gray-300 rounded-lg cursor-pointer bg-white hover:border-blue-500 transition-colors"
                      onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                    >
                      <span className="flex-grow">{tokenNo}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    {showTokenDropdown && (
                      <div className="absolute mt-1 w-full bg-white shadow-lg rounded-lg z-10 max-h-60 overflow-auto border border-gray-200">
                        {getAvailableTokenNumbers().map((num) => (
                          <div 
                            key={num}
                            className="p-2 cursor-pointer hover:bg-blue-50 flex justify-between items-center"
                            onClick={() => { setTokenNo(num); setShowTokenDropdown(false); }}
                          >
                            <span>{num}</span>
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Available</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {errors.tokenNo && <p className="mt-1 text-sm text-red-600">{errors.tokenNo}</p>}
                  {isMainButton && (
                    <button
                      onClick={assignNextAvailableToken}
                      className="mt-2 w-full p-1 text-blue-600 text-sm bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                    >
                      ASSIGN NEXT AVAILABLE TOKEN
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Order Selection - Only show if not using an existing order and not from main button */}
            {!existingOrderId && !isMainButton && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Order</label>
                <div className="relative dropdown-container">
                  <div 
                    className="flex p-3 border border-gray-300 rounded-lg cursor-pointer bg-white hover:border-blue-500 transition-colors"
                    onClick={() => setShowOrderDropdown(!showOrderDropdown)}
                  >
                    <span className="flex-grow">
                      {orderId === 'new' 
                        ? 'Create new order' 
                        : activeOrders.find((o: any) => o.id === orderId)?.orderNumber || orderId}
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {showOrderDropdown && (
                    <div className="absolute mt-1 w-full bg-white shadow-lg rounded-lg z-10 max-h-60 overflow-auto border border-gray-200">
                      <div 
                        className="p-2 hover:bg-blue-50 cursor-pointer text-blue-600 font-medium"
                        onClick={() => { setOrderId('new'); setShowOrderDropdown(false); }}
                      >
                        <span className="flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Create new order
                        </span>
                      </div>
                      
                      {activeOrders.length > 0 && (
                        <div className="border-t border-gray-100">
                          <p className="text-xs text-gray-500 p-2">Existing orders for token #{tokenNo}</p>
                          {activeOrders.map((order: any) => (
                            <div 
                              key={order.id}
                              className="p-2 hover:bg-blue-50 cursor-pointer"
                              onClick={() => { setOrderId(order.id); setShowOrderDropdown(false); }}
                            >
                              {order.orderNumber}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Display existing order info if using one */}
            {existingOrderId && (
              <div className="bg-blue-50 p-3 rounded border border-blue-100">
                <p className="text-sm text-blue-800">
                  Adding session to existing order. The token number and order are fixed.
                </p>
              </div>
            )}
            
            {/* Comments Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Comments</label>
              <textarea 
                className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
                placeholder="Add any notes about this session"
              ></textarea>
            </div>
          </div>
          
          {/* Button Row */}
          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              CANCEL
            </button>
            <button
              onClick={handleSubmit}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              disabled={createSessionMutation.isPending}
            >
              {createSessionMutation.isPending ? (
                <>
                  <span className="inline-block h-4 w-4 border-2 border-t-white rounded-full animate-spin mr-2"></span>
                  Creating...
                </>
              ) : (
                'CREATE SESSION'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 