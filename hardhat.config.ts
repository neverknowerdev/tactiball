import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import "@openzeppelin/hardhat-upgrades";

const config = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,  // Minimal runs for maximum size reduction
        details: {
          yul: true
        }
      },
      viaIR: true,
      outputSelection: {
        "*": {
          "*": ["storageLayout"],
        },
      },
      // Additional size reduction options
      evmVersion: "paris",
      debug: {
        revertStrings: "strip"
      }
    }
  },
  w3f: {
    rootDir: "./web3-functions",
    debug: false,
    networks: ["hardhat"],
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 31337,
      mining: {
        auto: true,
        interval: 1000 // 1 second
      },
      // accounts: {
      //     mnemonic: "gm1 gm1 gm3 gm4 gm5 gm6 gm7 gm8 gm9 gm10 gm11 gm12"
      // }
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "",
      accounts: process.env.TESTNET_WALLET_PRIVATE_KEY ? [process.env.TESTNET_WALLET_PRIVATE_KEY] : [],
      chainId: 84532,
    },
    baseMainnet: {
      url: process.env.BASE_MAINNET_RPC_URL || "",
      accounts: process.env.WALLET_PRIVATE_KEY ? [process.env.WALLET_PRIVATE_KEY] : [],
      chainId: 8453,
    },
    worldchain: {
      url: process.env.WORLDCHAIN_RPC_URL || "",
      accounts: process.env.WALLET_PRIVATE_KEY ? [process.env.WALLET_PRIVATE_KEY] : [],
      chainId: 480,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      },
      {
        network: "baseMainnet",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org"
        }
      },
      {
        network: "worldchain",
        chainId: 480,
        urls: {
          apiURL: "https://worldscan.org/api",
          browserURL: "https://worldscan.org"
        }
      }
    ]
  }
};
export default config;

