# Enhanced Team Event Simulation Script

This script automatically fetches real team data from your smart contract and simulates `TeamCreated` events to populate your database via the event-router.

## What It Does

The enhanced script now:

1. **Automatically Fetches Team Data**: Reads real team information directly from your smart contract
2. **Dynamic Team Selection**: Accepts team IDs as command line parameters
3. **Real-time Validation**: Ensures teams exist before creating events
4. **Smart Contract Integration**: Uses Viem to interact with your deployed contract
5. **Database Population**: Sends properly formatted events to your event-router

## Prerequisites

1. **Supabase Edge Function Running**: Your `event-router` function must be deployed and running
2. **Smart Contract Deployed**: Contract must be accessible on Base network
3. **Node.js**: Version 18+ (for fetch API and ES modules support)
4. **Viem**: For smart contract interaction

## Setup

### 1. Update Configuration

**IMPORTANT**: Update these values in `simulate-teams.js`:

```javascript
const CONTRACT_ADDRESS = "0xYOUR_ACTUAL_CONTRACT_ADDRESS_HERE";
const RPC_URL = "https://your-rpc-endpoint.com"; // Base RPC URL
```

### 2. Install Dependencies

```bash
yarn add -D viem
```

### 3. Get Your Contract Address

Find your deployed contract address from your deployment files or blockchain explorer.

## Usage

### Basic Usage

```bash
# Simulate teams 1, 2, 3 with default local URL
node scripts/simulate-teams.js 1 2 3

# Simulate single team
node scripts/simulate-teams.js 5

# Simulate multiple teams
node scripts/simulate-teams.js 1 2 3 4 5
```

### Custom Event Router URL

```bash
# Simulate teams with custom event-router URL
node scripts/simulate-teams.js 1 2 3 "https://your-project.supabase.co/functions/v1/event-router"

# For production Supabase
node scripts/simulate-teams.js 1 2 3 "https://your-project.supabase.co/functions/v1/event-router"
```

### Examples

```bash
# Local development
node scripts/simulate-teams.js 1 2 3

# Production with specific teams
node scripts/simulate-teams.js 1 5 10 "https://your-project.supabase.co/functions/v1/event-router"

# Single team test
node scripts/simulate-teams.js 7
```

## How It Works

1. **Parameter Parsing**: Accepts team IDs and optional event-router URL
2. **Smart Contract Query**: Fetches real team data using Viem
3. **Data Validation**: Ensures teams exist and data is valid
4. **Event Creation**: Generates properly formatted blockchain events
5. **HTTP Requests**: Sends events to your event-router function
6. **Summary Report**: Shows success/failure for each team

## Expected Output

```
🚀 Enhanced Team Event Simulation Script

Usage:
  node scripts/simulate-teams.js [teamIds...] [eventRouterUrl]

Examples:
  # Simulate teams 1, 2, 3 with default local URL
  node scripts/simulate-teams.js 1 2 3

  # Simulate team 5 with custom event-router URL
  node scripts/simulate-teams.js 5 "https://your-project.supabase.co/functions/v1/event-router"

🚀 Simulating TeamCreated events for 3 teams
📡 Sending to: http://localhost:54321/functions/v1/event-router
🔗 Contract: 0xYourContractAddress
🌐 RPC: https://your-rpc-endpoint.com

🔍 Fetching team 1 from smart contract...
✅ Team 1 found: Real Team Name
📤 Sending TeamCreated event for team 0x0000000000000000000000000000000000000000000000000000000000000001
✅ Success: {"success":true}

🔍 Fetching team 2 from smart contract...
✅ Team 2 found: Another Team Name
📤 Sending TeamCreated event for team 0x0000000000000000000000000000000000000000000000000000000000000002
✅ Success: {"success":true}

📊 Summary:
✅ Successful: 2 teams
   Teams: 1, 2
🎉 Events sent successfully!
```

## Configuration Options

### RPC Endpoints

- **Base Mainnet**: `https://mainnet.base.org`
- **Base Sepolia**: `https://sepolia.base.org`
- **Alchemy**: `https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY`
- **Infura**: `https://base-mainnet.infura.io/v3/YOUR_API_KEY`

### Contract Addresses

- **Mainnet**: Your deployed contract on Base mainnet
- **Testnet**: Your deployed contract on Base Sepolia

## Troubleshooting

### Common Issues

1. **Contract Not Found**: Verify contract address and RPC URL
2. **Teams Don't Exist**: Check if teams with those IDs exist on contract
3. **RPC Connection**: Ensure RPC endpoint is accessible
4. **Event Router**: Verify your Supabase function is running

### Debug Mode

The script provides detailed logging for each step:
- Contract queries
- Data validation
- Event creation
- HTTP requests
- Success/failure summary

### Error Handling

- **Invalid Team IDs**: Script validates and filters input
- **Contract Errors**: Graceful handling of contract call failures
- **Network Issues**: Retry logic for RPC calls
- **HTTP Errors**: Detailed error reporting for event-router

## Next Steps

After successfully running the script:

1. **Verify Database**: Check your Supabase `teams` table for new entries
2. **Test Frontend**: Your frontend should now show real team counts
3. **Monitor Logs**: Watch your event-router function logs
4. **Scale Up**: Use for other event types (games, etc.)

## Security Note

This script is for development/testing purposes. In production:
- Validate event authenticity
- Use secure RPC endpoints
- Implement rate limiting
- Monitor for abuse

## Advanced Usage

### Batch Processing

```bash
# Process many teams at once
node scripts/simulate-teams.js {1..20}

# Process specific ranges
node scripts/simulate-teams.js 1 2 3 10 11 12 15 20
```

### Integration with CI/CD

```bash
# In your deployment pipeline
node scripts/simulate-teams.js 1 2 3 "https://prod-project.supabase.co/functions/v1/event-router"
```

### Monitoring and Logging

The script provides comprehensive logging for monitoring and debugging production deployments.
