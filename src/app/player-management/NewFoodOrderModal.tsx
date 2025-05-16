'use client';

import React from 'react';
import { FoodItem } from '~/types';
import NewFoodOrderModalBase from '../food-order/NewFoodOrderModal';

interface NewFoodOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (order: {
    tokenId: number;
    tokenNo: number;
    items: FoodItem[];
    totalAmount: number;
  }) => void;
  activeTokens: number[];
  existingOrderId?: string;
}

export default function NewFoodOrderModal({
  isOpen,
  onClose,
  onSubmit,
  activeTokens,
  existingOrderId
}: NewFoodOrderModalProps) {
  // Just pass through to the base component - this wrapper allows us to customize if needed
  return (
    <NewFoodOrderModalBase
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={onSubmit}
      activeTokens={activeTokens}
      existingOrderId={existingOrderId}
    />
  );
} 