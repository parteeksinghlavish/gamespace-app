// Type definitions for pricing chart
type TimePrice = {
  [minutes: number]: number;
};

type FramePrice = number;

interface PlayerTimePrice {
  [players: number]: TimePrice;
}

interface PlayerFramePrice {
  [players: number]: FramePrice;
}

// Define game types as string literals
export type GameType = "PS5" | "PS4" | "Racing" | "VR" | "VR Racing" | "Pool" | "Frame";

// Define full pricing structure
type GamePricing = Record<GameType, PlayerTimePrice | PlayerFramePrice>;

// Pricing data structure for gaming cafe
export const pricingChart: GamePricing = {
  "PS5": {
    1: {15: 40, 30: 80, 45: 100, 60: 120},
    2: {15: 60, 30: 120, 45: 150, 60: 180},
    3: {15: 60, 30: 120, 45: 150, 60: 180},
    4: {15: 70, 30: 140, 45: 170, 60: 200},
  },
  "PS4": {
    1: {15: 25, 30: 50, 45: 65, 60: 80},
    2: {15: 35, 30: 70, 45: 95, 60: 120},
  },
  "Racing": {
    1: {15: 100, 30: 150, 45: 175, 60: 200},
  },
  "VR": {
    1: {15: 100, 30: 150, 45: 175, 60: 200},
  },
  "VR Racing": {
    1: {15: 150, 30: 200, 45: 250, 60: 300},
  },
  "Pool": {
    1: {15: 50, 30: 80, 45: 120, 60: 160},
  },
  // Frame pricing: Rs 50 per frame played (not time-based)
  "Frame": {
    1: 50  // Per frame charge
  }
};

// Mapping of alternative/variant device names to their standard form in pricing chart
const deviceTypeMap: Record<string, GameType> = {
  "FRAME": "Frame",
  "PS5": "PS5",
  "PS4": "PS4",
  "RACING": "Racing",
  "VR": "VR",
  "VR RACING": "VR Racing",
  "POOL": "Pool",
  "CONSOLE": "PS4",  // Default console to PS4 pricing if specific type not provided
  "ARCADE": "Racing" // Default arcade to Racing pricing if specific type not provided
};

/**
 * Normalizes device type to match pricing chart keys
 */
function getNormalizedDeviceType(deviceType: string): GameType {
  if (!deviceType) {
    return "PS4" as const;
  }
  
  const upperDeviceType = deviceType.toUpperCase();
  
  // Direct match
  if (upperDeviceType in deviceTypeMap) {
    return deviceTypeMap[upperDeviceType] as GameType;
  }
  
  // Partial match
  for (const [key, value] of Object.entries(deviceTypeMap)) {
    if (upperDeviceType.includes(key)) {
      console.log(`Mapped device type "${deviceType}" to "${value}" based on partial match`);
      return value;
    }
  }
  
  // Default fallback
  console.warn(`No pricing mapping found for device type "${deviceType}", defaulting to PS4 pricing`);
  return "PS4";
}

/**
 * Rounds the time played to the billing interval following given rules:
 * - Up to 7 minutes: 0 charge
 * - 8 to 21 minutes: charge for 15 minutes
 * - Next intervals of 15 minutes continue similarly
 */
export function roundTimeToCharge(minutesPlayed: number): number {
  if (minutesPlayed <= 7) {
    return 0;
  }
  // Rounded charging intervals start at 15
  // We subtract 8 to achieve range starting, then divide by 15 and ceil it to get interval
  const intervals = Math.ceil((minutesPlayed - 7) / 15);
  return intervals * 15;
}

/**
 * Default pricing when no specific pricing is available
 * Uses PS4 single player as the baseline
 */
function getDefaultPricing(minutes: number): number {
  // Basic pricing structure if nothing else is available
  if (minutes <= 15) return 25;
  if (minutes <= 30) return 50;
  if (minutes <= 45) return 65;
  if (minutes <= 60) return 80;
  return Math.round((80/60) * minutes); // Pro-rate based on hourly rate
}

