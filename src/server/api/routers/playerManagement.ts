import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { PaymentStatus, SessionStatus, DeviceType, OrderStatus } from "~/lib/constants";
import { calculatePrice, roundTimeToCharge, calculateDuration, calculateSessionCost } from "~/lib/pricing";
import { randomUUID } from "crypto";
import type { Session, Device, Order as PrismaOrder } from "@prisma/client";

// Enum values matching Prisma's generated enums
export { SessionStatus, DeviceType, PaymentStatus, OrderStatus };

// Helper function to generate a human-readable order number
function generateOrderNumber(): string {
  // Format: GSO-YYYYMMDD-XXXX (Gamespace Order, Date, Random alphanumeric)
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `GSO-${datePart}-${randomPart}`;
}

interface ParsedFoodItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
}

function parseFoodItemsFromNotes(notes: string | null | undefined): ParsedFoodItem[] {
  if (!notes) {
    return [];
  }

  const foodItemsSectionRegex = /Food items:(.*?)(?:,|$|\n)/;
  const foodItemsSectionMatch = notes.match(foodItemsSectionRegex);
  
  if (!foodItemsSectionMatch || typeof foodItemsSectionMatch[1] === 'undefined') {
    return [];
  }

  const itemsString = foodItemsSectionMatch[1].trim();
  if (!itemsString) {
    return [];
  }

  const itemsArray = itemsString.split('|');
  const parsedItems: ParsedFoodItem[] = [];

  const itemRegex = /(\d+)x\s*(.*?)\s*\(₹(\d+\.?\d*)\)/;
  for (const itemStr of itemsArray) {
    const match = itemStr.match(itemRegex);
    if (match && match[1] && match[2] && match[3]) {
      const quantity = parseInt(match[1], 10);
      const name = match[2].trim();
      const price = parseFloat(match[3]);
      if (!isNaN(quantity) && !isNaN(price)) {
        parsedItems.push({
          name,
          quantity,
          price,
          total: quantity * price,
        });
      }
    }
  }
  return parsedItems;
}

