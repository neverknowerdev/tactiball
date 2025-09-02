// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

library GameLib {
    // Constants
    uint256 public constant MAX_MOVES = 45;
    uint256 public constant MAX_MOVE_TIME = 1 minutes;

    // Enums
    enum TeamFormation {
        FORMATION_2_2_1
    }

    enum TeamEnum {
        NONE,
        TEAM1,
        TEAM2
    }

    enum GameStatus {
        NONE,
        ACTIVE,
        FINISHED,
        FINISHED_BY_TIMEOUT
    }

    enum FinishReason {
        MAX_MOVES_REACHED,
        MOVE_TIMEOUT
    }

    enum StateType {
        START_POSITIONS,
        MOVE,
        GOAL_TEAM1,
        GOAL_TEAM2
    }

    enum MoveType {
        PASS,
        TACKLE,
        RUN,
        SHOT
    }

    struct Position {
        uint8 x;
        uint8 y;
    }

    struct GameAction {
        uint256 playerId;
        MoveType moveType;
        Position oldPosition;
        Position newPosition;
    }

    struct GameState {
        uint8 movesMade;
        uint64 lastMoveAt;
        bool team1MadeMove;
        bool team2MadeMove;
        TeamEnum lastMoveTeam;
        uint8 team1score;
        uint8 team2score;
    }

    struct Team {
        uint256 id;
        address wallet;
        string name;
        uint64 eloRating;
        uint256 registeredAt;
        uint256[] games;
        uint8 country;
        bool hasActiveGame;
        uint256 gameRequestId;
        uint64 totalGames;
        //
        uint256[10] __gap;
    }

    struct TeamInfo {
        uint256 teamId;
        uint64 eloRating;
        uint64 eloRatingNew;
        TeamFormation formation;
        //
        uint256[5] __gap;
    }

    struct Game {
        uint256 gameId;
        //
        uint256 createdAt;
        //
        GameState gameState;
        //
        TeamInfo team1;
        TeamInfo team2;
        //
        GameStatus status;
        //
        TeamEnum winner;
        //
        bytes32 historyIPFS;
        bool isVerified;
        //
        uint8 gameEngineVersion;
        //
        uint256[10] __gap;
    }

    struct GameRequest {
        uint256 gameRequestId;
        uint256 team1id;
        uint256 team2id;
        uint256 createdAt;
    }

    // Helper function to trim leading and trailing spaces from a string
    function trimSpaces(
        string memory str
    ) external pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        uint256 start = 0;
        uint256 end = strBytes.length;

        // Find the first non-space character
        while (start < end && strBytes[start] == 0x20) {
            start++;
        }

        // Find the last non-space character
        while (end > start && strBytes[end - 1] == 0x20) {
            end--;
        }

        // If the string is all spaces, return empty string
        if (start >= end) {
            return "";
        }

        // Create a new string with the trimmed content
        bytes memory result = new bytes(end - start);
        for (uint256 i = 0; i < result.length; i++) {
            result[i] = strBytes[start + i];
        }

        return string(result);
    }

    // Team Management Functions
    function createTeam(
        uint256 nextTeamId,
        address wallet,
        string memory name,
        uint8 countryID,
        uint256 createdAt
    ) external pure returns (Team memory) {
        // Trim leading and trailing spaces from the team name

        return
            Team({
                id: nextTeamId,
                wallet: wallet,
                name: name,
                eloRating: 10000, // Default ELO rating
                registeredAt: createdAt,
                games: new uint256[](0),
                country: countryID,
                hasActiveGame: false,
                gameRequestId: 0,
                totalGames: 0,
                __gap: [
                    uint256(0),
                    uint256(0),
                    uint256(0),
                    uint256(0),
                    uint256(0),
                    uint256(0),
                    uint256(0),
                    uint256(0),
                    uint256(0),
                    uint256(0)
                ]
            });
    }
    // Game Management Functions
    function createGame(
        uint256 team1id,
        uint256 team2id,
        uint256 nextGameId,
        uint64 team1EloRating,
        uint64 team2EloRating
    ) internal view returns (Game memory) {
        TeamInfo memory team1Info = TeamInfo({
            teamId: team1id,
            eloRating: team1EloRating,
            eloRatingNew: 0,
            formation: TeamFormation.FORMATION_2_2_1,
            __gap: [uint256(0), uint256(0), uint256(0), uint256(0), uint256(0)]
        });

        TeamInfo memory team2Info = TeamInfo({
            teamId: team2id,
            eloRating: team2EloRating,
            eloRatingNew: 0,
            formation: TeamFormation.FORMATION_2_2_1,
            __gap: [uint256(0), uint256(0), uint256(0), uint256(0), uint256(0)]
        });

        return
            Game({
                gameId: nextGameId,
                createdAt: block.timestamp,
                gameState: GameState({
                    movesMade: 0,
                    lastMoveAt: 0,
                    team1MadeMove: false,
                    team2MadeMove: false,
                    lastMoveTeam: TeamEnum.NONE,
                    team1score: 0,
                    team2score: 0
                }),
                team1: team1Info,
                team2: team2Info,
                status: GameStatus.ACTIVE,
                winner: TeamEnum.NONE,
                isVerified: false,
                historyIPFS: "",
                gameEngineVersion: 1,
                __gap: [
                    uint256(0),
                    uint256(0),
                    uint256(0),
                    uint256(0),
                    uint256(0),
                    uint256(0),
                    uint256(0),
                    uint256(0),
                    uint256(0),
                    uint256(0)
                ]
            });
    }

    function createGameRequest(
        uint256 gameRequestId,
        uint256 team1id,
        uint256 team2id
    ) internal view returns (GameRequest memory) {
        return
            GameRequest({
                gameRequestId: gameRequestId,
                team1id: team1id,
                team2id: team2id,
                createdAt: block.timestamp
            });
    }

    function cancelGameRequest(
        mapping(uint256 => GameRequest) storage gameRequests,
        mapping(uint256 => Team) storage teams,
        uint256 gameRequestId
    ) external {
        require(gameRequestId > 0, "Game request does not exist");

        GameRequest storage request = gameRequests[gameRequestId];
        require(request.createdAt > 0, "Game request does not exist");

        Team storage team = teams[request.team1id];

        team.gameRequestId = 0;
        delete gameRequests[request.gameRequestId];
    }

    // Helper functions to access team data
    function getTeamInfo(
        Game storage game,
        TeamEnum team
    ) internal view returns (TeamInfo storage) {
        if (team == TeamEnum.TEAM1) {
            return game.team1;
        } else {
            return game.team2;
        }
    }

    function commitGameActions(
        GameState storage gameState,
        TeamEnum team
    ) external returns (bool) {
        if (team == TeamEnum.TEAM1) {
            gameState.team1MadeMove = true;
        } else {
            gameState.team2MadeMove = true;
        }

        gameState.lastMoveTeam = team;
        gameState.lastMoveAt = uint64(block.timestamp);

        return gameState.team1MadeMove && gameState.team2MadeMove;
    }

    function finishGame(
        Game storage game,
        Team storage team1,
        Team storage team2,
        FinishReason finishReason
    ) internal returns (TeamEnum winner) {
        require(game.status == GameStatus.ACTIVE, "Game is not active");

        team1.totalGames++;
        team2.totalGames++;

        team1.hasActiveGame = false;
        team2.hasActiveGame = false;

        if (finishReason == FinishReason.MOVE_TIMEOUT) {
            winner = game.gameState.lastMoveTeam;

            game.status = GameStatus.FINISHED_BY_TIMEOUT;

            if (winner == TeamEnum.TEAM1) {
                game.gameState.team1score = 3;
                game.gameState.team2score = 0;
            } else {
                game.gameState.team1score = 0;
                game.gameState.team2score = 3;
            }
            // that's technical win, don't update team stat
            // Event will be emitted from the main contract
            return winner;
        }
        if (finishReason == FinishReason.MAX_MOVES_REACHED) {
            if (game.gameState.team1score > game.gameState.team2score) {
                winner = TeamEnum.TEAM1;
            } else if (game.gameState.team1score < game.gameState.team2score) {
                winner = TeamEnum.TEAM2;
            } else {
                winner = TeamEnum.NONE;
            }
            game.status = GameStatus.FINISHED;
            // Event will be emitted from the main contract
        }

        game.winner = winner;

        return winner;
    }
}
