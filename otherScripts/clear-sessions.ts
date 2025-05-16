// Script to clear all session entries from the database
const { PrismaClient } = require('@prisma/client');
const readline = require('readline');
const prisma = new PrismaClient();

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promise-based question function
function askQuestion(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function clearSessions(): Promise<void> {
  try {
    console.log('\n🧹 Database Cleaning Utility');
    console.log('=======================\n');
    
    // Clear bills
    const shouldClearBills = await askQuestion('Do you want to clear all bills? (y/n): ');
    if (shouldClearBills) {
      const deletedBills = await prisma.bill.deleteMany({});
      console.log(`✅ ${deletedBills.count} bills deleted`);
    } else {
      console.log('⏭️ Skipping bills deletion');
    }
    
    // Clear sessions
    const shouldClearSessions = await askQuestion('\nDo you want to clear all sessions? (y/n): ');
    if (shouldClearSessions) {
      const deletedSessions = await prisma.session.deleteMany({});
      console.log(`✅ ${deletedSessions.count} sessions deleted`);
    } else {
      console.log('⏭️ Skipping sessions deletion');
    }
    
    // Clear orders
    const shouldClearOrders = await askQuestion('\nDo you want to clear all orders? (y/n): ');
    if (shouldClearOrders) {
      const deletedOrders = await prisma.order.deleteMany({});
      console.log(`✅ ${deletedOrders.count} orders deleted`);
    } else {
      console.log('⏭️ Skipping orders deletion');
    }
    
    // Clear tokens
    const shouldClearTokens = await askQuestion('\nDo you want to clear all tokens? (y/n): ');
    if (shouldClearTokens) {
      const deletedTokens = await prisma.token.deleteMany({});
      console.log(`✅ ${deletedTokens.count} tokens deleted`);
    } else {
      console.log('⏭️ Skipping tokens deletion');
    }

    // Clear customers
    const shouldClearCustomers = await askQuestion('\nDo you want to clear all customers? (y/n): ');
    if (shouldClearCustomers) {
      const deletedCustomers = await prisma.customer.deleteMany({});
      console.log(`✅ ${deletedCustomers.count} customers deleted`);
    } else {
      console.log('⏭️ Skipping customers deletion');
    }

    // Clear food orders (future implementation)
    const shouldClearFoodOrders = await askQuestion('\nDo you want to clear all food orders? (y/n): ');
    if (shouldClearFoodOrders) {
      // Note: These tables will be added in the future when food orders are implemented
      console.log('ℹ️ Food order tables not implemented yet');
    } else {
      console.log('⏭️ Skipping food orders deletion');
    }
    
    console.log('\n🎮 Database cleaning completed!');
    console.log('You can now start with a fresh set of gaming sessions and food orders.');
  } catch (error) {
    console.error('❌ Error clearing data:', error);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

// Run the function
clearSessions(); 