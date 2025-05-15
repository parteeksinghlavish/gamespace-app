import { useState, useCallback } from 'react';
import { api } from '~/trpc/react';
import { PaymentStatus } from '~/lib/constants';
import { formatCurrency } from '~/lib/utils';
import { useRouter } from 'next/navigation';

/**
 * Custom hook to centralize all bill-related operations
 */
export function useBillingManager() {
  const [showBillModal, setShowBillModal] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  
  const router = useRouter();
  const utils = api.useUtils();

  // Mutations for bill operations
  const generateTokenBillMutation = api.playerManagement.generateBill.useMutation({
    onSuccess: (data) => {
      if (data?.id) {
        setSelectedBillId(data.id);
        setShowBillModal(true);
      }
      showToast('Bill generated successfully', 'success');
    },
    onError: (error) => {
      showToast('Error generating bill: ' + error.message, 'error');
    },
  });

  const generateOrderBillMutation = api.playerManagement.generateBillForOrder.useMutation({
    onSuccess: (data) => {
      if (data?.id) {
        setSelectedBillId(data.id);
        setShowBillModal(true);
      }
      showToast('Bill generated successfully', 'success');
    },
    onError: (error) => {
      showToast('Error generating bill: ' + error.message, 'error');
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

  // Force refresh of all bill-related data
  const forceRefresh = useCallback(() => {
    // Reset the entire cache
    utils.invalidate();
    
    // Specifically target bill-related queries
    utils.playerManagement.getUnpaidBills.invalidate();
    utils.playerManagement.getTodaySessions.invalidate();
    utils.playerManagement.getBill.invalidate();
    utils.playerManagement.getCustomersWithDueBills.invalidate();
    
    // Force a timestamp update to break any caching
    setLastRefreshTime(new Date());
    
    // Staggered refetches to ensure data is updated
    setTimeout(() => {
      utils.playerManagement.getUnpaidBills.refetch();
      utils.playerManagement.getTodaySessions.refetch();
      
      // Second wave of refetches
      setTimeout(() => {
        utils.playerManagement.getUnpaidBills.invalidate();
        utils.playerManagement.getTodaySessions.invalidate();
      }, 500);
    }, 100);
    
    // Force router refresh as a last resort if needed
    router.refresh();
  }, [utils, router]);

  // Handler for opening bill modal with a specific bill ID
  const openBillById = useCallback((billId: number) => {
    setSelectedBillId(billId);
    setSelectedTokenId(null);
    setSelectedOrderId(null);
    setShowBillModal(true);
  }, []);

  // Handler for generating and opening a bill for a token
  const generateBillForToken = useCallback((tokenId: number) => {
    setSelectedTokenId(tokenId);
    setSelectedOrderId(null);
    generateTokenBillMutation.mutate({ tokenId });
  }, [generateTokenBillMutation]);

  // Handler for generating and opening a bill for an order
  const generateBillForOrder = useCallback((orderId: string) => {
    setSelectedOrderId(orderId);
    setSelectedTokenId(null);
    generateOrderBillMutation.mutate({ orderId });
  }, [generateOrderBillMutation]);

  // Handler for when a bill modal is closed
  const handleBillModalClose = useCallback(() => {
    setShowBillModal(false);
    setSelectedBillId(null);
    setSelectedTokenId(null);
    setSelectedOrderId(null);
    forceRefresh();
  }, [forceRefresh]);

  // Handler for when a bill is updated
  const handleBillUpdated = useCallback(() => {
    forceRefresh();
  }, [forceRefresh]);

  // Calculate total amount from sessions
  const calculateTotalFromSessions = (sessions: any[]): number => {
    if (!sessions || sessions.length === 0) return 0;
    
    return sessions.reduce((total, session) => {
      try {
        // For Frame devices
        if (session.device?.type === "FRAME") {
          const frameAmount = 50 * (session.playerCount || 1);
          return total + frameAmount;
        }
        
        // For completed sessions, use stored cost
        if (session.status !== "ACTIVE" && session.cost) {
          const storedCost = Number(session.cost);
          return total + storedCost;
        }
        
        // Import and use the calculation functions
        const { calculateSessionCost } = require('~/lib/pricing');
        const calculatedCost = calculateSessionCost(session);
        return total + calculatedCost;
        
      } catch (err) {
        console.error("Error calculating session cost:", err, session);
        return total;
      }
    }, 0);
  };

  return {
    // State
    showBillModal,
    selectedBillId,
    lastRefreshTime,
    
    // Actions
    openBillById,
    generateBillForToken,
    generateBillForOrder,
    handleBillModalClose,
    handleBillUpdated,
    forceRefresh,
    
    // Helper functions
    calculateTotalFromSessions,
    showToast,
    formatCurrency,
  };
} 