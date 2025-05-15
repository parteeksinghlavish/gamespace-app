# Gamespace App - Gaming Cafe Management System

Gamespace App is a comprehensive management system for gaming cafes, designed to handle the full lifecycle of customer sessions, billing, and reporting.

## Features

- **Token-based Customer Tracking**: Quickly assign tokens to customers
- **Order-based Billing**: Group gaming sessions into orders for better organization
- **Flexible Device Management**: Support for multiple device types (PS5, PS4, VR, etc.)
- **Dynamic Pricing**: Different pricing models based on device type, player count, and time
- **Special Handling for Frame Games**: Fixed price per player for frame/pool games
- **Real-time Session Management**: Track active sessions with periodic auto-refresh
- **Bill Generation and Payment Processing**: Generate bills for specific orders or tokens

## System Architecture

### Core Components

1. **Tokens**: Represent a physical token given to customers
2. **Orders**: Group related sessions under a single business transaction
3. **Sessions**: Individual gaming sessions on specific devices
4. **Bills**: Payment records associated with orders

### Data Model

- A **Token** can have multiple **Orders** (representing different visits or groups)
- An **Order** contains multiple **Sessions** (different games played)
- Each **Session** belongs to one **Device** and tracks time, cost, and players
- **Bills** are generated for **Orders** and track payment status

## Development

### Prerequisites

- Node.js (v16+)
- NPM or Yarn
- SQLite (development) or PostgreSQL (production)

### Getting Started

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create database and run migrations:
   ```
   npx prisma migrate dev
   ```
4. Start the development server:
   ```
   npm run dev
   ```

## Order-based Billing System

The system uses an order-based approach to streamline billing logic:

### Benefits

- **Better Billing Organization**: Group related sessions under a single order
- **Improved Customer Experience**: Track customer visits more effectively
- **Flexible Session Management**: Add sessions to existing orders or create new ones
- **Simplified Reporting**: Generate reports by orders rather than individual sessions

### Order Lifecycle

1. **Creation**: Orders are created when a new session is started for a token
2. **Active**: Sessions can be added to active orders
3. **Completed**: Orders are marked as completed when bills are paid
4. **Cancelled**: Orders can be cancelled if needed

## Pricing Logic

Different device types have different pricing strategies:

- **Time-based pricing**: Most devices charge by time (hourly rate)
- **Player-based pricing**: Frame and Pool games charge ₹50 per player
- **Hybrid pricing**: Some devices charge differently based on both time and player count

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request

## Devices Supported

| Device | Counters | Players Allowed |
|--------|----------|----------------|
| PS5 | 5 | 1-4 |
| PS4 | 1 | 1-2 |
| VR | 1 | 1 |
| VR Racing | 1 | 1 |
| Pool | 1 | 1 |
| Frame | 1 | 1 |
| Racing | 2 | 1 |

> **Note**: Pool and Frame share the same physical device, so only one can be active at a time.

## Tech Stack

- **Frontend**: Next.js, React, TailwindCSS
- **Backend**: tRPC, Prisma
- **Database**: SQLite (can be replaced with PostgreSQL, MySQL, etc.)
- **Authentication**: Simple admin token auth

## License

This project is licensed under the MIT License.

## Learn More

To learn more about the [T3 Stack](https://create.t3.gg/), take a look at the following resources:

- [Documentation](https://create.t3.gg/)
- [Learn the T3 Stack](https://create.t3.gg/en/faq#what-learning-resources-are-currently-available) — Check out these awesome tutorials

You can check out the [create-t3-app GitHub repository](https://github.com/t3-oss/create-t3-app) — your feedback and contributions are welcome!

## How do I deploy this?

Follow our deployment guides for [Vercel](https://create.t3.gg/en/deployment/vercel), [Netlify](https://create.t3.gg/en/deployment/netlify) and [Docker](https://create.t3.gg/en/deployment/docker) for more information.



