'use client';

import dynamic from 'next/dynamic';

// Use dynamic import with SSR disabled to avoid hydration issues with client components
const FoodOrdersContent = dynamic(() => import('./FoodOrdersContent'), { ssr: false });

export default function ClientFoodOrderPage() {
  return <FoodOrdersContent />;
} 