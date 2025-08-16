import { expect } from "chai";
import { ethers } from "hardhat";
import { upgrades } from "hardhat";

describe("Game Contract - Team Management", function () {
    let game: any;
    let owner: any;
    let team1Owner: any;
    let team2Owner: any;

    beforeEach(async function () {
        [owner, team1Owner, team2Owner] = await ethers.getSigners();

        // Deploy libraries first
        const eloLib = await ethers.deployContract("EloCalculationLib");
        await eloLib.waitForDeployment();

        const gameLib = await ethers.deployContract("GameLib", {
            libraries: {
                EloCalculationLib: await eloLib.getAddress(),
            },
        });
        await gameLib.waitForDeployment();

        // Deploy the main contract using the upgradeable pattern
        const ChessBallGame = await ethers.getContractFactory("ChessBallGame", {
            libraries: {
                EloCalculationLib: await eloLib.getAddress(),
                GameLib: await gameLib.getAddress(),
            },
        });

        game = await upgrades.deployProxy(ChessBallGame, [
            owner.address, // gelatoAddress - using owner for testing
            owner.address  // relayerAddress - using owner for testing
        ], {
            kind: 'uups',
            initializer: 'initialize',
            unsafeAllowLinkedLibraries: true
        });
        await game.waitForDeployment();
    });

    describe("createTeam Function", function () {
        it("Should create a team successfully with valid parameters", async function () {
            const teamName = "Test Team Alpha";
            const countryId = 1; // USA

            await game.connect(team1Owner).createTeam(
                teamName,
                countryId
            );

            // Verify team was created
            const teamId = await game.getTeamIdByWallet(team1Owner.address);
            expect(teamId).to.be.greaterThan(0);

            // Get team details
            const team = await game.getTeam(teamId);

            // Validate team properties
            expect(team.id).to.equal(teamId);
            expect(team.wallet).to.equal(team1Owner.address);
            expect(team.name).to.equal(teamName);
            expect(team.country).to.equal(countryId);
            expect(team.eloRating).to.equal(100); // Default ELO rating
            expect(team.registeredAt).to.be.greaterThan(0);
            expect(team.hasActiveGame).to.equal(false);
            expect(team.gameRequestId).to.equal(0);
            expect(team.games).to.be.an('array').that.is.empty;
        });

        it("Should create multiple teams with different owners", async function () {
            const team1Name = "Team Alpha";
            const team2Name = "Team Beta";
            const countryId1 = 1; // USA
            const countryId2 = 2; // Canada

            // Create first team
            await game.connect(team1Owner).createTeam(
                team1Name,
                countryId1
            );

            // Create second team
            await game.connect(team2Owner).createTeam(
                team2Name,
                countryId2
            );

            // Verify both teams were created
            const team1Id = await game.getTeamIdByWallet(team1Owner.address);
            const team2Id = await game.getTeamIdByWallet(team2Owner.address);

            expect(team1Id).to.be.greaterThan(0);
            expect(team2Id).to.be.greaterThan(0);
            expect(team1Id).to.not.equal(team2Id);

            // Verify team details
            const team1 = await game.getTeam(team1Id);
            const team2 = await game.getTeam(team2Id);

            expect(team1.name).to.equal(team1Name);
            expect(team1.country).to.equal(countryId1);
            expect(team2.name).to.equal(team2Name);
            expect(team2.country).to.equal(countryId2);
        });

        it("Should increment team ID for each new team", async function () {
            // Create first team
            await game.connect(team1Owner).createTeam(
                "Team Alpha",
                1
            );

            // Create second team
            await game.connect(team2Owner).createTeam(
                "Team Beta",
                2
            );

            const team1Id = await game.getTeamIdByWallet(team1Owner.address);
            const team2Id = await game.getTeamIdByWallet(team2Owner.address);

            expect(team2Id).to.equal(team1Id + 1n);
        });

        it("Should set correct wallet address for team owner", async function () {
            await game.connect(team1Owner).createTeam(
                "Test Team",
                1
            );

            const teamId = await game.getTeamIdByWallet(team1Owner.address);
            const team = await game.getTeam(teamId);

            expect(team.wallet).to.equal(team1Owner.address);
        });

        it("Should set correct country ID", async function () {
            const countryId = 5; // Some country ID
            await game.connect(team1Owner).createTeam(
                "Test Team",
                countryId
            );

            const teamId = await game.getTeamIdByWallet(team1Owner.address);
            const team = await game.getTeam(teamId);

            expect(team.country).to.equal(countryId);
        });

        it("Should set default ELO rating of 100", async function () {
            await game.connect(team1Owner).createTeam(
                "Test Team",
                1
            );

            const teamId = await game.getTeamIdByWallet(team1Owner.address);
            const team = await game.getTeam(teamId);

            expect(team.eloRating).to.equal(100);
        });

        it("Should set registration timestamp", async function () {
            const beforeCreation = Math.floor(Date.now() / 1000);

            await game.connect(team1Owner).createTeam(
                "Test Team",
                1
            );

            const teamId = await game.getTeamIdByWallet(team1Owner.address);
            const team = await game.getTeam(teamId);

            expect(team.registeredAt).to.be.greaterThanOrEqual(beforeCreation);
        });

        it("Should initialize team statistics to zero", async function () {
            await game.connect(team1Owner).createTeam(
                "Test Team",
                1
            );

            const teamId = await game.getTeamIdByWallet(team1Owner.address);
            const team = await game.getTeam(teamId);

            expect(team.statistic.wins).to.equal(0);
            expect(team.statistic.losses).to.equal(0);
            expect(team.statistic.draws).to.equal(0);
            expect(team.statistic.totalGames).to.equal(0);
            expect(team.statistic.totalGoalsScored).to.equal(0);
            expect(team.statistic.totalGoalsConceded).to.equal(0);
            expect(team.statistic.biggestWinGoalsScored).to.equal(0);
            expect(team.statistic.biggestWinGoalsConceded).to.equal(0);
            expect(team.statistic.biggestLossGoalsScored).to.equal(0);
            expect(team.statistic.biggestLossGoalsConceded).to.equal(0);
        });

        it("Should initialize games array as empty", async function () {
            await game.connect(team1Owner).createTeam(
                "Test Team",
                1
            );

            const teamId = await game.getTeamIdByWallet(team1Owner.address);
            const team = await game.getTeam(teamId);

            expect(team.games).to.be.an('array').that.is.empty;
        });

        it("Should set hasActiveGame to false initially", async function () {
            await game.connect(team1Owner).createTeam(
                "Test Team",
                1
            );

            const teamId = await game.getTeamIdByWallet(team1Owner.address);
            const team = await game.getTeam(teamId);

            expect(team.hasActiveGame).to.equal(false);
        });

        it("Should set gameRequestId to 0 initially", async function () {
            await game.connect(team1Owner).createTeam(
                "Test Team",
                1
            );

            const teamId = await game.getTeamIdByWallet(team1Owner.address);
            const team = await game.getTeam(teamId);

            expect(team.gameRequestId).to.equal(0);
        });
    });

    describe("createTeam Validation", function () {
        it("Should reject team creation with empty name", async function () {
            await expect(
                game.connect(team1Owner).createTeam(
                    "", // Empty name
                    1
                )
            ).to.be.rejectedWith("Name is required");
        });

        it("Should reject team creation with zero country ID", async function () {
            await expect(
                game.connect(team1Owner).createTeam(
                    "Test Team",
                    0 // Zero country ID
                )
            ).to.be.rejectedWith("Country is required");
        });

        it("Should reject team creation for wallet that already has a team", async function () {
            // Create first team
            await game.connect(team1Owner).createTeam(
                "Team Alpha",
                1
            );

            // Try to create another team with the same wallet
            await expect(
                game.connect(team1Owner).createTeam(
                    "Team Beta",
                    2
                )
            ).to.be.rejectedWith("Team already exists");
        });
    });

    describe("Team Retrieval", function () {
        it("Should return correct team by wallet address", async function () {
            const teamName = "Test Team";
            const countryId = 1;

            await game.connect(team1Owner).createTeam(
                teamName,
                countryId
            );

            const teamId = await game.getTeamIdByWallet(team1Owner.address);
            const team = await game.getTeam(teamId);

            expect(team.wallet).to.equal(team1Owner.address);
            expect(team.name).to.equal(teamName);
            expect(team.country).to.equal(countryId);
        });

        it("Should return zero for non-existent team wallet", async function () {
            const teamId = await game.getTeamIdByWallet(team1Owner.address);
            expect(teamId).to.equal(0);
        });
    });
});
