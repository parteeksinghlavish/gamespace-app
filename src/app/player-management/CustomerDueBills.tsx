'use client';

import React, { useState } from 'react';
import { api } from '~/trpc/react';
import { PaymentStatus } from '~/lib/constants';
import { formatCurrency } from '~/lib/utils';
import { format } from 'date-fns';
import BillModal from './BillModal';

// Define interfaces for TypeScript
interface Customer {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  bills: Bill[];
}

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
  };
  order?: {
    id: string;
    orderNumber: string;
    status: string;
  };
  customerId?: number;
  customer?: {
    id: number;
    name: string;
    phone?: string;
  };
}

export default function CustomerDueBills() {
  const [showBillModal, setShowBillModal] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  
  const { data: customers, isLoading, refetch } = api.playerManagement.getCustomersWithDueBills.useQuery();
  
  // Handle viewing a bill
  const handleViewBill = (billId: number) => {
    setSelectedBillId(billId);
    setShowBillModal(true);
  };
  
  // Handle modal close
  const handleModalClose = () => {
    setShowBillModal(false);
    setSelectedBillId(null);
  };
  
  // Handle success (bill updated)
  const handleSuccess = () => {
    refetch();
  };
  
  // Format date for display
  const formatDate = (date: Date | string) => {
    return format(new Date(date), 'MMM dd, yyyy h:mm a');
  };
  
  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
        <p className="mt-2">Loading customer data...</p>
      </div>
    );
  }
  
  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold mb-6">Customers with Due Bills</h2>
      
      {customers && customers.length > 0 ? (
        <div className="space-y-6">
          {customers.map((customer: Customer) => (
            <div key={customer.id} className="border rounded-lg overflow-hidden">
              <div className="bg-blue-50 p-4 flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-lg">{customer.name}</h3>
                  {customer.phone && <p className="text-sm text-gray-600">Phone: {customer.phone}</p>}
                </div>
                <div className="text-right">
                  <p className="font-medium">
                    {customer.bills.length} {customer.bills.length === 1 ? 'Bill' : 'Bills'} Due
                  </p>
                  <p className="text-blue-600 font-medium">
                    {formatCurrency(customer.bills.reduce((sum: number, bill: Bill) => 
                      sum + (bill.correctedAmount || bill.amount as number), 0))}
                  </p>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Order
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Token
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Generated
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {customer.bills.map((bill: Bill) => (
                      <tr key={bill.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {bill.order ? (
                            <span>{bill.order.orderNumber}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {bill.token?.tokenNo ? (
                            <span className="text-sm text-gray-600">Token #{bill.token.tokenNo}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(bill.generatedAt)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatCurrency(bill.correctedAmount || bill.amount)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => handleViewBill(bill.id)}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            View/Pay
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No customers with due bills found</p>
        </div>
      )}
      
      {showBillModal && selectedBillId && (
        <BillModal 
          isOpen={showBillModal}
          onClose={handleModalClose}
          billId={selectedBillId}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
} 