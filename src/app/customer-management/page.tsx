import { Suspense } from "react";
import CustomerManagement from "./CustomerManagement";

export const metadata = {
  title: "Customer Management | Gamespace",
};

export default function CustomerManagementPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-8">Customer Management</h1>
      
      <div className="grid grid-cols-1 gap-8">
        <Suspense fallback={<div>Loading customer data...</div>}>
          <CustomerManagement />
        </Suspense>
      </div>
    </div>
  );
} 