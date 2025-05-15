// Common types for the application

export type DeviceType = 'PS5' | 'PS4' | 'Racing' | 'VR' | 'VR Racing' | 'Pool' | 'Frame';
export type SessionStatus = 'ACTIVE' | 'ENDED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'DUE';
export type OrderStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface Device {
  id: number;
  type: DeviceType;
  counterNo: number;
  maxPlayers: number;
  hourlyRate?: number;
}

export interface Session {
  id: number;
  deviceId: number;
  device: Device;
  playerCount: number;
  status: SessionStatus;
  startTime: Date | string;
  endTime?: Date | string;
  duration?: number;
  cost?: number | string;
  comments?: string;
  orderId?: string | null;
  tokenId: number;
  framesPlayed?: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  tokenId: number;
  status: OrderStatus;
  startTime: Date | string;
  endTime?: Date | string;
  notes?: string;
  sessions: Session[];
}

export interface Token {
  id: number;
  tokenNo: number;
  createdAt: Date | string;
  sessions: Session[];
  orders: Order[];
  bills?: Bill[];
}

export interface Bill {
  id: number;
  tokenId: number;
  token: Token;
  orderId?: string | null;
  order?: Order | null;
  customerId?: number | null;
  customer?: Customer | null;
  amount: number;
  correctedAmount?: number;
  status: PaymentStatus;
  generatedAt: Date | string;
  paidAt?: Date | string;
  paymentMethod?: string;
  paymentReference?: string;
}

export interface FoodItem {
  id: number | string;
  name: string;
  price: number;
  quantity: number;
  total: number;
}

export interface FoodOrder {
  id: number | string;
  tokenId: number;
  tokenNo: number;
  items: FoodItem[];
  totalAmount: number;
  orderTime: Date | string;
  status: string;
}

export interface Customer {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  bills?: Bill[];
  createdAt: Date | string;
  updatedAt: Date | string;
} 