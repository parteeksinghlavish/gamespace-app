'use client';

import React, { useState } from 'react';
import { api } from '~/trpc/react';
import { SessionStatus, PaymentStatus } from '~/lib/constants';
import { roundTimeToCharge, calculatePrice, calculateSessionCost } from "~/lib/pricing";
// @ts-ignore
import NewSessionModal from './NewSessionModal';
// @ts-ignore
import CommentEditModal from './CommentEditModal';
import BillModal from './BillModal';
import UnpaidBillsContent from './UnpaidBillsContent';
import { useBillingManager } from '~/lib/hooks/useBillingManager';
// @ts-ignore
import NewFoodOrderModal from './NewFoodOrderModal';

// Helper functions
function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function calculateDuration(startTime: Date | string): string {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const now = new Date();
  const durationInMinutes = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60));
  return `${durationInMinutes}m`;
}

function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `₹${num.toFixed(2)}`;
}

// Replace old extractFoodItems
function extractFoodItems(notes: string): { foodItems: Array<{ displayName: string; quantity: number; price: number; total: number }>; otherNotes: string } {
  let otherNotes = notes;
  const map = new Map<string, { displayName: string; quantity: number; price: number; total: number }>();
  
  // Capture the block after 'Food items:'
  const blockMatch = notes.match(/Food items:\s*([\s\S]*)$/);
  if (blockMatch && blockMatch[1]) {
    const block = blockMatch[1];
    // Match patterns like '2x Red Sauce Pasta - Regular (₹199)'
    // Regex groups: 1: quantity, 2: name, 3: price
    const pattern = /(\d+)x\s+(.+?)\s*\(₹(\d+(?:\.\d+)?)\)/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(block)) !== null) {
      const qty = parseInt(m[1]!, 10);
      const name = m[2]!.trim(); // This is the clean item name, e.g., "Red Sauce Pasta - Regular"
      const price = parseFloat(m[3]!);
      
      // Use the full name (including variant, if any) and price for the key to ensure accurate grouping
      const key = `${name.toLowerCase().trim()}_${price.toFixed(2)}`;
      
      if (map.has(key)) {
        const entry = map.get(key)!;
        entry.quantity += qty;
        entry.total = entry.quantity * entry.price;
        // entry.displayName is already the clean 'name' from when it was first added
      } else {
        // Ensure displayName is set to the clean 'name'
        map.set(key, { displayName: name, quantity: qty, price, total: qty * price });
      }
    }
    // Remove the food items block from notes after processing
    otherNotes = notes.replace(/Food items:\s*[\s\S]*$/, '').trim();
  }
  return { foodItems: Array.from(map.values()), otherNotes };
}

// Calculate cost for active sessions
function calculateCost(startTime: Date | string, hourlyRate: number, deviceType: string, playerCount: number): number {
  // For Frame devices, cost is Rs 50 * player count
  if (deviceType === "FRAME") {
    return 50 * playerCount;
  }
  
  const now = new Date();
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const durationInMinutes = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60));
  
  try {
    // Use the calculatePrice function for consistency with other parts of the app
    return calculatePrice(
      deviceType as any,
      playerCount,
      durationInMinutes
    );
  } catch (error) {
    console.error("Error calculating price:", error);
    // Fallback to legacy calculation if there's an error, but still use rounded time
    const roundedTime = roundTimeToCharge(durationInMinutes);
    return (Number(hourlyRate) / 60) * roundedTime;
  }
}

