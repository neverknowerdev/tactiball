import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "@gelatonetwork/web3-functions-sdk/hardhat-plugin";

const config = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1  // Minimal runs for maximum size reduction
      },
      viaIR: true,
      outputSelection: {
        "*": {
          "*": ["storageLayout"],
        },
      },
    }
  },
  w3f: {
    rootDir: "./web3-functions",
    debug: false,
    networks: ["hardhat", "baseSepolia"],
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
      //     mnemonic: "gm1 gm2 gm3 gm4 gm5 gm6 gm7 gm8 gm9 gm10 gm11 gm12"
      // }
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "",
      accounts: process.env.BASE_SEPOLIA_PRIVATE_KEY ? [process.env.BASE_SEPOLIA_PRIVATE_KEY] : [],
      chainId: 84532,
    },
  },
};
export default config;

