'use client';

import React, { useState, useEffect } from 'react';
import { api } from '~/trpc/react';
import { FoodOrderStatus } from '~/lib/constants';
import NewFoodOrderModal from './NewFoodOrderModal';
import type { Token, FoodItem } from '~/types';

// Helper functions
function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `₹${num.toFixed(2)}`;
}

// Sample food order data (will be replaced with API data later)
const sampleFoodOrders = [
  {
    id: 1,
    tokenId: 1,
    tokenNo: 1,
    items: [
      {
        id: 101,
        name: 'Coffee - Cappuccino',
        price: 70,
        quantity: 2,
        total: 140,
      },
      {
        id: 102,
        name: 'Sandwich - Cheese',
        price: 80,
        quantity: 1,
        total: 80,
      }
    ],
    totalAmount: 220,
    orderTime: new Date(new Date().getTime() - 30 * 60000), // 30 minutes ago
    status: FoodOrderStatus.DELIVERED,
  },
  {
    id: 2,
    tokenId: 2,
    tokenNo: 2,
    items: [
      {
        id: 103,
        name: 'Pizza - Margherita',
        price: 250,
        quantity: 1,
        total: 250,
      },
      {
        id: 104,
        name: 'Cola',
        price: 40,
        quantity: 2,
        total: 80,
      }
    ],
    totalAmount: 330,
    orderTime: new Date(new Date().getTime() - 15 * 60000), // 15 minutes ago
    status: FoodOrderStatus.PREPARING,
  },
  {
    id: 3,
    tokenId: 3,
    tokenNo: 3,
    items: [
      {
        id: 105,
        name: 'French Fries - Cheese Loaded',
        price: 120,
        quantity: 1,
        total: 120,
      }
    ],
    totalAmount: 120,
    orderTime: new Date(new Date().getTime() - 5 * 60000), // 5 minutes ago
    status: FoodOrderStatus.ORDERED,
  }
];

export default function FoodOrdersContent() {
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [activeTokens, setActiveTokens] = useState<number[]>([]);
  
  // Get all active tokens from player management
  // This will be replaced with real API call
  const { data: tokens, isLoading: isTokensLoading } = api.playerManagement.getTodaySessions.useQuery(undefined, {
    refetchInterval: 30000, // Refetch every 30 seconds to keep data updated
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  // Extract token numbers from the data
  useEffect(() => {
    if (tokens) {
      // Extract the token numbers for all active tokens
      const tokenNumbers = tokens.map((token) => token.tokenNo);
      setActiveTokens(tokenNumbers);
    }
  }, [tokens]);
  
  // Mutations and API utils
  const utils = api.useUtils();
  
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
  
  // Handler for submitting a new food order
  const handleSubmitFoodOrder = (order: {
    tokenId: number;
    tokenNo: number;
    items: FoodItem[];
    totalAmount: number;
  }) => {
    // Here we would call the API to submit the order
    console.log('Order submitted:', order);
    
    // For now, we'll just show a success toast and close the modal
    showToast(`Order for token #${order.tokenNo} placed successfully!`, 'success');
    setShowNewOrderModal(false);
    
    // In a real implementation, we would invalidate and refetch food orders
    // void utils.foodOrders.getOrders.invalidate();
  };
  
  // Handler for generating bill for a token
  const handleGenerateBill = (tokenId: number) => {
    // This should be similar to the player management bill generation
    // but should include both game and food items
    showToast(`Generating bill for token ${tokenId}`, 'success');
  };
  
  // Handler for updating food order status
  const handleUpdateStatus = (orderId: number, status: FoodOrderStatus) => {
    // Will be replaced with real API call
    showToast(`Updated order ${orderId} status to ${status}`, 'success');
  };

  // Filter orders that are not paid
  const activeOrders = sampleFoodOrders.filter(order => order.status !== FoodOrderStatus.PAID);
  
  // Group orders by token
  const ordersByToken = activeOrders.reduce((acc, order) => {
    acc[order.tokenNo] ??= [];
    acc[order.tokenNo]!.push(order);
    return acc;
  }, {} as Record<number, typeof activeOrders>);

  if (isTokensLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <span className="text-xs font-medium text-blue-600 uppercase tracking-wider">Dashboard</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-1">Food Orders</h1>
        </div>
        <div className="flex items-center space-x-3">
          <button
            className="bg-white hover:bg-gray-50 p-2.5 rounded-lg transition-colors shadow-sm border border-gray-200"
            onClick={() => {
              // Invalidate and refetch data
              void utils.playerManagement.getTodaySessions.invalidate();
            }}
            aria-label="Refresh"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center shadow-sm"
            onClick={() => setShowNewOrderModal(true)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>NEW ORDER</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-5 border-b border-gray-200 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-800">Today&apos;s Food Orders</h2>
        </div>

        {Object.keys(ordersByToken).length === 0 ? (
          <div className="p-12 text-center">
            <div className="mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">No food orders found for today</h3>
            <p className="text-gray-500 mb-6">Start by creating a new food order</p>
            <button
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center mx-auto"
              onClick={() => setShowNewOrderModal(true)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Order
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {Object.entries(ordersByToken).map(([tokenNo, orders]) => (
              <div key={tokenNo} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center">
                    <div className="bg-blue-100 text-blue-600 font-semibold rounded-full h-10 w-10 flex items-center justify-center mr-3">
                      {tokenNo}
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Token Number</span>
                      <h2 className="text-lg font-semibold text-gray-800">#{tokenNo}</h2>
                    </div>
                  </div>
                  <button
                    className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-4 py-2.5 rounded-lg flex items-center transition-colors shadow-sm"
                    onClick={() => handleGenerateBill(parseInt(tokenNo))}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                    </svg>
                    <span className="font-medium">Generate Bill</span>
                  </button>
                </div>
                
                <div className="overflow-x-auto px-6 py-3">
                  <table className="min-w-full divide-y divide-gray-200 rounded-lg overflow-hidden">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 rounded-tl-lg">Order ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Items</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Time</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Total</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 rounded-tr-lg">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {orders.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">#{order.id}</td>
                          <td className="px-4 py-3 text-sm">
                            <div>
                              {order.items.map((item, index) => (
                                <div key={item.id} className={index !== 0 ? "mt-1" : ""}>
                                  <span className="font-medium text-gray-800">{item.name}</span>
                                  <span className="text-gray-500 ml-2">
                                    ({item.quantity} × {formatCurrency(item.price)})
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                            {formatTime(order.orderTime)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-800">
                            {formatCurrency(order.totalAmount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                            <span
                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                order.status === FoodOrderStatus.ORDERED
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : order.status === FoodOrderStatus.PREPARING
                                  ? 'bg-blue-100 text-blue-800'
                                  : order.status === FoodOrderStatus.DELIVERED
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {order.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                            <div className="flex space-x-2">
                              {order.status === FoodOrderStatus.ORDERED && (
                                <button
                                  className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center"
                                  onClick={() => handleUpdateStatus(order.id, FoodOrderStatus.PREPARING)}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                  </svg>
                                  Preparing
                                </button>
                              )}
                              {order.status === FoodOrderStatus.PREPARING && (
                                <button
                                  className="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center"
                                  onClick={() => handleUpdateStatus(order.id, FoodOrderStatus.DELIVERED)}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Delivered
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNewOrderModal && (
        <NewFoodOrderModal
          isOpen={showNewOrderModal}
          onClose={() => setShowNewOrderModal(false)}
          onSubmit={handleSubmitFoodOrder}
          activeTokens={activeTokens}
        />
      )}
    </div>
  );
} 