/**
 * Calculate price based on available time slots in pricing data
 */
function calculatePriceFromTimeSlots(playerPricing: TimePrice, roundedTime: number): number {
  // If rounded time is within provided pricing intervals (15,30,45,60)
  const maxInterval = 60;
  if (roundedTime <= maxInterval) {
    // Use exact time if available
    if (roundedTime in playerPricing) {
      const price = playerPricing[roundedTime];
      if (typeof price === 'number') {
        return price;
      }
      return 0;
    }
    
    // Otherwise, find the next highest interval
    const availableTimes = Object.keys(playerPricing)
      .map(Number)
      .sort((a, b) => a - b);
      
    for (const time of availableTimes) {
      if (roundedTime <= time) {
        const price = playerPricing[time];
        if (typeof price === 'number') {
          return price;
        }
        return 0;
      }
    }
    
    // Use the highest available time slot as fallback
    if (availableTimes.length > 0) {
      const lastTimeSlot = availableTimes[availableTimes.length - 1];
      if (lastTimeSlot && lastTimeSlot in playerPricing) {
        const price = playerPricing[lastTimeSlot];
        if (typeof price === 'number') {
          return price;
        }
      }
    }
    return 0;
  } else {
    // Beyond 60 minutes, apply per minute rate based on 60-minute price with rounding
    if (60 in playerPricing) {
      const price60 = playerPricing[60];
      if (typeof price60 === 'number') {
        // Calculate price per minute
        const pricePerMinute = price60 / 60;
        // Use the rounded minutes for billing
        return pricePerMinute * roundedTime;
      }
    }
    console.error(`No 60-minute pricing data found for calculation`);
    return getDefaultPricing(roundedTime);
  }
}

/**
 * Calculates the price based on game type, player count, and duration
 */
export function calculatePrice(
  rawGameType: string | GameType, 
  rawPlayerCount: number | undefined, 
  minutesPlayed: number
): number {
  try {
    // Handle empty/undefined inputs
    if (!rawGameType) {
      console.warn("No game type provided for pricing calculation");
      return 0;
    }
    
    // Ensure valid players count
    const players = Math.max(1, rawPlayerCount || 1);
    
    // Handle Frame game separately - check for any case variation
    if (typeof rawGameType === 'string' && rawGameType.toUpperCase() === "FRAME") {
      // For Frame, price is Rs 50 * number of players
      return 50 * players;
    }

    // Normalize the device type to match pricing chart
    const gameType = getNormalizedDeviceType(String(rawGameType));
    
    // Round the time played according to rules
    const roundedTime = roundTimeToCharge(minutesPlayed);

    if (roundedTime === 0) {
      return 0; // No charge for playtime less or equal to 7 minutes
    }
    
    // Get the pricing for this game and player count
    const gameData = pricingChart[gameType];
    
    // For Frame pricing, which uses a different structure
    if (gameType === "Frame") {
      // Frame pricing is fixed per player
      const basePricePerPlayer = 50;
      return basePricePerPlayer * players;
    }
    
    // For time-based pricing (PS4, PS5, etc.)
    // Use default player count (1) if specified player count is not available
    const playerCount = (players in gameData) ? players : 1;
    const pricing = gameData[playerCount];
    
    if (!pricing) {
      console.error(`No pricing data for ${gameType} with ${players} players`);
      return getDefaultPricing(roundedTime);
    }
    
    // Handle special case for Frame pricing (number instead of object)
    if (typeof pricing === 'number') {
      return pricing * players;
    }
    
    return calculatePriceFromTimeSlots(pricing as TimePrice, roundedTime);
  } catch (error) {
    console.error("Error in calculatePrice:", error);
    // Default to basic pricing if all else fails
    const roundedTime = roundTimeToCharge(minutesPlayed);
    return getDefaultPricing(roundedTime);
  }
}

