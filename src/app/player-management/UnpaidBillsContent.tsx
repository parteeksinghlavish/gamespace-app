'use client';

import React, { useEffect } from 'react';
import { api } from '~/trpc/react';
import { format } from 'date-fns';
import { PaymentStatus } from '~/lib/constants';
import BillModal from './BillModal';
import { useBillingManager } from '~/lib/hooks/useBillingManager';

export default function UnpaidBillsContent() {
  // Use our centralized billing manager
  const {
    showBillModal,
    selectedBillId,
    lastRefreshTime,
    openBillById,
    handleBillModalClose,
    handleBillUpdated,
    forceRefresh,
    calculateTotalFromSessions,
    showToast,
    formatCurrency
  } = useBillingManager();

  // Query to fetch all unpaid bills
  const {
    data: unpaidBills,
    isLoading,
    error,
    refetch,
  } = api.playerManagement.getUnpaidBills.useQuery(
    undefined,
    {
      refetchInterval: 3000, // Refetch every 3 seconds for more immediate updates
      refetchOnWindowFocus: true,
      refetchOnMount: true, // Always refetch when component mounts
      refetchOnReconnect: true,
      staleTime: 0, // Consider data stale immediately to ensure fresh data
      // Force React Query to treat this as a new query whenever lastRefreshTime changes
      trpc: { context: { timestamp: lastRefreshTime.getTime() } },
    }
  );

  // Add a custom useEffect to periodically force refetch
  useEffect(() => {
    const refreshTimer = setInterval(() => {
      forceRefresh(); // Use the centralized refresh function
      console.log('Forcing refresh of unpaid bills at', new Date().toISOString());
    }, 5000); // Force refresh every 5 seconds
    
    return () => clearInterval(refreshTimer);
  }, [forceRefresh]);

  // Helper function to format date
  const formatDate = (date: Date | string | null | undefined): string => {
    if (!date) return '';
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return format(d, 'MMM dd, yyyy hh:mm a');
    } catch (error) {
      console.error("Error formatting date:", error);
      return '';
    }
  };

  // Handler for viewing and paying bill
  const handleViewBill = (billId: number) => {
    openBillById(billId);
  };

  // Add a more prominent refresh button to manually refresh the data
  const handleRefresh = () => {
    showToast('Refreshing unpaid bills...', 'success');
    forceRefresh();
  };

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
        <p className="font-bold">Error loading unpaid bills: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <span className="text-xs font-medium text-orange-600 uppercase tracking-wider">All Unpaid Bills</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-1">Pending Payments</h1>
        </div>
        <div className="flex items-center space-x-3">
          <button
            className="bg-white hover:bg-gray-50 p-2.5 rounded-lg transition-colors shadow-sm border border-gray-200"
            onClick={handleRefresh}
            aria-label="Refresh"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-5 border-b border-gray-200 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-orange-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-800">Bills Pending Payment</h2>
        </div>

        {unpaidBills && unpaidBills.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">No unpaid bills found</h3>
            <p className="text-gray-500 mb-6">All bills have been settled</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Token #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Order</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Gaming Sessions</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {unpaidBills?.map((bill: any) => {
                  try {
                    // Determine if this is an order-based bill
                    const isOrderBill = bill.orderId && bill.order;
                    
                    // Get sessions either from the order or token
                    let sessions = [];
                    if (isOrderBill && bill.order?.sessions) {
                      sessions = bill.order.sessions;
                    } else if (bill.token?.sessions) {
                      // For token-based bills, only show sessions without an order
                      sessions = bill.token.sessions.filter((session: any) => !session.orderId);
                    }
                    
                    // Skip bill if there are no valid sessions
                    if (sessions.length === 0) return null;
                    
                    // Ensure token exists
                    if (!bill.token) {
                      console.error("Bill missing token:", bill.id);
                      return null;
                    }
                    
                    return (
                      <tr key={bill.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="bg-blue-100 text-blue-600 font-semibold rounded-full h-8 w-8 flex items-center justify-center mr-3">
                              {bill.token.tokenNo}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {isOrderBill && bill.order ? (
                            <div className="flex items-center">
                              <span className="font-medium text-gray-900">#{bill.order.orderNumber}</span>
                              <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                                bill.order.status === 'ACTIVE' 
                                  ? 'bg-green-100 text-green-800' 
                                  : bill.order.status === 'COMPLETED' 
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-red-100 text-red-800'
                              }`}>
                                {bill.order.status}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-500 text-sm italic">No Order (Legacy)</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{formatDate(bill.generatedAt)}</div>
                          {bill.generatedAt && (
                            <div className="text-xs text-gray-500">{format(new Date(bill.generatedAt), 'EEEE')}</div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-gray-900 flex flex-col space-y-1">
                            {sessions.map((session: any) => {
                              if (!session.device) return null;
                              return (
                                <div key={session.id} className="flex items-center">
                                  <span className="font-medium">{session.device.type} {session.device.counterNo}</span>
                                  <span className="mx-1">•</span>
                                  <span>
                                    {session.playerCount || 1} player{(session.playerCount || 1) > 1 ? 's' : ''}
                                  </span>
                                  <span className="mx-1">•</span>
                                  <span>{session.duration ? `${session.duration}m` : 'Active'}</span>
                                  <span className="mx-1">•</span>
                                  <span>
                                    {formatCurrency(session.cost || 0)}
                                  </span>
                                </div>
                              );
                            }).filter(Boolean)}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            bill.status === PaymentStatus.PENDING
                              ? 'bg-yellow-100 text-yellow-800'
                              : bill.status === PaymentStatus.PAID
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-orange-100 text-orange-800'
                          }`}>
                            {bill.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatCurrency(
                            // Calculate the total from sessions for more accurate display
                            calculateTotalFromSessions(
                              isOrderBill && bill.order?.sessions 
                                ? bill.order.sessions 
                                : bill.token?.sessions?.filter((s: any) => !s.orderId) || []
                            )
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-1.5 rounded-lg flex items-center transition-colors shadow-sm"
                            onClick={() => handleViewBill(bill.id)}
                          >
                            <span className="font-medium">View Bill</span>
                          </button>
                        </td>
                      </tr>
                    );
                  } catch (error) {
                    console.error("Error rendering bill:", error, bill);
                    return null;
                  }
                }).filter(Boolean)}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {showBillModal && selectedBillId && (
        <BillModal
          isOpen={showBillModal}
          onClose={handleBillModalClose}
          billId={selectedBillId}
          onSuccess={handleBillUpdated}
        />
      )}
    </div>
  );
} 