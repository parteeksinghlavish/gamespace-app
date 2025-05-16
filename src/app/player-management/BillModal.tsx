'use client';

import React, { useState, useEffect } from 'react';
import { api } from '~/trpc/react';
import { PaymentStatus } from '~/lib/constants';
import { roundTimeToCharge, calculatePrice, calculateSessionCost, calculateTotalCost } from "~/lib/pricing";
import { formatCurrency, formatDate } from "~/lib/utils";
import { format } from "date-fns";

// This Bill type needs to be defined locally since we removed the import
interface Bill {
  id: number;
  tokenId: number;
  orderId?: string;
  status: string;
  amount: number;
  correctedAmount?: number;
  amountReceived?: number;
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
  customerId?: number;
  customer?: {
    id: number;
    name: string;
    phone?: string;
  };
}

interface Customer {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  bills?: Bill[];
}

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

interface BillModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenId?: number;
  orderId?: string;
  billId?: number;
  onSuccess: () => void;
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
    const cost = calculateSessionCost(session);
    return formatCurrency(cost ?? 0);
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
  const [amountReceived, setAmountReceived] = useState<string>("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  // Add state to control when to show customer selection
  const [showDueForm, setShowDueForm] = useState(false);

  const utils = api.useUtils();

  // Add API queries for customers
  const { data: customers, isLoading: customersLoading } = api.playerManagement.getCustomers.useQuery(
    undefined,
    { enabled: isOpen }
  );

  const { data: customersWithDueBills, isLoading: dueBillsCustomersLoading } = 
    api.playerManagement.getCustomersWithDueBills.useQuery(
      undefined, 
      { enabled: isOpen }
    );

  const createCustomerMutation = api.playerManagement.createCustomer.useMutation({
    onSuccess: (newCustomer) => {
      setSelectedCustomerId(newCustomer.id);
      setShowCustomerForm(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      showToast('Customer added successfully', 'success');
      
      // Refresh customer lists
      utils.playerManagement.getCustomers.invalidate();
      utils.playerManagement.getCustomersWithDueBills.invalidate();
    },
    onError: (error) => {
      console.error("Error creating customer:", error);
      showToast('Error creating customer: ' + error.message, 'error');
    }
  });

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
      refetchOnWindowFocus: false, // Disable refetch on window focus
      refetchOnMount: true,
      // Disable automatic refetching when customer selection form is visible
      refetchInterval: false, // Disable automatic refetching
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
            
            // Calculate using pricing function
            try {
              const price = calculatePrice(deviceType, playerCount, durationInMinutes);
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
        
        // Don't allow zero amounts for bills with active sessions
        if (calculatedTotal > 0 || !sessions.some(s => s.status === "ACTIVE")) {
          setCurrentAmount(calculatedTotal);
          
          // Only set amount received if it hasn't been set by the user
          if (billData.amountReceived !== undefined && billData.amountReceived !== null && !amountReceived) {
            setAmountReceived(String(billData.amountReceived));
          } else if (currentStatus !== PaymentStatus.PAID && !amountReceived) {
            // Initialize amount received field with the calculated total for convenience
            setAmountReceived(String(calculatedTotal));
          }
        } else {
          // Use corrected amount or original amount as fallback
          const fallbackAmount = billData.correctedAmount !== undefined 
            ? billData.correctedAmount
            : billData.amount;
          console.log(`Using fallback amount: ₹${fallbackAmount}`);
          setCurrentAmount(fallbackAmount);
          
          // Only set amount received if it hasn't been set by the user
          if (billData.amountReceived !== undefined && billData.amountReceived !== null && !amountReceived) {
            setAmountReceived(String(billData.amountReceived));
          } else if (currentStatus !== PaymentStatus.PAID && !amountReceived) {
            setAmountReceived(String(fallbackAmount));
          }
        }
      } else {
        // Fallback to bill amount if sessions not available
        const amount = billData.correctedAmount !== undefined 
          ? billData.correctedAmount
          : billData.amount;
        console.log(`No sessions found, using bill amount: ₹${amount}`);
        setCurrentAmount(amount);
        
        // Only set amount received if it hasn't been set by the user
        if (billData.amountReceived !== undefined && billData.amountReceived !== null && !amountReceived) {
          setAmountReceived(String(billData.amountReceived));
        } else if (currentStatus !== PaymentStatus.PAID && !amountReceived) {
          setAmountReceived(String(amount));
        }
      }
    }
  }, [bill, currentStatus, amountReceived]); // Add amountReceived to dependencies

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
      
      // Force immediate cache invalidation with stronger approach for dev mode
      // First, reset the entire router cache to handle dev mode quirks
      utils.invalidate();
      
      // Then specifically target individual queries for more focused updates
      utils.playerManagement.getBill.invalidate();
      utils.playerManagement.getTodaySessions.invalidate();
      utils.playerManagement.getUnpaidBills.invalidate();
      utils.playerManagement.getAvailableDevices.invalidate();
      utils.playerManagement.getCustomersWithDueBills.invalidate();
      
      // Force aggressive refetches of critical data
      setTimeout(() => {
        utils.playerManagement.getUnpaidBills.refetch();
      }, 100);
      
      // Show success message and call callback
      showToast('Bill updated successfully', 'success');
      
      // Call onSuccess to trigger parent component's refetch
      if (onSuccess) onSuccess();
      
      // Close modal after delay - make it longer to ensure queries complete
      setTimeout(() => {
        if (onClose) onClose();
      }, 2000);
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
      
      // Force refetch the bill to ensure the latest status
      setTimeout(() => {
        utils.playerManagement.getBill.invalidate({ billId });
        utils.playerManagement.getBill.refetch({ billId });
      }, 100);
    } else if (tokenId && !activeBillId) {
      // Generate a bill for the token if needed
      setIsGenerating(true);
      generateBillMutation.mutate({ tokenId });
    } else if (orderId && !activeBillId) {
      // Generate a bill for the order if needed
      setIsGenerating(true);
      generateOrderBillMutation.mutate({ orderId });
    }

    // Reset amountReceived when modal opens
    setAmountReceived("");

    return () => {
      // Reset state when modal closes
      if (!isOpen) {
        setActiveBillId(null);
        setIsGenerating(false);
        setAmountReceived("");
      }
    };
  }, [isOpen, tokenId, orderId, billId]);

  // Reset selected customer when modal opens or the bill changes
  useEffect(() => {
    if (isOpen && bill) {
      // Use type assertion to access the customerId property
      const billData = bill as unknown as Bill;
      setSelectedCustomerId(billData.customerId || null);
    } else {
      setSelectedCustomerId(null);
    }
  }, [isOpen, bill]);

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
    // Check if we have an active bill ID
    if (activeBillId && bill) {
      try {
        // Create the mutation parameters
        const mutationParams: any = {
          billId: activeBillId,
          status: newStatus,
        };
          
        // Add payment details for PAID status
        if (newStatus === PaymentStatus.PAID) {
          // Validate that amount received has been entered
          if (!amountReceived || isNaN(parseFloat(amountReceived))) {
            showToast('Please enter the actual amount received from the customer', 'error');
            return;
          }
          
          // Parse the amount received as a float and ensure it's saved
          const receivedAmount = parseFloat(amountReceived);
          console.log("Amount received for payment:", receivedAmount);
          
          mutationParams.paymentMethod = paymentMethod;
          mutationParams.paymentReference = paymentReference.trim() || undefined;
          mutationParams.amountReceived = receivedAmount;
        }

        // Add customer ID for DUE status if we have selectedCustomerId
        if (newStatus === PaymentStatus.DUE && selectedCustomerId) {
          mutationParams.customerId = selectedCustomerId;
        }

        // Get the correct amount (either corrected or calculated)
        let correctTotal = currentAmount;
        
        // Type assertion for billData
        const billData = bill as unknown as Bill;
        
        // If amount correction is required and we have a valid number
        if (correctTotal !== null && typeof correctTotal === 'number' && correctTotal !== billData?.amount) {
          console.log(`Amount correction: ${billData?.amount} -> ${correctTotal}`);
          mutationParams.correctedAmount = correctTotal;
        }
        
        // Console for debugging
        console.log("Calling updateBillStatusMutation with params:", mutationParams);
        
        // IMPORTANT: Pre-emptively invalidate queries to force refresh
        utils.playerManagement.getUnpaidBills.invalidate();
        utils.playerManagement.getCustomersWithDueBills.invalidate();
        
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
    // Instead of immediately marking as due, show the customer selection form
    setShowDueForm(true);
  };

  const handleSubmitDue = () => {
    // Validate customer selection
    if (!selectedCustomerId) {
      showToast('Please select a customer for the due bill', 'error');
      return;
    }
    
    // Mark as due if customer is selected
    handleBillStatusChange(PaymentStatus.DUE);
  };

  const handleCreateCustomer = () => {
    if (!newCustomerName.trim()) {
      showToast('Please enter a customer name', 'error');
      return;
    }

    createCustomerMutation.mutate({
      name: newCustomerName,
      phone: newCustomerPhone || undefined,
    });
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

  // Fix the customer selection UI to only appear when marking as DUE
  const renderCustomerSelection = () => {
    // Only show customer selection when explicitly triggered by clicking Mark as Due
    if (!showDueForm) return null;
    
    return (
      <div className="mt-6 border-t pt-4">
        <h3 className="text-lg font-medium mb-3">Customer Information</h3>
        
        {billData?.customer ? (
          // Show assigned customer if bill is already assigned
          <div className="bg-blue-50 p-3 rounded-lg mb-4">
            <div className="flex justify-between">
              <div>
                <p className="font-medium">{billData.customer.name}</p>
                {billData.customer.phone && (
                  <p className="text-sm text-gray-600">Phone: {billData.customer.phone}</p>
                )}
              </div>
              <button 
                className="text-blue-600 text-sm hover:underline"
                onClick={() => setSelectedCustomerId(null)}
              >
                Change
              </button>
            </div>
          </div>
        ) : (
          // Show customer selection options
          <div>
            {showCustomerForm ? (
              // New Customer Form
              <div className="bg-blue-50 p-3 rounded-lg mb-4">
                <h4 className="font-medium mb-2">Add New Customer</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      className="w-full p-2 border rounded-md"
                      placeholder="Customer name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Phone (optional)</label>
                    <input
                      type="text"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      className="w-full p-2 border rounded-md"
                      placeholder="Phone number"
                    />
                  </div>
                  <div className="flex space-x-2">
                    <button
                      className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                      onClick={handleCreateCustomer}
                      disabled={createCustomerMutation.isPending}
                    >
                      {createCustomerMutation.isPending ? 'Saving...' : 'Save Customer'}
                    </button>
                    <button
                      className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
                      onClick={() => setShowCustomerForm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // Customer Selection UI
              <div>
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Select Customer <span className="text-red-500">*</span></label>
                  <select
                    value={selectedCustomerId || ""}
                    onChange={(e) => setSelectedCustomerId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="">-- Select a customer --</option>
                    
                    {/* Customers with existing due bills section */}
                    {customersWithDueBills && customersWithDueBills.length > 0 && (
                      <optgroup label="Customers with Due Bills">
                        {customersWithDueBills.map((customer: any) => (
                          <option key={`due-${customer.id}`} value={customer.id}>
                            {customer.name} ({customer.bills?.length || 0} due bills)
                          </option>
                        ))}
                      </optgroup>
                    )}
                    
                    {/* All customers section */}
                    {customers && customers.length > 0 && (
                      <optgroup label="All Customers">
                        {customers.map((customer: any) => (
                          <option key={`all-${customer.id}`} value={customer.id}>
                            {customer.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
                
                <button
                  className="text-blue-600 text-sm hover:underline"
                  onClick={() => setShowCustomerForm(true)}
                >
                  + Add New Customer
                </button>
              </div>
            )}
          </div>
        )}
        
        <div className="flex space-x-3 mt-4">
          <button
            className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
            onClick={handleSubmitDue}
            disabled={updateBillStatusMutation.isPending}
          >
            {updateBillStatusMutation.isPending && updateBillStatusMutation.variables?.status === PaymentStatus.DUE ? 'Processing...' : 'Confirm Due Bill'}
          </button>
          <button
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            onClick={() => setShowDueForm(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

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
                      Total Amount: {formatCurrency(displayAmount ?? 0)}
                    </p>
                    
                    {/* Amount Received input field - moved to left column under total amount */}
                    {(displayStatus === PaymentStatus.PENDING || displayStatus === PaymentStatus.DUE) && (
                      <div className="mt-3 mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Amount Received <span className="text-red-500">*</span>
                        </label>
                        <div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={amountReceived}
                            onChange={(e) => setAmountReceived(e.target.value)}
                            placeholder={`Enter amount received`}
                            className="w-44 border border-gray-300 rounded-md px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                    )}
                    
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
                        {billData?.amountReceived !== undefined && (
                          <p>Amount received: {formatCurrency(billData.amountReceived ?? 0)}</p>
                        )}
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
                    {/* Only show payment method fields when about to mark as PAID */}
                    {(displayStatus === PaymentStatus.PENDING || displayStatus === PaymentStatus.DUE) && (
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
                      </div>
                    )}
                  </div>
            </div>

                {/* Display customer selection only when explicitly triggered */}
                {renderCustomerSelection()}

                {/* Show action buttons for PENDING status */}
                {displayStatus === PaymentStatus.PENDING && !showDueForm && (
                        <div className="flex space-x-3 mt-4">
                    {/* Only show "Mark as Due" when amount is not zero */}
                    {displayAmount > 0 && (
              <button
                            className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
                    onClick={handleMarkAsDue}
                    disabled={updateBillStatusMutation.isPending}
                  >
                            {updateBillStatusMutation.isPending && updateBillStatusMutation.variables?.status === PaymentStatus.DUE ? 'Processing...' : 'Mark as Due'}
                  </button>
                    )}
                  <button
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    onClick={handleMarkAsPaid}
                    disabled={updateBillStatusMutation.isPending}
                  >
                            {updateBillStatusMutation.isPending && updateBillStatusMutation.variables?.status === PaymentStatus.PAID ? 'Processing...' : 'Mark as Paid'}
                  </button>
                        </div>
                )}

                {/* Add Mark as Paid button for DUE status */}
                {displayStatus === PaymentStatus.DUE && (
                  <div className="flex justify-end mt-4">
                    <button
                      className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                      onClick={handleMarkAsPaid}
                      disabled={updateBillStatusMutation.isPending}
                    >
                      {updateBillStatusMutation.isPending && updateBillStatusMutation.variables?.status === PaymentStatus.PAID ? 'Processing...' : 'Mark as Paid'}
                    </button>
                      </div>
              )}
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