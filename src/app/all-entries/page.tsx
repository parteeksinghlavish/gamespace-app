'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { api } from '~/trpc/react'; // Import tRPC API
import { format, startOfMonth, endOfMonth, parseISO, isValid, isAfter, isBefore, isWithinInterval } from 'date-fns'; // For date formatting
import { DeviceType, SessionStatus, OrderStatus, PaymentStatus } from '~/lib/constants'; // Import enums
import BillModal from '~/app/player-management/BillModal'; // Import BillModal

// Define types for the data we expect (can be refined based on actual API response)
interface Session {
  id: number;
  startTime: string | Date;
  endTime?: string | Date | null;
  duration?: number | null;
  cost?: number | null;
  status: string; // Should match SessionStatus values
  playerCount: number;
  comments?: string | null;
  device: {
    type: string; // Should match DeviceType values
    counterNo: number;
  };
  token: {
    tokenNo: number;
  };
  order?: {
    orderNumber: string;
  } | null;
}

// Define type for Food Order (can be refined)
interface FoodOrderItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
}

// FoodOrder (from API, before flattening for display - ensure it can hold order.status)
interface ApiFoodOrder {
  id: string;
  orderNumber: string;
  startTime: string | Date;
  notes?: string | null;
  status: string; // OrderStatus from Prisma
  token: {
    tokenNo: number;
    // Potentially other token fields from API if needed directly
  };
  sessions?: Array<{ id: number; device: { type: string; counterNo: number } }>;
  bills?: Array<{ amount: number; status: string }>; // Bill payment status
  // raw order fields from backend are implicitly here if ...order is used in mapping
}

// New interface for the flattened table row structure
interface FoodOrderItemRow {
  rowKey: string; // Unique key for React list e.g., `orderId-${itemName}-${itemIndex}`
  orderId: string;
  orderNumber: string;
  tokenNo: number;
  orderStartTime: string | Date;
  itemName: string;
  itemPrice: number;
  itemQuantity: number;
  itemTotal: number;
  orderComments: string; // Extracted non-food part of notes
  orderStatus: string;   // OrderStatus (e.g., ACTIVE, COMPLETED)
}

// Interface for the AllBillsTab
interface BillEntry {
  id: number;
  orderNumber: string | null; // From order?.orderNumber
  tokenNo: number; // From token.tokenNo
  status: string; // Bill status (PaymentStatus)
  totalAmount: number; // Bill amount or correctedAmount
  amountReceived: number | null;
  paymentMethod: string | null;
  generatedAt: string | Date;
}

// Helper function to parse food items from notes (can be moved to a utils file)
// This is a simplified version, adapt as needed from your BillModal or other components
function parseFoodItemsFromNotesForDisplay(notes: string | null | undefined): FoodOrderItem[] {
  if (!notes) {
    return [];
  }
  const foodItemsSectionRegex = /Food items:(.*?)(?:,|$|\n)/i;
  const foodItemsSectionMatch = notes.match(foodItemsSectionRegex);
  if (!foodItemsSectionMatch || typeof foodItemsSectionMatch[1] === 'undefined') {
    return [];
  }
  const itemsString = foodItemsSectionMatch[1].trim();
  if (!itemsString) {
    return [];
  }
  const itemsArray = itemsString.split('|');
  const parsedItems: FoodOrderItem[] = [];
  const itemRegex = /(\d+)x\s*(.*?)\s*\(₹(\d+\.?\d*)\)/;
  for (const itemStr of itemsArray) {
    const match = itemStr.match(itemRegex);
    if (match && match[1] && match[2] && match[3]) {
      const quantity = parseInt(match[1], 10);
      const name = match[2].trim();
      const price = parseFloat(match[3]);
      if (!isNaN(quantity) && !isNaN(price)) {
        // Clean up the name if it has an inner "Nx " prefix, e.g. "1x Item Name"
        const nameParts = name.match(/^(\d+)x\s+(.+)/);
        const cleanedName = nameParts && nameParts[2] ? nameParts[2].trim() : name.trim();

        parsedItems.push({
          name: cleanedName,
          quantity,
          price,
          total: quantity * price,
        });
      }
    }
  }
  return parsedItems;
}

