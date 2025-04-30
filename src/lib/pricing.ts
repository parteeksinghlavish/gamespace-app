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

type GamePricing = {
  "PS5": PlayerTimePrice;
  "PS4": PlayerTimePrice;
  "Racing": PlayerTimePrice;
  "VR": PlayerTimePrice;
  "VR Racing": PlayerTimePrice;
  "Pool": PlayerTimePrice;
  "Frame": PlayerFramePrice;
};

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
 * Calculates the price based on game type, player count, and duration
 */
export function calculatePrice(
  game: keyof GamePricing, 
  players: number, 
  minutesPlayed: number, 
  framesPlayed = 0
): number {
  // Handle Frame game separately
  if (game === "Frame") {
    // For Frame, price is Rs 50 * number of players
    // (framesPlayed parameter is ignored as requested)
    return 50 * players;
  }

  // Round the time played according to rules
  const roundedTime = roundTimeToCharge(minutesPlayed);

  if (roundedTime === 0) {
    return 0; // No charge for playtime less or equal to 7 minutes
  }

  // Get the pricing for this game and player count
  const gameData = pricingChart[game];
  // Use default player count (1) if specified player count is not available
  const playerCount = gameData[players] ? players : 1;
  const playerPricing = gameData[playerCount];

  if (!playerPricing) {
    console.error(`No pricing data for ${game} with ${players} players`);
    return 0;
  }

  // If rounded time is within provided pricing intervals (15,30,45,60)
  const maxInterval = 60;
  if (roundedTime <= maxInterval) {
    // Use exact time if available
    if (roundedTime in playerPricing) {
      return playerPricing[roundedTime];
    }
    
    // Otherwise, find the next highest interval
    const availableTimes = Object.keys(playerPricing)
      .map(Number)
      .sort((a, b) => a - b);
      
    for (const time of availableTimes) {
      if (roundedTime <= time) {
        return playerPricing[time];
      }
    }
    
    // Use the highest available time slot as fallback
    const lastTimeSlot = availableTimes[availableTimes.length - 1];
    return playerPricing[lastTimeSlot] || 0;
  } else {
    // Beyond 60 minutes, apply per minute rate based on 60-minute price with rounding
    if (60 in playerPricing) {
      const price60 = playerPricing[60];
      
      // Calculate price per minute
      const pricePerMinute = price60 / 60;

      // Use the rounded minutes for billing
      return pricePerMinute * roundedTime;
    } else {
      console.error(`No 60-minute pricing data for ${game} with ${players} players`);
      return 0;
    }
  }
}

/**
 * Helper function to calculate duration in minutes between two dates
 * @param startTime Starting date/time
 * @param endTime Ending date/time (defaults to current time if not provided)
 */
export function calculateDuration(startTime: Date | string, endTime?: Date | string): number {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const end = endTime 
    ? (typeof endTime === 'string' ? new Date(endTime) : endTime) 
    : new Date();
  
  // Calculate duration in milliseconds and convert to minutes
  const durationInMs = end.getTime() - start.getTime();
  return Math.ceil(durationInMs / (1000 * 60));
}

/**
 * Gets the hourly rate for a game type and player count
 * Used for display purposes in the UI
 */
export function getHourlyRate(game: keyof GamePricing, players: number): number {
  if (game === "Frame") {
    return 50 * players; // Return Rs 50 * players for Frame
  }
  
  const gameData = pricingChart[game];
  const playerCount = gameData[players] ? players : 1;
  const playerPricing = gameData[playerCount];
  
  if (playerPricing && 60 in playerPricing) {
    return playerPricing[60];
  }
  
  return 0;
}

/**
 * Calculate the correct cost for a session based on its type and duration
 * @param session Session with device, player count, and duration information
 * @returns The calculated cost
 */
export function calculateSessionCost(session: {
  device: { type: string; };
  playerCount: number;
  status: string;
  startTime?: Date | string;
  duration?: number;
  cost?: number | string;
}): number {
  // For Frame devices, use player count based pricing
  if (session.device.type === "FRAME") {
    return 50 * session.playerCount;
  }
  
  // For devices with stored non-zero cost, use that cost
  if (session.cost && Number(session.cost) > 0) {
    return Number(session.cost);
  }
  
  // For time-based pricing (PS4, PS5, etc.)
  try {
    // Calculate duration
    let minutes = 0;
    if (session.status === "ACTIVE" && session.startTime) {
      const start = typeof session.startTime === 'string' ? new Date(session.startTime) : session.startTime;
      const now = new Date();
      minutes = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60));
    } else {
      minutes = session.duration || 0;
    }
    
    // Skip if in free tier or no duration
    if (minutes <= 7) {
      return 0;
    }
    
    // Calculate price based on device, players, and time
    return calculatePrice(
      session.device.type as any,
      session.playerCount,
      minutes
    );
  } catch (error) {
    console.error("Error calculating time-based price:", error);
    return 0;
  }
}

/**
 * Calculate the total cost for multiple sessions
 * @param sessions Array of sessions to calculate total for
 * @returns The total cost
 */
export function calculateTotalCost(sessions: Array<{
  device: { type: string; };
  playerCount: number;
  status: string;
  startTime?: Date | string;
  duration?: number;
  cost?: number | string;
}>): number {
  if (!sessions || sessions.length === 0) {
    return 0;
  }
  
  return sessions.reduce((total, session) => {
    return total + calculateSessionCost(session);
  }, 0);
} 