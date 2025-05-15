/**
 * Client-side constants that match server enums
 */

export enum SessionStatus {
  ACTIVE = "ACTIVE",
  ENDED = "ENDED"
}

export enum DeviceType {
  PS5 = "PS5",
  PS4 = "PS4",
  VR = "VR",
  VR_RACING = "VR_RACING",
  POOL = "POOL",
  FRAME = "FRAME",
  RACING = "RACING"
}

export enum PaymentStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  DUE = "DUE"
}

export enum OrderStatus {
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED"
}

export enum FoodOrderStatus {
  ORDERED = "ORDERED",
  PREPARING = "PREPARING",
  DELIVERED = "DELIVERED",
  PAID = "PAID",
}

export type FoodCategory = {
  id: number;
  name: string;
};

export type FoodItem = {
  id: number;
  categoryId: number;
  name: string;
  hasVariants: boolean;
  price: number; // Base price, used if no variants
};

export type FoodVariant = {
  id: number;
  itemId: number;
  name: string;
  price: number;
};

// Sample food menu data
export const FOOD_CATEGORIES: FoodCategory[] = [
  { id: 1, name: "Beverages" },
  { id: 2, name: "Snacks" },
  { id: 3, name: "Meals" },
  { id: 4, name: "Desserts" },
];

export const FOOD_ITEMS: FoodItem[] = [
  // Beverages
  { id: 1, categoryId: 1, name: "Coffee", hasVariants: true, price: 30 },
  { id: 2, categoryId: 1, name: "Tea", hasVariants: true, price: 20 },
  { id: 3, categoryId: 1, name: "Cold Drink", hasVariants: true, price: 40 },
  { id: 4, categoryId: 1, name: "Water Bottle", hasVariants: false, price: 20 },
  
  // Snacks
  { id: 5, categoryId: 2, name: "Chips", hasVariants: true, price: 30 },
  { id: 6, categoryId: 2, name: "Sandwich", hasVariants: true, price: 60 },
  { id: 7, categoryId: 2, name: "Samosa", hasVariants: false, price: 20 },
  { id: 8, categoryId: 2, name: "French Fries", hasVariants: true, price: 80 },
  
  // Meals
  { id: 9, categoryId: 3, name: "Burger", hasVariants: true, price: 120 },
  { id: 10, categoryId: 3, name: "Pizza", hasVariants: true, price: 250 },
  { id: 11, categoryId: 3, name: "Pasta", hasVariants: true, price: 180 },
  { id: 12, categoryId: 3, name: "Noodles", hasVariants: true, price: 150 },
  
  // Desserts
  { id: 13, categoryId: 4, name: "Ice Cream", hasVariants: true, price: 70 },
  { id: 14, categoryId: 4, name: "Cake", hasVariants: true, price: 90 },
  { id: 15, categoryId: 4, name: "Brownie", hasVariants: false, price: 60 },
];

export const FOOD_VARIANTS: FoodVariant[] = [
  // Coffee variants
  { id: 1, itemId: 1, name: "Regular", price: 30 },
  { id: 2, itemId: 1, name: "Large", price: 50 },
  { id: 3, itemId: 1, name: "Cappuccino", price: 70 },
  
  // Tea variants
  { id: 4, itemId: 2, name: "Regular", price: 20 },
  { id: 5, itemId: 2, name: "Green Tea", price: 30 },
  { id: 6, itemId: 2, name: "Masala Tea", price: 25 },
  
  // Cold Drink variants
  { id: 7, itemId: 3, name: "Cola", price: 40 },
  { id: 8, itemId: 3, name: "Lemonade", price: 45 },
  { id: 9, itemId: 3, name: "Sprite", price: 40 },
  
  // Chips variants
  { id: 10, itemId: 5, name: "Salted", price: 30 },
  { id: 11, itemId: 5, name: "Masala", price: 35 },
  { id: 12, itemId: 5, name: "Cheese", price: 40 },
  
  // Sandwich variants
  { id: 13, itemId: 6, name: "Veg", price: 60 },
  { id: 14, itemId: 6, name: "Cheese", price: 80 },
  { id: 15, itemId: 6, name: "Grilled", price: 90 },
  
  // French Fries variants
  { id: 16, itemId: 8, name: "Regular", price: 80 },
  { id: 17, itemId: 8, name: "Cheese Loaded", price: 120 },
  
  // Burger variants
  { id: 18, itemId: 9, name: "Veg", price: 120 },
  { id: 19, itemId: 9, name: "Cheese", price: 150 },
  { id: 20, itemId: 9, name: "Double Patty", price: 180 },
  
  // Pizza variants
  { id: 21, itemId: 10, name: "Margherita", price: 250 },
  { id: 22, itemId: 10, name: "Peppy Paneer", price: 300 },
  { id: 23, itemId: 10, name: "Veg Loaded", price: 350 },
  
  // Pasta variants
  { id: 24, itemId: 11, name: "White Sauce", price: 180 },
  { id: 25, itemId: 11, name: "Red Sauce", price: 180 },
  { id: 26, itemId: 11, name: "Pink Sauce", price: 200 },
  
  // Noodles variants
  { id: 27, itemId: 12, name: "Hakka", price: 150 },
  { id: 28, itemId: 12, name: "Schezwan", price: 170 },
  
  // Ice Cream variants
  { id: 29, itemId: 13, name: "Vanilla", price: 70 },
  { id: 30, itemId: 13, name: "Chocolate", price: 80 },
  { id: 31, itemId: 13, name: "Butterscotch", price: 90 },
  
  // Cake variants
  { id: 32, itemId: 14, name: "Chocolate", price: 90 },
  { id: 33, itemId: 14, name: "Vanilla", price: 80 },
  { id: 34, itemId: 14, name: "Red Velvet", price: 120 },
]; 