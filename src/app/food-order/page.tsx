export const metadata = {
  title: 'Food Order - Gamespace App',
};

export default function FoodOrderPage() {
  return (
    <div className="container mx-auto py-6">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Food Order</h1>
        <div className="bg-white p-6 rounded-lg shadow">
          <p className="text-lg text-gray-500">Food Order Management</p>
          <p className="text-gray-500">This page will allow managing food and beverage orders for players.</p>
        </div>
      </div>
    </div>
  );
} 