// Helper to extract non-food comments from notes
function extractOtherNotes(notes: string | null | undefined): string {
  if (!notes) return '';
  // Regex to remove "Food items: ..." section, including optional leading/trailing comma and space
  const foodItemsSectionRegex = /(,\s*)?Food items:.*?(?:,|$|\n)/i;
  let otherNotes = notes.replace(foodItemsSectionRegex, '').trim();
  // Clean up remaining leading/trailing commas
  if (otherNotes.startsWith(',')) {
    otherNotes = otherNotes.substring(1).trim();
  }
  if (otherNotes.endsWith(',')) {
    otherNotes = otherNotes.slice(0, -1).trim();
  }
  return otherNotes;
}

// Pagination controls component
const PaginationControls = ({ 
  currentPage, 
  totalPages, 
  itemsPerPage, 
  totalItems,
  onPageChange,
  onItemsPerPageChange 
}: { 
  currentPage: number; 
  totalPages: number; 
  itemsPerPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (count: number) => void;
}) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Calculate the range of items being shown
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  if (!isMounted) {
    return null; // Or a basic placeholder, to match server render if it also can't render this
  }

  return (
    <div className="flex flex-col md:flex-row justify-between items-center mt-4 mb-4 gap-4">
      <div className="text-sm text-gray-700">
        Showing <span className="font-medium">{startItem}</span> to <span className="font-medium">{endItem}</span> of{' '}
        <span className="font-medium">{totalItems}</span> entries
      </div>
      
      <div className="flex items-center space-x-4">
        <label className="text-sm font-medium text-gray-700">Entries per page:</label>
        <select
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
          className="border border-gray-300 bg-white py-1 px-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={250}>250</option>
          <option value={500}>500</option>
        </select>
        
        <div className="flex space-x-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={`px-3 py-1 rounded-md text-sm ${
              currentPage === 1 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Previous
          </button>
          
          <div className="flex items-center space-x-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              // Logic for showing page numbers with ellipsis for many pages
              let pageNum;
              if (totalPages <= 5) {
                // Show all page numbers if 5 or fewer
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                // At the beginning, show first 5 pages
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                // At the end, show last 5 pages
                pageNum = totalPages - 4 + i;
              } else {
                // In the middle, show current page and 2 on each side
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={i}
                  onClick={() => onPageChange(pageNum)}
                  className={`w-8 h-8 flex items-center justify-center rounded-md text-sm ${
                    currentPage === pageNum
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            
            {totalPages > 5 && currentPage < totalPages - 2 && (
              <>
                <span className="px-1">...</span>
                <button
                  onClick={() => onPageChange(totalPages)}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-sm bg-gray-200 text-gray-700 hover:bg-gray-300"
                >
                  {totalPages}
                </button>
              </>
            )}
          </div>
          
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages || totalPages === 0}
            className={`px-3 py-1 rounded-md text-sm ${
              currentPage === totalPages || totalPages === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

const AllGamingSessionsTab = () => {
  const { data: rawSessions, isLoading, error } = api.playerManagement.getAllGamingSessions.useQuery();

  // Filter states
  const [filterDeviceType, setFilterDeviceType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  // Date filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');

  // Sorting states
  type SortableSessionKeys = keyof Session | 'token.tokenNo' | 'device.type' | 'order.orderNumber';
  const [sortKey, setSortKey] = useState<SortableSessionKeys>('startTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc'); // Default to showing newest first

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100); // Default to 100 per page

  // Generate years array for dropdown (last 5 years)
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYear - i);
  }, []);

  // Generate months array for dropdown
  const months = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' }
  ];

  // Clear date range filters if month/year is selected and vice versa
  const handleMonthYearChange = (month: string, year: string) => {
    setFilterMonth(month);
    setFilterYear(year);
    // Clear date range when month/year changes
    if (month || year) {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleDateRangeChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    // Clear month/year when date range changes
    if (start || end) {
      setFilterMonth('');
      setFilterYear('');
    }
  };

  const handleResetFilters = () => {
    setFilterDeviceType('');
    setFilterStatus('');
    setStartDate('');
    setEndDate('');
    setFilterMonth('');
    setFilterYear('');
    setCurrentPage(1);
  };

  const baseSessions: Session[] = useMemo(() => {
    if (!rawSessions) return [];
    return rawSessions.map(session => {
      const costAsNumber = session.cost !== null && session.cost !== undefined ? Number(session.cost) : null;
      return {
        ...session,
        cost: costAsNumber,
        device: {
          type: session.device.type,
          counterNo: session.device.counterNo,
        },
        token: {
          tokenNo: session.token.tokenNo,
        },
        order: session.order ? { orderNumber: session.order.orderNumber } : null,
      };
    });
  }, [rawSessions]);

  const filteredSessions = useMemo(() => {
    let filtered = [...baseSessions];

    // Device Type filter
    if (filterDeviceType) {
      filtered = filtered.filter(s => s.device.type === filterDeviceType);
    }
    
    // Status filter
    if (filterStatus) {
      filtered = filtered.filter(s => s.status === filterStatus);
    }

    // Date range filter
    if (startDate && endDate) {
      const startDateObj = parseISO(startDate);
      const endDateObj = parseISO(endDate);
      
      if (isValid(startDateObj) && isValid(endDateObj)) {
        // Add one day to end date to include the end date in the range
        const adjustedEndDate = new Date(endDateObj);
        adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);
        
        filtered = filtered.filter(session => {
          const sessionDate = new Date(session.startTime);
          return isAfter(sessionDate, startDateObj) && isBefore(sessionDate, adjustedEndDate);
        });
      }
    }
    
    // Month and Year filter
    if (filterMonth && filterYear) {
      const monthStart = startOfMonth(new Date(`${filterYear}-${filterMonth}-01`));
      const monthEnd = endOfMonth(monthStart);
      
      filtered = filtered.filter(session => {
        const sessionDate = new Date(session.startTime);
        return isWithinInterval(sessionDate, { start: monthStart, end: monthEnd });
      });
    } else if (filterYear) {
      // Only year is selected
      const yearStart = new Date(`${filterYear}-01-01`);
      const yearEnd = new Date(`${filterYear}-12-31T23:59:59.999Z`);
      
      filtered = filtered.filter(session => {
        const sessionDate = new Date(session.startTime);
        return isWithinInterval(sessionDate, { start: yearStart, end: yearEnd });
      });
    } else if (filterMonth) {
      // Only month is selected (use current year)
      const currentYear = new Date().getFullYear();
      const monthStart = startOfMonth(new Date(`${currentYear}-${filterMonth}-01`));
      const monthEnd = endOfMonth(monthStart);
      
      filtered = filtered.filter(session => {
        const sessionDate = new Date(session.startTime);
        return (
          sessionDate.getMonth() + 1 === parseInt(filterMonth, 10) && 
          isWithinInterval(sessionDate, { start: monthStart, end: monthEnd })
        );
      });
    }

    return filtered;
  }, [baseSessions, filterDeviceType, filterStatus, startDate, endDate, filterMonth, filterYear]);

  const sortedSessions = useMemo(() => {
    let sorted = [...filteredSessions];
    
    if (sortKey) {
      sorted.sort((a, b) => {
        // Helper to get nested properties
        const getNestedValue = (obj: any, path: string) => path.split('.').reduce((o, k) => (o || {})[k], obj);

        const valA = getNestedValue(a, sortKey);
        const valB = getNestedValue(b, sortKey);

        // Handle different types
        if (valA === null || valA === undefined) return sortOrder === 'asc' ? -1 : 1;
        if (valB === null || valB === undefined) return sortOrder === 'asc' ? 1 : -1;
        
        if (sortKey === 'startTime' || sortKey === 'endTime') {
            const dateA = new Date(valA as string | Date).getTime();
            const dateB = new Date(valB as string | Date).getTime();
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        }

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0; 
      });
    }
    return sorted;
  }, [filteredSessions, sortKey, sortOrder]);

  // Apply pagination
  const displayedSessions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedSessions.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedSessions, currentPage, itemsPerPage]);

  // Calculate total pages
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(sortedSessions.length / itemsPerPage));
  }, [sortedSessions.length, itemsPerPage]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [filterDeviceType, filterStatus, startDate, endDate, filterMonth, filterYear]);

  const handleSort = (key: SortableSessionKeys) => {
    if (sortKey === key) {
      setSortOrder(prevOrder => prevOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const renderSortArrow = (key: SortableSessionKeys) => {
    if (sortKey === key) {
      return sortOrder === 'asc' ? ' ▲' : ' ▼';
    }
    return '';
  };

  if (isLoading) return <div className="p-4 text-center">Loading gaming sessions...</div>;
  if (error) return <div className="p-4 text-red-600 text-center">Error loading sessions: {error.message}</div>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">
        All Gaming Sessions ({filteredSessions.length} / {baseSessions.length})
      </h2>

      {/* Improved Filter UI */}
      <div className="mb-6 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-700">Filters</h3>
        </div>
        
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left column - Type filter and Status filter */}
            <div className="space-y-4">
              <div>
                <label htmlFor="filterDeviceType" className="block text-sm font-medium text-gray-700 mb-1">Device Type</label>
                <select
                  id="filterDeviceType"
                  value={filterDeviceType}
                  onChange={(e) => setFilterDeviceType(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">All Types</option>
                  {Object.values(DeviceType).map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor="filterStatus" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  id="filterStatus"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">All Statuses</option>
                  {Object.values(SessionStatus).map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Right column - Date filters */}
            <div>
              <fieldset className="border border-gray-200 rounded-md p-3">
                <legend className="text-sm font-medium text-gray-700 px-2">Date Filters</legend>
                
                {/* Date Range */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Date Range</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="startDate" className="block text-xs text-gray-500 mb-1">From</label>
                      <input
                        type="date"
                        id="startDate"
                        value={startDate}
                        onChange={(e) => handleDateRangeChange(e.target.value, endDate)}
                        disabled={!!(filterMonth || filterYear)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="endDate" className="block text-xs text-gray-500 mb-1">To</label>
                      <input
                        type="date"
                        id="endDate"
                        value={endDate}
                        min={startDate}
                        onChange={(e) => handleDateRangeChange(startDate, e.target.value)}
                        disabled={!!(filterMonth || filterYear)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                  </div>
                </div>
                
                {/* Month & Year Section */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Month & Year</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="filterMonth" className="block text-xs text-gray-500 mb-1">Month</label>
                      <select
                        id="filterMonth"
                        value={filterMonth}
                        onChange={(e) => handleMonthYearChange(e.target.value, filterYear)}
                        disabled={!!(startDate || endDate)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="">All Months</option>
                        {months.map(month => (
                          <option key={month.value} value={month.value}>{month.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="filterYear" className="block text-xs text-gray-500 mb-1">Year</label>
                      <select
                        id="filterYear"
                        value={filterYear}
                        onChange={(e) => handleMonthYearChange(filterMonth, e.target.value)}
                        disabled={!!(startDate || endDate)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      >
                        <option value="">All Years</option>
                        {years.map(year => (
                          <option key={year} value={year.toString()}>{year}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </fieldset>
            </div>
          </div>
        </div>

        {/* Filter Actions */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={handleResetFilters}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Reset Filters
          </button>
        </div>
      </div>
      
      {filteredSessions.length === 0 && !isLoading && (
         <div className="p-4 text-center text-gray-500">No gaming sessions match your filters.</div>
      )}

      {/* Pagination component at the top */}
      {filteredSessions.length > 0 && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          totalItems={filteredSessions.length}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      )}

      <div className="shadow border-b border-gray-200 sm:rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {[
                { key: 'token.tokenNo', label: 'Token' },
                { key: 'order.orderNumber', label: 'Order #' },
                { key: 'device.type', label: 'Device' },
                { key: 'playerCount', label: 'Players' },
                { key: 'startTime', label: 'Start Time' },
                { key: 'endTime', label: 'End Time' },
                { key: 'duration', label: 'Duration' },
                { key: 'cost', label: 'Cost' },
                { key: 'status', label: 'Status' },
                { key: 'comments', label: 'Comments' },
              ].map(header => (
                <th 
                  key={header.key} 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort(header.key as SortableSessionKeys)}
                >
                  {header.label}
                  {renderSortArrow(header.key as SortableSessionKeys)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {displayedSessions.map((session) => (
              <tr key={session.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{session.token.tokenNo}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{session.order?.orderNumber || 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{session.device.type} {session.device.counterNo}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{session.playerCount}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{format(new Date(session.startTime), 'Pp')}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {session.endTime ? format(new Date(session.endTime), 'Pp') : 'Active'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{session.duration ? `${session.duration} mins` : '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {typeof session.cost === 'number' ? `₹${session.cost.toFixed(2)}` : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${session.status === SessionStatus.ACTIVE ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {session.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-xs truncate" title={session.comments || ''}>{session.comments || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination component at the bottom */}
      {filteredSessions.length > 0 && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          totalItems={filteredSessions.length}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      )}
    </div>
  );
};

const AllFoodOrdersTab = () => {
  const { data: rawOrders, isLoading, error } = api.playerManagement.getAllFoodOrders.useQuery();

  // Filter states
  const [filterOrderNumber, setFilterOrderNumber] = useState('');
  const [filterTokenNo, setFilterTokenNo] = useState('');
  const [filterOrderStatus, setFilterOrderStatus] = useState(''); // New filter for Order Status
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');

  // Sorting states
  type SortableFoodItemRowKeys = keyof FoodOrderItemRow;
  const [sortKey, setSortKey] = useState<SortableFoodItemRowKeys>('orderStartTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYear - i);
  }, []);

  const months = [
    { value: '01', label: 'January' }, { value: '02', label: 'February' }, { value: '03', label: 'March' },
    { value: '04', label: 'April' }, { value: '05', label: 'May' }, { value: '06', label: 'June' },
    { value: '07', label: 'July' }, { value: '08', label: 'August' }, { value: '09', label: 'September' },
    { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' }
  ];

  const handleMonthYearChange = (month: string, year: string) => {
    setFilterMonth(month);
    setFilterYear(year);
    if (month || year) {
      setFilterStartDate('');
      setFilterEndDate('');
    }
  };

  const handleDateRangeChange = (start: string, end: string) => {
    setFilterStartDate(start);
    setFilterEndDate(end);
    if (start || end) {
      setFilterMonth('');
      setFilterYear('');
    }
  };

  const handleResetFilters = () => {
    setFilterOrderNumber('');
    setFilterTokenNo('');
    setFilterOrderStatus('');
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterMonth('');
    setFilterYear('');
    setCurrentPage(1);
  };

  // Memoized function to derive FoodOrderItemRow[] from rawOrders
  const foodOrderRows = useMemo(() => {
    if (!rawOrders) return [];

    // Explicitly type `order` if inference is tricky, but usually TS infers it well from rawOrders
    // For clarity here, let's assume `order` is of a type compatible with `ApiFoodOrder` structure
    // coming from the API, which includes `Decimal` for amounts.
    const ordersWithNumericBillAmounts = rawOrders.map(order => ({
      ...order,
      startTime: order.startTime, 
      bills: order.bills ? order.bills.map(bill => ({
        ...bill,
        // bill.amount is Decimal from Prisma, convert to number
        amount: Number(bill.amount), 
      })) : undefined,
    }));

    // Now, ordersWithNumericBillAmounts should be an array where each element
    // conforms to ApiFoodOrder's expectation of bill.amount being a number.
    const rows: FoodOrderItemRow[] = [];
    ordersWithNumericBillAmounts.forEach((order: ApiFoodOrder) => { // Explicitly type here to match usage below
      const parsedFoodItems = parseFoodItemsFromNotesForDisplay(order.notes);
      const orderComments = extractOtherNotes(order.notes);

      if (parsedFoodItems.length > 0) {
        parsedFoodItems.forEach((item, index) => {
          rows.push({
            rowKey: `${order.id}-${item.name}-${index}`,
            orderId: order.id,
            orderNumber: order.orderNumber,
            tokenNo: order.token.tokenNo,
            orderStartTime: order.startTime,
            itemName: item.name,
            itemPrice: item.price,
            itemQuantity: item.quantity,
            itemTotal: item.total,
            orderComments: orderComments,
            orderStatus: order.status as OrderStatus,
          });
        });
      } else {
        // No food items were parsed from notes.
        // Only add an "N/A" placeholder row if the original 'notes' field was non-empty.
        // This handles cases where notes might contain only comments or a malformed food string.
        // Orders with null or completely empty notes will be skipped.
        if (order.notes && order.notes.trim() !== '') {
          rows.push({
            rowKey: `${order.id}-no-food-0`,
            orderId: order.id,
            orderNumber: order.orderNumber,
            tokenNo: order.token.tokenNo,
            orderStartTime: order.startTime,
            itemName: 'N/A',
            itemPrice: 0,
            itemQuantity: 0,
            itemTotal: 0,
            orderComments: orderComments,
            orderStatus: order.status as OrderStatus,
          });
        }
      }
    });
    return rows;
  }, [rawOrders]);

  const filteredOrderItemRows = useMemo(() => {
    let filtered = [...foodOrderRows];
    if (filterOrderNumber) filtered = filtered.filter(row => row.orderNumber.toLowerCase().includes(filterOrderNumber.toLowerCase()));
    if (filterTokenNo) filtered = filtered.filter(row => row.tokenNo.toString().includes(filterTokenNo));
    if (filterOrderStatus) filtered = filtered.filter(row => row.orderStatus === filterOrderStatus);

    if (filterStartDate && filterEndDate) {
      const start = parseISO(filterStartDate); const end = parseISO(filterEndDate);
      if (isValid(start) && isValid(end)) {
        const adjEnd = new Date(end); adjEnd.setDate(adjEnd.getDate() + 1);
        filtered = filtered.filter(row => isAfter(new Date(row.orderStartTime), start) && isBefore(new Date(row.orderStartTime), adjEnd));
      }
    }
    if (filterMonth && filterYear) {
      const monthStart = startOfMonth(new Date(`${filterYear}-${filterMonth}-01`));
      const monthEnd = endOfMonth(monthStart);
      filtered = filtered.filter(row => isWithinInterval(new Date(row.orderStartTime), { start: monthStart, end: monthEnd }));
    } else if (filterYear) {
      const yearStart = new Date(`${filterYear}-01-01`); const yearEnd = new Date(`${filterYear}-12-31T23:59:59.999Z`);
      filtered = filtered.filter(row => isWithinInterval(new Date(row.orderStartTime), { start: yearStart, end: yearEnd }));
    } else if (filterMonth) {
      const currentYear = new Date().getFullYear();
      const monthStart = startOfMonth(new Date(`${currentYear}-${filterMonth}-01`)); const monthEnd = endOfMonth(monthStart);
      filtered = filtered.filter(row => new Date(row.orderStartTime).getMonth() + 1 === parseInt(filterMonth, 10) && isWithinInterval(new Date(row.orderStartTime), { start: monthStart, end: monthEnd }));
    }
    return filtered;
  }, [foodOrderRows, filterOrderNumber, filterTokenNo, filterOrderStatus, filterStartDate, filterEndDate, filterMonth, filterYear]);

  const sortedOrderItemRows = useMemo(() => {
    let sorted = [...filteredOrderItemRows];
    if (sortKey) {
      sorted.sort((a, b) => {
        const valA = a[sortKey];
        const valB = b[sortKey];

        if (valA === null || valA === undefined) return sortOrder === 'asc' ? -1 : 1;
        if (valB === null || valB === undefined) return sortOrder === 'asc' ? 1 : -1;

        if (sortKey === 'orderStartTime') {
          return sortOrder === 'asc' ? new Date(valA as string | Date).getTime() - new Date(valB as string | Date).getTime() : new Date(valB as string | Date).getTime() - new Date(valA as string | Date).getTime();
        }
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
      });
    }
    return sorted;
  }, [filteredOrderItemRows, sortKey, sortOrder]);

  const displayedOrderItemRows = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedOrderItemRows.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedOrderItemRows, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(sortedOrderItemRows.length / itemsPerPage)), [sortedOrderItemRows.length, itemsPerPage]);

  useMemo(() => setCurrentPage(1), [filterOrderNumber, filterTokenNo, filterOrderStatus, filterStartDate, filterEndDate, filterMonth, filterYear]);

  const handleSort = (key: SortableFoodItemRowKeys) => {
    if (sortKey === key) setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortOrder('asc'); }
  };

  const renderSortArrow = (key: SortableFoodItemRowKeys) => (sortKey === key ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : '');

  if (isLoading) return <div className="p-4 text-center">Loading food orders...</div>;
  if (error) return <div className="p-4 text-red-600 text-center">Error loading food orders: {error.message}</div>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">
        All Food Orders ({filteredOrderItemRows.length} / {foodOrderRows.length} item entries)
      </h2>

      {/* Filter UI for Food Orders */}
      <div className="mb-6 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-700">Filters</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Column 1: Order #, Token #, Status */}
            <div className="space-y-4">
              <div>
                <label htmlFor="filterOrderNumberFood" className="block text-sm font-medium text-gray-700 mb-1">Order Number</label>
                <input type="text" id="filterOrderNumberFood" value={filterOrderNumber} onChange={(e) => setFilterOrderNumber(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="Filter by Order No."/>
              </div>
              <div>
                <label htmlFor="filterTokenNoFood" className="block text-sm font-medium text-gray-700 mb-1">Token No.</label>
                <input type="text" id="filterTokenNoFood" value={filterTokenNo} onChange={(e) => setFilterTokenNo(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="Filter by Token No."/>
              </div>
              <div>
                <label htmlFor="filterOrderStatus" className="block text-sm font-medium text-gray-700 mb-1">Order Status</label>
                <select id="filterOrderStatus" value={filterOrderStatus} onChange={(e) => setFilterOrderStatus(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                  <option value="">All Statuses</option>
                  {Object.values(OrderStatus).map(status => (<option key={status} value={status}>{status}</option>))}
                </select>
              </div>
            </div>

            {/* Column 2 & 3: Date Filters (spanning 2 virtual columns for layout) */}
            <div className="md:col-span-2">
              <fieldset className="border border-gray-200 rounded-md p-3 h-full">
                <legend className="text-sm font-medium text-gray-700 px-2">Date Filters</legend>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Date Range</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="filterStartDateFood" className="block text-xs text-gray-500 mb-1">From</label>
                        <input type="date" id="filterStartDateFood" value={filterStartDate} onChange={(e) => handleDateRangeChange(e.target.value, filterEndDate)} disabled={!!(filterMonth || filterYear)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                      </div>
                      <div>
                        <label htmlFor="filterEndDateFood" className="block text-xs text-gray-500 mb-1">To</label>
                        <input type="date" id="filterEndDateFood" value={filterEndDate} min={filterStartDate} onChange={(e) => handleDateRangeChange(filterStartDate, e.target.value)} disabled={!!(filterMonth || filterYear)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Month & Year</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="filterMonthFood" className="block text-xs text-gray-500 mb-1">Month</label>
                        <select id="filterMonthFood" value={filterMonth} onChange={(e) => handleMonthYearChange(e.target.value, filterYear)} disabled={!!(filterStartDate || filterEndDate)} className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                          <option value="">All Months</option>
                          {months.map(month => (<option key={month.value} value={month.value}>{month.label}</option>))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="filterYearFood" className="block text-xs text-gray-500 mb-1">Year</label>
                        <select id="filterYearFood" value={filterYear} onChange={(e) => handleMonthYearChange(filterMonth, e.target.value)} disabled={!!(filterStartDate || filterEndDate)} className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                          <option value="">All Years</option>
                          {years.map(year => (<option key={year} value={year.toString()}>{year}</option>))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </fieldset>
            </div>
          </div>
        </div>
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button onClick={handleResetFilters} className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Reset Filters</button>
        </div>
      </div>

      {filteredOrderItemRows.length === 0 && !isLoading && (
        <div className="p-4 text-center text-gray-500">No food order items match your filters.</div>
      )}

      {filteredOrderItemRows.length > 0 && (
        <PaginationControls currentPage={currentPage} totalPages={totalPages} itemsPerPage={itemsPerPage} totalItems={filteredOrderItemRows.length} onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage}/>
      )}

      <div className="shadow border-b border-gray-200 sm:rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {/* Order #, Token, Date, Item, Price, Quantity, Total, Comments, Status */}
              {[
                { key: 'orderNumber', label: 'Order #' },
                { key: 'tokenNo', label: 'Token' },
                { key: 'orderStartTime', label: 'Date' },
                { key: 'itemName', label: 'Item' },
                { key: 'itemPrice', label: 'Price' },
                { key: 'itemQuantity', label: 'Quantity' },
                { key: 'itemTotal', label: 'Total' },
                { key: 'orderComments', label: 'Comments' },
                { key: 'orderStatus', label: 'Status' },
              ].map(header => (
                <th key={header.key} scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort(header.key as SortableFoodItemRowKeys)}>
                  {header.label}
                  {renderSortArrow(header.key as SortableFoodItemRowKeys)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {displayedOrderItemRows.map((row) => (
              <tr key={row.rowKey} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.orderNumber}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.tokenNo}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{format(new Date(row.orderStartTime), 'Pp')}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.itemName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{`₹${row.itemPrice.toFixed(2)}`}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{row.itemQuantity}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{`₹${row.itemTotal.toFixed(2)}`}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-xs truncate" title={row.orderComments}>{row.orderComments || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${row.orderStatus === OrderStatus.ACTIVE ? 'bg-blue-100 text-blue-800' : row.orderStatus === OrderStatus.COMPLETED ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {row.orderStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredOrderItemRows.length > 0 && (
        <PaginationControls currentPage={currentPage} totalPages={totalPages} itemsPerPage={itemsPerPage} totalItems={filteredOrderItemRows.length} onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage}/>
      )}
    </div>
  );
};

const AllBillsTab = ({ onViewBill }: { onViewBill: (billId: number) => void }) => {
  const { data: rawBills, isLoading, error } = api.playerManagement.getAllBills.useQuery();

  const bills: BillEntry[] = useMemo(() => {
    if (!rawBills) return [];
    return rawBills.map(bill => ({
      id: bill.id,
      orderNumber: bill.order?.orderNumber || 'N/A',
      tokenNo: bill.token.tokenNo,
      status: bill.status, // This is PaymentStatus
      totalAmount: Number(bill.correctedAmount ?? bill.amount),
      amountReceived: bill.amountReceived ? Number(bill.amountReceived) : null,
      paymentMethod: bill.paymentMethod || 'N/A',
      generatedAt: bill.generatedAt,
    }));
  }, [rawBills]);

  // TODO: Implement states for filtering, sorting, pagination
  // For now, just display fetched data

  if (isLoading) return <div className="p-4 text-center">Loading bills...</div>;
  if (error) return <div className="p-4 text-red-600 text-center">Error loading bills: {error.message}</div>;
  if (!bills.length) return <div className="p-4 text-center text-gray-500">No bills found.</div>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">
        All Bills ({bills.length})
      </h2>
      {/* TODO: Add Filters and Pagination Controls here */}
      <div className="shadow border-b border-gray-200 sm:rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {[                
                { key: 'orderNumber', label: 'Order #' },
                { key: 'tokenNo', label: 'Token' },
                { key: 'status', label: 'Status' },
                { key: 'totalAmount', label: 'Total Amount' },
                { key: 'amountReceived', label: 'Amount Received' },
                { key: 'paymentMethod', label: 'Payment Method' },
                { key: 'generatedAt', label: 'Generated At' },
                { key: 'link', label: 'Link to Bill' }, // Placeholder
              ].map(header => (
                <th 
                  key={header.key} 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  // onClick={() => handleSort(header.key as SortableBillKeys)} // TODO: Add sorting
                >
                  {header.label}
                  {/* {renderSortArrow(header.key as SortableBillKeys)} // TODO: Add sort arrow */}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {bills.map((bill) => (
              <tr key={bill.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-center">{bill.orderNumber}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{bill.tokenNo}</td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${ 
                    bill.status === PaymentStatus.PAID ? 'bg-green-100 text-green-800' : 
                    bill.status === PaymentStatus.PENDING ? 'bg-yellow-100 text-yellow-800' : 
                    bill.status === PaymentStatus.DUE ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {bill.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{`₹${bill.totalAmount.toFixed(2)}`}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{bill.amountReceived !== null ? `₹${bill.amountReceived.toFixed(2)}` : '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{bill.paymentMethod}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{format(new Date(bill.generatedAt), 'Pp')}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                  <button 
                    onClick={() => onViewBill(bill.id)}
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    View Bill
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* TODO: Add Pagination Controls here */}
    </div>
  );
};

export default function AllEntriesPage() {
  const [activeTab, setActiveTab] = useState<'gaming' | 'food' | 'bills'>('gaming');
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [selectedBillIdForModal, setSelectedBillIdForModal] = useState<number | null>(null);

  const utils = api.useUtils(); // For refetching data

  const handleViewBill = (billId: number) => {
    setSelectedBillIdForModal(billId);
    setIsBillModalOpen(true);
  };

  const handleCloseBillModal = () => {
    setIsBillModalOpen(false);
    setSelectedBillIdForModal(null);
  };

  const handleBillModalSuccess = () => {
    handleCloseBillModal();
    utils.playerManagement.getAllBills.invalidate(); // Refetch bills after modal success
    // Potentially refetch other data if BillModal affects other tabs
    utils.playerManagement.getTodaySessions.invalidate(); 
    utils.playerManagement.getUnpaidBills.invalidate();
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold leading-tight text-gray-900">All Entries</h1>
      </header>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('gaming')}
            className={`
              ${activeTab === 'gaming'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
            `}
          >
            Gaming Sessions
          </button>
          <button
            onClick={() => setActiveTab('food')}
            className={`
              ${activeTab === 'food'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
            `}
          >
            Food Orders
          </button>
          <button
            onClick={() => setActiveTab('bills')}
            className={`
              ${activeTab === 'bills'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
            `}
          >
            All Bills
          </button>
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'gaming' && <AllGamingSessionsTab />}
        {activeTab === 'food' && <AllFoodOrdersTab />}
        {activeTab === 'bills' && <AllBillsTab onViewBill={handleViewBill} />}
      </div>

      {isBillModalOpen && selectedBillIdForModal !== null && (
        <BillModal
          isOpen={isBillModalOpen}
          billId={selectedBillIdForModal} // Pass only billId, modal should fetch other details if needed
          onClose={handleCloseBillModal}
          onSuccess={handleBillModalSuccess} // Handle successful bill update/payment
          // Note: BillModal might also need tokenId or orderId for its initial generation logic
          // if a billId is not found or for creating a NEW bill. 
          // For viewing an existing bill, billId is primary.
          // We might need to pass undefined for tokenId/orderId or adjust BillModal if it strictly requires them.
          // For now, assuming BillModal can operate with billId for viewing an existing bill.
        />
      )}
    </div>
  );
} 