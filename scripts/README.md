# ChessBall Deployment Scripts

This directory contains the deployment and management scripts for the ChessBall smart contracts.

## 📁 Scripts Overview

### `deploy.ts` - Initial Deployment
Deploys all contracts (libraries, implementation, and proxy) for the first time.

**Features:**
- Deploys `EloCalculationLib` first
- Deploys `GameLib` with `EloCalculationLib` linked
- Deploys `ChessBallGame` implementation with both libraries linked
- Deploys UUPS proxy contract
- Calculates and stores source code hashes for future comparisons
- **NEW**: Saves deployments per network separately in `deployment.json`

**Usage:**
```bash
yarn hardhat run scripts/deploy.ts --network baseSepolia
```

### `upgrade-contract.ts` - Smart Contract Upgrades
Upgrades the main proxy contract with intelligent library handling.

**Features:**
- **Smart Library Detection**: Compares source code hashes to detect actual changes
- **Efficient Updates**: Only deploys new libraries when source code genuinely changes
- **Force Update Option**: Use `FORCE_LIBRARY_UPDATE=true` to force library redeployment
- **Network-Aware**: Works with the new network-based deployment structure
- **Upgrade History**: Tracks previous implementations and libraries

**Usage:**
```bash
# Normal upgrade (libraries only if changed)
yarn hardhat run scripts/upgrade-contract.ts --network baseSepolia

# Force library update
FORCE_LIBRARY_UPDATE=true yarn hardhat run scripts/upgrade-contract.ts --network baseSepolia
```

### `verify.ts` - Contract Verification
Verifies contracts both on-chain and on Basescan.

**Features:**
- On-chain verification (contract accessibility, state checks)
- Basescan source code verification
- Library linking support
- **Network-Aware**: Automatically detects current network

**Usage:**
```bash
yarn hardhat run scripts/verify.ts --network baseSepolia
```

## 🌐 Network-Based Deployment Structure

The deployment system now saves deployments per network separately in a single `deployment.json` file:

```json
{
  "baseSepolia": {
    "network": "baseSepolia",
    "chainId": "84532",
    "proxyAddress": "0x...",
    "implementationAddress": "0x...",
    "libraries": {
      "eloCalculationLib": "0x...",
      "gameLib": "0x..."
    },
    "deployer": "0x...",
    "gasPrice": "1500088",
    "timestamp": "2025-08-17T09:10:51.354Z",
    "eloCalculationLibHash": "0cfad71c...",
    "gameLibHash": "c6b4b2d3...",
    "upgradeTimestamp": "2025-08-17T09:11:46.092Z",
    "previousImplementation": "0x...",
    "previousLibraries": { ... },
    "librariesUpdated": false
  }
}
```

**Benefits:**
- ✅ Multiple networks in one file
- ✅ No overwriting between networks
- ✅ Easy to manage deployments across testnets/mainnets
- ✅ Automatic network detection

## 🔧 Environment Setup

Create a `.env` file with:

```bash
# RPC URLs
BASE_SEPOLIA_RPC_URL=your_base_sepolia_rpc_url
BASE_MAINNET_RPC_URL=your_base_mainnet_rpc_url

# API Keys
BASESCAN_API_KEY=your_basescan_api_key_here

# Optional: Force library updates during upgrades
FORCE_LIBRARY_UPDATE=false
```

## 🚀 Deployment Workflow

1. **Initial Deployment:**
   ```bash
   yarn hardhat run scripts/deploy.ts --network baseSepolia
   ```

2. **Verify Deployment:**
   ```bash
   yarn hardhat run scripts/verify.ts --network baseSepolia
   ```

3. **Upgrade Contracts (when needed):**
   ```bash
   yarn hardhat run scripts/upgrade-contract.ts --network baseSepolia
   ```

4. **Verify Upgrade:**
   ```bash
   yarn hardhat run scripts/verify.ts --network baseSepolia
   ```

## 💡 Smart Library Handling

The upgrade system automatically detects when libraries need updating:

- **Source Code Comparison**: Uses SHA256 hashes of normalized source code
- **Efficient**: Only deploys new libraries when source code changes
- **Transparent**: Clear reporting of what changed and why
- **Flexible**: Force update option when needed

## 🔍 Verification Status

All contracts are automatically verified on Basescan:
- ✅ `EloCalculationLib` - Library for ELO calculations
- ✅ `GameLib` - Game logic library (depends on EloCalculationLib)
- ✅ `ChessBallGame` - Main implementation contract
- ✅ Proxy contract (automatically handled by OpenZeppelin)

## 📊 Gas Optimization

- **Smart Library Reuse**: Libraries only redeploy when source code changes
- **Gas Price Adjustment**: Automatic gas price adjustment for Base Sepolia
- **Transaction Delays**: Built-in delays to prevent replacement transaction errors
