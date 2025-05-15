import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import type { Device, Session, Order } from "@prisma/client";
import { DeviceType, SessionStatus, PaymentStatus, OrderStatus } from "~/lib/constants";
import { calculatePrice, roundTimeToCharge, calculateDuration } from "~/lib/pricing";
import { randomUUID } from "crypto";

// Enum values matching Prisma's generated enums
export { SessionStatus, DeviceType, PaymentStatus, OrderStatus };

// Helper function to generate a human-readable order number
function generateOrderNumber(): string {
  // Format: GSO-YYYYMMDD-XXXX (Gamespace Order, Date, Random alphanumeric)
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `GSO-${datePart}-${randomPart}`;
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

      // Create the new order
      const order = await ctx.db.order.create({
        data: {
          id: randomUUID(),
          orderNumber,
          tokenId: input.tokenId,
          notes: input.notes,
          status: OrderStatus.ACTIVE,
        },
        include: {
          token: true,
        },
      });

      return order;
    }),

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
              device: true
            }
          },
        },
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      let totalAmount = 0;
      const now = new Date();
      
      // Calculate total amount based on sessions
      console.log("Calculating bill for order:", order.orderNumber);
      
      for (const session of order.sessions) {
        if (session.status === SessionStatus.ACTIVE) {
          // Get the device
          const device = await ctx.db.device.findUnique({
            where: { id: session.deviceId }
          });
          
          if (!device) {
            console.error(`Device with ID ${session.deviceId} not found`);
            continue;
          }
          
          // Special handling for Frame
          if (device.type === DeviceType.FRAME) {
            const framePrice = 50 * session.playerCount;
            console.log(`Active Frame session ${session.id}: ${framePrice} (${session.playerCount} players)`);
            totalAmount += framePrice;
            continue;
          }

          // For non-Frame active sessions, calculate duration
          const durationInMinutes = calculateDuration(session.startTime, now);
          
          try {
            // Calculate price based on device type, player count, and duration
            const price = calculatePrice(
              device.type as any,
              session.playerCount,
              durationInMinutes
            );
            
            console.log(`Active session ${session.id} (${session.device.type}): ${price} for ${durationInMinutes}m`);
            totalAmount += price;
          } catch (error) {
            console.error("Error calculating price:", error);
            // Fallback to legacy calculation if the new system throws an error
            const hourlyRate = Number(device.hourlyRate || 0);
            const roundedTime = roundTimeToCharge(durationInMinutes);
            const cost = (hourlyRate / 60) * roundedTime;
            console.log(`Fallback calculation for session ${session.id}: ${cost}`);
            totalAmount += cost;
          }
        } else {
          // For ended sessions, use the stored cost
          const sessionCost = Number(session.cost || 0);
          console.log(`Ended session ${session.id} (${session.device.type}): ${sessionCost}`);
          totalAmount += sessionCost;
        }
      }
      
      console.log(`Total calculated amount for order ${order.orderNumber}: ${totalAmount}`);

      // Create the bill
      const bill = await ctx.db.bill.create({
        data: {
          tokenId: order.tokenId,
          orderId: order.id,
          amount: totalAmount,
          status: PaymentStatus.PENDING,
        },
        include: {
          token: true,
          order: true,
        },
      });

      return bill;
    }),

  // Generate bill for a token (legacy support)
  generateBill: protectedProcedure
    .input(z.object({ tokenId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const token = await ctx.db.token.findUnique({
        where: { id: input.tokenId },
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
          orders: true,
        },
      });

      if (!token) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Token not found",
        });
      }

      // Group sessions by order ID
      const sessionsByOrder = new Map<string | null, Session[]>();
      
      // Add sessions with no order to a special group (null key)
      sessionsByOrder.set(null, []);
      
      // Initialize entry for each order
      token.orders.forEach(order => {
        sessionsByOrder.set(order.id, []);
      });
      
      // Group sessions
      token.sessions.forEach(session => {
        const orderId = session.orderId || null;
        const sessions = sessionsByOrder.get(orderId) || [];
        sessions.push(session);
        sessionsByOrder.set(orderId, sessions);
      });
      
      // Create bills for each order group
      const bills = [];
      
      // First, handle sessions with orders
      for (const [orderId, sessions] of sessionsByOrder.entries()) {
        if (orderId === null || sessions.length === 0) continue;
        
        // Get the order
        const order = token.orders.find(o => o.id === orderId);
        if (!order) continue;
        
        let totalAmount = 0;
        const now = new Date();
        
        // Calculate total for this order's sessions
        for (const session of sessions) {
          if (session.status === SessionStatus.ACTIVE) {
            // Get the device
            const device = await ctx.db.device.findUnique({
              where: { id: session.deviceId }
            });
            
            if (!device) {
              console.error(`Device with ID ${session.deviceId} not found`);
              continue;
            }
            
            // Special handling for Frame
            if (device.type === DeviceType.FRAME) {
              const framePrice = 50 * session.playerCount;
              totalAmount += framePrice;
              continue;
            }

            // For non-Frame active sessions, calculate duration
            const durationInMinutes = calculateDuration(session.startTime, now);
            
            try {
              const price = calculatePrice(
                device.type as any,
                session.playerCount,
                durationInMinutes
              );
              totalAmount += price;
            } catch (error) {
              console.error("Error calculating price:", error);
              const hourlyRate = Number(device.hourlyRate || 0);
              const roundedTime = roundTimeToCharge(durationInMinutes);
              const cost = (hourlyRate / 60) * roundedTime;
              totalAmount += cost;
            }
          } else {
            // For ended sessions, use the stored cost
            const sessionCost = Number(session.cost || 0);
            totalAmount += sessionCost;
          }
        }
        
        // Create bill for this order
        if (totalAmount > 0) {
          const bill = await ctx.db.bill.create({
            data: {
              tokenId: token.id,
              orderId: orderId,
              amount: totalAmount,
              status: PaymentStatus.PENDING,
            },
          });
          bills.push(bill);
        }
      }
      
      // Handle sessions without orders (legacy)
      const legacySessions = sessionsByOrder.get(null) || [];
      if (legacySessions.length > 0) {
        let totalAmount = 0;
        const now = new Date();
        
        for (const session of legacySessions) {
          if (session.status === SessionStatus.ACTIVE) {
            // Get the device
            const device = await ctx.db.device.findUnique({
              where: { id: session.deviceId }
            });
            
            if (!device) {
              console.error(`Device with ID ${session.deviceId} not found`);
              continue;
            }
            
            // Special handling for Frame
            if (device.type === DeviceType.FRAME) {
              const framePrice = 50 * session.playerCount;
              totalAmount += framePrice;
              continue;
            }

            // Calculate for active sessions
            const durationInMinutes = calculateDuration(session.startTime, now);
            
            try {
              const price = calculatePrice(
                device.type as any,
                session.playerCount,
                durationInMinutes
              );
              totalAmount += price;
            } catch (error) {
              console.error("Error calculating price:", error);
              const hourlyRate = Number(device.hourlyRate || 0);
              const roundedTime = roundTimeToCharge(durationInMinutes);
              const cost = (hourlyRate / 60) * roundedTime;
              totalAmount += cost;
            }
          } else {
            // For ended sessions, use the stored cost
            const sessionCost = Number(session.cost || 0);
            totalAmount += sessionCost;
          }
        }
        
        // Create legacy bill without order
        if (totalAmount > 0) {
          const bill = await ctx.db.bill.create({
            data: {
              tokenId: token.id,
              amount: totalAmount,
              status: PaymentStatus.PENDING,
            },
          });
          bills.push(bill);
        }
      }
      
      // If no bills were created, throw an error
      if (bills.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No billable sessions found for this token",
        });
      }
      
      // Return the first bill (for backward compatibility)
      return bills[0];
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

  // Update bill status
  updateBillStatus: protectedProcedure
    .input(
      z.object({
        billId: z.number(),
        status: z.enum([PaymentStatus.PENDING, PaymentStatus.PAID, PaymentStatus.DUE]),
        correctedAmount: z.number().optional(),
        paymentMethod: z.string().optional(),
        paymentReference: z.string().optional(),
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
      
      // Set paid time if marking as paid
      if (input.status === PaymentStatus.PAID) {
        updateData.paidAt = now;
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
          order: true
        }
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
}); 