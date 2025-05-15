'use client';

import React, { useState, useEffect } from 'react';
import { api } from '~/trpc/react';
import { PaymentStatus } from '~/lib/constants';
import { roundTimeToCharge, calculatePrice, calculateSessionCost, calculateTotalCost } from "~/lib/pricing";

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
  orderId?: string;
  playerCount: number;
  startTime: string;
  endTime?: string;
  duration?: number;
  cost?: number;
  comments?: string;
  status: string;
  device: Device;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  sessions: Session[];
}

interface Token {
  id: number;
  tokenNo: number;
  sessions: Session[];
}

// Define complete Bill type
interface Bill {
  id: number;
  tokenId: number;
  orderId?: string;
  status: string;
  amount: number;
  correctedAmount?: number;
  generatedAt: Date;
  paidAt?: Date;
  paymentMethod?: string;
  paymentReference?: string;
  token?: {
    id: number;
    tokenNo: number;
    sessions: Session[];
  };
  order?: {
    id: string;
    orderNumber: string;
    status: string;
    sessions: Session[];
  };
}

interface BillModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenId?: number;
  orderId?: string;
  billId?: number;
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

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) {
    return '₹0.00';
  }
  
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  // Check if num is NaN after conversion
  if (isNaN(num)) {
    return '₹0.00';
  }
  
  return `₹${num.toFixed(2)}`;
}

// Calculate duration between two dates in minutes
function calculateDuration(startTime: Date | string, endTime: Date | string = new Date()): string {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime;
  const durationInMinutes = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60));
  return `${durationInMinutes}m`;
}

// Helper function to calculate duration for display
function getDisplayDuration(session: Session): string {
  if (session.status === "ACTIVE") {
    // For active sessions, calculate duration from start time to now
    const now = new Date();
    const start = new Date(session.startTime);
    const calculatedMinutes = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60));
    
    // Show both actual minutes and rounded billing minutes
    const billingMinutes = roundTimeToCharge(calculatedMinutes);
    
    if (billingMinutes === 0) {
      return `${calculatedMinutes}m (Free tier)`;
    }
    
    return `${calculatedMinutes}m (Billed: ${billingMinutes}m)`;
  } else {
    // For ended sessions, use the stored duration
    const storedDuration = session.duration || 0;
    const billingMinutes = roundTimeToCharge(storedDuration);
    if (billingMinutes === storedDuration) {
      return `${storedDuration}m`;
    } else {
      return `${storedDuration}m (Billed: ${billingMinutes}m)`;
    }
  }
}

// Helper function to get the rounded billing time
function getBilledTime(session: Session): string {
  try {
    // Frame devices don't use time-based billing
    if (!session.device || !session.device.type) {
      return "N/A";
    }
    
    if (session.device.type === "FRAME") {
      return "N/A";
    }
  
  const actualMinutes = session.status === "ACTIVE" 
    ? Math.ceil((new Date().getTime() - new Date(session.startTime).getTime()) / (1000 * 60)) 
    : session.duration || 0;
  
  const billedMinutes = roundTimeToCharge(actualMinutes);
  
  if (billedMinutes === 0) {
    return 'Free tier (≤7m)';
  }
  
  return `${billedMinutes}m`;
  } catch (error) {
    console.error("Error calculating billed time:", error);
    return "N/A";
  }
}

// Helper function to calculate cost for display
function getDisplayCost(session: Session): string {
  try {
    // Use the centralized function for session cost calculation
    return formatCurrency(calculateSessionCost(session));
  } catch (error) {
    console.error("Error calculating session cost:", error);
    return '₹0.00';
  }
}

