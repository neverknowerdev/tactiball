import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("Smart Contract Game Engine Integration", function () {
    it("should simulate 45 moves with smart contract and detect GameFinished event", async function () {
        // ========================================
        // DEPLOY SMART CONTRACT
        // ========================================
        console.log('🚀 Starting smart contract integration test...');

        // Deploy GameLib library first
        const GameLibFactory = await ethers.getContractFactory('GameLib');
        const gameLib = await GameLibFactory.deploy();
        await gameLib.waitForDeployment();
        const gameLibAddress = await gameLib.getAddress();
        console.log('✅ GameLib deployed to:', gameLibAddress);

        // Deploy ChessBallGame with GameLib
        const ChessBallGameFactory = await ethers.getContractFactory("ChessBallGame", {
            libraries: {
                GameLib: gameLibAddress
            }
        });

        const [deployer, team1Owner, team2Owner] = await ethers.getSigners();
        const RELAYER_ADDRESS = deployer.address;
        const GAME_ENGINE_ADDRESS = deployer.address;
        const PUBLIC_KEY = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

        const chessBallGame = await upgrades.deployProxy(
            ChessBallGameFactory,
            [
                RELAYER_ADDRESS,
                RELAYER_ADDRESS,
                GAME_ENGINE_ADDRESS,
                PUBLIC_KEY
            ],
            {
                initializer: "initialize",
                unsafeAllowLinkedLibraries: true // Allow linked libraries for testing
            }
        );
        await chessBallGame.waitForDeployment();
        console.log('✅ ChessBallGame deployed to:', await chessBallGame.getAddress());

        // ========================================
        // CREATE TEAMS AND GAME
        // ========================================
        await chessBallGame.connect(team1Owner).createTeam('Team Alpha', 1);
        await chessBallGame.connect(team2Owner).createTeam('Team Beta', 2);

        const team1Id = await chessBallGame.getTeamIdByWallet(team1Owner.address);
        const team2Id = await chessBallGame.getTeamIdByWallet(team2Owner.address);

        // Create game request
        await chessBallGame.connect(team1Owner).createGameRequest(team1Id, team2Id);
        const gameRequestId = await chessBallGame.getTeam(team1Id).then((t: any) => t.gameRequestId);

        // Start game
        const ephemeralPublicKeyBytes = Buffer.from("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", 'hex');
        await chessBallGame.connect(team2Owner).startGame(gameRequestId, ephemeralPublicKeyBytes);

        const gameId = await chessBallGame.nextGameId();
        console.log('✅ Game created with ID:', gameId);

        // Track game events from transaction receipts
        let gameFinishedEventDetected = false;
        let gameFinishedEventData: any = null;

        // Function to check transaction receipt for GameFinished event
        const checkTransactionReceipt = (receipt: any) => {
            const gameFinishedEvent = receipt?.logs?.find((log: any) => {
                try {
                    const parsed = chessBallGame.interface.parseLog(log);
                    return parsed?.name === 'GameFinished';
                } catch {
                    return false;
                }
            });

            if (gameFinishedEvent) {
                const parsed = chessBallGame.interface.parseLog(gameFinishedEvent);
                gameFinishedEventDetected = true;
                gameFinishedEventData = {
                    gameId: parsed.args.gameId,
                    winner: parsed.args.winner,
                    finishReason: parsed.args.finishReason
                };
                console.log(`🎯 GameFinished event detected in transaction receipt:`, gameFinishedEventData);
                return true; // Event found, should exit loop
            }
            return false; // No event found, continue loop
        };

        // ========================================
        // SIMULATE 45 MOVES WITH SMART CONTRACT
        // ========================================
        console.log('🎮 Starting 45-move simulation with smart contract...');

        for (let moveNumber = 1; moveNumber <= 45; moveNumber++) {
            // Commit dummy moves for both teams
            const dummyMoves1 = ethers.keccak256(ethers.toUtf8Bytes(`team1_move_${moveNumber}`));
            const dummyMoves2 = ethers.keccak256(ethers.toUtf8Bytes(`team2_move_${moveNumber}`));

            await chessBallGame.connect(deployer).commitGameActionsRelayer(team1Owner.address, gameId, 1, dummyMoves1);
            await chessBallGame.connect(deployer).commitGameActionsRelayer(team2Owner.address, gameId, 2, dummyMoves2);

            // Determine if this should be a goal (Team 1 scores on move 20)
            const isGoal = moveNumber === 20;
            const stateType = isGoal ? 2 : 1; // 2 = GOAL_TEAM1, 1 = MOVE
            const ballPosition = isGoal ? { x: 8, y: 5 } : { x: 5, y: 5 }; // Ball near goal for scoring

            // Call newGameState and get transaction receipt
            const boardState = {
                team1PlayerPositions: [
                    { x: 1, y: 5 }, { x: 4, y: 2 }, { x: 4, y: 8 },
                    { x: 6, y: 3 }, { x: 6, y: 7 }, { x: 8, y: 5 }
                ],
                team2PlayerPositions: [
                    { x: 15, y: 5 }, { x: 12, y: 2 }, { x: 12, y: 8 },
                    { x: 10, y: 2 }, { x: 10, y: 8 }, { x: 10, y: 5 }
                ],
                ballPosition: ballPosition,
                ballOwner: 1 // TEAM1
            };

            const newGameStateTx = await chessBallGame.connect(deployer).newGameState(
                gameId,
                stateType, // StateType.MOVE or GOAL_TEAM1
                [], // clashRandomNumbers
                [], // team1Actions
                [], // team2Actions
                boardState
            );

            const receipt = await newGameStateTx.wait();

            if (isGoal) {
                console.log(`🎯 Move ${moveNumber}: GOAL! Team 1 scored!`);
            } else {
                console.log(`Move ${moveNumber}: Transaction receipt received`);
            }

            // Check transaction receipt for GameFinished event
            if (checkTransactionReceipt(receipt)) {
                console.log(`Move ${moveNumber}: MAX_MOVES (45) reached - GameFinished event detected!`);
                break; // Exit the loop since GameFinished event was detected
            }

            // Log progress every 5 moves
            if (moveNumber % 5 === 0) {
                const gameData = await chessBallGame.getGame(gameId);
                console.log(`Move ${moveNumber}: Game status = ${gameData.status}, Moves made = ${gameData.gameState.movesMade}, Score = ${gameData.gameState.team1score}-${gameData.gameState.team2score}`);
            }
        }

        // ========================================
        // VERIFY GAME COMPLETION
        // ========================================

        // Verify that GameFinished event was detected
        expect(gameFinishedEventDetected).to.be.true;
        expect(gameFinishedEventData).to.not.be.null;
        expect(gameFinishedEventData.gameId).to.be.equal(gameId);
        expect(gameFinishedEventData.winner).to.be.equal(1); // 1 = TEAM1 (winner)
        expect(gameFinishedEventData.finishReason).to.be.equal(0); // 0 = MAX_MOVES_REACHED

        console.log("✅ GameFinished event was properly detected in transaction receipt");
        console.log(`✅ Event data: GameId=${gameFinishedEventData.gameId}, Winner=${gameFinishedEventData.winner}, FinishReason=${gameFinishedEventData.finishReason}`);

        // Verify final game state
        const finalGameData = await chessBallGame.getGame(gameId);
        expect(finalGameData.status).to.be.equal(2); // GameStatus.FINISHED
        expect(finalGameData.gameState.movesMade).to.be.equal(45);
        expect(finalGameData.gameState.team1score).to.be.equal(1); // Team 1 scored 1 goal
        expect(finalGameData.gameState.team2score).to.be.equal(0); // Team 2 scored 0 goals

        // ========================================
        // VERIFY ELO RATING CHANGES
        // ========================================
        console.log('\n📊 Checking ELO rating changes...');

        const team1Data = await chessBallGame.getTeam(team1Id);
        const team2Data = await chessBallGame.getTeam(team2Id);

        console.log(`Team 1 final ELO: ${team1Data.eloRating}`);
        console.log(`Team 2 final ELO: ${team2Data.eloRating}`);

        // Verify ELO ratings changed (winner should have higher ELO, loser should have lower)
        expect(team1Data.eloRating).to.be.greaterThan(10000); // Winner should gain ELO
        expect(team2Data.eloRating).to.be.lessThan(10000); // Loser should lose ELO

        console.log("✅ ELO rating verification passed");
        console.log(`✅ Team 1 (winner) gained ELO: ${Number(team1Data.eloRating) - 10000}`);
        console.log(`✅ Team 2 (loser) lost ELO: ${10000 - Number(team2Data.eloRating)}`);

        console.log("✅ Smart contract integration test completed successfully!");
        console.log("✅ GameFinished event detection from transaction receipt passed");
        console.log("✅ Game status verification passed");
        console.log("✅ 45-move simulation with smart contract completed");
    });
});
