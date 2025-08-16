# UUPS Upgradeable Pattern Implementation

This project implements the UUPS (Universal Upgradeable Proxy Standard) upgradeable pattern using OpenZeppelin libraries for the ChessBallGame contract.

## Overview

The UUPS pattern allows you to upgrade smart contracts while maintaining their state and address. This is particularly useful for:
- Fixing bugs in deployed contracts
- Adding new features
- Improving gas efficiency
- Maintaining user experience (same contract address)

## Architecture

### 1. Implementation Contract (`ChessBallGame.sol`)
- Contains the actual business logic
- Inherits from OpenZeppelin's upgradeable contracts:
  - `Initializable`: Handles initialization logic
  - `UUPSUpgradeable`: Provides upgrade functionality
  - `OwnableUpgradeable`: Manages ownership and access control
- Uses `_disableInitializers()` in constructor to prevent direct deployment
- Implements `_authorizeUpgrade()` function for access control

### 2. Proxy Contract (`ChessBallGameProxy.sol`)
- Acts as a delegate proxy
- Forwards all calls to the implementation contract
- Maintains the same address across upgrades
- Stores the implementation address

### 3. Storage Layout
- All state variables are stored in the proxy contract
- Implementation contracts must maintain storage layout compatibility
- Use storage gaps for future extensibility if needed

## Key Components

### Initialization
```solidity
function initialize(
    address _gelatoAddress,
    address _relayerAddress
) public initializer {
    // ... initialization logic
    __Ownable_init(msg.sender);
}
```

### Upgrade Authorization
```solidity
function _authorizeUpgrade(
    address newImplementation
) internal override onlyOwner {}
```

## Deployment

### Initial Deployment
```typescript
import { upgrades } from "@openzeppelin/hardhat-upgrades";

const ChessBallGame = await ethers.getContractFactory("ChessBallGame");
const chessBallGame = await upgrades.deployProxy(ChessBallGame, [
    gelatoAddress,
    relayerAddress
], {
    kind: 'uups',
    initializer: 'initialize'
});
```

### Upgrading
```typescript
const ChessBallGameV2 = await ethers.getContractFactory("ChessBallGame");
await upgrades.upgradeProxy(proxyAddress, ChessBallGameV2);
```

## Testing

Run the upgradeable tests:
```bash
yarn test test/UpgradeableGame.test.ts
```

## Best Practices

### 1. Storage Layout
- Never change the order of existing state variables
- Add new variables at the end
- Use storage gaps for future extensibility

### 2. Initialization
- Use `initializer` modifier for initialization functions
- Never call initialization functions from constructors
- Use `_disableInitializers()` in constructors

### 3. Access Control
- Implement `_authorizeUpgrade()` function
- Restrict upgrade access to authorized accounts
- Use role-based access control for complex scenarios

### 4. Testing
- Test both deployment and upgrade scenarios
- Verify state preservation after upgrades
- Test access control for upgrade functions

## Security Considerations

1. **Upgrade Access**: Only authorized accounts should be able to upgrade
2. **Storage Collisions**: Avoid storage layout conflicts
3. **Initialization**: Prevent re-initialization attacks
4. **Timelock**: Consider implementing upgrade timelocks for production

## Common Issues and Solutions

### 1. Storage Layout Incompatibility
- Use OpenZeppelin's storage gap pattern
- Test upgrades thoroughly before mainnet deployment

### 2. Initialization Failures
- Ensure proper access control in `_authorizeUpgrade()`
- Verify initialization parameters

### 3. Gas Limit Issues
- Keep upgrade functions gas-efficient
- Consider batch upgrades for complex changes

## Migration from Non-Upgradeable Contracts

If you have existing non-upgradeable contracts:

1. **Audit Current State**: Review all state variables and functions
2. **Plan Storage Layout**: Design storage structure for upgradeability
3. **Implement Proxy Pattern**: Add upgradeable inheritance
4. **Test Thoroughly**: Verify all functionality works through proxy
5. **Deploy and Migrate**: Deploy new upgradeable version and migrate users

## Resources

- [OpenZeppelin Upgradeable Contracts Documentation](https://docs.openzeppelin.com/upgrades-plugins/1.x/)
- [UUPS Pattern Explanation](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies#upgradeability)
- [Storage Layout Best Practices](https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable#modifying-your-contracts)
