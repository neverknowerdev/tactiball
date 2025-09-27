import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { ChessBallGame } from '../typechain-types';
import {
    generateECIESKeyPair,
    generateSymmetricKey,
    encodeSymmetricKey,
    decodeSymmetricKey,
    encodeData,
    decodeData,
    bigintToBuffer,
    bufferToBigint
} from '../frontend/lib/encrypting';
import { serializeMoves, MoveType, TeamEnum } from '../frontend/lib/game';

describe('Hybrid Encryption Flow', () => {
    let eciesKeyPair: { publicKey: string; privateKey: string };
    let symmetricKey: string;

    before(() => {
        eciesKeyPair = generateECIESKeyPair();
        symmetricKey = generateSymmetricKey();
    });

    it('should generate a symmetric key', () => {
        const key = generateSymmetricKey();
        expect(key).to.be.a('string');
        expect(Buffer.from(key, 'base64').length).to.equal(16); // Updated to 16 bytes for AES-128
    });

    it('should encode and decode symmetric key using ECIES', () => {
        const encodedKey = encodeSymmetricKey(symmetricKey, eciesKeyPair.publicKey);
        expect(encodedKey).to.not.be.undefined;
        expect(encodedKey).to.be.a('string');

        // Check that ECIES produces a smaller ciphertext than RSA
        const encodedKeySize = Buffer.from(encodedKey, 'base64').length;
        console.log('ECIES encoded key size:', encodedKeySize, 'bytes');
        expect(encodedKeySize).to.be.lessThan(256); // Should be much smaller than RSA's 256 bytes

        const encodedKeyBuffer = Buffer.from(encodedKey, 'base64');
        const decodedKey = decodeSymmetricKey(encodedKeyBuffer, eciesKeyPair.privateKey);
        expect(decodedKey).to.equal(symmetricKey);
    });

    it('should encode and decode data using symmetric key', () => {
        const data = BigInt('1234567890123456789012345678901234567890');
        const movesMade = 5;

        const dataBuffer = bigintToBuffer(data);
        const encodedData = encodeData(dataBuffer, movesMade, symmetricKey);
        expect(encodedData).to.not.be.undefined;
        expect(encodedData).to.be.instanceOf(Buffer);

        // Log the size of encodedData
        const encodedDataSize = encodedData.length;
        console.log('Encoded data size:', encodedDataSize, 'bytes');

        const decodedDataBuffer = decodeData(encodedData, movesMade, symmetricKey);
        const decodedData = bufferToBigint(decodedDataBuffer);
        expect(decodedData).to.equal(data);
    });

    it('should fail to decode data with incorrect nonce', () => {
        const data = BigInt('9876543210987654321098765432109876543210');
        const movesMade = 10;
        const wrongMovesMade = 11;

        const dataBuffer = bigintToBuffer(data);
        const encodedData = encodeData(dataBuffer, movesMade, symmetricKey);
        const decodedDataBuffer = decodeData(encodedData, wrongMovesMade, symmetricKey);
        const decodedData = bufferToBigint(decodedDataBuffer);
        expect(decodedData).to.not.equal(data, 'Decryption with incorrect nonce should not return the original data');
    });

    it('should handle multiple data encryption/decryption operations', () => {
        const dataSets = [
            BigInt('1111111111111111111111111111111111111111'),
            BigInt('2222222222222222222222222222222222222222'),
            BigInt('3333333333333333333333333333333333333333')
        ];
        const movesMade = 15;

        dataSets.forEach((data, index) => {
            const dataBuffer = bigintToBuffer(data);
            const encoded = encodeData(dataBuffer, movesMade + index, symmetricKey);
            const decodedBuffer = decodeData(encoded, movesMade + index, symmetricKey);
            const decoded = bufferToBigint(decodedBuffer);
            expect(decoded).to.equal(data, `Data set ${index} should decode correctly`);
        });
    });

    it('real case', () => {
        // Convert the moves string to a bigint (assuming it's a numerical representation)
        const movesData = BigInt('1100101020220010102023001010202400101020250010102026001010202');
        console.log('movesData', movesData);
        console.log('Input data length:', movesData.toString().length, 'characters');
        const movesMade = 1;

        const encodedSymmetricKey = encodeSymmetricKey(symmetricKey, eciesKeyPair.publicKey);
        console.log('symmetricKey', symmetricKey);
        console.log('encodedSymmetricKey', encodedSymmetricKey);

        const movesDataBuffer = bigintToBuffer(movesData);
        const encodedData = encodeData(movesDataBuffer, movesMade, symmetricKey);
        console.log('encodedData', encodedData);
        console.log('Encoded data size in real case:', encodedData.length, 'bytes');

        const encodedSymmetricKeyBuffer = Buffer.from(encodedSymmetricKey, 'base64');
        const decodedSymmetricKey = decodeSymmetricKey(encodedSymmetricKeyBuffer, eciesKeyPair.privateKey);
        console.log('decodedSymmetricKey', decodedSymmetricKey);

        const decodedDataBuffer = decodeData(encodedData, movesMade, decodedSymmetricKey);
        const decodedData = bufferToBigint(decodedDataBuffer);
        console.log('decodedData', decodedData);

        expect(decodedData).to.equal(movesData);
    });
});


