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