export const playerManagementRouter = createTRPCRouter({
  // Get today's sessions grouped by token
  getTodaySessions: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tokens = await ctx.db.token.findMany({
      where: {
        createdAt: {
          gte: today,
        },
      },
      include: {
        sessions: {
          include: {
            device: true,
            order: true,
          },
          orderBy: {
            startTime: "desc",
          },
        },
        bills: true,
        orders: {
          include: {
            sessions: {
              include: {
                device: true,
              }
            },
            bills: true,
          },
          orderBy: {
            startTime: "desc",
          },
        },
      },
      orderBy: {
        tokenNo: "asc",
      },
    });

    return tokens;
  }),

  // Get all active orders
  getActiveOrders: protectedProcedure.query(async ({ ctx }) => {
    const orders = await ctx.db.order.findMany({
      where: {
        status: OrderStatus.ACTIVE,
      },
      include: {
        token: true,
        sessions: {
          include: {
            device: true,
          },
          orderBy: {
            startTime: "desc",
          },
        },
        bills: true,
      },
      orderBy: {
        startTime: "desc",
      },
    });

    return orders;
  }),

  // Get order by ID
  getOrderById: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.order.findUnique({
        where: { id: input.orderId },
        include: {
          token: true,
          sessions: {
            include: {
              device: true,
            },
            orderBy: {
              startTime: "desc",
            },
          },
          bills: true,
        },
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      return order;
    }),

  // Create a new order
  createOrder: protectedProcedure
    .input(
      z.object({
        tokenId: z.number(),
        notes: z.string().optional(),
        foodItems: z.array(
          z.object({
            name: z.string(),
            price: z.number(),
            quantity: z.number().min(1)
          })
        ).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if token exists
      const token = await ctx.db.token.findUnique({
        where: { id: input.tokenId },
      });

      if (!token) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Token not found",
        });
      }

      // Generate a unique order number
      const orderNumber = generateOrderNumber();

      // Process food items if they exist
      let notes = input.notes || '';
      if (input.foodItems && input.foodItems.length > 0) {
        const foodItemsText = input.foodItems
          .map(item => `${item.quantity}x ${item.name} (₹${item.price})`)
          .join('|');
          
        notes = notes
          ? `${notes}, Food items: ${foodItemsText}`
          : `Food items: ${foodItemsText}`;
      }

      // Create the new order
      const order = await ctx.db.order.create({
        data: {
          id: randomUUID(),
          orderNumber,
          tokenId: input.tokenId,
          notes: notes,
          status: OrderStatus.ACTIVE,
        },
        include: {
          token: true,
        },
      });

      return order;
    }),

  // *** NEW MUTATION: Create Token and Order for Food ***
  createTokenAndOrderForFood: protectedProcedure
    .input(
      z.object({
        foodItems: z.array(
          z.object({
            name: z.string(),
            price: z.number(),
            quantity: z.number().min(1),
          })
        ).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let newToken;
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0); 

        const lastTokenToday = await ctx.db.token.findFirst({
          where: { createdAt: { gte: today } },
          orderBy: { tokenNo: 'desc' },
        });
        const nextTokenNo = lastTokenToday ? lastTokenToday.tokenNo + 1 : 1;
        
        newToken = await ctx.db.token.create({
          data: { tokenNo: nextTokenNo },
        });
      } catch (error) {
        console.error("[PlayerManagement] createTokenAndOrderForFood: CRITICAL - Error creating new token:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create a new token for the food order.",
          cause: error,
        });
      }

      const orderNumber = generateOrderNumber();
      let notes = '';
      if (input.foodItems && input.foodItems.length > 0) {
        const foodItemsText = input.foodItems
          .map(item => `${item.quantity}x ${item.name} (₹${item.price})`)
          .join('|');
        notes = `Food items: ${foodItemsText}`;
      }

      const orderDataForCreation = {
        id: randomUUID(), 
        orderNumber,
        tokenId: newToken.id, 
        notes: notes,
        status: OrderStatus.ACTIVE, 
      };

      let newOrder;
      try {
        newOrder = await ctx.db.order.create({
          data: orderDataForCreation,
          include: {
            token: true, 
          },
        });
      } catch (error) {
        console.error("[PlayerManagement] createTokenAndOrderForFood: CRITICAL - Error creating new order. Attempted data:", JSON.stringify(orderDataForCreation, null, 2), "Error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create a new order for the food items.",
          cause: error,
        });
      }
      
      return newOrder; 
    }),
  // *** END OF NEW MUTATION ***

  // Update order status
  updateOrderStatus: protectedProcedure
    .input(
      z.object({
        orderId: z.string(),
        status: z.enum([OrderStatus.ACTIVE, OrderStatus.COMPLETED, OrderStatus.CANCELLED]),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.order.findUnique({
        where: { id: input.orderId },
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      // If completing an order, set the end time
      const updateData: any = {
        status: input.status,
      };

      if (input.notes !== undefined) {
        updateData.notes = input.notes;
      }

      if (input.status === OrderStatus.COMPLETED) {
        updateData.endTime = new Date();
      }

      // Update the order
      const updatedOrder = await ctx.db.order.update({
        where: { id: input.orderId },
        data: updateData,
        include: {
          token: true,
          sessions: true,
        },
      });

      return updatedOrder;
    }),

  // Get available devices for new session
  getAvailableDevices: protectedProcedure.query(async ({ ctx }) => {
    // Get all devices
    const allDevices = await ctx.db.device.findMany();
    
    // Get active sessions from today only
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const activeSessions = await ctx.db.session.findMany({
      where: {
        status: SessionStatus.ACTIVE,
        startTime: {
          gte: today,
        },
      },
      include: {
        device: true,
      },
    });

    // Create a map of currently used devices
    const usedDevices = new Map<string, any>();
    activeSessions.forEach((session: any) => {
      usedDevices.set(`${session.device.type}-${session.device.counterNo}`, session);
    });

    // Check if Pool or Frame is active
    const isPoolOrFrameActive = activeSessions.some(
      (session: any) => session.device.type === DeviceType.POOL || session.device.type === DeviceType.FRAME
    );

    // Filter out unavailable devices
    const availableDevices = allDevices.filter((device: any) => {
      // If Pool or Frame is active, both are unavailable
      if (isPoolOrFrameActive && (device.type === DeviceType.POOL || device.type === DeviceType.FRAME)) {
        return false;
      }
      
      // Check if this specific device is in use
      return !usedDevices.has(`${device.type}-${device.counterNo}`);
    });

    return availableDevices;
  }),

  // Get all devices (including those in use)
  getAllDevices: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.db.device.findMany({
      orderBy: [
        { type: 'asc' },
        { counterNo: 'asc' }
      ]
    });
  }),

  // Create a new session
  createSession: protectedProcedure
    .input(
      z.object({
        deviceId: z.number(),
        playerCount: z.number().min(1),
        tokenNo: z.number(),
        orderId: z.string().optional(), // Optional order ID
        comments: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate player count
      const device = await ctx.db.device.findUnique({
        where: { id: input.deviceId },
      });

      if (!device) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found",
        });
      }

      if (input.playerCount > device.maxPlayers) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This device only allows a maximum of ${device.maxPlayers} players`,
        });
      }

      // Check if device is available
      const activeSessionsOnDevice = await ctx.db.session.findFirst({
        where: {
          deviceId: input.deviceId,
          status: SessionStatus.ACTIVE,
        },
      });

      if (activeSessionsOnDevice) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This device is already in use",
        });
      }

      // Check Pool/Frame constraint
      if (device.type === DeviceType.POOL || device.type === DeviceType.FRAME) {
        const isPoolFrameActive = await ctx.db.session.findFirst({
          where: {
            device: {
              type: {
                in: [DeviceType.POOL, DeviceType.FRAME],
              },
            },
            status: SessionStatus.ACTIVE,
          },
        });

        if (isPoolFrameActive) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Pool table is already in use",
          });
        }
      }

      // Find existing token for today or create a new one
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Check if the token is available for use
      const tokenInUse = await ctx.db.token.findFirst({
        where: {
          tokenNo: input.tokenNo,
          createdAt: {
            gte: today,
          },
          orders: {
            some: {
              status: OrderStatus.ACTIVE
            }
          }
        },
      });

      if (tokenInUse && !input.orderId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This token is already in use by another active order",
        });
      }

      // Create a new token or use the existing one for the given orderId
      let token;
      
      // If orderId is provided, find the token associated with that order
      if (input.orderId) {
        const orderWithToken = await ctx.db.order.findUnique({
          where: { id: input.orderId },
          include: { token: true }
        });
        
        if (!orderWithToken) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          });
        }
        
        token = orderWithToken.token;
      } else {
        // Otherwise, create a new token with the specified token number
        token = await ctx.db.token.create({
          data: {
            tokenNo: input.tokenNo,
          },
        });
      }

      // Create a new order or use the existing one
      let orderId = input.orderId;
      
      if (!orderId) {
        // Create a new order
        const newOrder = await ctx.db.order.create({
          data: {
            id: randomUUID(),
            orderNumber: generateOrderNumber(),
            tokenId: token.id,
            status: OrderStatus.ACTIVE,
          },
        });
        orderId = newOrder.id;
      }

      // Create the session
      const session = await ctx.db.session.create({
        data: {
          tokenId: token.id,
          orderId: orderId,
          deviceId: input.deviceId,
          playerCount: input.playerCount,
          comments: input.comments,
          status: SessionStatus.ACTIVE,
        },
        include: {
          device: true,
        },
      });

      // Attempt to trigger webhook for session started
      try {
        // Import is done dynamically to avoid circular dependencies
        const { handleSessionStatusChange } = await import("~/server/webhooks/webhookHandler");
        
        // Don't await this to prevent blocking the response
        handleSessionStatusChange(
          session.deviceId,
          SessionStatus.ACTIVE,
          session.id
        ).catch(error => {
          console.error("Error triggering ACTIVE webhook:", error);
        });
      } catch (error) {
        console.error("Error importing webhook handler:", error);
        // We don't throw here as webhook is a secondary concern
      }

      return session;
    }),

  // End a gaming session
  endSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.session.findUnique({
        where: { id: input.sessionId },
        include: {
          device: true
        }
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      if (session.status === SessionStatus.ENDED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Session is already ended",
        });
      }

      // Calculate duration and cost using the new pricing system
      const now = new Date();
      const durationInMinutes = calculateDuration(session.startTime, now);
      
      let cost = 0;
      
      // Special handling for Frame devices
      if (session.device.type === DeviceType.FRAME) {
        // For Frame, cost is fixed at Rs 50 * player count
        cost = 50 * session.playerCount;
        console.log(`Ending Frame session with ${session.playerCount} players: cost = ${cost}`);
      } else {
        try {
          // Calculate price based on device type, player count, and duration
          cost = calculatePrice(
            session.device.type as any, // Cast to any as a workaround for TypeScript
            session.playerCount,
            durationInMinutes
          );
        } catch (error) {
          console.error("Error calculating price:", error);
          // Fallback to legacy calculation if the new system throws an error
          const hourlyRate = Number(session.device.hourlyRate || 0);
          const roundedTime = roundTimeToCharge(durationInMinutes);
          cost = (hourlyRate / 60) * roundedTime;
        }
      }

      // Update the session
      const updatedSession = await ctx.db.session.update({
        where: { id: input.sessionId },
        data: {
          status: SessionStatus.ENDED,
          endTime: now,
          duration: durationInMinutes,
          cost: cost,
        },
      });

      // Attempt to trigger webhook for session ended
      try {
        // Import is done dynamically to avoid circular dependencies
        const { handleSessionStatusChange } = await import("~/server/webhooks/webhookHandler");
        
        // Don't await this to prevent blocking the response
        handleSessionStatusChange(
          session.deviceId,
          SessionStatus.ENDED,
          session.id
        ).catch(error => {
          console.error("Error triggering ENDED webhook:", error);
        });
      } catch (error) {
        console.error("Error importing webhook handler:", error);
        // We don't throw here as webhook is a secondary concern
      }

      return updatedSession;
    }),

  // Update session comments
  updateSessionComments: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        comments: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.session.findUnique({
        where: { id: input.sessionId },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      const updatedSession = await ctx.db.session.update({
        where: { id: input.sessionId },
        data: {
          comments: input.comments,
        },
      });

      return updatedSession;
    }),

  // Generate bill for an order
  generateBillForOrder: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.order.findUnique({
        where: { id: input.orderId },
        include: {
          token: true,
          sessions: {
            include: {
              device: true,
            },
          },
          bills: { // Include existing bills for this order
            where: {
              status: PaymentStatus.PENDING,
            },
            orderBy: {
              generatedAt: 'desc', // Get the latest PENDING bill if multiple (should ideally not happen)
            },
            take: 1,
          }
        },
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      const now = new Date();
      let totalAmount = 0;

      // --- Calculate total amount (same logic as before) ---
      console.log("Calculating bill amount for order:", order.orderNumber);
      for (const session of order.sessions) {
        if (session.status === SessionStatus.ACTIVE) {
          const device = await ctx.db.device.findUnique({ where: { id: session.deviceId } });
          if (!device) {
            console.error(`Device with ID ${session.deviceId} not found for active session ${session.id}`);
            continue;
          }
          if (device.type === DeviceType.FRAME) {
            totalAmount += (50 * session.playerCount);
          } else {
            const durationInMinutes = calculateDuration(session.startTime, now);
            try {
              totalAmount += calculatePrice(device.type as any, session.playerCount, durationInMinutes);
            } catch (e) {
              console.error("Error in calculatePrice for active session:", e);
              const hourlyRate = Number(device.hourlyRate || 0);
              const roundedTime = roundTimeToCharge(durationInMinutes);
              totalAmount += (hourlyRate / 60) * roundedTime;
            }
          }
        } else {
          totalAmount += Number(session.cost || 0);
        }
      }

      let foodItemsTotal = 0;
      if (order.notes) {
        const parsedFoodItems = parseFoodItemsFromNotes(order.notes);
        for (const item of parsedFoodItems) {
          foodItemsTotal += item.total;
        }
      }
      totalAmount += foodItemsTotal;
      console.log(`Total calculated amount for order ${order.orderNumber} (including food): ${totalAmount}`);
      // --- End of amount calculation ---

      const existingPendingBill = order.bills && order.bills[0]; // bills is included and filtered for PENDING, take: 1

      if (existingPendingBill) {
        console.log(`Found existing PENDING bill (ID: ${existingPendingBill.id}) for order ${order.orderNumber}. Updating amount.`);
        const updatedBill = await ctx.db.bill.update({
          where: { id: existingPendingBill.id },
          data: {
            amount: totalAmount,
            generatedAt: now, // Reflect that it was re-evaluated now
            // Other fields like status remain PENDING
          },
          include: {
            token: true,
            order: true,
          },
        });
        return updatedBill;
      } else {
        console.log(`No existing PENDING bill for order ${order.orderNumber}. Creating new bill.`);
        const newBill = await ctx.db.bill.create({
          data: {
            tokenId: order.tokenId,
            orderId: order.id,
            amount: totalAmount,
            status: PaymentStatus.PENDING,
            generatedAt: now,
          },
          include: {
            token: true,
            order: true,
          },
        });
        return newBill;
      }
    }),

  // Generate bill for a token (legacy support)
  generateBill: protectedProcedure
    .input(z.object({ tokenId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Define a more specific type for sessions with included relations
      type SessionWithRelations = Session & {
        device: Device; 
        order: PrismaOrder | null; 
      };

      const tokenData = await ctx.db.token.findUnique({
        where: { id: input.tokenId },
        include: {
          sessions: {
            include: { device: true, order: true },
            orderBy: { startTime: "desc" },
          },
          orders: {
            include: {
              bills: {
                where: { status: PaymentStatus.PENDING },
                orderBy: { generatedAt: 'desc' },
                take: 1,
              }
            }
          },
          bills: {
            where: {
              status: PaymentStatus.PENDING,
              orderId: null, 
            },
            orderBy: { generatedAt: 'desc' },
            take: 1,
          }
        },
      });

      if (!tokenData) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Token not found" });
      }

      const createdOrUpdatedBills = [];
      const now = new Date();

      const sessionsByActualOrderId = new Map<string | null, SessionWithRelations[]>();
      (tokenData.sessions as SessionWithRelations[]).forEach(session => {
        const orderIdKey = session.orderId || null;
        if (!sessionsByActualOrderId.has(orderIdKey)) {
          sessionsByActualOrderId.set(orderIdKey, []);
        }
        sessionsByActualOrderId.get(orderIdKey)?.push(session);
      });

      // Process sessions linked to an order
      for (const order of tokenData.orders) {
        const sessionsForThisOrder = sessionsByActualOrderId.get(order.id) || [];
        if (sessionsForThisOrder.length === 0) continue;

        let orderTotalAmount = 0;
        for (const session of sessionsForThisOrder) { // session is now SessionWithRelations
          if (session.status === SessionStatus.ACTIVE) {
            const device = session.device; // device should be directly accessible and correctly typed
            if (!device) { console.error("Device missing for active session on order"); continue; }
            if (device.type === DeviceType.FRAME) {
              orderTotalAmount += (50 * session.playerCount);
            } else {
              const durationInMinutes = calculateDuration(session.startTime, now);
              try { orderTotalAmount += calculatePrice(device.type as any, session.playerCount, durationInMinutes); } 
              catch (e) { 
                console.error("Price calc error on order:", e); 
                orderTotalAmount += (Number(device.hourlyRate||0)/60) * roundTimeToCharge(durationInMinutes); 
              }
            }
          } else {
            orderTotalAmount += Number(session.cost || 0);
          }
        }
        if (orderTotalAmount <= 0) continue;
        const existingPendingBillForOrder = order.bills && order.bills[0];
        if (existingPendingBillForOrder) {
          const updatedBill = await ctx.db.bill.update({
            where: { id: existingPendingBillForOrder.id },
            data: { amount: orderTotalAmount, generatedAt: now },
          });
          createdOrUpdatedBills.push(updatedBill);
        } else {
          const newBill = await ctx.db.bill.create({
            data: {
              tokenId: tokenData.id, orderId: order.id, amount: orderTotalAmount,
              status: PaymentStatus.PENDING, generatedAt: now,
            },
          });
          createdOrUpdatedBills.push(newBill);
        }
      }

      // Process legacy sessions (not tied to any specific order on the token)
      const legacySessions = sessionsByActualOrderId.get(null) || [];
      if (legacySessions.length > 0) {
        let legacyTotalAmount = 0;
        for (const session of legacySessions) { // session is now SessionWithRelations
          if (session.status === SessionStatus.ACTIVE) {
            const device = session.device; // device should be directly accessible
            if (!device) { console.error("Device missing for legacy active session"); continue; }
            if (device.type === DeviceType.FRAME) {
              legacyTotalAmount += (50 * session.playerCount);
            } else {
              const durationInMinutes = calculateDuration(session.startTime, now);
              try { legacyTotalAmount += calculatePrice(device.type as any, session.playerCount, durationInMinutes); } 
              catch (e) { 
                console.error("Price calc error legacy:", e); 
                legacyTotalAmount += (Number(device.hourlyRate||0)/60) * roundTimeToCharge(durationInMinutes);
              }
            }
          } else {
            legacyTotalAmount += Number(session.cost || 0);
          }
        }
        if (legacyTotalAmount > 0) {
          const existingLegacyPendingBill = tokenData.bills && tokenData.bills[0];
          if (existingLegacyPendingBill) {
            const updatedBill = await ctx.db.bill.update({
              where: { id: existingLegacyPendingBill.id },
              data: { amount: legacyTotalAmount, generatedAt: now },
            });
            createdOrUpdatedBills.push(updatedBill);
          } else {
            const newBill = await ctx.db.bill.create({
              data: {
                tokenId: tokenData.id, orderId: null, amount: legacyTotalAmount,
                status: PaymentStatus.PENDING, generatedAt: now,
              },
            });
            createdOrUpdatedBills.push(newBill);
          }
        }
      }

      if (createdOrUpdatedBills.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No billable activity found for this token" });
      }
      return createdOrUpdatedBills[0];
    }),

  // Get bill by ID
  getBill: protectedProcedure
    .input(z.object({ billId: z.number() }))
    .query(async ({ ctx, input }) => {
      const bill = await ctx.db.bill.findUnique({
        where: { id: input.billId },
        include: {
          token: {
            include: {
              sessions: {
                include: {
                  device: true,
                  order: true,
                }
              }
            }
          },
          order: {
            include: {
              sessions: {
                include: {
                  device: true
                }
              }
            }
          }
        }
      });

      if (!bill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bill not found",
        });
      }

      return bill;
    }),

  // Get all bills with order and token information
  getAllBills: protectedProcedure
    .query(async ({ ctx }) => {
      const bills = await ctx.db.bill.findMany({
        include: {
          token: {
            select: {
              tokenNo: true,
            },
          },
          order: {
            select: {
              orderNumber: true,
            },
          },
        },
        orderBy: {
          generatedAt: "desc",
        },
        distinct: ['id'],
      });
      return bills;
    }),

  // Update bill status
  updateBillStatus: protectedProcedure
    .input(
      z.object({
        billId: z.number(),
        status: z.enum([PaymentStatus.PENDING, PaymentStatus.PAID, PaymentStatus.DUE]),
        correctedAmount: z.number().optional(),
        amountReceived: z.number().optional(), // Add amountReceived parameter
        paymentMethod: z.string().optional(),
        paymentReference: z.string().optional(),
        customerId: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get the bill with token information and all related sessions
      const bill = await ctx.db.bill.findUnique({
        where: { id: input.billId },
        include: {
          token: true,
          order: {
            include: {
              sessions: {
                include: {
                  device: true
                },
                where: {
                  status: SessionStatus.ACTIVE
                }
              }
            }
          }
        },
      });

      if (!bill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bill not found",
        });
      }

      const now = new Date();

      // Update the bill status and amount if corrected amount is provided
      const updateData: any = {
        status: input.status,
      };
      
      // If client provided a corrected amount, use it
      if (input.correctedAmount !== undefined) {
        updateData.correctedAmount = input.correctedAmount;
        console.log(`Updating bill amount from ${bill.amount} to ${input.correctedAmount}`);
      }

      // Add payment info if provided
      if (input.paymentMethod) {
        updateData.paymentMethod = input.paymentMethod;
      }
      
      if (input.paymentReference) {
        updateData.paymentReference = input.paymentReference;
      }
      
      // Save the amount received if provided
      if (input.amountReceived !== undefined) {
        updateData.amountReceived = input.amountReceived;
        console.log(`Saving amount received: ${input.amountReceived}`);
      }
      
      // Set paid time if marking as paid
      if (input.status === PaymentStatus.PAID) {
        updateData.paidAt = now;
      }

      // Associate with customer if marking as DUE and customerId provided
      if (input.status === PaymentStatus.DUE) {
        if (input.customerId) {
          // Check if the customer exists
          const customerExists = await ctx.db.customer.findUnique({
            where: { id: input.customerId }
          });

          if (!customerExists) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Customer not found",
            });
          }

          updateData.customerId = input.customerId;
        }
      }

      // End any active sessions when bill is marked as PAID or DUE
      if (bill.status === PaymentStatus.PENDING && 
         (input.status === PaymentStatus.PAID || input.status === PaymentStatus.DUE)) {
        console.log(`Bill ${bill.id} status changed from PENDING to ${input.status}. Ending active sessions...`);
        
        // Get all active sessions related to this bill
        let activeSessions = [];
        
        if (bill.order) {
          // First get sessions from the order
          activeSessions = bill.order.sessions;
        } else {
          // If no order, get active sessions directly from the token
          const tokenSessions = await ctx.db.session.findMany({
            where: {
              tokenId: bill.tokenId,
              status: SessionStatus.ACTIVE,
              orderId: null // Only get sessions not associated with an order
            },
            include: {
              device: true
            }
          });
          activeSessions = tokenSessions;
        }
        
        console.log(`Found ${activeSessions.length} active sessions to end`);
        
        // End each active session
        for (const session of activeSessions) {
          console.log(`Ending session ${session.id}`);
          
          // Calculate duration and cost
          const durationInMinutes = calculateDuration(session.startTime, now);
          
          let cost = 0;
          
          // Get the device, if it's not already included in the session
          const device = session.device || await ctx.db.device.findUnique({
            where: { id: session.deviceId }
          });
          
          if (!device) {
            console.error(`Device with ID ${session.deviceId} not found`);
            continue;
          }
          
          // Special handling for Frame devices
          if (device.type === DeviceType.FRAME) {
            // For Frame, cost is fixed at Rs 50 * player count
            cost = 50 * session.playerCount;
          } else {
            try {
              // Calculate price based on device type, player count, and duration
              cost = calculatePrice(
                device.type as any,
                session.playerCount,
                durationInMinutes
              );
            } catch (error) {
              console.error("Error calculating price:", error);
              // Fallback to legacy calculation
              const hourlyRate = Number(device.hourlyRate || 0);
              const roundedTime = roundTimeToCharge(durationInMinutes);
              cost = (hourlyRate / 60) * roundedTime;
            }
          }

          // Update the session
          await ctx.db.session.update({
            where: { id: session.id },
            data: {
              status: SessionStatus.ENDED,
              endTime: now,
              duration: durationInMinutes,
              cost: cost,
            },
          });
        }
      }
      
      // Update the bill status
      const updatedBill = await ctx.db.bill.update({
        where: { id: input.billId },
        data: updateData,
        include: {
          token: true,
          order: true,
          customer: true,
        },
      });

      // If bill is marked as PAID or DUE, update the order status to COMPLETED
      if (
        (input.status === PaymentStatus.PAID || input.status === PaymentStatus.DUE) &&
        bill.orderId
      ) {
        await ctx.db.order.update({
          where: { id: bill.orderId },
          data: {
            status: OrderStatus.COMPLETED,
            endTime: now,
          },
        });
      }

      return updatedBill;
    }),

  // Update frames played for Frame game sessions
  updateFramesPlayed: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        comments: z.string(),
        framesPlayed: z.number().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.session.findUnique({
        where: { id: input.sessionId },
        include: { device: true }
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      // Verify this is a Frame game
      if (session.device.type !== DeviceType.FRAME) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This endpoint is only for Frame game sessions",
        });
      }

      // Calculate cost based on number of frames
      try {
        // For Frame, cost is now just based on player count (Rs 50 * player count)
        const frameCost = calculatePrice("Frame", session.playerCount, 0);
        
        // Update the session with frames played and cost
        const updatedSession = await ctx.db.session.update({
          where: { id: input.sessionId },
          data: {
            comments: input.comments,
            framesPlayed: input.framesPlayed, // We still track frames for record-keeping
            cost: frameCost,
          },
        });

        return updatedSession;
      } catch (error: unknown) {
        console.error("Error calculating frame price:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error calculating price for frames",
        });
      }
    }),

  // Update player count for Frame sessions
  updatePlayerCount: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        playerCount: z.number().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.session.findUnique({
        where: { id: input.sessionId },
        include: { device: true }
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      // Verify this is a Frame game
      if (session.device.type !== DeviceType.FRAME) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Player count editing is only available for Frame game sessions",
        });
      }

      // Verify player count is within limits
      if (input.playerCount > session.device.maxPlayers) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This device only allows a maximum of ${session.device.maxPlayers} players`,
        });
      }

      // Calculate cost based on number of frames (if any) and new player count
      try {
        // For Frame, cost is now based solely on player count (Rs 50 * player count)
        const frameCost = calculatePrice("Frame", input.playerCount, 0);
        
        // Update the session with new player count and recalculated cost
        const updatedSession = await ctx.db.session.update({
          where: { id: input.sessionId },
          data: {
            playerCount: input.playerCount,
            cost: frameCost,
          },
        });

        return updatedSession;
      } catch (error: unknown) {
        console.error("Error calculating frame price:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error calculating price for frames",
        });
      }
    }),

  /**
   * Placeholder for future getFoodOrders implementation.
   * Currently returns empty array.
   */
  getFoodOrders: protectedProcedure
    .query(async () => {
      // This will be replaced with a real database query in the future
      // For now, just return an empty array
      return [];
    }),

  // Get all unpaid bills across all dates
  getUnpaidBills: protectedProcedure.query(async ({ ctx }) => {
    try {
      console.log("Fetching unpaid bills...");
      
      // First get all unique order bills
      const orderBills = await ctx.db.bill.findMany({
        where: {
          status: {
            in: [PaymentStatus.PENDING, PaymentStatus.DUE]
          },
          // Only get bills with an order ID (preferred approach)
          orderId: {
            not: null
          }
        },
        include: {
          token: true,
          order: {
            include: {
              sessions: {
                include: {
                  device: true
                },
                orderBy: {
                  startTime: "desc"
                }
              }
            }
          }
        },
        orderBy: [
          { generatedAt: "desc" }
        ],
        // Use distinct to prevent duplicates
        distinct: ['orderId']
      });

      // Then get token-based bills that don't have an order (legacy)
      const tokenBills = await ctx.db.bill.findMany({
        where: {
          status: {
            in: [PaymentStatus.PENDING, PaymentStatus.DUE]
          },
          // Only get bills without an order ID (legacy approach)
          orderId: null
        },
        include: {
          token: {
            include: {
              sessions: {
                where: {
                  orderId: null // Only include sessions without an order
                },
                include: {
                  device: true
                },
                orderBy: {
                  startTime: "desc"
                }
              }
            }
          }
        },
        orderBy: [
          { generatedAt: "desc" }
        ],
        // Use distinct to prevent duplicates
        distinct: ['tokenId']
      });

      console.log(`Found ${orderBills.length} order bills and ${tokenBills.length} token bills`);
      
      // Log status counts for debugging
      const orderBillStatusCounts = orderBills.reduce((acc, bill) => {
        acc[bill.status] = (acc[bill.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const tokenBillStatusCounts = tokenBills.reduce((acc, bill) => {
        acc[bill.status] = (acc[bill.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log("Order bill status counts:", orderBillStatusCounts);
      console.log("Token bill status counts:", tokenBillStatusCounts);

      // Add a null order property to tokenBills for consistency
      const formattedTokenBills = tokenBills.map(bill => ({
        ...bill,
        order: null
      }));

      // Final check to make absolutely sure we don't return PAID bills
      const filteredBills = [...orderBills, ...formattedTokenBills].filter(bill => 
        bill.status !== PaymentStatus.PAID
      );
      
      console.log(`Returning ${filteredBills.length} unpaid bills after final filter`);
      
      // Combine both sets of bills, prioritizing order-based bills
      return filteredBills;
    } catch (error: unknown) {
      console.error("Error in getUnpaidBills:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Failed to get unpaid bills"
      });
    }
  }),

  // Create a new customer
  createCustomer: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        phone: z.string().optional(),
        email: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const customer = await ctx.db.customer.create({
        data: {
          name: input.name,
          phone: input.phone,
          email: input.email,
        },
      });

      return customer;
    }),

  // Get all customers
  getCustomers: protectedProcedure
    .query(async ({ ctx }) => {
      const customers = await ctx.db.customer.findMany({
        orderBy: { name: 'asc' },
      });
      return customers;
    }),

  // Get customers with due bills
  getCustomersWithDueBills: protectedProcedure
    .query(async ({ ctx }) => {
      const customers = await ctx.db.customer.findMany({
        where: {
          bills: {
            some: {
              status: PaymentStatus.DUE,
            },
          },
        },
        include: {
          bills: {
            where: {
              status: PaymentStatus.DUE,
            },
            include: {
              token: true,
              order: true,
            },
            orderBy: {
              generatedAt: 'desc',
            },
          },
        },
        orderBy: { name: 'asc' },
      });
      return customers;
  }),

  // Add food items to an existing order
  addFoodToOrder: protectedProcedure
    .input(
      z.object({
        orderId: z.string(),
        foodItems: z.array(
          z.object({
            name: z.string(),
            price: z.number(),
            quantity: z.number().min(1)
          })
        )
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if order exists
      const order = await ctx.db.order.findUnique({
        where: { id: input.orderId },
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      // Extract existing food items if any
      const existingNotes = order.notes || '';
      let existingFoodItems: Array<{name: string, price: number, quantity: number}> = [];
      
      if (existingNotes.includes('Food items:')) {
        const match = existingNotes.match(/Food items:(.*?)(?:,|$)/);
        if (match && match[1]) {
          // Parse existing items
          const itemsStr = match[1].trim();
          existingFoodItems = itemsStr.split('|')
            .map(item => {
              const itemMatch = item.trim().match(/^(\d+)x (.+?) \(₹(\d+(?:\.\d+)?)\)$/);
              if (itemMatch && itemMatch[1] && itemMatch[2] && itemMatch[3]) {
                return {
                  quantity: parseInt(itemMatch[1], 10),
                  name: itemMatch[2].trim(),
                  price: parseFloat(itemMatch[3])
                };
              }
              return null;
            })
            .filter(Boolean) as Array<{name: string, price: number, quantity: number}>;
        }
      }
      
      // Helper function to normalize item names for comparison
      const normalizeItemName = (name: string) => {
        // Remove any variant info after the dash
        const nameParts = name.split('-');
        const baseName = nameParts[0];
        // Clean up and standardize
        if (baseName) {
          return baseName.toLowerCase().trim();
        }
        return name.toLowerCase().trim(); // Fallback for names without '-'
      };
      
      // Combine new items with existing items (adding quantities for same items)
      const combinedItems = [...existingFoodItems];
      
      input.foodItems.forEach(newItem => {
        // Try to find matching item by normalized name and price
        const newItemNormalized = normalizeItemName(newItem.name);
        
        const existingItemIndex = combinedItems.findIndex(item => 
          normalizeItemName(item.name) === newItemNormalized && 
          Math.abs(item.price - newItem.price) < 0.01 // Compare prices with small tolerance
        );
        
        if (existingItemIndex >= 0) {
          // Increment quantity of existing item
          const itemToUpdate = combinedItems[existingItemIndex];
          if (itemToUpdate) {
            itemToUpdate.quantity += newItem.quantity;
          } else {
            // This case should ideally not be reached if existingItemIndex >= 0 and filter(Boolean) worked
            console.error("Error: itemToUpdate is undefined despite existingItemIndex >= 0");
          }
        } else {
          // Add as new item
          combinedItems.push({
            name: newItem.name,
            price: newItem.price,
            quantity: newItem.quantity
          });
        }
      });
      
      // Convert back to string format
      const combinedItemsText = combinedItems
        .map(item => `${item.quantity}x ${item.name} (₹${item.price})`)
        .join('|');
      
      // Update notes with combined items
      let newNotes;
      if (existingNotes.includes('Food items:')) {
        // Replace existing food items section
        newNotes = existingNotes.replace(
          /Food items:(.*?)(?:,|$)/, 
          `Food items: ${combinedItemsText},`
        );
      } else {
        // Add new food items section
        newNotes = existingNotes
          ? `${existingNotes}, Food items: ${combinedItemsText}`
          : `Food items: ${combinedItemsText}`;
      }
      
      // Update the order
      const updatedOrder = await ctx.db.order.update({
        where: { id: input.orderId },
        data: {
          notes: newNotes,
        },
      });

      return updatedOrder;
    }),

  // *** NEW PROCEDURE: Get All Gaming Sessions ***
  getAllGamingSessions: protectedProcedure
    .query(async ({ ctx }) => {
      const sessions = await ctx.db.session.findMany({
        include: {
          device: true,
          token: true,
          order: true, // Include order details if the session is part of an order
        },
        orderBy: {
          startTime: 'desc', // Show most recent sessions first
        },
      });
      return sessions;
    }),
  // *** END OF NEW PROCEDURE ***

  // *** NEW PROCEDURE: Get All Food Orders ***
  getAllFoodOrders: protectedProcedure
    .query(async ({ ctx }) => {
      const orders = await ctx.db.order.findMany({
        include: {
          token: true,    // Include the token associated with the order
          sessions: {     // Include sessions, if any, linked to this order
            include: {
              device: true
            }
          },
          bills: true,      // Include any bills associated with the order
        },
        orderBy: {
          startTime: 'desc', // Show most recent orders first
        },
      });
      // We are returning the raw order notes. 
      // The frontend can use the existing 'parseFoodItemsFromNotes' helper if it needs to display itemized food.
      return orders;
    }),
  // *** END OF NEW PROCEDURE ***

  // Update food items for an existing order (full replacement)
  updateFoodItems: protectedProcedure
    .input(
      z.object({
        orderId: z.string(),
        foodItems: z.array(
          z.object({ name: z.string(), price: z.number(), quantity: z.number().min(0) })
        )
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if the order exists
      const order = await ctx.db.order.findUnique({ where: { id: input.orderId } });
      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }
      // Build the notes string for food items
      let notes: string | null = null;
      if (input.foodItems.length > 0) {
        const foodItemsText = input.foodItems
          .map(item => `${item.quantity}x ${item.name} (₹${item.price})`)
          .join('|');
        notes = `Food items: ${foodItemsText}`;
      }
      // Update the order notes
      const updatedOrder = await ctx.db.order.update({
        where: { id: input.orderId },
        data: { notes },
        include: { token: true }
      });
      return updatedOrder;
    }),
}); 