/**
 * Helper function to calculate duration in minutes between two dates
 */
export function calculateDuration(startTime: Date | string, endTime?: Date | string): number {
  try {
    const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
    const end = endTime 
      ? (typeof endTime === 'string' ? new Date(endTime) : endTime) 
      : new Date();
    
    // Calculate duration in milliseconds and convert to minutes
    const durationInMs = end.getTime() - start.getTime();
    return Math.ceil(durationInMs / (1000 * 60));
  } catch (error) {
    console.error("Error calculating duration:", error);
    return 0;
  }
}

/**
 * Gets the hourly rate for a game type and player count
 * Used for display purposes in the UI
 */
export function getHourlyRate(rawGameType: string | GameType, rawPlayerCount: number): number {
  try {
    // Default to standard player count
    const players = Math.max(1, rawPlayerCount || 1);
    
    // Normalize device type
    const gameType = getNormalizedDeviceType(String(rawGameType || ""));
    
    if (gameType === "Frame") {
      return 50 * players; // Return Rs 50 * players for Frame
    }
    
    const gameData = pricingChart[gameType];
    if (!gameData) return 80; // Default hourly rate
    
    const playerCount = gameData[players] ? players : 1;
    const playerPricing = gameData[playerCount];
    
    if (playerPricing && typeof playerPricing !== 'number' && 60 in playerPricing) {
      return playerPricing[60];
    }
    
    return 80; // Default hourly rate
  } catch (error) {
    console.error("Error getting hourly rate:", error);
    return 80; // Default hourly rate
  }
}

/**
 * Calculate the correct cost for a session based on its type and duration
 */
export function calculateSessionCost(session: {
  device: { type: string; };
  playerCount: number;
  status: string;
  startTime?: Date | string;
  duration?: number;
  cost?: number | string;
}): number {
  try {
    // Validation
    if (!session) {
      console.error("Session object is null or undefined");
      return 0;
    }
    
    if (!session.device || !session.device.type) {
      console.error("Missing device type in session", session);
      return 0;
    }
    
    // For Frame devices, use player count based pricing
    if (session.device.type.toUpperCase() === "FRAME") {
      return 50 * Math.max(1, session.playerCount || 1);
    }
    
    // For devices with stored non-zero cost, use that cost
    const storedCost = parseFloat(String(session.cost || "0"));
    if (!isNaN(storedCost) && storedCost > 0) {
      return storedCost;
    }
    
    // For time-based pricing (PS4, PS5, etc.)
    let minutes = 0;
    
    if (session.status === "ACTIVE" && session.startTime) {
      // Active session - calculate duration from start time to now
      const start = typeof session.startTime === 'string' ? new Date(session.startTime) : session.startTime;
      const now = new Date();
      minutes = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60));
    } else {
      // Completed session - use stored duration
      minutes = session.duration || 0;
    }
    
    // Skip if in free tier or no duration
    if (minutes <= 7) {
      return 0;
    }
    
    // Calculate price based on device, players, and time
    return calculatePrice(
      session.device.type,
      session.playerCount,
      minutes
    );
  } catch (error) {
    console.error("Error calculating session cost:", error, session);
    return 0;
  }
}

/**
 * Calculate the total cost for multiple sessions
 */
export function calculateTotalCost(sessions: Array<{
  device: { type: string; };
  playerCount: number;
  status: string;
  startTime?: Date | string;
  duration?: number;
  cost?: number | string;
}>): number {
  if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
    return 0;
  }
  
  let total = 0;
  
  for (const session of sessions) {
    try {
      const sessionCost = calculateSessionCost(session);
      console.log(`Session cost for ${session.device?.type} (${session.playerCount || 1} players): ₹${sessionCost}`);
      total += sessionCost;
    } catch (error) {
      console.error("Error calculating session cost:", error, session);
    }
  }
  
  console.log(`Total cost for ${sessions.length} sessions: ₹${total}`);
  return total;
} 