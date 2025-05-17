'use client';

import React, { useState, useEffect } from 'react';
import { api } from '~/trpc/react';
import { SessionStatus, PaymentStatus, OrderStatus } from '~/lib/constants';
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
    // Regex groups: 1: quantity, 2: name part, 3: price
    const pattern = /(\d+)x\s+(.+?)\s*\(₹(\d+(?:\.\d+)?)\)/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(block)) !== null) {
      const qty = parseInt(m[1]!, 10); // This is the quantity for the current item entry in notes
      const namePartFromRegex = m[2]!.trim(); // This might be "Actual Name" or "Nx Actual Name" if notes are malformed
      const price = parseFloat(m[3]!);
      
      let actualBaseName = namePartFromRegex;
      // Check if namePartFromRegex itself has a "Nx " prefix (due to malformed notes from backend)
      // Example: namePartFromRegex could be "1x Pasta - Regular"
      const innerPrefixMatch = namePartFromRegex.match(/^(\d+)x\s+(.+)/);
      if (innerPrefixMatch && innerPrefixMatch[2]) {
        // If it was "1x Pasta - Regular", innerPrefixMatch[2] is "Pasta - Regular"
        actualBaseName = innerPrefixMatch[2].trim();
      }
      // Now actualBaseName is the clean item name, e.g., "Pasta - Regular"

      const key = `${actualBaseName.toLowerCase()}_${price.toFixed(2)}`;
      
      if (map.has(key)) {
        const entry = map.get(key)!;
        entry.quantity += qty; // Add the quantity from the current item string in notes
        entry.total = entry.quantity * entry.price;
      } else {
        // Use actualBaseName for displayName and qty from the current item string
        map.set(key, { displayName: actualBaseName, quantity: qty, price, total: qty * price });
      }
    }
    // Remove the food items block from notes after processing
    otherNotes = notes.replace(/Food items:\s*[\s\S]*$/, '').trim();
  }
  return { foodItems: Array.from(map.values()), otherNotes };
}

// START OF SIMPLIFIED HELPER FUNCTION
// Using any for token type due to import issues with RouterOutputs
function isTokenEffectivelyBusy(token: any): boolean {
  if (!token || typeof token !== 'object') return false;

  // 1. Check for active gaming sessions
  if (token.sessions && Array.isArray(token.sessions) && token.sessions.some((session: any) => session && session.status === SessionStatus.ACTIVE)) {
    return true;
  }

  // 2. Check for specific order conditions
  if (token.orders && Array.isArray(token.orders)) {
    const hasBusyOrder = token.orders.some((order: any) => {
      if (order && order.status === OrderStatus.ACTIVE) {
        // Pure food order (ACTIVE order with no gaming sessions)
        if (!order.sessions || order.sessions.length === 0) {
          return true;
        }
        // ACTIVE order where all its gaming sessions are ENDED
        if (order.sessions && Array.isArray(order.sessions) && order.sessions.every((session: any) => session && session.status === SessionStatus.ENDED)) {
          return true;
        }
      }
      return false;
    });
    if (hasBusyOrder) {
      return true;
    }
  }

  // 3. Check for PENDING bills
  // Token's own bills (directly on the token object)
  if (token.bills && Array.isArray(token.bills) && token.bills.some((bill: any) => bill && bill.status === PaymentStatus.PENDING)) {
    return true;
  }

  // Bills associated with orders of this token
  if (token.orders && Array.isArray(token.orders)) {
    const hasPendingOrderBill = token.orders.some((order: any) =>
      order && order.bills && Array.isArray(order.bills) && order.bills.some((bill: any) => bill && bill.status === PaymentStatus.PENDING)
    );
    if (hasPendingOrderBill) {
      return true;
    }
  }

  return false;
}
// END OF SIMPLIFIED HELPER FUNCTION

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

