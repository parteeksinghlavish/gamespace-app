'use client';

import type { ChangeEvent } from 'react';
import { useState, useEffect } from 'react';
import { foodMenu } from '~/lib/foodMenu';
import type { FoodItem, FoodVariant } from '~/lib/foodMenu';

// Order item type for tracking selections
type OrderItem = {
  id: string;
  categoryId: string;
  itemId: string;
  name: string;
  variantName: string;
  price: number;
  quantity: number;
  total: number;
};

type NewFoodOrderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (order: {
    tokenId: number;
    tokenNo: number;
    items: Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
      total: number;
    }>;
    totalAmount: number;
  }) => void;
  activeTokens: number[];
  existingOrderId?: string;
  preselectedTokenNo?: number;
};

const NewFoodOrderModal = ({ 
  isOpen, 
  onClose, 
  onSubmit,
  activeTokens = [],
  existingOrderId,
  preselectedTokenNo
}: NewFoodOrderModalProps) => {
  const [selectedToken, setSelectedToken] = useState<number | null>(null);
  const [isCreatingNewToken, setIsCreatingNewToken] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<FoodVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  
  // Reset state when modal opens or preselectedTokenNo changes
  useEffect(() => {
    if (isOpen) {
      if (preselectedTokenNo) {
        setSelectedToken(preselectedTokenNo);
        setIsCreatingNewToken(false);
      } else {
        setSelectedToken(null); 
        // Reset new token flag if not preselected
        // User must explicitly click "+ New Token" each time if they want a new one
        setIsCreatingNewToken(false); 
      }
      setSelectedCategory(null);
      setSelectedItem(null);
      setSelectedVariant(null);
      setQuantity(1);
      setOrderItems([]);
      setOrderTotal(0);
    }
  }, [isOpen, preselectedTokenNo]); // Add preselectedTokenNo to dependency array

  // Update order total whenever items change
  useEffect(() => {
    const total = orderItems.reduce((sum, item) => sum + item.total, 0);
    setOrderTotal(total);
  }, [orderItems]);

  // Handle category selection
  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setSelectedItem(null);
    setSelectedVariant(null);
  };

  // Handle item selection
  const handleItemSelect = (item: FoodItem) => {
    setSelectedItem(item);
    // Automatically select the first variant if only one exists
    if (item.variants.length === 1) {
      setSelectedVariant(item.variants[0] ?? null);
    } else {
      setSelectedVariant(null);
    }
  };

  // Handle variant selection
  const handleVariantSelect = (variant: FoodVariant) => {
    setSelectedVariant(variant);
  };

  // Handle quantity change
  const handleQuantityChange = (e: { currentTarget: { value: string } }) => {
    const newQuantity = parseInt(e.currentTarget.value);
    if (!isNaN(newQuantity) && newQuantity > 0) {
      setQuantity(newQuantity);
    }
  };

  // Add item to order
  const handleAddItem = () => {
    if (!selectedCategory || !selectedItem || !selectedVariant) return;
    
    const newItem: OrderItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      categoryId: selectedCategory,
      itemId: selectedItem.id,
      name: `${selectedItem.name} - ${selectedVariant.name}`,
      variantName: selectedVariant.name,
      price: selectedVariant.price,
      quantity: quantity,
      total: selectedVariant.price * quantity
    };
    
    setOrderItems([...orderItems, newItem]);
    
    // Reset selections for next item
    setSelectedItem(null);
    setSelectedVariant(null);
    setQuantity(1);
  };

  // Remove item from order
  const handleRemoveItem = (itemId: string) => {
    setOrderItems(orderItems.filter(item => item.id !== itemId));
  };

  // Submit the order
  const handleSubmitOrder = () => {
    // If creating new token, selectedToken might be null initially, but isCreatingNewToken will be true
    if ((!selectedToken && !isCreatingNewToken) || orderItems.length === 0) return;
    
    onSubmit({
      // If isCreatingNewToken is true, pass a special indicator for tokenNo/tokenId
      // The backend or calling component will handle actual token creation.
      tokenId: isCreatingNewToken ? -1 : selectedToken!, 
      tokenNo: isCreatingNewToken ? -1 : selectedToken!, 
      items: orderItems.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        total: item.total
      })),
      totalAmount: orderTotal
    });
    
    onClose();
  };

  // Ensure tokens are unique for display
  const uniqueTokens = Array.from(new Set(activeTokens));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              New Food Order 
              {preselectedTokenNo && (
                <span className="text-lg font-semibold text-blue-600 ml-2">(Token #{preselectedTokenNo})</span>
              )}
            </h2>
            {/* Display selectedToken if not preselected - useful when user picks from grid */}
            {!preselectedTokenNo && selectedToken && (
              <p className="text-sm text-blue-600 mt-1">Token #{selectedToken}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 bg-white rounded-full p-2 hover:bg-gray-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Left side: Food selection form */}
          <div className="w-full md:w-2/3 flex flex-col overflow-hidden p-6 space-y-6">
            {/* Token Selection - Visual Grid or Display */}
            {preselectedTokenNo ? (
              null 
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Select Token</label>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  {uniqueTokens.map(token => (
                    <button
                      key={token}
                      onClick={() => {
                        setSelectedToken(token);
                        setIsCreatingNewToken(false); // Clear new token flag if existing token is selected
                      }}
                      className={`px-3 py-2 rounded-lg text-center font-medium transition-all transform hover:scale-105 ${
                        selectedToken === token && !isCreatingNewToken
                          ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300'
                          : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      #{token}
                    </button>
                  ))}
                  {/* "+ New Token" Button */}
                  <button
                    onClick={() => {
                      setSelectedToken(null); // Clear selected token if any
                      setIsCreatingNewToken(true);
                    }}
                    className={`px-3 py-2 rounded-lg text-center font-medium transition-all transform hover:scale-105 flex items-center justify-center ${
                      isCreatingNewToken
                        ? 'bg-green-600 text-white shadow-md ring-2 ring-green-300'
                        : 'bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    New
                  </button>
                </div>
                {uniqueTokens.length === 0 && !isCreatingNewToken && (
                  <p className="text-sm text-red-600 mt-1">No active tokens available. You can create a new token for this order.</p>
                )}
              </div>
            )}

            {/* Category Selection - enable if a token is selected OR if creating a new token */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Select Category</label>
              <select
                value={selectedCategory || ''}
                onChange={(e: { currentTarget: { value: string } }) => 
                  handleCategorySelect(e.currentTarget.value)
                }
                className="mt-1 block w-full pl-3 pr-10 py-2.5 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-lg bg-white shadow-sm"
                disabled={!selectedToken && !isCreatingNewToken} // Enable if selectedToken OR isCreatingNewToken
              >
                <option value="">Select a category</option>
                {foodMenu.map(category => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>

            {/* Item Selection */}
            {selectedCategory && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Select Item</label>
                <select
                  value={selectedItem?.id || ''}
                  onChange={(e: { currentTarget: { value: string } }) => {
                    const item = foodMenu
                      .find(cat => cat.id === selectedCategory)
                      ?.items.find(item => item.id === e.currentTarget.value);
                    if (item) handleItemSelect(item);
                  }}
                  className="mt-1 block w-full pl-3 pr-10 py-2.5 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-lg bg-white shadow-sm"
                  disabled={!selectedToken && !isCreatingNewToken}
                >
                  <option value="">Select an item</option>
                  {foodMenu
                    .find(category => category.id === selectedCategory)
                    ?.items.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} {item.variants.length === 1 ? `(₹${item.variants[0]?.price || 0})` : ''}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Variant Selection */}
            {selectedItem && selectedItem.variants.length > 1 && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Select Variant</label>
                <select
                  value={selectedVariant?.name || ''}
                  onChange={(e: { currentTarget: { value: string } }) => {
                    if (!selectedItem) return;
                    const variant = selectedItem.variants.find(v => v.name === e.currentTarget.value);
                    if (variant) handleVariantSelect(variant);
                  }}
                  className="mt-1 block w-full pl-3 pr-10 py-2.5 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-lg bg-white shadow-sm"
                >
                  <option value="">Select a variant</option>
                  {selectedItem.variants.map(variant => (
                    <option key={variant.name} value={variant.name}>
                      {variant.name} (₹{variant.price})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quantity Selection */}
            {selectedVariant && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Quantity</label>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center rounded-lg overflow-hidden border border-gray-300">
                      <button 
                        onClick={() => quantity > 1 && setQuantity(quantity - 1)}
                        className="px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={handleQuantityChange}
                        className="w-20 text-center py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button 
                        onClick={() => setQuantity(quantity + 1)}
                        className="px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                    <div className="text-sm text-gray-600 bg-gray-50 px-4 py-2 rounded-lg">
                      Total: ₹{selectedVariant.price * quantity}
                    </div>
                    <button
                      onClick={handleAddItem}
                      className="ml-auto bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm hover:shadow-md transition-all"
                    >
                      Add to Order
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right side: Order summary */}
          <div className="w-full md:w-1/3 border-l border-gray-200 flex flex-col overflow-hidden bg-gray-50">
            <div className="p-5 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <h3 className="text-lg font-semibold text-gray-800">Order Summary</h3>
              {isCreatingNewToken ? (
                <div className="mt-1 text-sm text-green-600 font-medium">For a New Token</div>
              ) : selectedToken ? (
                <div className="mt-1 text-sm text-blue-600 font-medium">Token #{selectedToken}</div>
              ) : (
                <div className="mt-1 text-sm text-orange-600">Select a token to place an order</div>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-5">
              {orderItems.length === 0 ? (
                <div className="text-center text-gray-500 mt-10 bg-white rounded-lg p-6 shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <p className="font-medium text-gray-600">Your order is empty</p>
                  <p className="text-sm mt-1">Select items to add to your order</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {orderItems.map(item => (
                    <li key={item.id} className="bg-white rounded-lg p-4 flex justify-between items-center shadow-sm hover:shadow-md transition-shadow">
                      <div>
                        <h4 className="font-medium text-gray-800">{item.name}</h4>
                        <div className="text-sm text-gray-500 mt-1">
                          {item.quantity} × ₹{item.price}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="font-medium text-blue-600">₹{item.total}</div>
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-full p-1.5 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-5 border-t border-gray-200 bg-white">
              <div className="flex justify-between items-center mb-4">
                <span className="font-medium text-gray-700">Total Amount:</span>
                <span className="text-xl font-bold text-blue-600">₹{orderTotal}</span>
              </div>
              <button
                onClick={handleSubmitOrder}
                disabled={(!selectedToken && !isCreatingNewToken) || orderItems.length === 0}
                className={`w-full bg-green-600 text-white py-3 rounded-lg font-medium ${
                  (!selectedToken && !isCreatingNewToken) || orderItems.length === 0 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 shadow-sm hover:shadow-md transition-all'
                }`}
              >
                {orderItems.length === 0 ? 'Add items to order' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NewFoodOrderModal; 