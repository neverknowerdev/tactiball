import { expect } from 'chai';
import {
    serializeMoves,
    deserializeMoves,
    GameAction,
    MoveType,
    TeamEnum,
    Position
} from '../frontend/lib/game';

describe('SerializeMoves and DeserializeMoves', function () {
    // Helper function to create a GameAction
    function createGameAction(
        playerId: number,
        moveType: MoveType,
        oldPosition: Position,
        newPosition: Position,
        teamEnum: TeamEnum = TeamEnum.TEAM1
    ): GameAction {
        return {
            playerId,
            teamEnum,
            moveType,
            oldPosition,
            newPosition,
            playerKey: () => `${teamEnum}_${playerId}`
        };
    }

    describe('serializeMoves', function () {
        it('should serialize a single move correctly', function () {
            const gameActions = [
                createGameAction(1, MoveType.TACKLE, { x: 5, y: 7 }, { x: 7, y: 9 })
            ];

            const result = serializeMoves(gameActions);
            expect(result).to.equal('11105070709');

            // Test BigInt conversion
            const bigIntResult = BigInt(result);
            expect(bigIntResult.toString()).to.equal('11105070709');
        });

        it('should serialize multiple moves correctly', function () {
            const gameActions = [
                createGameAction(1, MoveType.PASS, { x: 5, y: 7 }, { x: 7, y: 9 }),
                createGameAction(2, MoveType.RUN, { x: 3, y: 4 }, { x: 5, y: 6 }),
                createGameAction(3, MoveType.SHOT, { x: 8, y: 2 }, { x: 10, y: 4 })
            ];

            const result = serializeMoves(gameActions);
            expect(result).to.equal('1100507070922030405063308021004');

            // Test BigInt conversion
            const bigIntResult = BigInt(result);
            expect(bigIntResult.toString()).to.equal('1100507070922030405063308021004');
        });

        it('should handle edge case positions (0, 0)', function () {
            const gameActions = [
                createGameAction(0, MoveType.PASS, { x: 0, y: 0 }, { x: 0, y: 0 })
            ];

            const result = serializeMoves(gameActions);
            expect(result).to.equal('10000000000');

            // Test BigInt conversion
            const bigIntResult = BigInt(result);
            expect(bigIntResult.toString()).to.equal('10000000000');
        });

        it('should handle maximum positions (99, 99)', function () {
            const gameActions = [
                createGameAction(9, MoveType.SHOT, { x: 99, y: 99 }, { x: 99, y: 99 })
            ];

            const result = serializeMoves(gameActions);
            expect(result).to.equal('19399999999');

            // Test BigInt conversion
            const bigIntResult = BigInt(result);
            expect(bigIntResult.toString()).to.equal('19399999999');
        });

        it('should handle all move types correctly', function () {
            const gameActions = [
                createGameAction(1, MoveType.PASS, { x: 1, y: 1 }, { x: 2, y: 2 }),
                createGameAction(2, MoveType.TACKLE, { x: 3, y: 3 }, { x: 4, y: 4 }),
                createGameAction(3, MoveType.RUN, { x: 5, y: 5 }, { x: 6, y: 6 }),
                createGameAction(4, MoveType.SHOT, { x: 7, y: 7 }, { x: 8, y: 8 })
            ];

            const result = serializeMoves(gameActions);
            expect(result).to.equal('11001010202210303040432050506064307070808');

            // Test BigInt conversion
            const bigIntResult = BigInt(result);
            expect(bigIntResult.toString()).to.equal('11001010202210303040432050506064307070808');
        });

        it('should throw error for empty array', function () {
            const gameActions: GameAction[] = [];

            expect(() => serializeMoves(gameActions)).to.throw('Number of moves must be between 1 and 6');
        });

        it('should throw error for more than 6 moves', function () {
            const gameActions = Array(7).fill(null).map((_, i) =>
                createGameAction(i, MoveType.PASS, { x: 1, y: 1 }, { x: 2, y: 2 })
            );

            expect(() => serializeMoves(gameActions)).to.throw('Number of moves must be between 1 and 6');
        });

        it('should throw error for invalid playerId (negative)', function () {
            const gameActions = [
                createGameAction(-1, MoveType.PASS, { x: 1, y: 1 }, { x: 2, y: 2 })
            ];

            expect(() => serializeMoves(gameActions)).to.throw('Invalid playerId: -1');
        });

        it('should throw error for invalid playerId (> 9)', function () {
            const gameActions = [
                createGameAction(10, MoveType.PASS, { x: 1, y: 1 }, { x: 2, y: 2 })
            ];

            expect(() => serializeMoves(gameActions)).to.throw('Invalid playerId: 10');
        });

        it('should throw error for position out of range (x > 99)', function () {
            const gameActions = [
                createGameAction(1, MoveType.PASS, { x: 100, y: 1 }, { x: 2, y: 2 })
            ];

            expect(() => serializeMoves(gameActions)).to.throw('Position values out of range for move by player 1');
        });

        it('should throw error for position out of range (y > 99)', function () {
            const gameActions = [
                createGameAction(1, MoveType.PASS, { x: 1, y: 100 }, { x: 2, y: 2 })
            ];

            expect(() => serializeMoves(gameActions)).to.throw('Position values out of range for move by player 1');
        });

        it('should throw error for negative position values', function () {
            const gameActions = [
                createGameAction(1, MoveType.PASS, { x: -1, y: 1 }, { x: 2, y: 2 })
            ];

            expect(() => serializeMoves(gameActions)).to.throw('Position values out of range for move by player 1');
        });

        it('should handle decimal positions by flooring them', function () {
            const gameActions = [
                createGameAction(1, MoveType.PASS, { x: 5.7, y: 3.2 }, { x: 7.9, y: 9.1 })
            ];

            const result = serializeMoves(gameActions);
            expect(result).to.equal('11005030709');

            // Test BigInt conversion
            const bigIntResult = BigInt(result);
            expect(bigIntResult.toString()).to.equal('11005030709');
        });
    });

    describe('deserializeMoves', function () {
        it('should deserialize a single move correctly', function () {
            const serialized = '11105070709';

            // Test BigInt conversion first
            const bigIntValue = BigInt(serialized);
            expect(bigIntValue.toString()).to.equal('11105070709');

            const result = deserializeMoves(serialized);

            expect(result).to.have.length(1);
            expect(result[0].playerId).to.equal(1);
            expect(result[0].moveType).to.equal(MoveType.TACKLE);
            expect(result[0].oldPosition).to.deep.equal({ x: 5, y: 7 });
            expect(result[0].newPosition).to.deep.equal({ x: 7, y: 9 });
        });

        it('should deserialize multiple moves correctly', function () {
            const serialized = '1100507070922030405063308021004';

            // Test BigInt conversion first
            const bigIntValue = BigInt(serialized);
            expect(bigIntValue.toString()).to.equal('1100507070922030405063308021004');

            const result = deserializeMoves(serialized);

            expect(result).to.have.length(3);
            expect(result[0].playerId).to.equal(1);
            expect(result[0].moveType).to.equal(MoveType.PASS);
            expect(result[0].oldPosition).to.deep.equal({ x: 5, y: 7 });
            expect(result[0].newPosition).to.deep.equal({ x: 7, y: 9 });

            expect(result[1].playerId).to.equal(2);
            expect(result[1].moveType).to.equal(MoveType.RUN);
            expect(result[1].oldPosition).to.deep.equal({ x: 3, y: 4 });
            expect(result[1].newPosition).to.deep.equal({ x: 5, y: 6 });

            expect(result[2].playerId).to.equal(3);
            expect(result[2].moveType).to.equal(MoveType.SHOT);
            expect(result[2].oldPosition).to.deep.equal({ x: 8, y: 2 });
            expect(result[2].newPosition).to.deep.equal({ x: 10, y: 4 });
        });

        it('should handle edge case positions (0, 0)', function () {
            const serialized = '10000000000';

            // Test BigInt conversion first
            const bigIntValue = BigInt(serialized);
            expect(bigIntValue.toString()).to.equal('10000000000');

            const result = deserializeMoves(serialized);

            expect(result).to.have.length(1);
            expect(result[0].playerId).to.equal(0);
            expect(result[0].moveType).to.equal(MoveType.PASS);
            expect(result[0].oldPosition).to.deep.equal({ x: 0, y: 0 });
            expect(result[0].newPosition).to.deep.equal({ x: 0, y: 0 });
        });

        it('should handle maximum positions (99, 99)', function () {
            const serialized = '19399999999';

            // Test BigInt conversion first
            const bigIntValue = BigInt(serialized);
            expect(bigIntValue.toString()).to.equal('19399999999');

            const result = deserializeMoves(serialized);

            expect(result).to.have.length(1);
            expect(result[0].playerId).to.equal(9);
            expect(result[0].moveType).to.equal(MoveType.SHOT);
            expect(result[0].oldPosition).to.deep.equal({ x: 99, y: 99 });
            expect(result[0].newPosition).to.deep.equal({ x: 99, y: 99 });
        });

        it('should handle all move types correctly', function () {
            const serialized = '11001010202210303040432050506064307070808';

            // Test BigInt conversion first
            const bigIntValue = BigInt(serialized);
            expect(bigIntValue.toString()).to.equal('11001010202210303040432050506064307070808');

            const result = deserializeMoves(serialized);

            expect(result).to.have.length(4);
            expect(result[0].moveType).to.equal(MoveType.PASS);
            expect(result[1].moveType).to.equal(MoveType.TACKLE);
            expect(result[2].moveType).to.equal(MoveType.RUN);
            expect(result[3].moveType).to.equal(MoveType.SHOT);
        });

        it('should throw error for string not starting with 1', function () {
            const serialized = '2105070709';

            expect(() => deserializeMoves(serialized)).to.throw('Invalid serialized moves format: must start with 1 and have 11 to 61 digits');
        });

        it('should throw error for string too short', function () {
            const serialized = '11050707';

            expect(() => deserializeMoves(serialized)).to.throw('Invalid serialized moves format: must start with 1 and have 11 to 61 digits');
        });

        it('should throw error for string too long', function () {
            const serialized = '1' + '0'.repeat(61);

            expect(() => deserializeMoves(serialized)).to.throw('Invalid serialized moves format: must start with 1 and have 11 to 61 digits');
        });

        it('should throw error for string length not divisible by 10', function () {
            const serialized = '111050707091';

            expect(() => deserializeMoves(serialized)).to.throw('Invalid serialized moves length: must be divisible by 10 after leading 1');
        });

        it('should handle maximum number of moves (6)', function () {
            // Create 6 moves and serialize them to get the correct format
            const gameActions = [
                createGameAction(0, MoveType.PASS, { x: 1, y: 1 }, { x: 2, y: 2 }),
                createGameAction(1, MoveType.TACKLE, { x: 3, y: 3 }, { x: 4, y: 4 }),
                createGameAction(2, MoveType.RUN, { x: 5, y: 5 }, { x: 6, y: 6 }),
                createGameAction(3, MoveType.SHOT, { x: 7, y: 7 }, { x: 8, y: 8 }),
                createGameAction(4, MoveType.PASS, { x: 9, y: 9 }, { x: 10, y: 10 }),
                createGameAction(5, MoveType.TACKLE, { x: 11, y: 11 }, { x: 12, y: 12 })
            ];

            const serialized = serializeMoves(gameActions);

            // Test BigInt conversion first
            const bigIntValue = BigInt(serialized);
            expect(bigIntValue.toString()).to.equal(serialized);

            const result = deserializeMoves(serialized);

            expect(result).to.have.length(6);
        });
    });

    describe('Round-trip serialization/deserialization', function () {
        it('should maintain data integrity through serialize/deserialize cycle', function () {
            const originalActions = [
                createGameAction(1, MoveType.PASS, { x: 5, y: 7 }, { x: 7, y: 9 }),
                createGameAction(2, MoveType.TACKLE, { x: 3, y: 4 }, { x: 5, y: 6 }),
                createGameAction(3, MoveType.RUN, { x: 8, y: 2 }, { x: 10, y: 4 }),
                createGameAction(4, MoveType.SHOT, { x: 1, y: 1 }, { x: 2, y: 2 })
            ];

            const serialized = serializeMoves(originalActions);

            // Test BigInt conversion
            const bigIntValue = BigInt(serialized);
            expect(bigIntValue.toString()).to.equal(serialized);

            const deserialized = deserializeMoves(serialized);

            expect(deserialized).to.have.length(originalActions.length);

            for (let i = 0; i < originalActions.length; i++) {
                expect(deserialized[i].playerId).to.equal(originalActions[i].playerId);
                expect(deserialized[i].moveType).to.equal(originalActions[i].moveType);
                expect(deserialized[i].oldPosition).to.deep.equal(originalActions[i].oldPosition);
                expect(deserialized[i].newPosition).to.deep.equal(originalActions[i].newPosition);
            }
        });

        it('should handle single move round-trip', function () {
            const originalAction = createGameAction(5, MoveType.SHOT, { x: 15, y: 25 }, { x: 30, y: 40 });

            const serialized = serializeMoves([originalAction]);

            // Test BigInt conversion
            const bigIntValue = BigInt(serialized);
            expect(bigIntValue.toString()).to.equal(serialized);

            const deserialized = deserializeMoves(serialized);

            expect(deserialized).to.have.length(1);
            expect(deserialized[0].playerId).to.equal(originalAction.playerId);
            expect(deserialized[0].moveType).to.equal(originalAction.moveType);
            expect(deserialized[0].oldPosition).to.deep.equal(originalAction.oldPosition);
            expect(deserialized[0].newPosition).to.deep.equal(originalAction.newPosition);
        });
    });
});
