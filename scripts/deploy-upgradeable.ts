import { ethers, upgrades } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // Deploy the implementation contract
    const ChessBallGame = await ethers.getContractFactory("ChessBallGame");

    // Deploy using UUPS proxy pattern
    const chessBallGame = await upgrades.deployProxy(ChessBallGame, [
        "0x1234567890123456789012345678901234567890", // Replace with actual Gelato address
        "0x0987654321098765432109876543210987654321"  // Replace with actual Relayer address
    ], {
        kind: 'uups',
        initializer: 'initialize'
    });

    await chessBallGame.waitForDeployment();

    const implementationAddress = await upgrades.erc1967.getImplementationAddress(await chessBallGame.getAddress());
    const proxyAddress = await chessBallGame.getAddress();

    console.log("ChessBallGame deployed to:", proxyAddress);
    console.log("Implementation deployed to:", implementationAddress);
    console.log("Proxy deployed to:", proxyAddress);

    // Verify the deployment
    const gelatoAddress = await chessBallGame.gelatoAddress();
    const relayerAddress = await chessBallGame.relayerAddress();
    const owner = await chessBallGame.owner();

    console.log("Gelato address:", gelatoAddress);
    console.log("Relayer address:", relayerAddress);
    console.log("Owner:", owner);
}

async function upgrade() {
    const [deployer] = await ethers.getSigners();
    console.log("Upgrading contract with the account:", deployer.address);

    // Get the proxy address (you'll need to replace this with your actual proxy address)
    const proxyAddress = "YOUR_PROXY_ADDRESS_HERE";

    // Deploy the new implementation
    const ChessBallGameV2 = await ethers.getContractFactory("ChessBallGame");

    // Upgrade the proxy to the new implementation
    const upgraded = await upgrades.upgradeProxy(proxyAddress, ChessBallGameV2);

    console.log("ChessBallGame upgraded");

    // Get the new implementation address
    const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("New implementation deployed to:", newImplementationAddress);
}

// Export functions for use in other scripts
export {
    main as deploy,
    upgrade
};

// Run deployment if this script is executed directly
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
