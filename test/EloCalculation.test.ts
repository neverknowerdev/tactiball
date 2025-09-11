import { expect } from "chai";
import { ethers } from "hardhat";
import { upgrades } from "hardhat";

describe("ELO Rating System", function () {
    let game: any;
    let owner: any;
    let team1Owner: any;
    let team2Owner: any;

    beforeEach(async function () {
        [owner, team1Owner, team2Owner] = await ethers.getSigners();

        // Deploy GameLib library first
        const gameLib = await ethers.deployContract("GameLib");
        await gameLib.waitForDeployment();

        // Deploy the main contract using the upgradeable pattern
        const ChessBallGame = await ethers.getContractFactory("ChessBallGame", {
            libraries: {
                GameLib: await gameLib.getAddress(),
            },
        });

        game = await upgrades.deployProxy(ChessBallGame, [
            owner.address, // gelatoAddress - using owner for testing
            owner.address,  // relayerAddress - using owner for testing
            owner.address,  // gameEngineAddress - using owner for testing
            "test-public-key" // publicKey - using test key for testing
        ], {
            kind: 'uups',
            initializer: 'initialize',
            unsafeAllowLinkedLibraries: true
        });
        await game.waitForDeployment();
    });

    describe("Team Creation", function () {
        it("Should create team with default ELO rating of 10000", async function () {
            await game.connect(team1Owner).createTeam(
                "Team Alpha",
                1 // USA country ID
            );

            const teamId = await game.getTeamIdByWallet(team1Owner.address);
            const team = await game.getTeam(teamId);

            expect(team.eloRating).to.equal(10000);
        });
    });

    describe("Game Creation", function () {
        beforeEach(async function () {
            // Create two teams
            await game.connect(team1Owner).createTeam("Team Alpha", 1); // USA
            await game.connect(team2Owner).createTeam("Team Beta", 2); // Canada

            const team1Id = await game.getTeamIdByWallet(team1Owner.address);
            const team2Id = await game.getTeamIdByWallet(team2Owner.address);

            // Create game request
            await game.connect(team1Owner).createGameRequest(team1Id, team2Id);
            const gameRequestId = await game.getTeam(team1Id).then((t: any) => t.gameRequestId);

            // Start game with ephemeral public key
            const ephemeralPublicKey = "0x02" + "1234567890123456789012345678901234567890123456789012345678901234";
            await game.connect(team2Owner).startGame(gameRequestId, ephemeralPublicKey);
        });

        it("Should store ELO ratings at game start", async function () {
            const gameId = 1; // First game
            const gameData = await game.getGame(gameId);

            expect(gameData.team1.eloRating).to.equal(10000);
            expect(gameData.team2.eloRating).to.equal(10000);
        });
    });

    describe("ELO Rating Updates", function () {
        it("Should calculate new ELO ratings for 0:0 draw between equal teams (10000 vs 10000)", async function () {
            // Create teams with equal ELO ratings (10000 each, representing 100.00)
            await game.connect(team1Owner).createTeam("Team Alpha", 1); // USA
            await game.connect(team2Owner).createTeam("Team Beta", 2); // Canada

            const team1Id = await game.getTeamIdByWallet(team1Owner.address);
            const team2Id = await game.getTeamIdByWallet(team2Owner.address);

            // Verify initial ratings
            let team1 = await game.getTeam(team1Id);
            let team2 = await game.getTeam(team2Id);
            expect(team1.eloRating).to.equal(10000);
            expect(team2.eloRating).to.equal(10000);

            // Create and start game
            await game.connect(team1Owner).createGameRequest(team1Id, team2Id);
            const gameRequestId = await game.getTeam(team1Id).then((t: any) => t.gameRequestId);
            const ephemeralPublicKey = "0x02" + "1234567890123456789012345678901234567890123456789012345678901234";
            await game.connect(team2Owner).startGame(gameRequestId, ephemeralPublicKey);

            const gameId = 1; // First game
            let gameData = await game.getGame(gameId);

            // Verify game stores initial ELO ratings
            expect(gameData.team1.eloRating).to.equal(10000);
            expect(gameData.team2.eloRating).to.equal(10000);

            // Simulate game progression to reach MAX_MOVES (45) with 0:0 score
            // We need to simulate moves to reach the maximum moves limit
            for (let move = 1; move <= 45; move++) {
                // Commit moves for both teams (simulating via relayer since we're testing)
                await game.connect(owner).commitGameActionsRelayer(team1Owner.address, gameId, 1, 1); // TEAM1, dummy moves
                await game.connect(owner).commitGameActionsRelayer(team2Owner.address, gameId, 2, 1); // TEAM2, dummy moves

                // Update game state with no goals (maintaining 0:0 score)
                const boardState = {
                    team1PlayerPositions: [
                        { x: 1, y: 5 }, { x: 4, y: 2 }, { x: 4, y: 8 },
                        { x: 6, y: 3 }, { x: 6, y: 7 }, { x: 5, y: 5 }
                    ],
                    team2PlayerPositions: [
                        { x: 15, y: 5 }, { x: 12, y: 2 }, { x: 12, y: 8 },
                        { x: 10, y: 2 }, { x: 10, y: 8 }, { x: 10, y: 5 }
                    ],
                    ballPosition: { x: 5, y: 5 },
                    ballOwner: 1 // TEAM1
                };

                await game.connect(owner).newGameState(
                    gameId,
                    1, // StateType.MOVE (no goal)
                    [], // clashRandomNumbers
                    [], // team1Actions
                    [], // team2Actions
                    boardState
                );
            }

            // The game should have finished automatically after 45 moves
            // Let's check the game status
            gameData = await game.getGame(gameId);
            console.log(`Game status after 45 moves: ${gameData.status}`);
            console.log(`Moves made: ${gameData.gameState.movesMade}`);

            // If the game hasn't finished yet, we need to trigger one more state update
            if (gameData.status === 1) {
                console.log("Game not finished yet, triggering one more state update...");
                await game.connect(owner).commitGameActionsRelayer(team1Owner.address, gameId, 1, 1); // TEAM1, dummy moves
                await game.connect(owner).commitGameActionsRelayer(team2Owner.address, gameId, 2, 1); // TEAM2, dummy moves
                await game.connect(owner).newGameState(
                    gameId,
                    1, // StateType.MOVE (no goal)
                    [], // clashRandomNumbers
                    [], // team1Actions
                    [], // team2Actions
                    { x: 5, y: 5 }, // ballPosition
                    1 // ballOwner (TEAM1)
                );
                gameData = await game.getGame(gameId);
                console.log(`Game status after additional move: ${gameData.status}`);
                console.log(`Moves made: ${gameData.gameState.movesMade}`);
            }

            // Verify game is finished
            gameData = await game.getGame(gameId);
            expect(gameData.status).to.equal(2); // GameStatus.FINISHED
            expect(gameData.gameState.team1score).to.equal(0);
            expect(gameData.gameState.team2score).to.equal(0);
            expect(gameData.gameState.movesMade).to.equal(45);

            // Check final ELO ratings
            team1 = await game.getTeam(team1Id);
            team2 = await game.getTeam(team2Id);

            console.log(`Team 1 final ELO: ${team1.eloRating}`);
            console.log(`Team 2 final ELO: ${team2.eloRating}`);

            // Check the game data to see the new ELO ratings
            gameData = await game.getGame(gameId);
            console.log(`Game Team 1 ELO (new): ${gameData.team1.eloRatingNew}`);
            console.log(`Game Team 2 ELO (new): ${gameData.team2.eloRatingNew}`);

            // For a 0:0 draw between equal teams (10000 vs 10000):
            // Expected score for both teams should be 0.5
            // Actual result for both teams should be 0.5 (draw)
            // Rating change = K * (actual - expected) = 20 * (0.5 - 0.5) = 0 points

            // For a proper ELO system, a draw between equal teams should result in no rating change
            expect(team1.eloRating).to.equal(10000);
            expect(team2.eloRating).to.equal(10000);

            // The difference should be 0 (no change)
            const ratingDifference = team1.eloRating - team2.eloRating;
            expect(ratingDifference).to.equal(0);
        });

        it("Should calculate new ELO ratings for team win scenario", async function () {
            // Create teams with equal ELO ratings (10000 each, representing 100.00)
            await game.connect(team1Owner).createTeam("Team Alpha", 1); // USA
            await game.connect(team2Owner).createTeam("Team Beta", 2); // Canada

            const team1Id = await game.getTeamIdByWallet(team1Owner.address);
            const team2Id = await game.getTeamIdByWallet(team2Owner.address);

            // Verify initial ratings
            let team1 = await game.getTeam(team1Id);
            let team2 = await game.getTeam(team2Id);
            expect(team1.eloRating).to.equal(10000);
            expect(team2.eloRating).to.equal(10000);

            // Create and start game
            await game.connect(team1Owner).createGameRequest(team1Id, team2Id);
            const gameRequestId = await game.getTeam(team1Id).then((t: any) => t.gameRequestId);
            const ephemeralPublicKey = "0x02" + "1234567890123456789012345678901234567890123456789012345678901234";
            await game.connect(team2Owner).startGame(gameRequestId, ephemeralPublicKey);

            const gameId = 1; // First game (fresh start)
            let gameData = await game.getGame(gameId);

            // Verify game stores initial ELO ratings
            expect(gameData.team1.eloRating).to.equal(10000);
            expect(gameData.team2.eloRating).to.equal(10000);

            // Simulate game progression with team1 scoring a goal
            // First, make some moves to set up the game
            for (let move = 1; move <= 10; move++) {
                await game.connect(owner).commitGameActionsRelayer(team1Owner.address, gameId, 1, 1); // TEAM1, dummy moves
                await game.connect(owner).commitGameActionsRelayer(team2Owner.address, gameId, 2, 1); // TEAM2, dummy moves

                const boardState = {
                    team1PlayerPositions: [
                        { x: 1, y: 5 }, { x: 4, y: 2 }, { x: 4, y: 8 },
                        { x: 6, y: 3 }, { x: 6, y: 7 }, { x: 5, y: 5 }
                    ],
                    team2PlayerPositions: [
                        { x: 15, y: 5 }, { x: 12, y: 2 }, { x: 12, y: 8 },
                        { x: 10, y: 2 }, { x: 10, y: 8 }, { x: 10, y: 5 }
                    ],
                    ballPosition: { x: 5, y: 5 },
                    ballOwner: 1 // TEAM1
                };

                await game.connect(owner).newGameState(
                    gameId,
                    1, // StateType.MOVE (no goal)
                    [], // clashRandomNumbers
                    [], // team1Actions
                    [], // team2Actions
                    boardState
                );
            }

            // Now simulate team1 scoring a goal
            await game.connect(owner).commitGameActionsRelayer(team1Owner.address, gameId, 1, 1); // TEAM1, dummy moves
            await game.connect(owner).commitGameActionsRelayer(team2Owner.address, gameId, 2, 1); // TEAM2, dummy moves

            const goalBoardState = {
                team1PlayerPositions: [
                    { x: 1, y: 5 }, { x: 4, y: 2 }, { x: 4, y: 8 },
                    { x: 6, y: 3 }, { x: 6, y: 7 }, { x: 5, y: 5 }
                ],
                team2PlayerPositions: [
                    { x: 15, y: 5 }, { x: 12, y: 2 }, { x: 12, y: 8 },
                    { x: 10, y: 2 }, { x: 10, y: 8 }, { x: 10, y: 5 }
                ],
                ballPosition: { x: 5, y: 5 },
                ballOwner: 1 // TEAM1
            };

            await game.connect(owner).newGameState(
                gameId,
                2, // StateType.GOAL_TEAM1
                [], // clashRandomNumbers
                [], // team1Actions
                [], // team2Actions
                goalBoardState
            );

            // Continue the game to reach MAX_MOVES
            for (let move = 12; move <= 45; move++) {
                await game.connect(owner).commitGameActionsRelayer(team1Owner.address, gameId, 1, 1); // TEAM1, dummy moves
                await game.connect(owner).commitGameActionsRelayer(team2Owner.address, gameId, 2, 1); // TEAM2, dummy moves

                const finalBoardState = {
                    team1PlayerPositions: [
                        { x: 1, y: 5 }, { x: 4, y: 2 }, { x: 4, y: 8 },
                        { x: 6, y: 3 }, { x: 6, y: 7 }, { x: 5, y: 5 }
                    ],
                    team2PlayerPositions: [
                        { x: 15, y: 5 }, { x: 12, y: 2 }, { x: 12, y: 8 },
                        { x: 10, y: 2 }, { x: 10, y: 8 }, { x: 10, y: 5 }
                    ],
                    ballPosition: { x: 5, y: 5 },
                    ballOwner: 1 // TEAM1
                };

                await game.connect(owner).newGameState(
                    gameId,
                    1, // StateType.MOVE (no goal)
                    [], // clashRandomNumbers
                    [], // team1Actions
                    [], // team2Actions
                    finalBoardState
                );
            }

            // Verify game is finished
            gameData = await game.getGame(gameId);
            expect(gameData.status).to.equal(2); // GameStatus.FINISHED
            expect(gameData.gameState.team1score).to.equal(1);
            expect(gameData.gameState.team2score).to.equal(0);
            expect(gameData.gameState.movesMade).to.equal(45);

            // Check final ELO ratings
            team1 = await game.getTeam(team1Id);
            team2 = await game.getTeam(team2Id);

            console.log(`Team 1 final ELO (win): ${team1.eloRating}`);
            console.log(`Team 2 final ELO (loss): ${team2.eloRating}`);

            // For a 1:0 win by team1 against equal teams (10000 vs 10000):
            // Expected score for team1 should be 0.5, actual result is 1.0
            // Rating change = K * (actual - expected) = 20 * (1.0 - 0.5) = 10 points
            // Team1 should gain ~10 points, team2 should lose ~10 points
            // With 2 decimal precision: 10 points = 1000 (representing 10.00)

            expect(team1.eloRating).to.be.greaterThan(10000);
            expect(team2.eloRating).to.be.lessThan(10000);

            console.log(`Team 1 final ELO (win): ${team1.eloRating}`);
            console.log(`Team 2 final ELO (loss): ${team2.eloRating}`);

            // The difference should be approximately 2000 points total (1000 gained + 1000 lost)
            // This represents 20.00 ELO points difference
            const ratingDifference = team1.eloRating - team2.eloRating;
            expect(ratingDifference).to.be.closeTo(2000, 200); // Allow for small rounding differences
        });




    });
});