describe('Complete Smart Contract Encryption Integration Test', () => {
    it('should deploy contract, create game, commit moves, fetch and decrypt moves', async () => {
        console.log('🚀 Starting complete encryption integration test...');

        // ========================================
        // 1. GENERATE ENCRYPTION KEYS
        // ========================================
        console.log('\n🔐 Generating encryption keys...');
        const gameEngineKeyPair = generateECIESKeyPair();
        const symmetricKey = generateSymmetricKey();
        console.log('✅ Generated game engine key pair and symmetric key');

        // ========================================
        // 2. DEPLOY SMART CONTRACT
        // ========================================
        console.log('\n📦 Deploying ChessBallGame contract...');

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

        const [deployer] = await ethers.getSigners();
        const GELATO_ADDRESS = "0x12ebb8c121b706ae6368147afc5b54702cb26637";
        const RELAYER_ADDRESS = deployer.address; // Use deployer as relayer for testing
        const GAME_ENGINE_ADDRESS = deployer.address; // Use deployer as game engine for testing
        const PUBLIC_KEY = gameEngineKeyPair.publicKey;

        const chessBallGame = await upgrades.deployProxy(ChessBallGameFactory, [
            GELATO_ADDRESS,
            RELAYER_ADDRESS,
            GAME_ENGINE_ADDRESS,
            PUBLIC_KEY
        ], {
            kind: 'uups',
            initializer: 'initialize',
            unsafeAllowLinkedLibraries: true
        }) as ChessBallGame;

        await chessBallGame.waitForDeployment();
        console.log('✅ ChessBallGame deployed to:', await chessBallGame.getAddress());

        // ========================================
        // 3. CREATE TEAMS AND GAME REQUEST
        // ========================================
        console.log('\n👥 Creating teams and game request...');
        const [team1Owner, team2Owner] = await ethers.getSigners();

        // Create Team 1
        const createTeam1Tx = await chessBallGame.connect(team1Owner).createTeam("Team Alpha", 1);
        const team1Receipt = await createTeam1Tx.wait();
        const team1Event = team1Receipt?.logs.find(log => {
            try {
                const parsed = chessBallGame.interface.parseLog(log);
                return parsed?.name === 'TeamCreated';
            } catch {
                return false;
            }
        });
        const team1Id = team1Event ? Number(chessBallGame.interface.parseLog(team1Event)!.args.teamId) : 1;
        console.log('✅ Team 1 created with ID:', team1Id);

        // Create Team 2
        const createTeam2Tx = await chessBallGame.connect(team2Owner).createTeam("Team Beta", 2);
        const team2Receipt = await createTeam2Tx.wait();
        const team2Event = team2Receipt?.logs.find(log => {
            try {
                const parsed = chessBallGame.interface.parseLog(log);
                return parsed?.name === 'TeamCreated';
            } catch {
                return false;
            }
        });
        const team2Id = team2Event ? Number(chessBallGame.interface.parseLog(team2Event)!.args.teamId) : 2;
        console.log('✅ Team 2 created with ID:', team2Id);

        // Create game request first
        const createRequestTx = await chessBallGame.connect(team1Owner).createGameRequest(team1Id, team2Id);
        const requestReceipt = await createRequestTx.wait();
        const requestEvent = requestReceipt?.logs.find(log => {
            try {
                const parsed = chessBallGame.interface.parseLog(log);
                return parsed?.name === 'GameRequestCreated';
            } catch {
                return false;
            }
        });
        const gameRequestId = requestEvent ? Number(chessBallGame.interface.parseLog(requestEvent)!.args.gameRequestId) : 1;
        console.log('✅ Game request created with ID:', gameRequestId);

        // ========================================
        // 4. START GAME WITH ENCRYPTED SYMMETRIC KEY
        // ========================================
        console.log('\n🎮 Starting game with encrypted symmetric key...');

        const gamePublicKey = await chessBallGame.gamePublicKey();
        console.log('Game public key:', gamePublicKey);

        // Generate encrypted symmetric key for the game
        const encodedSymmetricKey = encodeSymmetricKey(symmetricKey, gamePublicKey);
        console.log('📊 Encoded symmetric key size:', Buffer.from(encodedSymmetricKey, 'base64').length, 'bytes');

        // Convert base64 string to bytes for smart contract
        const encryptedKeyBytes = Buffer.from(encodedSymmetricKey, 'base64');
        console.log('📦 Encrypted key size for contract:', encryptedKeyBytes.length, 'bytes');

        // Start game with encrypted symmetric key
        const startGameTx = await chessBallGame.connect(team2Owner).startGame(gameRequestId, encryptedKeyBytes);
        const gameReceipt = await startGameTx.wait();
        const gameEvent = gameReceipt?.logs.find(log => {
            try {
                const parsed = chessBallGame.interface.parseLog(log);
                return parsed?.name === 'GameStarted';
            } catch {
                return false;
            }
        });
        const gameId = gameEvent ? Number(chessBallGame.interface.parseLog(gameEvent)!.args.gameId) : 1;
        console.log('✅ Game started with ID:', gameId);

        // ========================================
        // 5. CREATE AND ENCRYPT GAME MOVES
        // ========================================
        console.log('\n🎯 Creating and encrypting game moves...');

        // Create maximum number of moves for Team 1 (6 moves - maximum possible)
        const team1Moves = [
            {
                playerId: 1,
                moveType: MoveType.PASS,
                oldPosition: { x: 1, y: 1 },
                newPosition: { x: 2, y: 2 },
                teamEnum: TeamEnum.TEAM1,
                playerKey: () => '1',
            },
            {
                playerId: 2,
                moveType: MoveType.RUN,
                oldPosition: { x: 3, y: 3 },
                newPosition: { x: 4, y: 4 },
                teamEnum: TeamEnum.TEAM1,
                playerKey: () => '2',
            },
            {
                playerId: 3,
                moveType: MoveType.TACKLE,
                oldPosition: { x: 5, y: 5 },
                newPosition: { x: 6, y: 6 },
                teamEnum: TeamEnum.TEAM1,
                playerKey: () => '3',
            },
            {
                playerId: 4,
                moveType: MoveType.SHOT,
                oldPosition: { x: 7, y: 7 },
                newPosition: { x: 8, y: 8 },
                teamEnum: TeamEnum.TEAM1,
                playerKey: () => '4',
            },
            {
                playerId: 5,
                moveType: MoveType.PASS,
                oldPosition: { x: 9, y: 9 },
                newPosition: { x: 10, y: 10 },
                teamEnum: TeamEnum.TEAM1,
                playerKey: () => '5',
            },
            {
                playerId: 6,
                moveType: MoveType.RUN,
                oldPosition: { x: 11, y: 11 },
                newPosition: { x: 12, y: 12 },
                teamEnum: TeamEnum.TEAM1,
                playerKey: () => '6',
            }
        ];

        // Serialize moves to bigint
        const serializedMoves = serializeMoves(team1Moves);
        const movesBigInt = BigInt(serializedMoves);
        console.log('📝 Team 1 moves (serialized, 6 moves):', serializedMoves);
        console.log('📝 Team 1 moves as BigInt:', movesBigInt.toString());
        console.log('📊 Team 1 moves BigInt length:', movesBigInt.toString().length, 'digits');

        // Encrypt moves using symmetric key
        const movesMade = 1;
        const movesBuffer = bigintToBuffer(movesBigInt);
        const encodedMoves = encodeData(movesBuffer, movesMade, symmetricKey);
        console.log('🔒 Encoded moves size:', encodedMoves.length, 'bytes');

        // Convert to bytes32 for smart contract
        const movesBytes32 = '0x' + encodedMoves.toString('hex').padStart(64, '0');

        // Create maximum number of moves for Team 2 (6 moves - maximum possible)
        const team2Moves = [
            {
                playerId: 1,
                moveType: MoveType.TACKLE,
                oldPosition: { x: 1, y: 1 },
                newPosition: { x: 2, y: 2 },
                teamEnum: TeamEnum.TEAM2,
                playerKey: () => '1',
            },
            {
                playerId: 2,
                moveType: MoveType.SHOT,
                oldPosition: { x: 3, y: 3 },
                newPosition: { x: 4, y: 4 },
                teamEnum: TeamEnum.TEAM2,
                playerKey: () => '2',
            },
            {
                playerId: 3,
                moveType: MoveType.PASS,
                oldPosition: { x: 5, y: 5 },
                newPosition: { x: 6, y: 6 },
                teamEnum: TeamEnum.TEAM2,
                playerKey: () => '3',
            },
            {
                playerId: 4,
                moveType: MoveType.RUN,
                oldPosition: { x: 7, y: 7 },
                newPosition: { x: 8, y: 8 },
                teamEnum: TeamEnum.TEAM2,
                playerKey: () => '4',
            },
            {
                playerId: 5,
                moveType: MoveType.TACKLE,
                oldPosition: { x: 9, y: 9 },
                newPosition: { x: 10, y: 10 },
                teamEnum: TeamEnum.TEAM2,
                playerKey: () => '5',
            },
            {
                playerId: 6,
                moveType: MoveType.SHOT,
                oldPosition: { x: 11, y: 11 },
                newPosition: { x: 12, y: 12 },
                teamEnum: TeamEnum.TEAM2,
                playerKey: () => '6',
            }
        ];

        const serializedMoves2 = serializeMoves(team2Moves);
        const movesBigInt2 = BigInt(serializedMoves2);
        const movesBuffer2 = bigintToBuffer(movesBigInt2);
        const encodedMoves2 = encodeData(movesBuffer2, movesMade, symmetricKey);
        const movesBytes32_2 = '0x' + encodedMoves2.toString('hex').padStart(64, '0');

        console.log('📝 Team 2 moves (serialized, 6 moves):', serializedMoves2);
        console.log('📝 Team 2 moves as BigInt:', movesBigInt2.toString());
        console.log('📊 Team 2 moves BigInt length:', movesBigInt2.toString().length, 'digits');

        // ========================================
        // 6. COMMIT MOVES TO CONTRACT
        // ========================================
        console.log('\n💾 Committing moves to contract...');

        // Commit moves to contract
        const commitTx = await chessBallGame.connect(deployer).commitGameActionsRelayer(team1Owner.address, gameId, 1, movesBytes32); // 1 = TEAM1
        await commitTx.wait();
        console.log('✅ Team 1 moves committed to contract');

        const commitTx2 = await chessBallGame.connect(deployer).commitGameActionsRelayer(team2Owner.address, gameId, 2, movesBytes32_2); // 2 = TEAM2
        await commitTx2.wait();
        console.log('✅ Team 2 moves committed to contract');

        // ========================================
        // 7. FETCH GAME FROM CONTRACT
        // ========================================
        console.log('\n📥 Fetching game from contract...');

        // Fetch game from contract using getGame function
        const game = await chessBallGame.getGame(gameId);
        console.log('✅ Game fetched from contract');
        console.log('📊 Game structure length:', Object.keys(game).length, 'fields');

        // ========================================
        // 8. DECRYPT SYMMETRIC KEY
        // ========================================
        console.log('\n🔓 Decrypting symmetric key...');

        // Get encrypted symmetric key from contract storage (stored as bytes)
        const encryptedKeyHex = game.encryptedKey;
        console.log('📦 Encrypted key hex length:', encryptedKeyHex.length, 'characters');

        // Convert hex string to buffer for decryption
        const encryptedKeyBuffer = Buffer.from(encryptedKeyHex.slice(2), 'hex'); // Remove '0x' prefix
        console.log('📊 Encrypted key buffer length:', encryptedKeyBuffer.length, 'bytes');

        // Decrypt symmetric key using game engine private key
        const decryptedSymmetricKey = decodeSymmetricKey(encryptedKeyBuffer, gameEngineKeyPair.privateKey);
        expect(decryptedSymmetricKey).to.equal(symmetricKey);
        console.log('✅ Successfully decrypted symmetric key from contract');

        // ========================================
        // 9. DECRYPT AND VERIFY MOVES
        // ========================================
        console.log('\n🔓 Decrypting and verifying moves...');

        // Decrypt Team 1 moves
        const team1MovesEncrypted = game[2].team1MovesEncrypted; // gameState is at index 2
        const team1MovesBuffer = Buffer.from(team1MovesEncrypted.slice(2), 'hex');

        const decryptedTeam1MovesBuffer = decodeData(team1MovesBuffer, movesMade, decryptedSymmetricKey);
        const decryptedTeam1Moves = bufferToBigint(decryptedTeam1MovesBuffer);
        console.log('📝 Decrypted Team 1 moves:', decryptedTeam1Moves.toString());

        // Decrypt Team 2 moves
        const team2MovesEncrypted = game[2].team2MovesEncrypted; // gameState is at index 2
        const team2MovesBuffer = Buffer.from(team2MovesEncrypted.slice(2), 'hex');

        const decryptedTeam2MovesBuffer = decodeData(team2MovesBuffer, movesMade, decryptedSymmetricKey);
        const decryptedTeam2Moves = bufferToBigint(decryptedTeam2MovesBuffer);
        console.log('📝 Decrypted Team 2 moves:', decryptedTeam2Moves.toString());

        // ========================================
        // 10. VERIFY DECRYPTED MOVES MATCH ORIGINAL
        // ========================================
        console.log('\n✅ Verifying decrypted moves match original...');

        // Verify decrypted moves match original
        expect(decryptedTeam1Moves).to.equal(movesBigInt);
        expect(decryptedTeam2Moves).to.equal(movesBigInt2);
        expect(decryptedTeam1Moves).to.be.a('bigint');
        expect(decryptedTeam2Moves).to.be.a('bigint');

        console.log('🎉 SUCCESS: Complete encryption integration test passed!');
        console.log('📊 Summary:');
        console.log('   - Contract deployed and configured');
        console.log('   - Teams created and game started');
        console.log('   - Symmetric key encrypted and stored (96 bytes)');
        console.log('   - Maximum moves (6 per team) encrypted and committed (32 bytes each)');
        console.log('   - Data retrieved and successfully decrypted');
        console.log('   - All moves match original values');
        console.log('   - Tested with maximum possible move complexity');
    });
});
