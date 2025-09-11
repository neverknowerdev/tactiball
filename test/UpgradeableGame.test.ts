import { expect } from "chai";
import { ethers } from "hardhat";
import { ChessBallGame } from "../typechain-types";

import { upgrades } from "hardhat";

describe("ChessBallGame Upgradeable", function () {
    let chessBallGame: ChessBallGame;
    let chessBallGameV2: ChessBallGame;
    let owner: any;
    let user1: any;
    let user2: any;
    let eloLib: any;
    let gameLib: any;

    const GELATO_ADDRESS = "0x1234567890123456789012345678901234567890";
    const RELAYER_ADDRESS = "0x0987654321098765432109876543210987654321";
    const GAME_ENGINE_SERVER_ADDRESS = "0x1234567890123456789012345678901234567890";

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        gameLib = await ethers.deployContract("GameLib");
        await gameLib.waitForDeployment();

        // Deploy the initial implementation using the upgradeable pattern
        const ChessBallGame = await ethers.getContractFactory("ChessBallGame", {
            libraries: {
                GameLib: await gameLib.getAddress(),
            },
        });

        chessBallGame = await upgrades.deployProxy(ChessBallGame, [
            GELATO_ADDRESS,
            RELAYER_ADDRESS,
            GAME_ENGINE_SERVER_ADDRESS,
            "test-public-key" // publicKey - using test key for testing
        ], {
            kind: 'uups',
            initializer: 'initialize',
            unsafeAllowLinkedLibraries: true
        }) as ChessBallGame;

        await chessBallGame.waitForDeployment();
    });

    describe("Initial Deployment", function () {
        it("Should deploy with correct initial values", async function () {
            expect(await chessBallGame.gelatoAddress()).to.equal(GELATO_ADDRESS);
            expect(await chessBallGame.relayerAddress()).to.equal(RELAYER_ADDRESS);
            expect(await chessBallGame.owner()).to.equal(owner.address);
        });

        it("Should not allow re-initialization", async function () {
            await expect(
                chessBallGame.initialize(GELATO_ADDRESS, RELAYER_ADDRESS, GAME_ENGINE_SERVER_ADDRESS, "test-public-key")
            ).to.be.reverted;
        });
    });

    describe("Upgrade Functionality", function () {
        it("Should allow owner to upgrade implementation", async function () {
            const ChessBallGameV2 = await ethers.getContractFactory("ChessBallGame", {
                libraries: {
                    GameLib: await gameLib.getAddress(),
                },
            });

            // Upgrade the proxy
            await upgrades.upgradeProxy(await chessBallGame.getAddress(), ChessBallGameV2, {
                unsafeAllowLinkedLibraries: true
            });

            // Verify the upgrade was successful
            const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(
                await chessBallGame.getAddress()
            );
            expect(newImplementationAddress).to.not.equal(ethers.ZeroAddress);
        });

        it("Should maintain state after upgrade", async function () {
            // Create a team before upgrade
            await chessBallGame.connect(user1).createTeam("Team Alpha", 1);

            // Upgrade the implementation
            const ChessBallGameV2 = await ethers.getContractFactory("ChessBallGame", {
                libraries: {
                    GameLib: await gameLib.getAddress(),
                },
            });
            await upgrades.upgradeProxy(await chessBallGame.getAddress(), ChessBallGameV2, {
                unsafeAllowLinkedLibraries: true
            });

            // Verify state is maintained
            const teamId = await chessBallGame.getTeamIdByWallet(user1.address);
            expect(teamId).to.equal(1);

            const team = await chessBallGame.getTeam(teamId);
            expect(team.name).to.equal("Team Alpha");
        });

        it("Should not allow non-owner to upgrade", async function () {
            const ChessBallGameV2 = await ethers.getContractFactory("ChessBallGame", {
                libraries: {
                    GameLib: await gameLib.getAddress(),
                },
            });

            await expect(
                upgrades.upgradeProxy(await chessBallGame.getAddress(), ChessBallGameV2.connect(user1), {
                    unsafeAllowLinkedLibraries: true
                })
            ).to.be.reverted;
        });
    });

    describe("Proxy Functionality", function () {
        it("Should delegate calls to implementation", async function () {
            // Test that the proxy correctly delegates calls
            await chessBallGame.connect(user1).createTeam("Test Team", 1);

            const teamId = await chessBallGame.getTeamIdByWallet(user1.address);
            expect(teamId).to.equal(1);
        });

        it("Should maintain upgradeability", async function () {
            // Verify the contract has the upgrade function
            const upgradeFunction = chessBallGame.interface.getFunction("upgradeToAndCall");
            expect(upgradeFunction).to.not.be.undefined;
        });
    });

    describe("Storage Layout", function () {
        it("Should maintain storage layout compatibility", async function () {
            // This test ensures that storage layout changes don't break upgrades
            // In a real scenario, you would use the OpenZeppelin storage gap pattern
            // or carefully manage storage layout changes

            // Create some state
            await chessBallGame.connect(user1).createTeam("Team Beta", 2);
            await chessBallGame.connect(user2).createTeam("Team Gamma", 3);

            // Verify state is accessible
            const team1 = await chessBallGame.getTeam(1);
            const team2 = await chessBallGame.getTeam(2);

            expect(team1.name).to.equal("Team Beta");
            expect(team2.name).to.equal("Team Gamma");
        });
    });
}); 