'use client';

import React, { useState, useEffect } from 'react';
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
};

export default function NewFoodOrderModal({ 
  isOpen, 
  onClose, 
  onSubmit,
  activeTokens = []
}: NewFoodOrderModalProps) {
  const [selectedToken, setSelectedToken] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<FoodVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  
  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedToken(null);
      setSelectedCategory(null);
      setSelectedItem(null);
      setSelectedVariant(null);
      setQuantity(1);
      setOrderItems([]);
      setOrderTotal(0);
    }
  }, [isOpen]);

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
  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuantity = parseInt(e.target.value);
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
    if (!selectedToken || orderItems.length === 0) return;
    
    onSubmit({
      tokenId: selectedToken,
      tokenNo: selectedToken,
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">New Food Order</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Left side: Food selection */}
          <div className="w-full md:w-2/3 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Token</label>
              <div className="grid grid-cols-6 gap-2">
                {activeTokens.map(token => (
                  <button
                    key={token}
                    onClick={() => setSelectedToken(token)}
                    className={`px-3 py-2 rounded-md text-center ${
                      selectedToken === token
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {token}
                  </button>
                ))}
              </div>
              
              {activeTokens.length === 0 && (
                <div className="text-sm text-red-500 mt-1">
                  No active tokens available. Please create a session first.
                </div>
              )}
            </div>

            <div className="p-4 border-b border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Category</label>
              <div className="grid grid-cols-3 gap-2 overflow-y-auto max-h-32">
                {foodMenu.map(category => (
                  <button
                    key={category.id}
                    onClick={() => handleCategorySelect(category.id)}
                    className={`px-3 py-2 rounded-md text-sm text-center ${
                      selectedCategory === category.id
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            {selectedCategory && (
              <div className="p-4 border-b border-gray-200 flex-1 overflow-hidden">
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Item</label>
                <div className="grid grid-cols-2 gap-2 overflow-y-auto h-40">
                  {foodMenu
                    .find(category => category.id === selectedCategory)
                    ?.items.map(item => (
                      <button
                        key={item.id}
                        onClick={() => handleItemSelect(item)}
                        className={`px-3 py-2 rounded-md text-sm text-center ${
                          selectedItem?.id === item.id
                            ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {item.name}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {selectedItem && selectedItem.variants.length > 1 && (
              <div className="p-4 border-b border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Variant</label>
                <div className="grid grid-cols-3 gap-2">
                  {selectedItem.variants.map(variant => (
                    <button
                      key={variant.name}
                      onClick={() => handleVariantSelect(variant)}
                      className={`px-3 py-2 rounded-md text-sm text-center ${
                        selectedVariant?.name === variant.name
                          ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {variant.name} - ₹{variant.price}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedVariant && (
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={handleQuantityChange}
                    className="border border-gray-300 rounded-md px-3 py-2 w-20"
                  />
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">Price: ₹{selectedVariant.price}</div>
                  <div className="text-sm font-medium text-gray-700">
                    Total: ₹{selectedVariant.price * quantity}
                  </div>
                </div>
                <button
                  onClick={handleAddItem}
                  disabled={!selectedToken}
                  className={`bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center ${
                    !selectedToken ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add to Order
                </button>
              </div>
            )}
          </div>

          {/* Right side: Order summary */}
          <div className="w-full md:w-1/3 border-l border-gray-200 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">Order Summary</h3>
              {selectedToken && (
                <div className="mt-1 text-sm text-gray-600">Token #{selectedToken}</div>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {orderItems.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <p>No items added yet</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {orderItems.map(item => (
                    <li key={item.id} className="bg-gray-50 rounded-lg p-3 flex justify-between">
                      <div>
                        <h4 className="font-medium text-gray-800">{item.name}</h4>
                        <div className="text-sm text-gray-500">
                          {item.quantity} × ₹{item.price}
                        </div>
                      </div>
                      <div className="flex items-center">
                        <div className="font-medium mr-3">₹{item.total}</div>
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-4 border-t border-gray-200">
              <div className="flex justify-between mb-2">
                <div className="font-medium">Total Amount:</div>
                <div className="font-bold text-lg">₹{orderTotal}</div>
              </div>
              <button
                onClick={handleSubmitOrder}
                disabled={!selectedToken || orderItems.length === 0}
                className={`w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-3 rounded-lg font-medium transition-colors ${
                  !selectedToken || orderItems.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                Place Order
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 