// New component to edit food items for an order
function FoodItemsEditor({ order, showToast, refetch }: { order: any; showToast: (message: string, type: 'success' | 'error') => void; refetch: () => Promise<any>; }) {
  type EditableFoodItem = { displayName: string; quantity: number; price: number; total: number };
  const initialItems: EditableFoodItem[] = extractFoodItems(order.notes || '').foodItems;
  const [items, setItems] = useState(initialItems);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [newQuantity, setNewQuantity] = useState<number>(1);

  // Sync with order.notes updates
  useEffect(() => {
    setItems(extractFoodItems(order.notes || '').foodItems as EditableFoodItem[]);
  }, [order.notes]);

  const updateFoodMutation = api.playerManagement.updateFoodItems.useMutation({
    onSuccess: () => {
      showToast('Food order updated successfully', 'success');
      refetch();
    },
    onError: (error) => {
      showToast(`Error updating food order: ${error.message}`, 'error');
    }
  });

  const handleEditQuantity = (idx: number) => {
    setEditingItemId(idx);
    setNewQuantity(items[idx]?.quantity || 1);
  };

  const handleSaveQuantity = (idx: number) => {
    const newItems = [...items];
    const item = newItems[idx]!;
    newItems[idx] = { ...item, quantity: newQuantity, total: item.price * newQuantity };
    setItems(newItems);
    
    updateFoodMutation.mutate({
      orderId: order.id,
      foodItems: newItems.map(item => ({ name: item.displayName, price: item.price, quantity: item.quantity }))
    });
    
    setEditingItemId(null);
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
  };

  const handleRemove = (idx: number) => {
    const newItems = items.filter((_, i) => i !== idx);
    setItems(newItems);
    updateFoodMutation.mutate({
      orderId: order.id,
      foodItems: newItems.map(item => ({ name: item.displayName, price: item.price, quantity: item.quantity }))
    });
  };

  if (items.length === 0) return null;

  return (
    <div className="border-t border-gray-200 mt-4">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-orange-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-sm font-medium text-gray-700">Food Items</h3>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Item Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Price</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Quantity</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Total</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((item, idx) => (
              <tr key={`food-${idx}`} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{item.displayName}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">₹{item.price.toFixed(2)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                  {editingItemId === idx ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="1"
                        value={newQuantity}
                        onChange={(e) => setNewQuantity(parseInt(e.currentTarget.value) || 1)}
                        className="w-16 p-1 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        onClick={() => handleSaveQuantity(idx)}
                        className="text-green-500 hover:text-green-700"
                      >
                        ✓
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="text-red-500 hover:text-red-700"
                      >
                        ✗
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <span>{item.quantity}</span>
                      <button
                        className="ml-2 text-xs"
                        onClick={() => handleEditQuantity(idx)}
                      >
                        ✏️
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">₹{item.total.toFixed(2)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                  <button
                    onClick={() => handleRemove(idx)}
                    className="text-red-500 hover:text-red-700 font-medium text-xs flex items-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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

  // Placeholder for new mutation - this will need to be implemented in the backend router
  const createTokenAndOrderForFoodMutation = api.playerManagement.createTokenAndOrderForFood.useMutation({
    onSuccess: (newOrder) => {
      showToast(`Food order placed for new token successfully! Order: ${newOrder.orderNumber}`, 'success');
      setShowFoodOrderModal(false);
      setLocalOrderId(null);
      setLocalTokenNoForFoodModal(undefined);
      refetch();
    },
    onError: (error) => {
      showToast(`Error creating food order for new token: ${error.message}`, 'error');
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
  const [localTokenNoForFoodModal, setLocalTokenNoForFoodModal] = useState<number | undefined>(undefined);
  
  const busyTokenNumbers = tokens
    ?.filter(token => isTokenEffectivelyBusy(token))
    .map(token => token.tokenNo) || [];
  
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
  const handleAddFoodToOrder = (orderId: string, tokenNo: number) => {
    setLocalOrderId(orderId);
    setLocalTokenNoForFoodModal(tokenNo); // Store the tokenNo for the modal
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
                                className="bg-blue-500 text-white hover:bg-blue-600 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center"
                                onClick={() => handleAddToOrder(order.id)}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Session
                              </button>
                            )}
                            
                            {order.status === 'ACTIVE' && (
                              <button
                                className="bg-orange-500 text-white hover:bg-orange-600 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center ml-2"
                                onClick={() => handleAddFoodToOrder(order.id, token.tokenNo)}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Add Food
                              </button>
                            )}
                            
                            <button
                              className="bg-orange-500 text-white hover:bg-orange-600 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center"
                              onClick={() => handleGenerateOrderBill(order.id)}
                              disabled={generateOrderBillMutation.isPending}
                            >
                              {generateOrderBillMutation.isPending && order.id === generateOrderBillMutation.variables?.orderId ? (
                                <span className="inline-block h-1.5 w-1.5 border-2 border-t-white rounded-full animate-spin mr-1"></span>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                                          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center"
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
                        <FoodItemsEditor order={order} showToast={showToast} refetch={refetch} />
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
                        className="bg-orange-500 text-white hover:bg-orange-600 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center"
                        onClick={() => handleGenerateBill(token.id)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                                  className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center"
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
            setLocalTokenNoForFoodModal(undefined); // Reset tokenNo
          }}
          onSubmit={async (orderDataFromModal) => { 
            const formattedItems = orderDataFromModal.items.map((item: any) => ({ 
              name: item.name,
              price: item.price,
              quantity: item.quantity
            }));

            if (orderDataFromModal.tokenNo === -1) { 
              createTokenAndOrderForFoodMutation.mutate({
                foodItems: formattedItems
              });
            } else if (localOrderId) {
              addFoodToOrderMutation.mutate({
                orderId: localOrderId,
                foodItems: formattedItems
              });
            } else {
              const selectedTokenNoFromModal = orderDataFromModal.tokenNo;
              try {
                await utils.playerManagement.getTodaySessions.refetch(); 
                const allTokensAfterRefetch = utils.playerManagement.getTodaySessions.getData(); 

                const matchingTokenInstances = allTokensAfterRefetch?.filter(t => t.tokenNo === selectedTokenNoFromModal);

                let tokenObjectAfterRefetch = null;
                if (matchingTokenInstances && matchingTokenInstances.length > 0) {
                  if (matchingTokenInstances.length === 1) {
                    tokenObjectAfterRefetch = matchingTokenInstances[0];
                  } else {
                    matchingTokenInstances.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    tokenObjectAfterRefetch = matchingTokenInstances[0];
                  }
                }
                
                if (!tokenObjectAfterRefetch) {
                  showToast(`Error: Token #${selectedTokenNoFromModal} not found after refetch.`, 'error');
                  console.error(`[PlayerManagementContent] onSubmit: Token #${selectedTokenNoFromModal} not found in refetched data after attempting to find the most recent instance.`);
                  return;
                }

                const activeOrders = tokenObjectAfterRefetch.orders?.filter(
                  (o: any) => o.status === 'ACTIVE'
                ).sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()); 

                if (activeOrders && activeOrders.length > 0) {
                  const mostRecentActiveOrder = activeOrders[0];
                  if (mostRecentActiveOrder) {
                    addFoodToOrderMutation.mutate({ 
                      orderId: mostRecentActiveOrder.id,
                      foodItems: formattedItems
                    });
                  } else {
                    // This case should ideally not be hit if activeOrders.length > 0
                    // but as a safeguard, create a new order for the token if mostRecentActiveOrder is somehow null
                    console.warn(`[PlayerManagementContent] onSubmit: activeOrders array had items, but mostRecentActiveOrder was unexpectedly null for token #${selectedTokenNoFromModal}. Order will be created for token ID ${tokenObjectAfterRefetch.id}`);
                    createFoodOrderMutation.mutate({
                      tokenId: tokenObjectAfterRefetch.id, 
                      foodItems: formattedItems,
                    });
                  }
                } else {
                  createFoodOrderMutation.mutate({
                    tokenId: tokenObjectAfterRefetch.id, 
                    foodItems: formattedItems,
                  });
                }
              } catch (e: any) {
                showToast(`Error processing food order: ${e.message}`, 'error');
                console.error("[PlayerManagementContent] onSubmit: General error during food order submission:", e);
              }
            }
          }}
          activeTokens={tokens?.filter(t => isTokenEffectivelyBusy(t)).map(t => t.tokenNo).sort((a,b) => a-b) ?? []}
          existingOrderId={localOrderId || undefined}
          preselectedTokenNo={localTokenNoForFoodModal}
        />
      )}
    </div>
  );
} 