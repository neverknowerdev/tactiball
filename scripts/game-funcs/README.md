# Game Functions Scripts

This directory contains scripts for interacting with the deployed ChessBallGame contract.

## Prerequisites

1. Make sure you have a `.env` file in the root directory with:
   ```
   WALLET_PRIVATE_KEY=your_private_key_here
   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
   ```

2. Ensure the contract is deployed and `deployment.json` exists in the root directory.

## Scripts

### createTeam.ts

Creates a new team in the ChessBallGame contract.

**Usage:**
```bash
# Using default values (team name: "My Team", country: 1)
yarn hardhat run scripts/game-funcs/createTeam.ts

# With custom team name
yarn hardhat run scripts/game-funcs/createTeam.ts "Awesome Team"

# With custom team name and country code
yarn hardhat run scripts/game-funcs/createTeam.ts "Awesome Team" 5
```

**Parameters:**
- `teamName` (optional): The name of the team (default: "My Team")
- `country` (optional): The country code from 1-255 (default: 1)

**Features:**
- Automatically reads the deployed contract address from `deployment.json`
- Uses the private key from environment variables
- Adjusts gas price for Base Sepolia network
- Provides detailed transaction information and confirmation
- Displays the created team details after successful creation

**Example Output:**
```
Creating team on baseSepolia (Chain ID: 84532)
Contract address: 0x517Dfc882bC29c4405d27C997c4Ac5dF95aB2009
Using wallet: 0xf831c2F992866D01A2d66dB807adD7EEE8980914

Creating team with name: "Awesome Team" and country: 5
Current gas price: 1500000000
Using adjusted gas price: 2250000000
Transaction hash: 0x...
Waiting for transaction confirmation...
Transaction confirmed in block 12345678

✅ Team created successfully!
Team ID: 1
Team Name: Awesome Team
Country: 5
Owner: 0xf831c2F992866D01A2d66dB807adD7EEE8980914

🎉 Script completed successfully!
```

## Adding New Scripts

When adding new game function scripts:

1. Follow the same pattern as `createTeam.ts`
2. Use environment variables for sensitive data
3. Read contract address from `deployment.json`
4. Include proper error handling and logging
5. Add documentation to this README

## Troubleshooting

- **"WALLET_PRIVATE_KEY environment variable is required"**: Make sure your `.env` file exists and contains the private key
- **"Country code must be between 1 and 255"**: Use a valid country code in the specified range
- **Transaction failures**: Check your wallet has sufficient funds for gas fees
- **Contract not found**: Ensure the contract is deployed and `deployment.json` is up to date
