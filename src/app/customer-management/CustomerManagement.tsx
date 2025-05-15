'use client';

import { useState } from 'react';
import { api } from '~/trpc/react';
import { PaymentStatus } from '~/lib/constants';
import BillModal from '../player-management/BillModal';
import { formatCurrency, formatDate } from '~/lib/utils';
import { format } from 'date-fns';

// Define interfaces for TypeScript
interface Customer {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  bills?: Bill[];
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

export default function CustomerManagement() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const [showBillModal, setShowBillModal] = useState(false);

  const utils = api.useUtils();

  // Get all customers
  const { data: customers, isLoading } = api.playerManagement.getCustomers.useQuery();
  
  // Get customers with due bills
  const { data: customersWithDueBills, isLoading: dueBillsLoading } = 
    api.playerManagement.getCustomersWithDueBills.useQuery();

  // Mutation to create a new customer
  const createCustomerMutation = api.playerManagement.createCustomer.useMutation({
    onSuccess: () => {
      // Reset form fields
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerEmail('');
      setShowCreateForm(false);
      
      // Refresh customers list
      utils.playerManagement.getCustomers.invalidate();
      showToast('Customer added successfully', 'success');
    },
    onError: (error) => {
      showToast(`Error creating customer: ${error.message}`, 'error');
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

  // Handle customer creation
  const handleCreateCustomer = () => {
    if (!newCustomerName.trim()) {
      showToast('Please enter a customer name', 'error');
      return;
    }

    createCustomerMutation.mutate({
      name: newCustomerName,
      phone: newCustomerPhone || undefined,
      email: newCustomerEmail || undefined,
    });
  };

  // Handle viewing a bill
  const handleViewBill = (billId: number) => {
    setSelectedBillId(billId);
    setShowBillModal(true);
  };

  // Handle success (bill updated)
  const handleBillSuccess = () => {
    // Refresh customer lists
    utils.playerManagement.getCustomers.invalidate();
    utils.playerManagement.getCustomersWithDueBills.invalidate();
  };

  // Loading state
  if (isLoading && dueBillsLoading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
        <p className="mt-2">Loading customer data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Customer Creation Form */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold">Customer Management</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {showCreateForm ? 'Cancel' : '+ Add New Customer'}
          </button>
        </div>

        {showCreateForm && (
          <div className="bg-blue-50 p-4 rounded-lg mb-6">
            <h3 className="text-lg font-medium mb-4">Create New Customer</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Name *</label>
                <input
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  placeholder="Customer name"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Phone</label>
                <input
                  type="text"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  placeholder="Phone number"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="block text-sm font-medium">Email</label>
                <input
                  type="email"
                  value={newCustomerEmail}
                  onChange={(e) => setNewCustomerEmail(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  placeholder="Email address"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  onClick={handleCreateCustomer}
                  disabled={createCustomerMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {createCustomerMutation.isPending ? 'Creating...' : 'Create Customer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* All Customers List */}
        <div>
          <h3 className="text-lg font-medium mb-3">All Customers</h3>
          {customers && customers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Due Bills
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {customers.map((customer: Customer) => (
                    <tr key={customer.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{customer.name}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {customer.phone && <div>Phone: {customer.phone}</div>}
                          {customer.email && <div>Email: {customer.email}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {customersWithDueBills?.find((c: Customer) => c.id === customer.id) ? (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            Has due bills
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">No due bills</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <p className="text-gray-500">No customers found</p>
            </div>
          )}
        </div>
      </div>

      {/* Customers with Due Bills */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold mb-6">Customers with Due Bills</h2>
        
        {customersWithDueBills && customersWithDueBills.length > 0 ? (
          <div className="space-y-6">
            {customersWithDueBills.map((customer: Customer) => (
              <div key={customer.id} className="border rounded-lg overflow-hidden">
                <div className="bg-blue-50 p-4 flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-lg">{customer.name}</h3>
                    {customer.phone && <p className="text-sm text-gray-600">Phone: {customer.phone}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {customer.bills?.length} {customer.bills?.length === 1 ? 'Bill' : 'Bills'} Due
                    </p>
                    <p className="text-blue-600 font-medium">
                      {formatCurrency(customer.bills?.reduce((sum: number, bill: Bill) => 
                        sum + (bill.correctedAmount || bill.amount), 0) || 0)}
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
                      {customer.bills?.map((bill: Bill) => (
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
      </div>

      {/* Bill Modal */}
      {showBillModal && selectedBillId && (
        <BillModal 
          isOpen={showBillModal}
          onClose={() => setShowBillModal(false)}
          billId={selectedBillId}
          onSuccess={handleBillSuccess}
        />
      )}
    </div>
  );
} 