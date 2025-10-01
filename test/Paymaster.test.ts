// test-flashblocks-performance.ts
import { sendTransactionWithRetry, waitForPaymasterTransactionReceipt } from '../frontend/lib/paymaster';

interface TimingMetrics {
  transactionSend: number;
  receiptWait: number;
  total: number;
}

async function measureTransactionTiming(
  request: any
): Promise<TimingMetrics> {
  const startTotal = Date.now();
  
  // Measure transaction send time
  const startSend = Date.now();
  const receipt = await sendTransactionWithRetry(request);
  const sendDuration = Date.now() - startSend;
  
  // Measure receipt wait time (already included in sendTransactionWithRetry)
  // But we'll measure the final confirmation
  const startWait = Date.now();
  await waitForPaymasterTransactionReceipt(receipt);
  const waitDuration = Date.now() - startWait;
  
  const totalDuration = Date.now() - startTotal;
  
  return {
    transactionSend: sendDuration,
    receiptWait: waitDuration,
    total: totalDuration
  };
}

async function runPerformanceTest() {
  console.log('🚀 Starting Flashblocks Performance Test\n');
  
  // Test cases for both endpoints
  const testCases = [
    {
      name: 'Commit Game Actions',
      request: {
        address: process.env.CONTRACT_ADDRESS as `0x${string}`,
        functionName: 'commitGameActions',
        args: [
          /* your test args here */
        ]
      }
    },
    {
      name: 'Calculate New Game State',
      request: {
        address: process.env.CONTRACT_ADDRESS as `0x${string}`,
        functionName: 'calculateNewGameState',
        args: [
          /* your test args here */
        ]
      }
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📊 Testing: ${testCase.name}`);
    console.log('─'.repeat(50));
    
    try {
      const metrics = await measureTransactionTiming(testCase.request);
      
      console.log(`✅ Transaction Send: ${metrics.transactionSend}ms`);
      console.log(`✅ Receipt Wait: ${metrics.receiptWait}ms`);
      console.log(`✅ Total Time: ${metrics.total}ms`);
      
      // Performance targets (flashblocks should be <1s for each)
      if (metrics.transactionSend > 1000) {
        console.log(`⚠️  Transaction send is slower than target (>1s)`);
      }
      if (metrics.receiptWait > 1000) {
        console.log(`⚠️  Receipt wait is slower than target (>1s)`);
      }
      if (metrics.total < 2000) {
        console.log(`🎉 Total time meets flashblocks target (<2s)`);
      }
      
    } catch (error) {
      console.error(`❌ Test failed:`, error);
    }
  }
  
  console.log('\n✨ Performance test completed\n');
}

// Run the test
runPerformanceTest().catch(console.error);