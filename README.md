# ChessBall

A strategic soccer game that combines football and chess mechanics.

## Project Structure

The project is organized into two main parts:

- **`/frontend`** - Next.js React application
- **`/contracts`** - Solidity smart contracts
- **`/web3-functions`** - Gelato Web3 Functions for automation
- **`/test`** - Smart contract tests

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm package manager
- Hardhat for smart contract development

### Installation

1. Install root dependencies:
```bash
npm install
```

2. Install frontend dependencies:
```bash
npm run frontend:install
```

### Running the Project

#### Frontend Development
```bash
npm run dev
```
This will start the Next.js development server on http://localhost:3001

#### Smart Contract Development
```bash
# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Deploy contracts
npx hardhat run scripts/deploy.ts --network <network>
```

## Available Scripts

- `npm run dev` - Start frontend development server
- `npm run build` - Build frontend for production
- `npm run start` - Start frontend production server
- `npm run lint` - Run frontend linting
- `npm run frontend:install` - Install frontend dependencies

## Frontend Structure

```
frontend/
├── src/
│   ├── app/          # Next.js app router pages
│   └── lib/          # Utility functions and game logic
├── public/            # Static assets
├── package.json       # Frontend dependencies
└── tsconfig.json      # TypeScript configuration
```

## Smart Contract Structure

```
contracts/
├── Game.sol           # Main game contract
├── GameLib.sol        # Game logic library
└── EloCalculationLib.sol # ELO rating calculations
```

## Technologies Used

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Smart Contracts**: Solidity, Hardhat
- **Automation**: Gelato Web3 Functions
- **Testing**: Mocha, Chai, Hardhat testing framework
