# Multi-Network Deployment with Same Address

This guide explains how to deploy smart contracts to multiple networks (Base Sepolia and Base Mainnet) while maintaining the same contract address across all networks.

## 🎯 Goal

Deploy the same smart contract to multiple networks using the same wallet, ensuring that the deployed contract has the **same address** on all networks.

## 🔑 Key Concepts

### 1. **Deterministic Deployment**
- Uses CREATE2 opcode for predictable contract addresses
- Address is calculated based on deployer address, salt, and contract bytecode
- Same inputs = Same address across all networks

### 2. **CREATE2 vs CREATE**
- **CREATE**: Address depends on deployer's nonce (changes with each transaction)
- **CREATE2**: Address depends on deployer address, salt, and bytecode (deterministic)

## 📁 Files Overview

- `hardhat.config.ts` - Network configuration
- `scripts/deploy-deterministic.ts` - Single network deployment with CREATE2
- `scripts/deploy-multi-network.ts` - Multi-network deployment script
- `scripts/deploy-helper.ts` - Helper functions for address prediction
- `env.example` - Environment variables template

## 🚀 Setup Instructions

### 1. Environment Configuration

Create a `.env` file based on `env.example`:

```bash
# Copy the example file
cp env.example .env

# Edit with your actual values
nano .env
```

Required environment variables:
```bash
WALLET_PRIVATE_KEY=your_private_key_here
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_MAINNET_RPC_URL=https://mainnet.base.org
```

### 2. Install Dependencies

```bash
yarn install
```

### 3. Compile Contracts

```bash
yarn hardhat compile
```

## 🎯 Deployment Methods

### Method 1: Single Network Deployment

Deploy to a specific network:

```bash
# Deploy to Base Sepolia
yarn hardhat run scripts/deploy-deterministic.ts --network baseSepolia

# Deploy to Base Mainnet
yarn hardhat run scripts/deploy-deterministic.ts --network baseMainnet
```

### Method 2: Multi-Network Deployment

Deploy to all configured networks sequentially:

```bash
yarn hardhat run scripts/deploy-multi-network.ts
```

### Method 3: Address Prediction

Predict the contract address before deployment:

```bash
yarn hardhat run scripts/deploy-helper.ts
```

## 🔍 How It Works

### 1. **Salt Generation**
```typescript
const salt = keccak256(toUtf8Bytes("ChessBallGame_v1"));
```

### 2. **Address Calculation**
```typescript
const create2Address = getCreate2Address(
    deployerAddress,
    salt,
    keccak256(bytecode + encodedArgs)
);
```

### 3. **Deterministic Deployment**
The same salt, bytecode, and deployer address will always produce the same contract address.

## 📊 Expected Results

When deploying to both networks, you should see:

```
✅ baseSepolia: 0x1234...5678
✅ baseMainnet: 0x1234...5678

🎉 All deployments have the same address!
```

## ⚠️ Important Notes

### 1. **Same Wallet Required**
- Both networks must use the **exact same private key**
- Different wallets will produce different addresses

### 2. **Salt Consistency**
- Use the **same salt** for all deployments
- Changing the salt will change the address

### 3. **Contract Bytecode**
- Contract code must be **identical** across deployments
- Any compilation differences will affect the address

### 4. **Constructor Arguments**
- Must be **exactly the same** on all networks
- Different arguments = Different addresses

## 🛠️ Troubleshooting

### Address Mismatch
If addresses don't match:

1. **Check salt consistency**: Ensure the same salt is used
2. **Verify bytecode**: Confirm contracts are compiled identically
3. **Check constructor args**: Ensure arguments are identical
4. **Verify deployer**: Same wallet must be used on all networks

### Deployment Failures
Common issues:

1. **Insufficient funds**: Ensure wallet has enough ETH/Base tokens
2. **RPC issues**: Check network connectivity and RPC URLs
3. **Gas estimation**: Verify gas limits are appropriate for each network

## 🔄 Upgrading Contracts

When upgrading contracts:

1. **Keep the same proxy address** (this is your main contract address)
2. **Implementation can change** (upgrade logic)
3. **Use the upgrade script** to maintain the same proxy address

```bash
yarn hardhat run scripts/upgrade-contract.ts --network baseSepolia
```

## 📚 Additional Resources

- [OpenZeppelin Upgrades Documentation](https://docs.openzeppelin.com/upgrades-plugins/1.x/)
- [CREATE2 Opcode Explanation](https://eips.ethereum.org/EIPS/eip-1014)
- [Hardhat Network Configuration](https://hardhat.org/config/)

## 🎉 Success Criteria

Your deployment is successful when:

1. ✅ Contract deploys to Base Sepolia
2. ✅ Contract deploys to Base Mainnet  
3. ✅ Both deployments have the **same address**
4. ✅ Same wallet used for both deployments
5. ✅ Contract functions work correctly on both networks

## 🚨 Security Considerations

- **Never commit private keys** to version control
- **Use environment variables** for sensitive data
- **Verify contract addresses** before interacting
- **Test thoroughly** on testnets before mainnet deployment

