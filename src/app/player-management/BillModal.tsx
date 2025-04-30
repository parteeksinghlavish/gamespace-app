'use client';

import React, { useState, useEffect } from 'react';
import { api } from '~/trpc/react';
import { PaymentStatus } from '~/lib/constants';

// Define types for our data
interface Device {
  id: number;
  type: string;
  counterNo: number;
  hourlyRate: number;
}

interface Session {
  id: number;
  deviceId: number;
  tokenId: number;
  playerCount: number;
  startTime: string;
  endTime?: string;
  duration?: number;
  cost?: number;
  comments?: string;
  status: string;
  device: Device;
}

interface BillModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenId: number;
  onSuccess: () => void;
}

// Helper functions
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `₹${num.toFixed(2)}`;
}

// Helper function to calculate duration for display
function getDisplayDuration(session: Session): string {
  if (session.status === "ACTIVE") {
    // For active sessions, calculate duration from start time to now
    const now = new Date();
    const start = new Date(session.startTime);
    const durationInMinutes = Math.ceil(
      (now.getTime() - start.getTime()) / (1000 * 60)
    );
    return `${durationInMinutes} min (active)`;
  } else {
    // For ended sessions, use stored duration
    return `${session.duration || 0} min`;
  }
}

// Helper function to calculate cost for display
function getDisplayCost(session: Session): string {
  if (session.status === "ACTIVE") {
    // For active sessions, calculate cost from start time to now
    const now = new Date();
    const start = new Date(session.startTime);
    const durationInMinutes = (now.getTime() - start.getTime()) / (1000 * 60);
    const hourlyRate = session.device.hourlyRate;
    const cost = (Number(hourlyRate) / 60) * durationInMinutes;
    return formatCurrency(cost);
  } else {
    // For ended sessions, use stored cost
    return formatCurrency(session.cost || 0);
  }
}

export default function BillModal({ isOpen, onClose, tokenId, onSuccess }: BillModalProps) {
  const [billId, setBillId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);

  const utils = api.useUtils();

  // Mutation to generate a bill
  const generateBillMutation = api.playerManagement.generateBill.useMutation({
    onSuccess: (data) => {
      setBillId(data.id);
      setIsGenerating(false);
    },
    onError: (error) => {
      showToast('Error generating bill: ' + error.message, 'error');
      onClose();
    },
  });

  // Query to get bill details
  const { data: bill, isLoading: isBillLoading } = api.playerManagement.getBill.useQuery(
    { billId: billId! },
    { 
      enabled: !!billId,
      refetchOnWindowFocus: false,
    }
  );

  // Mutation to update bill status
  const updateBillStatusMutation = api.playerManagement.updateBillStatus.useMutation({
    onSuccess: () => {
      utils.playerManagement.getBill.invalidate({ billId: billId! });
      utils.playerManagement.getTodaySessions.invalidate();
      onSuccess();
      onClose();
      showToast('Bill updated successfully', 'success');
    },
    onError: (error) => {
      showToast('Error updating bill: ' + error.message, 'error');
    },
  });

  // Generate the bill when the modal opens
  useEffect(() => {
    if (isOpen && isGenerating) {
      generateBillMutation.mutate({ tokenId });
    }

    return () => {
      // Reset state when modal closes
      if (!isOpen) {
        setBillId(null);
        setIsGenerating(true);
      }
    };
  }, [isOpen, tokenId, isGenerating]);

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

  const handleMarkAsPaid = () => {
    if (billId) {
      updateBillStatusMutation.mutate({
        billId,
        status: PaymentStatus.PAID,
      });
    }
  };

  const handleMarkAsDue = () => {
    if (billId) {
      updateBillStatusMutation.mutate({
        billId,
        status: PaymentStatus.DUE,
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl overflow-hidden">
        <div className="bg-blue-600 p-4 sm:p-5">
          <h3 className="text-xl font-semibold text-white">Bill Details</h3>
        </div>

        {(isGenerating || isBillLoading) ? (
          <div className="p-8 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-600">Generating bill, please wait...</p>
          </div>
        ) : bill ? (
          <>
            <div className="p-4 sm:p-6">
              <div className="bg-blue-50 p-3 rounded-lg mb-4 flex justify-between items-center">
                <h4 className="font-medium">Token No. {bill.token.tokenNo}</h4>
                <span className="text-sm text-gray-500">Generated: {formatDate(bill.generatedAt)}</span>
              </div>

              <div className="mb-5">
                <h4 className="font-medium mb-2">Sessions</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Players</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {bill.token.sessions.map((session: Session) => (
                        <tr key={session.id}>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {session.device.type} {session.device.counterNo}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{session.playerCount}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{getDisplayDuration(session)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{getDisplayCost(session)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t pt-4 mb-4">
                <div className="flex justify-between items-center text-lg font-medium">
                  <span>Total Amount:</span>
                  <span className="text-blue-600">{formatCurrency(bill.totalAmount)}</span>
                </div>
                {bill.status !== PaymentStatus.PENDING && (
                  <div className="mt-2 flex justify-end">
                    <span className={`px-2 py-1 text-sm rounded-full ${
                      bill.status === PaymentStatus.PAID 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-orange-100 text-orange-800'
                    }`}>
                      {bill.status}
                    </span>
                  </div>
                )}
              </div>

              {bill.status === PaymentStatus.PENDING && bill.token.sessions.some((s: Session) => s.status === "ACTIVE") && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-yellow-700">
                        Marking this bill as paid or due will <strong>automatically end all active sessions</strong> for this token.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gray-50 px-4 sm:px-6 py-4 flex justify-end space-x-4 border-t">
              <button
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium focus:outline-none transition-colors"
                onClick={onClose}
              >
                CANCEL
              </button>
              {bill.status === PaymentStatus.PENDING && (
                <>
                  <button
                    className="px-6 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 font-medium focus:outline-none transition-colors shadow-sm"
                    onClick={handleMarkAsDue}
                    disabled={updateBillStatusMutation.isPending}
                  >
                    MARK AS DUE
                  </button>
                  <button
                    className="px-6 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium focus:outline-none transition-colors shadow-sm"
                    onClick={handleMarkAsPaid}
                    disabled={updateBillStatusMutation.isPending}
                  >
                    MARK AS PAID
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="p-8 text-center">
            <p className="text-red-500">Error loading bill. Please try again.</p>
          </div>
        )}
      </div>
    </div>
  );
} 