export default function PlayerManagementContent() {
  const [activeTab, setActiveTab] = useState<'today' | 'unpaid'>('today');
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [showFoodOrderModal, setShowFoodOrderModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [editingPlayerCount, setEditingPlayerCount] = useState<number | null>(null);
  const [newPlayerCount, setNewPlayerCount] = useState<number>(1);
  
  // Use our centralized billing hook for bill-related operations
  const {
    showBillModal: billModalOpen,
    selectedBillId,
    generateBillForToken,
    generateBillForOrder,
    handleBillModalClose, 
    handleBillUpdated
  } = useBillingManager();

  // Query to fetch today's sessions
  const {
    data: tokens,
    isLoading,
    error,
    refetch,
  } = api.playerManagement.getTodaySessions.useQuery(undefined, {
    refetchInterval: 30000, // Refetch every 30 seconds to keep data updated
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  // Mutations
  const utils = api.useUtils();

  // Define food order mutation at the top level
  const createFoodOrderMutation = api.playerManagement.createOrder.useMutation({
    onSuccess: (newOrder) => {
      showToast(`Food order placed successfully!`, 'success');
      setShowFoodOrderModal(false);
      setLocalOrderId(null);
      // Refetch data to update UI
      refetch();
    },
    onError: (error) => {
      showToast(`Error creating food order: ${error.message}`, 'error');
    }
  });

  // Add a new mutation for adding food items to an existing order
  const addFoodToOrderMutation = api.playerManagement.addFoodToOrder.useMutation({
    onSuccess: () => {
      showToast("Food items added to order successfully!", 'success');
      setShowFoodOrderModal(false);
      setLocalOrderId(null);
      refetch();
    },
    onError: (error) => {
      showToast(`Error adding food items: ${error.message}`, 'error');
    }
  });

  const endSessionMutation = api.playerManagement.endSession.useMutation({
    onSuccess: () => {
      // Invalidate and refetch all relevant queries
      refetch();
      utils.playerManagement.getAvailableDevices.invalidate();
      utils.playerManagement.getAllDevices.invalidate();
      showToast('Session ended', 'success');
    },
    onError: (error) => {
      showToast('Error ending session: ' + error.message, 'error');
    },
  });

  const generateBillMutation = api.playerManagement.generateBill.useMutation({
    onSuccess: () => {
      showToast('Bill generated successfully', 'success');
    },
    onError: (error) => {
      showToast('Error generating bill: ' + error.message, 'error');
    },
  });

  const updatePlayerCountMutation = api.playerManagement.updatePlayerCount.useMutation({
    onSuccess: () => {
      // Invalidate and refetch all relevant queries
      utils.playerManagement.getTodaySessions.invalidate();
      utils.playerManagement.getAvailableDevices.invalidate();
      utils.playerManagement.getAllDevices.invalidate();
      refetch();
      showToast('Player count updated', 'success');
      setEditingPlayerCount(null);
    },
    onError: (error) => {
      showToast('Error updating player count: ' + error.message, 'error');
    },
  });

  const generateOrderBillMutation = api.playerManagement.generateBillForOrder.useMutation({
    onSuccess: () => {
      showToast('Bill generated successfully', 'success');
      refetch();
    },
    onError: (error) => {
      showToast(`Error generating bill: ${error.message}`, 'error');
    }
  });

  // Simple toast notification
  const showToast = (message: string, type: 'success' | 'error') => {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 p-4 rounded-md text-white ${
      type === 'success' ? 'bg-green-500' : 'bg-red-500'
    } shadow-lg z-50`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('opacity-0', 'transition-opacity', 'duration-500');
      setTimeout(() => document.body.removeChild(toast), 500);
    }, 3000);
  };

  // Local state for session management
  const [localOrderId, setLocalOrderId] = useState<string | null>(null);
  
  // Handlers
  const handleEndSession = (sessionId: number) => {
    endSessionMutation.mutate({ sessionId });
  };

  const handleCommentEdit = (session: any) => {
    setSelectedSession(session);
    setShowCommentModal(true);
  };

  const handleGenerateBill = (tokenId: number) => {
    // Use the centralized billing manager
    generateBillForToken(tokenId);
  };

  const handleGenerateOrderBill = (orderId: string) => {
    // Use the centralized billing manager
    generateBillForOrder(orderId);
  };

  const handleAddToOrder = (orderId: string) => {
    setLocalOrderId(orderId);
    setShowNewSessionModal(true);
  };

  const handleCreateNewSession = () => {
    setLocalOrderId(null);
    setShowNewSessionModal(true);
  };

  const handleEditPlayerCount = (session: any) => {
    setEditingPlayerCount(session.id);
    setNewPlayerCount(session.playerCount);
  };

  const handleSavePlayerCount = (sessionId: number) => {
    updatePlayerCountMutation.mutate({
      sessionId,
      playerCount: newPlayerCount
    });
  };

  const handleCancelEditPlayerCount = () => {
    setEditingPlayerCount(null);
  };

  // Handle button click to create new food order
  const handleCreateNewFoodOrder = () => {
    setLocalOrderId(null);
    setShowFoodOrderModal(true);
  };

  // Handle adding food to an existing order
  const handleAddFoodToOrder = (orderId: string) => {
    setLocalOrderId(orderId);
    setShowFoodOrderModal(true);
  };

  // Filter tokens to show only those with active sessions or no completed bills
  const activeOrPendingTokens = tokens?.filter((token: any) => {
    // Check if token has any active sessions
    const hasActiveSession = token.sessions.some((session: any) => session.status === SessionStatus.ACTIVE);
    
    // If token has active sessions, always show it
    if (hasActiveSession) return true;
    
    // Check if token has any bills marked as PAID or DUE
    const hasCompletedBill = token.bills?.some((bill: any) => 
      bill.status === 'PAID' || bill.status === 'DUE'
    );
    
    // Only show tokens without completed bills (either no bills or only PENDING bills)
    return !hasCompletedBill;
  });

  // Show the appropriate content based on the active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'today':
        return renderTodaySessions();
      case 'unpaid':
        return <UnpaidBillsContent />;
      default:
        return renderTodaySessions();
    }
  };

  // Render the "Today's Sessions" tab content
  const renderTodaySessions = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-4 bg-red-50 text-red-800 rounded-md">
          <p className="font-bold">Error loading sessions: {error.message}</p>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-5 border-b border-gray-200 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-800">Today's Sessions</h2>
        </div>

        {activeOrPendingTokens && activeOrPendingTokens.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">No active sessions found for today</h3>
            <p className="text-gray-500 mb-6">Start by creating a new gaming session</p>
            <button
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center mx-auto"
              onClick={handleCreateNewSession}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Session
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {activeOrPendingTokens?.map((token: any) => (
              <div key={token.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="flex justify-end items-center px-6 py-4 border-b border-gray-200">
                  {/* Remove the New Session button here entirely */}
                </div>
                
                {/* Group sessions by orders */}
                {token.orders && token.orders.length > 0 ? (
                  // Show orders
                  <div className="space-y-4 p-4">
                    {token.orders.map((order: any) => (
                      <div key={order.id} className="border border-gray-100 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 flex justify-between items-center">
                          <div className="flex items-center space-x-4">
                            {/* Order display with token number */}
                            <div className="flex items-center">
                              <div className="bg-blue-100 text-blue-600 font-semibold rounded-full h-10 w-10 flex items-center justify-center">
                                {token.tokenNo}
                              </div>
                            </div>
                            
                            {/* Order display */}
                            <div>
                              <span className="text-xs font-medium text-gray-500">Order</span>
                              <h3 className="text-base font-medium text-gray-800">{order.orderNumber}</h3>
                            </div>
                          </div>
                          
                          <div className="flex space-x-3 items-center">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              order.status === 'ACTIVE' 
                                ? 'bg-green-100 text-green-800' 
                                : order.status === 'COMPLETED' 
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-red-100 text-red-800'
                            }`}>
                              {order.status}
                            </span>
                            
                            {order.status === 'ACTIVE' && (
                              <button
                                className="bg-blue-500 text-white hover:bg-blue-600 px-3 py-2 rounded font-medium flex items-center"
                                onClick={() => handleAddToOrder(order.id)}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Session
                              </button>
                            )}
                            
                            {order.status === 'ACTIVE' && (
                              <button
                                className="bg-orange-500 text-white hover:bg-orange-600 px-3 py-2 rounded font-medium flex items-center ml-2"
                                onClick={() => handleAddFoodToOrder(order.id)}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Add Food
                              </button>
                            )}
                            
                            <button
                              className="bg-orange-500 text-white hover:bg-orange-600 px-3 py-2 rounded font-medium flex items-center"
                              onClick={() => handleGenerateOrderBill(order.id)}
                              disabled={generateOrderBillMutation.isPending}
                            >
                              {generateOrderBillMutation.isPending && order.id === generateOrderBillMutation.variables?.orderId ? (
                                <span className="inline-block h-4 w-4 border-2 border-t-white rounded-full animate-spin mr-1"></span>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                </svg>
                              )}
                              Bill
                            </button>
                          </div>
                        </div>
                        
                        {/* Order sessions */}
                        {order.sessions && order.sessions.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead>
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Device</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Players</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">In Time</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Duration</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Cost</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Comments</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Status</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {order.sessions.map((session: any) => (
                                  <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                                      <span className="font-medium text-gray-800">{session.device.type} {session.device.counterNo}</span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                      {session.status === SessionStatus.ACTIVE && 
                                      session.device.type === "FRAME" ? (
                                        editingPlayerCount === session.id ? (
                                          <div className="flex items-center space-x-2">
                                            <input
                                              type="number"
                                              min="1"
                                              max={session.device.maxPlayers}
                                              value={newPlayerCount}
                                              onChange={(e) => setNewPlayerCount(parseInt((e.target as HTMLInputElement).value))}
                                              className="w-12 p-1 border rounded"
                                            />
                                            <button
                                              onClick={() => handleSavePlayerCount(session.id)}
                                              className="text-green-500 hover:text-green-700"
                                            >
                                              ✓
                                            </button>
                                            <button
                                              onClick={handleCancelEditPlayerCount}
                                              className="text-red-500 hover:text-red-700"
                                            >
                                              ✗
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center">
                                            <span>{session.playerCount}</span>
                                            <button
                                              className="ml-2 text-xs"
                                              onClick={() => handleEditPlayerCount(session)}
                                            >
                                              ✏️
                                            </button>
                                          </div>
                                        )
                                      ) : (
                                        session.playerCount
                                      )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{formatTime(session.startTime)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                      {session.status === SessionStatus.ACTIVE
                                        ? calculateDuration(session.startTime)
                                        : `${session.duration}m`}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                      {session.status === SessionStatus.ACTIVE
                                        ? `₹${calculateCost(
                                            session.startTime,
                                            session.device.hourlyRate,
                                            session.device.type,
                                            session.playerCount
                                          ).toFixed(2)}`
                                        : session.device.type === "FRAME"
                                          ? `₹${(50 * session.playerCount).toFixed(2)}`
                                          : formatCurrency(session.cost)}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                      <div className="flex items-center">
                                        <span className="truncate max-w-[150px]">
                                          {session.comments || '-'}
                                        </span>
                                        <button
                                          className="ml-2 text-xs"
                                          onClick={() => handleCommentEdit(session)}
                                        >
                                          ✏️
                                        </button>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                      <span
                                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                          session.status === SessionStatus.ACTIVE
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-red-100 text-red-800'
                                        }`}
                                      >
                                        {session.status}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                      {session.status === SessionStatus.ACTIVE ? (
                                        <button
                                          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center"
                                          onClick={() => handleEndSession(session.id)}
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                          End Session
                                        </button>
                                      ) : (
                                        <span className="text-gray-500 text-xs">Session ended</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="p-4 text-center text-gray-500">
                            No sessions in this order
                          </div>
                        )}
                        
                        {/* Display Food Items in a table format */}
                        {(() => {
                          if (!order.notes) return null;
                          const { foodItems, otherNotes } = extractFoodItems(order.notes);
                          console.log('Parsed foodItems (from extractFoodItems):', JSON.stringify(foodItems)); // Enhanced logging
                          if (foodItems.length === 0) return null;
                          
                          // Combine duplicates by displayName AND price for robust aggregation
                          const grouped = new Map<string, { displayName: string; quantity: number; price: number; total: number }>();
                          foodItems.forEach(item => {
                            // Use a key that includes both displayName (case-insensitive) and price (fixed to 2 decimal places)
                            const key = `${item.displayName.toLowerCase()}_${item.price.toFixed(2)}`;
                            if (grouped.has(key)) {
                              const e = grouped.get(key)!;
                              e.quantity += item.quantity;
                              // Total is based on the consistent price for this key
                              e.total = e.quantity * e.price; 
                            } else {
                              // Spread item to ensure all properties are copied correctly
                              grouped.set(key, { ...item });
                            }
                          });
                          const displayItems = Array.from(grouped.values());
                          console.log('Displayable foodItems (after render-time grouping):', JSON.stringify(displayItems)); // Enhanced logging

                          return (
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead>
                                  <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Device</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Item</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Price</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Quantity</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Total</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Comments</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {displayItems.map((item, idx) => (
                                    <tr key={`food-${idx}`} className="hover:bg-gray-50 transition-colors">
                                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                                        <span className="font-medium text-gray-800">Food</span>
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                        {item.displayName}
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                        ₹{item.price.toFixed(2)}
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                        {item.quantity}pc
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                        ₹{item.total.toFixed(2)}
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">-</td>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">ACTIVE</span>
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">-</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                ) : (
                  // Legacy view for sessions without orders
                  <div className="overflow-x-auto px-6 py-3">
                    <div className="mb-4 flex justify-between items-center">
                      <div className="flex items-center">
                        <div className="bg-blue-100 text-blue-600 font-semibold rounded-full h-10 w-10 flex items-center justify-center mr-3">
                          {token.tokenNo}
                        </div>
                        <h3 className="text-base font-medium text-gray-800">No Order ID</h3>
                      </div>
                      
                      <button
                        className="bg-orange-500 text-white hover:bg-orange-600 px-3 py-2 rounded font-medium flex items-center"
                        onClick={() => handleGenerateBill(token.id)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                        </svg>
                        Generate Bill
                      </button>
                    </div>
                    
                    <table className="min-w-full divide-y divide-gray-200 rounded-lg overflow-hidden">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 rounded-tl-lg">Token</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Device</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Players</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">In Time</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Duration</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Cost</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Comments</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 rounded-tr-lg">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {token.sessions
                          .filter((session: any) => !session.orderId) // Only show sessions without an order
                          .map((session: any) => (
                          <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{token.tokenNo}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                              <span className="font-medium text-gray-800">{session.device.type} {session.device.counterNo}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                              {session.playerCount}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{formatTime(session.startTime)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                              {session.status === SessionStatus.ACTIVE
                                ? calculateDuration(session.startTime)
                                : `${session.duration}m`}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                              {session.status === SessionStatus.ACTIVE
                                ? `₹${calculateCost(
                                    session.startTime,
                                    session.device.hourlyRate,
                                    session.device.type,
                                    session.playerCount
                                  ).toFixed(2)}`
                                : session.device.type === "FRAME"
                                  ? `₹${(50 * session.playerCount).toFixed(2)}`
                                  : formatCurrency(session.cost)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                              <div className="flex items-center">
                                <span className="truncate max-w-[150px]">
                                  {session.comments || '-'}
                                </span>
                                <button
                                  className="ml-2 text-xs"
                                  onClick={() => handleCommentEdit(session)}
                                >
                                  ✏️
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                              <span
                                className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  session.status === SessionStatus.ACTIVE
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {session.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                              {session.status === SessionStatus.ACTIVE ? (
                                <button
                                  className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center"
                                  onClick={() => handleEndSession(session.id)}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                  End Session
                                </button>
                              ) : (
                                <span className="text-gray-500 text-xs">Session ended</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tokens && activeOrPendingTokens && tokens.length > activeOrPendingTokens.length && (
          <div className="mt-4 mb-2">
            <div className="flex items-center bg-blue-50 rounded-lg p-4 text-blue-800 border border-blue-100 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">
                <span className="font-medium">{tokens.length - activeOrPendingTokens.length} completed</span> token{tokens.length - activeOrPendingTokens.length !== 1 ? 's' : ''} with paid/due bills {tokens.length - activeOrPendingTokens.length !== 1 ? 'are' : 'is'} hidden. These token numbers are available for new sessions.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 py-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <span className="text-xs font-medium text-blue-600 uppercase tracking-wider">Dashboard</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-1">Gaming Sessions</h1>
        </div>
        <div className="flex items-center space-x-3">
          <button
            className="bg-white hover:bg-gray-50 p-2.5 rounded-lg transition-colors shadow-sm border border-gray-200"
            onClick={() => {
              // Invalidate and refetch all relevant queries for immediate data update
              utils.playerManagement.getTodaySessions.invalidate();
              utils.playerManagement.getAvailableDevices.invalidate();
              utils.playerManagement.getAllDevices.invalidate();
              utils.playerManagement.getUnpaidBills.invalidate();
              refetch();
            }}
            aria-label="Refresh"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center shadow-sm"
            onClick={handleCreateNewSession}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>NEW SESSION</span>
          </button>
          <button
            className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center shadow-sm"
            onClick={handleCreateNewFoodOrder}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>ADD FOOD</span>
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex">
            <button
              className={`py-4 px-6 font-medium text-sm border-b-2 ${
                activeTab === 'today'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } transition-colors`}
              onClick={() => setActiveTab('today')}
            >
              Today's Sessions
            </button>
            <button
              className={`py-4 px-6 font-medium text-sm border-b-2 ${
                activeTab === 'unpaid'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } transition-colors`}
              onClick={() => setActiveTab('unpaid')}
            >
              Unpaid Bills
            </button>
          </nav>
        </div>
      </div>

      {/* Content based on the active tab */}
      {renderContent()}

      {/* Modals */}
      {showNewSessionModal && (
        <NewSessionModal 
          isOpen={showNewSessionModal}
          onClose={() => {
            setShowNewSessionModal(false);
            setLocalOrderId(null);
          }}
          onSuccess={() => {
            refetch();
            setShowNewSessionModal(false);
            setLocalOrderId(null);
          }}
          existingOrderId={localOrderId || undefined}
          isMainButton={!localOrderId}
        />
      )}

      {showCommentModal && selectedSession && (
        <CommentEditModal
          isOpen={showCommentModal}
          onClose={() => setShowCommentModal(false)}
          session={selectedSession}
          onSuccess={() => {
            refetch();
            setShowCommentModal(false);
          }}
        />
      )}

      {billModalOpen && (
        <BillModal
          isOpen={billModalOpen}
          onClose={handleBillModalClose}
          billId={selectedBillId || undefined}
          onSuccess={handleBillUpdated}
        />
      )}

      {showFoodOrderModal && (
        <NewFoodOrderModal 
          isOpen={showFoodOrderModal}
          onClose={() => {
            setShowFoodOrderModal(false);
            setLocalOrderId(null);
          }}
          onSubmit={(order) => {
            // Find the actual token object from the token number
            const tokenObject = tokens?.find(token => token.tokenNo === order.tokenNo);
            
            if (!tokenObject) {
              showToast(`Error: Token #${order.tokenNo} not found in the system`, 'error');
              return;
            }
            
            // Format food items with quantities for better display
            const formattedItems = order.items.map((item: any) => ({
              name: `${item.quantity}x ${item.name}${item.price ? ` (₹${item.price})` : ''}`,
              price: item.price,
              quantity: item.quantity
            }));
            
            // Check if we should add to an existing order or create a new one
            if (localOrderId) {
              // We have an explicitly selected order ID, so add the food items to this order
              addFoodToOrderMutation.mutate({
                orderId: localOrderId,
                foodItems: formattedItems
              });
            } else {
              // Check if the selected token already has any active orders
              const activeOrders = tokenObject.orders?.filter(
                (order: any) => order.status === 'ACTIVE'
              );
              
              if (activeOrders && activeOrders.length > 0) {
                // Use the most recent active order (assuming first is most recent if sorted, or just pick one)
                const mostRecentOrder = activeOrders[0];
                if (mostRecentOrder) {
                  addFoodToOrderMutation.mutate({
                    orderId: mostRecentOrder.id,
                    foodItems: formattedItems
                  });
                  showToast(`Adding food to existing order ${mostRecentOrder.orderNumber}`, 'success');
                } else {
                  // This case should ideally not be reached if activeOrders.length > 0
                  showToast(`Error: Could not determine active order to add food to.`, 'error');
                }
              } else {
                // No active orders for this token, create a new one
                createFoodOrderMutation.mutate({
                  tokenId: tokenObject.id,
                  foodItems: formattedItems
                });
              }
            }
          }}
          activeTokens={tokens?.map(token => token.tokenNo) || []}
          existingOrderId={localOrderId || undefined}
        />
      )}
    </div>
  );
} 