export default function BillModal({ isOpen, onClose, tokenId, orderId, billId, onSuccess }: BillModalProps) {
  const [activeBillId, setActiveBillId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [paymentReference, setPaymentReference] = useState<string>("");
  // Add local state to track bill status for immediate UI updates
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [currentAmount, setCurrentAmount] = useState<number | null>(null);

  const utils = api.useUtils();

  // Mutation to generate a bill for a token
  const generateBillMutation = api.playerManagement.generateBill.useMutation({
    onSuccess: (data) => {
      if (data?.id) {
        setActiveBillId(data.id);
      }
      setIsGenerating(false);
    },
    onError: (error) => {
      showToast('Error generating bill: ' + error.message, 'error');
      onClose();
    },
  });

  // Mutation to generate a bill for an order
  const generateOrderBillMutation = api.playerManagement.generateBillForOrder.useMutation({
    onSuccess: (data) => {
      if (data?.id) {
        setActiveBillId(data.id);
      }
      setIsGenerating(false);
    },
    onError: (error) => {
      showToast('Error generating bill: ' + error.message, 'error');
      onClose();
    },
  });

  // Query to get bill details - ensure it always fetches fresh data
  const { data: bill, isLoading: isBillLoading } = api.playerManagement.getBill.useQuery(
    { billId: activeBillId! },
    { 
      enabled: !!activeBillId,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchInterval: 3000, // Refresh every 3 seconds while modal is open
      staleTime: 0, // Consider data always stale to ensure fresh fetches
    }
  );

  // Update local state when bill data changes
  useEffect(() => {
    if (bill) {
      // Use type assertion to handle the bill structure
      const billData = bill as unknown as Bill;
      
      console.log("Bill data received:", billData);
      
      // Always update local status from server
      setCurrentStatus(billData.status);
      
      // Calculate total from sessions for more accurate amounts
      if (billData.order?.sessions || billData.token?.sessions) {
        const sessions = billData.order?.sessions || billData.token?.sessions || [];
        
        console.log(`Calculating total for ${sessions.length} sessions`);
        
        const calculatedTotal = sessions.reduce((total, session) => {
          try {
            // For Frame devices
            if (session.device?.type === "FRAME") {
              const frameAmount = 50 * (session.playerCount || 1);
              console.log(`Frame device: ${session.playerCount} players = ₹${frameAmount}`);
              return total + frameAmount;
            }
            
            // For completed sessions, use stored cost
            if (session.status !== "ACTIVE" && session.cost) {
              const storedCost = Number(session.cost);
              console.log(`Stored cost for session ${session.id}: ₹${storedCost}`);
              return total + storedCost;
            }
            
            // For active sessions, calculate duration and cost
            const durationInMinutes = session.status === "ACTIVE"
              ? Math.ceil((new Date().getTime() - new Date(session.startTime).getTime()) / (1000 * 60))
              : (session.duration || 0);
            
            // Get device type and player count
            const deviceType = session.device?.type as any;
            const playerCount = session.playerCount || 1;
            
            if (!deviceType) {
              console.error("Missing device type for session:", session.id);
              return total;
            }
            
            try {
              // Calculate using proper pricing function
              const price = calculatePrice(deviceType, playerCount, durationInMinutes);
              console.log(`${deviceType}: ${durationInMinutes}m, ${playerCount} players = ₹${price}`);
              return total + price;
            } catch (error) {
              console.error("Error in price calculation:", error);
              // Fallback calculation using hourly rate
              const hourlyRate = Number(session.device?.hourlyRate || 0);
              const roundedTime = roundTimeToCharge(durationInMinutes);
              const cost = (hourlyRate / 60) * roundedTime;
              console.log(`Fallback calculation: ${hourlyRate}/hr, ${roundedTime}m = ₹${cost}`);
              return total + cost;
            }
          } catch (err) {
            console.error("Error calculating session cost:", err);
            return total;
          }
        }, 0);
        
        console.log(`Total calculated from sessions: ₹${calculatedTotal}`);
        
        // Don't allow zero amounts for bills with active sessions
        if (calculatedTotal > 0 || !sessions.some(s => s.status === "ACTIVE")) {
          setCurrentAmount(calculatedTotal);
        } else {
          // Use corrected amount or original amount as fallback
          const fallbackAmount = billData.correctedAmount !== undefined 
            ? billData.correctedAmount
            : billData.amount;
          console.log(`Using fallback amount: ₹${fallbackAmount}`);
          setCurrentAmount(fallbackAmount);
        }
      } else {
        // Fallback to bill amount if sessions not available
        const amount = billData.correctedAmount !== undefined 
          ? billData.correctedAmount
          : billData.amount;
        console.log(`No sessions found, using bill amount: ₹${amount}`);
        setCurrentAmount(amount);
      }
    }
  }, [bill]);

  // Mutation to update bill status
  const updateBillStatusMutation = api.playerManagement.updateBillStatus.useMutation({
    onSuccess: (updatedBill: any) => {
      console.log("Bill updated successfully:", updatedBill);
      
      // Update local state immediately for UI
      setCurrentStatus(updatedBill.status);
      
      // Always set the currentAmount to the most accurate value available
      // Type assertion to handle correctedAmount
      const billData = updatedBill as unknown as Bill;
      const updatedAmount = billData.correctedAmount !== undefined 
        ? billData.correctedAmount 
        : billData.amount;
      
      setCurrentAmount(updatedAmount);
      
      // IMPORTANT: First invalidate all the queries that might be affected
      utils.playerManagement.getBill.invalidate();
      utils.playerManagement.getTodaySessions.invalidate();
      utils.playerManagement.getUnpaidBills.invalidate();
      utils.playerManagement.getAvailableDevices.invalidate();
      
      // Explicitly trigger refetch for unpaid bills to ensure UI updates
      utils.playerManagement.getUnpaidBills.refetch();
      
      // Show success message and call callback
      showToast('Bill updated successfully', 'success');
      
      // Call onSuccess to trigger parent component's refetch
      if (onSuccess) onSuccess();
      
      // Close modal after delay - make it longer to ensure queries complete
      setTimeout(() => {
        if (onClose) onClose();
      }, 1500);
    },
    onError: (error) => {
      console.error("Error updating bill:", error);
      showToast('Error updating bill: ' + error.message, 'error');
    }
  });

  // Initialize from provided billId or generate via tokenId/orderId
  useEffect(() => {
    if (!isOpen) return;

    if (billId) {
      // If billId is provided directly, use it
      setActiveBillId(billId);
      setIsGenerating(false);
    } else if (tokenId && !activeBillId) {
      // Generate a bill for the token if needed
      setIsGenerating(true);
      generateBillMutation.mutate({ tokenId });
    } else if (orderId && !activeBillId) {
      // Generate a bill for the order if needed
      setIsGenerating(true);
      generateOrderBillMutation.mutate({ orderId });
    }

    return () => {
      // Reset state when modal closes
      if (!isOpen) {
        setActiveBillId(null);
        setIsGenerating(false);
      }
    };
  }, [isOpen, tokenId, orderId, billId]);

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

  // Helper function to handle bill status updates
  const handleBillStatusChange = (newStatus: PaymentStatus) => {
    if (activeBillId && bill) {
      try {
        console.log(`Starting bill status change to ${newStatus} for bill ID:`, activeBillId);
        
        // Immediately update local state for responsive UI
        setCurrentStatus(newStatus);
        
        // Type assertion for bill data
        const billData = bill as unknown as Bill;
        
        // Get all sessions from either order or token
        const allSessions = isOrderBill && billData?.order?.sessions 
          ? billData.order.sessions 
          : billData?.token?.sessions || [];
        
        console.log("Session source:", isOrderBill ? "order" : "token");
        console.log("Number of sessions:", allSessions.length);
        
        // Calculate the total manually for ALL device types
        let correctTotal = 0;
        
        console.log(`Calculating total for ${allSessions.length} sessions`);
        
        // Use each session's existing cost when available or calculate directly
        allSessions.forEach(session => {
          let sessionCost = 0;
          
          // For Frame devices, always use fixed pricing
          if (session.device?.type === "FRAME") {
            sessionCost = 50 * (session.playerCount || 1);
            console.log(`Frame session ${session.id}: ${session.playerCount} players = ₹${sessionCost}`);
          }
          // For ended sessions with existing cost
          else if (session.status !== "ACTIVE" && session.cost) {
            sessionCost = Number(session.cost);
            console.log(`Ended session ${session.id}: stored cost = ₹${sessionCost}`);
          }
          // For active sessions, use direct calculation
          else if (session.status === "ACTIVE") {
            const durationInMinutes = Math.ceil((new Date().getTime() - new Date(session.startTime).getTime()) / (1000 * 60));
            
            // Simple calculation based on hourly rate
            const hourlyRate = Number(session.device?.hourlyRate || 0);
            // Round time according to the 7-minute rule
            const roundedMinutes = durationInMinutes <= 7 ? 0 : Math.ceil((durationInMinutes - 7) / 15) * 15;
            
            // Calculate cost based on device type
            try {
              // Use the centralized pricing function
              sessionCost = calculatePrice(
                session.device?.type as any,
                session.playerCount || 1,
                durationInMinutes
              );
              console.log(`Active session ${session.id}: calculated cost using price function = ₹${sessionCost}`);
            } catch (error) {
              console.error("Error calculating session cost in bill modal:", error);
              // Fallback calculation for device types not handled by main function
              switch(session.device?.type) {
                case "PS5":
                  if (session.playerCount <= 1) {
                    if (roundedMinutes <= 15) sessionCost = 40;
                    else if (roundedMinutes <= 30) sessionCost = 80;
                    else if (roundedMinutes <= 45) sessionCost = 100;
                    else if (roundedMinutes <= 60) sessionCost = 120;
                    else sessionCost = 120 * (roundedMinutes / 60);
                  } else if (session.playerCount <= 3) {
                    if (roundedMinutes <= 15) sessionCost = 60;
                    else if (roundedMinutes <= 30) sessionCost = 120;
                    else if (roundedMinutes <= 45) sessionCost = 150;
                    else if (roundedMinutes <= 60) sessionCost = 180;
                    else sessionCost = 180 * (roundedMinutes / 60);
                  } else {
                    if (roundedMinutes <= 15) sessionCost = 70;
                    else if (roundedMinutes <= 30) sessionCost = 140;
                    else if (roundedMinutes <= 45) sessionCost = 170;
                    else if (roundedMinutes <= 60) sessionCost = 200;
                    else sessionCost = 200 * (roundedMinutes / 60);
                  }
                  break;
                case "PS4":
                  if (session.playerCount <= 1) {
                    if (roundedMinutes <= 15) sessionCost = 25;
                    else if (roundedMinutes <= 30) sessionCost = 50;
                    else if (roundedMinutes <= 45) sessionCost = 65;
                    else if (roundedMinutes <= 60) sessionCost = 80;
                    else sessionCost = 80 * (roundedMinutes / 60);
                  } else {
                    if (roundedMinutes <= 15) sessionCost = 35;
                    else if (roundedMinutes <= 30) sessionCost = 70;
                    else if (roundedMinutes <= 45) sessionCost = 95;
                    else if (roundedMinutes <= 60) sessionCost = 120;
                    else sessionCost = 120 * (roundedMinutes / 60);
                  }
                  break;
                case "Racing":
                  if (roundedMinutes <= 15) sessionCost = 100;
                  else if (roundedMinutes <= 30) sessionCost = 150;
                  else if (roundedMinutes <= 45) sessionCost = 175;
                  else if (roundedMinutes <= 60) sessionCost = 200;
                  else sessionCost = 200 * (roundedMinutes / 60);
                  break;
                case "VR":
                  if (roundedMinutes <= 15) sessionCost = 100;
                  else if (roundedMinutes <= 30) sessionCost = 150;
                  else if (roundedMinutes <= 45) sessionCost = 175;
                  else if (roundedMinutes <= 60) sessionCost = 200;
                  else sessionCost = 200 * (roundedMinutes / 60);
                  break;
                case "VR Racing":
                  if (roundedMinutes <= 15) sessionCost = 150;
                  else if (roundedMinutes <= 30) sessionCost = 200;
                  else if (roundedMinutes <= 45) sessionCost = 250;
                  else if (roundedMinutes <= 60) sessionCost = 300;
                  else sessionCost = 300 * (roundedMinutes / 60);
                  break;
                case "Pool":
                  if (roundedMinutes <= 15) sessionCost = 50;
                  else if (roundedMinutes <= 30) sessionCost = 80;
                  else if (roundedMinutes <= 45) sessionCost = 120;
                  else if (roundedMinutes <= 60) sessionCost = 160;
                  else sessionCost = 160 * (roundedMinutes / 60);
                  break;
                default:
                  // Fallback to hourly rate
                  if (hourlyRate > 0) {
                    sessionCost = (hourlyRate / 60) * roundedMinutes;
                  }
              }
              console.log(`Active session ${session.id}: calculated cost using fallback = ₹${sessionCost}`);
            }
          }
          
          correctTotal += sessionCost;
        });
        
        console.log(`Total calculated: ₹${correctTotal}`);
        
        // Ensure we never send a zero amount for active sessions
        if (correctTotal <= 0 && allSessions.some(s => s.status === "ACTIVE")) {
          console.warn("Calculated total is zero or negative for bill with active sessions");
          // Fallback to the current amount if available or the bill amount
          correctTotal = currentAmount !== null 
            ? currentAmount 
            : (billData?.correctedAmount || billData?.amount || 0);
        }
        
        // Prepare the mutation parameters
        const mutationParams = {
          billId: activeBillId,
          status: newStatus,
          correctedAmount: correctTotal,
          paymentMethod: newStatus === PaymentStatus.PAID ? paymentMethod : undefined,
          paymentReference: (newStatus === PaymentStatus.PAID && paymentReference) ? paymentReference : undefined,
        };
        
        console.log("Calling updateBillStatusMutation with params:", mutationParams);
        console.log(`Specific correctTotal value: ${correctTotal} - Type: ${typeof correctTotal}`);
        
        // Ensure correctedAmount is a number
        if (typeof correctTotal !== 'number') {
          console.error("Attempting to convert correctedAmount to number");
          mutationParams.correctedAmount = Number(correctTotal);
          console.log(`Converted correctedAmount: ${mutationParams.correctedAmount} - Type: ${typeof mutationParams.correctedAmount}`);
          // If conversion results in NaN, use a fallback
          if (isNaN(mutationParams.correctedAmount)) {
            console.error("Conversion resulted in NaN, using fallback amount");
            mutationParams.correctedAmount = billData?.amount || 0;
          }
        }
        
        // IMPORTANT: Pre-emptively invalidate queries to force refresh
        utils.playerManagement.getUnpaidBills.invalidate();
        
        // Update the bill status
        updateBillStatusMutation.mutate(mutationParams);
      } catch (error) {
        console.error(`Error changing bill status to ${newStatus}:`, error);
        showToast(`Error updating bill status to ${newStatus}. Please try again.`, 'error');
      }
    } else {
      console.error("Cannot update bill status: activeBillId or bill is missing", { 
        activeBillId, 
        billExists: !!bill,
        status: newStatus
      });
    }
  };

  const handleMarkAsPaid = () => {
    handleBillStatusChange(PaymentStatus.PAID);
  };

  const handleMarkAsDue = () => {
    handleBillStatusChange(PaymentStatus.DUE);
  };

  if (!isOpen) return null;

  // Use type assertion for bill data
  const billData = bill as unknown as Bill | undefined;

  // Determine if this is an order-based bill (prefer order-based billing)
  const isOrderBill = billData?.order !== undefined && billData.order !== null;
  
  // Get the appropriate sessions for billing
  const sessions = isOrderBill ? billData?.order?.sessions || [] : billData?.token?.sessions || [];
  
  // IMPORTANT: Always prioritize local state for UI consistency
  // For displaying status, always use local state first if available
  const displayStatus = currentStatus || (billData?.status || PaymentStatus.PENDING);
  
  // For displaying amount, always use local state first if available
  // If not available, calculate from sessions to avoid incorrect amounts
  const displayAmount = currentAmount !== null 
    ? currentAmount 
    : sessions.reduce((total, session) => {
        try {
          // For Frame devices
          if (session.device?.type === "FRAME") {
            return total + (50 * (session.playerCount || 1));
          }
          
          // For completed sessions, use stored cost
          if (session.status !== "ACTIVE" && session.cost) {
            return total + Number(session.cost);
          }
          
          // For active sessions, calculate cost
          const durationInMinutes = session.status === "ACTIVE"
            ? Math.ceil((new Date().getTime() - new Date(session.startTime).getTime()) / (1000 * 60))
            : (session.duration || 0);
            
          // Calculate using pricing function
          try {
            const price = calculatePrice(
              session.device?.type as any,
              session.playerCount || 1,
              durationInMinutes
            );
            return total + price;
          } catch (error) {
            console.error("Error calculating price:", error);
            // Fallback calculation
            const hourlyRate = Number(session.device?.hourlyRate || 0);
            const roundedTime = roundTimeToCharge(durationInMinutes);
            const cost = (hourlyRate / 60) * roundedTime;
            return total + cost;
          }
        } catch (err) {
          console.error("Error calculating session cost:", err);
          return total;
        }
      }, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl overflow-hidden">
        <div className="bg-blue-600 p-4 sm:p-5">
          <h3 className="text-xl font-semibold text-white">
            {isOrderBill ? "Order Bill" : "Token Bill"}
          </h3>
        </div>

        {(isGenerating || isBillLoading) ? (
          <div className="p-8 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-600">Generating bill, please wait...</p>
          </div>
        ) : bill ? (
            <div className="p-4 sm:p-6">
            <div className="relative">
              <div id="billErrorIndicator" className="hidden absolute inset-0 bg-red-50 flex items-center justify-center rounded-lg">
                <p className="text-red-500 p-4 text-center">
                  There was an error displaying this bill. Please try again or contact support.
                </p>
              </div>
              
              <script dangerouslySetInnerHTML={{ __html: `
                try {
                  // This script runs client-side to catch render errors
                  setTimeout(() => {
                    if (document.getElementById('billContent').childElementCount === 0) {
                      document.getElementById('billErrorIndicator').classList.remove('hidden');
                    }
                  }, 500);
                } catch (e) {
                  console.error('Bill render error:', e);
                  document.getElementById('billErrorIndicator').classList.remove('hidden');
                }
              `}} />
              
              <div id="billContent">
                <div className="bg-blue-50 p-3 rounded-lg mb-4 flex justify-between items-center">
                  <div>
                    <h4 className="font-medium">
                      {isOrderBill 
                        ? `Order: ${billData?.order?.orderNumber}` 
                        : `Token No. ${billData?.token?.tokenNo}`
                      }
                    </h4>
                    {isOrderBill ? (
                      <div className="mt-1 text-sm text-blue-700">
                        Token: {billData?.token?.tokenNo}
                        <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                          billData?.order?.status === 'ACTIVE' 
                            ? 'bg-green-100 text-green-800' 
                            : billData?.order?.status === 'COMPLETED' 
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-red-100 text-red-800'
                        }`}>
                          {billData?.order?.status}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <span className="text-sm text-gray-500">Generated: {billData?.generatedAt ? formatDate(billData.generatedAt) : ""}</span>
              </div>

              <div className="mb-5">
                  <h4 className="font-medium mb-2">Gaming Sessions</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Players</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Billed Time</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {sessions?.map((session) => (
                        <tr key={session.id}>
                          <td className="px-3 py-2 whitespace-nowrap">
                              {session.device?.type || 'Unknown'} {session.device?.counterNo || ''}
                          </td>
                            <td className="px-3 py-2 whitespace-nowrap">{session.playerCount || 1}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {session.status === "ACTIVE" 
                                ? calculateDuration(session.startTime, new Date())
                                : `${session.duration || 0}m`
                              }
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{getBilledTime(session)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {getDisplayCost(session)}
                            </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

                <div className="border-t pt-4 flex justify-between items-start">
                  <div>
                    <p className="text-xl font-semibold">
                      Total Amount: {formatCurrency(displayAmount)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Bill Status: 
                      <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                        displayStatus === PaymentStatus.PENDING
                          ? 'bg-yellow-100 text-yellow-800'
                          : displayStatus === PaymentStatus.PAID
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-orange-100 text-orange-800'
                    }`}>
                        {displayStatus || 'PENDING'}
                    </span>
                    </p>
                    
                    {displayStatus === PaymentStatus.PAID && (
                      <div className="mt-2 text-sm">
                        <p>Paid via: {billData?.paymentMethod || "Cash"}</p>
                        {billData?.paymentReference && (
                          <p>Reference: {billData.paymentReference}</p>
                        )}
                        {billData?.paidAt && (
                          <p>Paid on: {billData.paidAt ? formatDate(billData.paidAt) : ""}</p>
                        )}
                  </div>
                )}
              </div>

                  <div>
                    {(displayStatus === PaymentStatus.PENDING) && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Payment Method
                          </label>
                          <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          >
                            <option value="Cash">Cash</option>
                            <option value="Card">Card</option>
                            <option value="UPI">UPI</option>
                            <option value="Online">Online</option>
                          </select>
                    </div>
                        
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Reference (Optional)
                          </label>
                          <input
                            type="text"
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)}
                            placeholder="Transaction ID, etc."
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          />
            </div>

                        <div className="flex space-x-3 mt-4">
              <button
                            className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
                    onClick={handleMarkAsDue}
                    disabled={updateBillStatusMutation.isPending}
                  >
                            {updateBillStatusMutation.isPending && updateBillStatusMutation.variables?.status === PaymentStatus.DUE ? 'Processing...' : 'Mark as Due'}
                  </button>
                  <button
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    onClick={handleMarkAsPaid}
                    disabled={updateBillStatusMutation.isPending}
                  >
                            {updateBillStatusMutation.isPending && updateBillStatusMutation.variables?.status === PaymentStatus.PAID ? 'Processing...' : 'Mark as Paid'}
                  </button>
                        </div>
                      </div>
              )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 flex flex-col items-center justify-center">
            <p className="text-red-500">Error loading bill details</p>
          </div>
        )}

        <div className="bg-gray-50 px-4 sm:px-6 py-4 flex justify-end border-t">
          <button
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
} 