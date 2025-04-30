'use client';

import React, { useState } from 'react';
import { api } from '~/trpc/react';
import { SessionStatus } from '~/lib/constants';
import NewSessionModal from './NewSessionModal';
import CommentEditModal from './CommentEditModal';
import BillModal from './BillModal';

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

// Calculate cost for active sessions
function calculateCost(startTime: Date | string, hourlyRate: number): string {
  const now = new Date();
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const durationInMinutes = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60));
  const cost = (Number(hourlyRate) / 60) * durationInMinutes;
  return cost.toFixed(2);
}

export default function PlayerManagementContent() {
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null);

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

  // Handlers
  const handleEndSession = (sessionId: number) => {
    endSessionMutation.mutate({ sessionId });
  };

  const handleCommentEdit = (session: any) => {
    setSelectedSession(session);
    setShowCommentModal(true);
  };

  const handleGenerateBill = (tokenId: number) => {
    setSelectedTokenId(tokenId);
    setShowBillModal(true);
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
    <div>
      <div className="flex justify-between mb-4">
        <div className="flex space-x-2">
          <button
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md"
            onClick={() => setShowNewSessionModal(true)}
          >
            New Session
          </button>
        </div>
        <button
          className="bg-gray-200 hover:bg-gray-300 p-2 rounded-md"
          onClick={() => refetch()}
          aria-label="Refresh"
        >
          🔄
        </button>
      </div>

      {activeOrPendingTokens && activeOrPendingTokens.length === 0 ? (
        <div className="p-6 text-center bg-gray-50 rounded-md">
          <p className="text-lg">No active sessions found for today</p>
          <button
            className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md"
            onClick={() => setShowNewSessionModal(true)}
          >
            Create New Session
          </button>
        </div>
      ) : (
        activeOrPendingTokens?.map((token: any) => (
          <div key={token.id} className="mb-8 border rounded-lg overflow-hidden">
            <div className="flex justify-between items-center p-4 bg-blue-50">
              <h2 className="text-xl font-semibold">Token No. {token.tokenNo}</h2>
              <button
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md flex items-center"
                onClick={() => handleGenerateBill(token.id)}
              >
                <span className="mr-1">₹</span> Generate Bill
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Token</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Players</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">In Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Duration</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Cost</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comments</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {token.sessions.map((session: any) => (
                    <tr key={session.id}>
                      <td className="px-6 py-4 whitespace-nowrap">{token.tokenNo}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {session.device.type} {session.device.counterNo}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{session.playerCount}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{formatTime(session.startTime)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {session.status === SessionStatus.ACTIVE
                          ? calculateDuration(session.startTime)
                          : `${session.duration}m`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {session.status === SessionStatus.ACTIVE
                          ? `₹${calculateCost(
                              session.startTime,
                              session.device.hourlyRate
                            )}`
                          : formatCurrency(session.cost)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
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
                      <td className="px-6 py-4 whitespace-nowrap">
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        {session.status === SessionStatus.ACTIVE ? (
                          <button
                            className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded-md text-sm"
                            onClick={() => handleEndSession(session.id)}
                          >
                            End Session
                          </button>
                        ) : (
                          <span>Session ended</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {tokens && activeOrPendingTokens && tokens.length > activeOrPendingTokens.length && (
        <div className="mt-6 p-3 bg-blue-50 rounded-md text-center text-gray-600">
          <p>
            <span className="font-medium">{tokens.length - activeOrPendingTokens.length} completed</span> token{tokens.length - activeOrPendingTokens.length !== 1 ? 's' : ''} with paid/due bills {tokens.length - activeOrPendingTokens.length !== 1 ? 'are' : 'is'} hidden. These token numbers are available for new sessions.
          </p>
        </div>
      )}

      {showNewSessionModal && (
        <NewSessionModal 
          isOpen={showNewSessionModal}
          onClose={() => setShowNewSessionModal(false)}
          onSuccess={() => {
            refetch();
            setShowNewSessionModal(false);
          }}
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

      {showBillModal && selectedTokenId && (
        <BillModal
          isOpen={showBillModal}
          onClose={() => {
            setShowBillModal(false);
            setSelectedTokenId(null);
          }}
          tokenId={selectedTokenId}
          onSuccess={() => {
            refetch();
          }}
        />
      )}
    </div>
  );
} 