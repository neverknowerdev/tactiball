import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { ChessBallGame } from '../typechain-types';
import { getGameFromContract, GameInfo } from '../frontend/lib/contract';
import {
    generateAndSaveKeyPair,
    getPublicKey,
    generateEphemeralKeyPair,
    deriveSharedKey,
    encryptUint256
} from '../frontend/lib/encrypting';
import {
    serializeMoves,
    MoveType,
    TeamEnum
} from '../frontend/lib/game';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('getGameFromContract Function', function () {
    let game: ChessBallGame;
    let relayer: HardhatEthersSigner;
    let team1Owner: HardhatEthersSigner;
    let team2Owner: HardhatEthersSigner;
    let ecPublicKey: string;
    let ephemeral: { privateKey: string; publicKey: string };
    let symmetricKey: Buffer;

    before(async function () {
        // Generate and save key pair for encryption
        generateAndSaveKeyPair();
        ecPublicKey = getPublicKey();

        // Generate ephemeral key pair for this test
        ephemeral = generateEphemeralKeyPair();
        symmetricKey = deriveSharedKey(ephemeral.privateKey, ecPublicKey);

        [relayer, team1Owner, team2Owner] = await ethers.getSigners();

        // Deploy GameLib as a contract for linking purposes
        const GameLibFactory = await ethers.getContractFactory('GameLib');
        const gameLib = await GameLibFactory.deploy();
        await gameLib.waitForDeployment();
        const gameLibAddress = await gameLib.getAddress();

        const ChessBallGame = await ethers.getContractFactory('ChessBallGame', {
            libraries: {
                GameLib: gameLibAddress
            }
        });
        game = await upgrades.deployProxy(ChessBallGame, [relayer.address, relayer.address, relayer.address, ecPublicKey], {
            kind: 'uups',
            initializer: 'initialize',
            unsafeAllowLinkedLibraries: true
        }) as ChessBallGame;
        await game.waitForDeployment();
    });

    it('should fetch complete game data from contract after creating and playing a game', async function () {
        // Step 1: Create teams
        await game.connect(team1Owner).createTeam('Team Alpha', 1);
        await game.connect(team2Owner).createTeam('Team Beta', 2);

        const team1Id = await game.getTeamIdByWallet(team1Owner.address);
        const team2Id = await game.getTeamIdByWallet(team2Owner.address);

        expect(team1Id).to.be.greaterThan(0);
        expect(team2Id).to.be.greaterThan(0);

        // Step 2: Create game request
        await game.connect(team1Owner).createGameRequest(team1Id, team2Id);
        const gameRequestId = await game.getTeam(team1Id).then((t: any) => t.gameRequestId);

        // Step 3: Start game with ephemeral public key
        const ephemeralPublicKeyBytes = Buffer.from(ephemeral.publicKey.slice(2), 'hex');
        await game.connect(team2Owner).startGame(gameRequestId, ephemeralPublicKeyBytes);

        const gameId = await game.nextGameId();
        expect(gameId).to.equal(1);

        // Step 4: Create some sample moves and encrypt them
        const sampleMoves = [
            {
                playerId: 1,
                teamEnum: TeamEnum.TEAM1,
                moveType: MoveType.PASS,
                oldPosition: { x: 5, y: 7 },
                newPosition: { x: 7, y: 9 },
                playerKey: () => '1_1'
            },
            {
                playerId: 2,
                teamEnum: TeamEnum.TEAM1,
                moveType: MoveType.RUN,
                oldPosition: { x: 3, y: 4 },
                newPosition: { x: 5, y: 6 },
                playerKey: () => '1_2'
            }
        ];

        // Serialize and encrypt the moves
        const serializedMoves = serializeMoves(sampleMoves);
        const encryptedMoves = encryptUint256(serializedMoves, symmetricKey, 0);
        const encryptedMovesBigInt = ethers.getBigInt(`0x${encryptedMoves.toString('hex').slice(0, 64)}`);

        // Step 5: Commit moves for both teams
        await game.connect(relayer).commitGameActionsRelayer(team1Owner.address, gameId, 1, encryptedMovesBigInt);
        await game.connect(relayer).commitGameActionsRelayer(team2Owner.address, gameId, 2, encryptedMovesBigInt);

        // Step 6: Update game state (simplified call)
        const boardState = {
            team1PlayerPositions: [
                { x: 1, y: 5 }, { x: 4, y: 2 }, { x: 4, y: 8 },
                { x: 6, y: 3 }, { x: 6, y: 7 }, { x: 8, y: 5 }
            ],
            team2PlayerPositions: [
                { x: 15, y: 5 }, { x: 12, y: 2 }, { x: 12, y: 8 },
                { x: 10, y: 2 }, { x: 10, y: 8 }, { x: 10, y: 5 }
            ],
            ballPosition: { x: 8, y: 5 },
            ballOwner: 1 // TEAM1
        };

        await game.connect(relayer).newGameState(
            gameId,
            1, // StateType.MOVE
            [], // clashRandomNumbers
            [], // team1Actions
            [], // team2Actions
            boardState
        );

        // Step 7: Fetch game data directly from contract
        const gameData = await game.getGame(gameId);


        // Verify all GameInfo fields are populated
        expect(gameData.gameId).to.equal(Number(gameId));
        expect(gameData.createdAt).to.be.a('bigint');
        expect(Number(gameData.createdAt)).to.be.greaterThan(0);
        expect(gameData.status).to.be.a('bigint');
        expect(gameData.winner).to.be.a('bigint');
        expect(gameData.historyIPFS).to.be.a('string');
        expect(gameData.isVerified).to.be.a('boolean');
        expect(gameData.ephemeralPublicKey).to.be.a('string');
        expect(gameData.gameEngineVersion).to.be.a('bigint');

        // Verify GameState fields (it's an array with 7 elements)
        expect(gameData.gameState).to.be.an('array');
        expect(gameData.gameState).to.have.lengthOf(7);
        expect(gameData.gameState[0]).to.be.a('bigint'); // movesMade
        expect(gameData.gameState[1]).to.be.a('bigint'); // lastMoveAt
        expect(gameData.gameState[2]).to.be.a('bigint'); // team1MovesEncrypted
        expect(gameData.gameState[3]).to.be.a('bigint'); // team2MovesEncrypted
        expect(gameData.gameState[4]).to.be.a('bigint'); // lastMoveTeam
        expect(gameData.gameState[5]).to.be.a('bigint'); // team1score
        expect(gameData.gameState[6]).to.be.a('bigint'); // team2score

        // Verify TeamInfo fields for both teams (they are arrays with 5 elements each)
        expect(gameData.team1).to.be.an('array');
        expect(gameData.team1).to.have.lengthOf(5);
        expect(gameData.team1[0]).to.be.a('bigint'); // teamId
        expect(gameData.team1[1]).to.be.a('bigint'); // eloRating
        expect(gameData.team1[2]).to.be.a('bigint'); // eloRatingNew
        expect(gameData.team1[3]).to.be.a('bigint'); // formation
        expect(gameData.team1[4]).to.be.an('array'); // lastGamesResult (array of 5 elements)

        expect(gameData.team2).to.be.an('array');
        expect(gameData.team2).to.have.lengthOf(5);
        expect(gameData.team2[0]).to.be.a('bigint'); // teamId
        expect(gameData.team2[1]).to.be.a('bigint'); // eloRating
        expect(gameData.team2[2]).to.be.a('bigint'); // eloRatingNew
        expect(gameData.team2[3]).to.be.a('bigint'); // formation
        expect(gameData.team2[4]).to.be.an('array'); // lastGamesResult (array of 5 elements)

        // Verify specific values
        expect(gameData.gameId).to.equal(1);
        expect(gameData.team1[0]).to.equal(BigInt(team1Id)); // teamId
        expect(gameData.team2[0]).to.equal(BigInt(team2Id)); // teamId
        expect(gameData.team1[1]).to.equal(10000n); // Default ELO rating
        expect(gameData.team2[1]).to.equal(10000n); // Default ELO rating
        expect(gameData.gameState[0]).to.equal(1n); // movesMade - 1 move processed by game engine
        expect(gameData.gameState[5]).to.equal(0n); // team1score (0 initially)
        expect(gameData.gameState[6]).to.equal(0n); // team2score (0 initially)
        expect(gameData.status).to.equal(1n); // ACTIVE status
        expect(gameData.winner).to.equal(0n); // NONE winner
        expect(gameData.isVerified).to.be.false;
        expect(gameData.gameEngineVersion).to.equal(1n);

        console.log('✅ All game data fields are correctly populated');
        console.log('Game ID:', gameData.gameId);
        console.log('Created At:', new Date(Number(gameData.createdAt) * 1000));
        console.log('Team 1 ELO:', Number(gameData.team1[1]));
        console.log('Team 2 ELO:', Number(gameData.team2[1]));
        console.log('Status:', Number(gameData.status));
        console.log('Moves Made:', Number(gameData.gameState[0]));
        console.log('Team 1 Score:', Number(gameData.gameState[5]));
        console.log('Team 2 Score:', Number(gameData.gameState[6]));
        console.log('Ephemeral Public Key:', gameData.ephemeralPublicKey);
    });

    it('should handle non-existent game ID gracefully', async function () {
        const nonExistentGameId = 999999;

        try {
            await game.getGame(nonExistentGameId);
            expect.fail('Expected getGame to throw an error for non-existent game');
        } catch (error: any) {
            expect(error.message).to.include('DoesNotExist');
        }
    });

    it('should handle invalid game ID format', async function () {
        // This test is not applicable for direct contract calls since TypeScript will catch type errors
        // But we can test with a very large number that might cause issues
        const veryLargeGameId = Number.MAX_SAFE_INTEGER;

        try {
            await game.getGame(veryLargeGameId);
            expect.fail('Expected getGame to throw an error for very large game ID');
        } catch (error: any) {
            expect(error.message).to.include('DoesNotExist');
        }
    });

    it('should fetch game data with updated state after multiple moves', async function () {
        // Use the existing game from the first test
        const gameId = 1; // We know this is the first game created

        // Make multiple moves and update game state
        for (let i = 0; i < 3; i++) {
            const sampleMoves = [
                {
                    playerId: 1,
                    teamEnum: TeamEnum.TEAM1,
                    moveType: MoveType.PASS,
                    oldPosition: { x: 5 + i, y: 7 },
                    newPosition: { x: 7 + i, y: 9 },
                    playerKey: () => '1_1'
                }
            ];

            const serializedMoves = serializeMoves(sampleMoves);
            const encryptedMoves = encryptUint256(serializedMoves, symmetricKey, i);
            const encryptedMovesBigInt = ethers.getBigInt(`0x${encryptedMoves.toString('hex').slice(0, 64)}`);

            await game.connect(relayer).commitGameActionsRelayer(team1Owner.address, gameId, 1, encryptedMovesBigInt);
            await game.connect(relayer).commitGameActionsRelayer(team2Owner.address, gameId, 2, encryptedMovesBigInt);

            const boardState = {
                team1PlayerPositions: [
                    { x: 1, y: 5 }, { x: 4, y: 2 }, { x: 4, y: 8 },
                    { x: 6, y: 3 }, { x: 6, y: 7 }, { x: 8 + i, y: 5 }
                ],
                team2PlayerPositions: [
                    { x: 15, y: 5 }, { x: 12, y: 2 }, { x: 12, y: 8 },
                    { x: 10, y: 2 }, { x: 10, y: 8 }, { x: 10, y: 5 }
                ],
                ballPosition: { x: 8 + i, y: 5 },
                ballOwner: 1 // TEAM1
            };

            await game.connect(relayer).newGameState(
                gameId,
                1, // StateType.MOVE
                [], // clashRandomNumbers
                [], // team1Actions
                [], // team2Actions
                boardState
            );
        }

        // Fetch and verify updated game data
        const gameData = await game.getGame(gameId);
        expect(gameData.gameId).to.equal(Number(gameId));
        expect(gameData.gameState[0]).to.be.greaterThan(0n); // movesMade - Moves were made
        expect(gameData.team1[1]).to.be.greaterThan(0n);
        expect(gameData.team2[1]).to.be.greaterThan(0n);

        console.log('✅ Game data with multiple moves fetched successfully');
        console.log('Final moves made:', gameData.gameState[0]);
        console.log('Team 1 ELO after moves:', gameData.team1[1]);
        console.log('Team 2 ELO after moves:', gameData.team2[1]);
    });
});
