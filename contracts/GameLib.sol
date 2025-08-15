// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./EloCalculationLib.sol";

library GameLib {
    // Constants
    uint256 public constant MAX_MOVES = 45;
    uint256 public constant MAX_MOVE_TIME = 1 minutes;

    // Enums
    enum TeamEnum {
        NONE,
        TEAM1,
        TEAM2
    }

    enum MoveType {
        PASS,
        TACKLE,
        RUN,
        SHOT
    }

    enum GameStatus {
        WAITING_FOR_START,
        ACTIVE,
        FINISHED,
        FINISHED_BY_TIMEOUT
    }

    enum FinishReason {
        MAX_MOVES_REACHED,
        MOVE_TIMEOUT
    }

    // Structs
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

    enum StateType {
        START_POSITIONS,
        MOVE,
        GOAL_TEAM1,
        GOAL_TEAM2
    }

    struct GameState {
        Position[] team1Positions;
        Position[] team2Positions;
        Position ballPosition;
        TeamEnum ballOwner;
        uint8[] clashRandomResults;
        StateType stateType;
    }

    struct GameStatistics {
        uint32 wins;
        uint32 losses;
        uint32 draws;
        uint32 totalGames;
        uint32 totalGoalsScored;
        uint32 totalGoalsConceded;
        // biggestWin
        uint32 biggestWinGoalsScored;
        uint32 biggestWinGoalsConceded;
        // biggestLoss
        uint32 biggestLossGoalsScored;
        uint32 biggestLossGoalsConceded;
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
        GameStatistics statistic;
    }

    struct Game {
        uint256 gameId;
        uint256 team1id;
        uint256 team2id;
        //
        uint256 createdAt;
        //
        uint256 lastMoveAt;
        TeamEnum lastMoveTeam;
        //
        uint8 team1Score;
        uint8 team2score;
        // elo rating at the game start
        uint64 team1EloRating;
        uint64 team2EloRating;
        //
        uint64 eloRatingDelta;
        //
        GameState[] history;
        GameStatus status;
        //
        GameAction[] team1Actions;
        GameAction[] team2Actions;
        //
        uint8 movesMade;
        //
        TeamEnum winner;
    }

    struct GameRequest {
        uint256 gameRequestId;
        uint256 team1id;
        uint256 team2id;
        uint256 createdAt;
    }

    // Team Management Functions
    function createTeam(
        uint256 nextTeamId,
        address wallet,
        string memory name,
        uint8 countryID,
        uint256 createdAt
    ) external pure returns (Team memory) {
        return
            Team({
                id: nextTeamId,
                wallet: wallet,
                name: name,
                eloRating: EloCalculationLib.getDefaultRating(),
                registeredAt: createdAt,
                games: new uint256[](0),
                country: countryID,
                hasActiveGame: false,
                gameRequestId: 0,
                statistic: GameStatistics({
                    wins: 0,
                    losses: 0,
                    draws: 0,
                    totalGames: 0,
                    totalGoalsScored: 0,
                    totalGoalsConceded: 0,
                    biggestWinGoalsScored: 0,
                    biggestWinGoalsConceded: 0,
                    biggestLossGoalsScored: 0,
                    biggestLossGoalsConceded: 0
                })
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
        return
            Game({
                gameId: nextGameId,
                team1id: team1id,
                team2id: team2id,
                createdAt: block.timestamp,
                lastMoveAt: 0,
                lastMoveTeam: TeamEnum.TEAM1,
                team1Score: 0,
                team2score: 0,
                team1EloRating: team1EloRating,
                team2EloRating: team2EloRating,
                history: new GameState[](0),
                status: GameStatus.WAITING_FOR_START,
                team1Actions: new GameAction[](0),
                team2Actions: new GameAction[](0),
                movesMade: 0,
                winner: TeamEnum.NONE,
                eloRatingDelta: 0
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

    function commitGameActions(
        Game storage game,
        TeamEnum team,
        GameAction[] calldata actions
    ) external returns (bool) {
        if (team == TeamEnum.TEAM1) {
            require(
                game.team1Actions.length == 0,
                "Team 1 already has actions"
            );

            game.team1Actions = actions;
            game.lastMoveTeam = TeamEnum.TEAM1;
        } else {
            require(
                game.team2Actions.length == 0,
                "Team 2 already has actions"
            );

            game.team2Actions = actions;
            game.lastMoveTeam = TeamEnum.TEAM2;
        }

        game.lastMoveAt = block.timestamp;

        return game.team1Actions.length > 0 && game.team2Actions.length > 0;
    }

    function finishGame(
        Game storage game,
        Team storage team1,
        Team storage team2,
        FinishReason finishReason
    ) internal returns (TeamEnum winner) {
        require(game.status == GameStatus.ACTIVE, "Game is not active");

        game.status = GameStatus.FINISHED;

        team1.statistic.totalGames++;
        team2.statistic.totalGames++;

        team1.hasActiveGame = false;
        team2.hasActiveGame = false;

        if (finishReason == FinishReason.MOVE_TIMEOUT) {
            winner = game.lastMoveTeam;

            if (winner == TeamEnum.TEAM1) {
                game.team1Score = 3;
                game.team2score = 0;
            } else {
                game.team1Score = 0;
                game.team2score = 3;
            }
            // that's technical win, don't update team stat
            // Event will be emitted from the main contract
            return winner;
        }
        if (finishReason == FinishReason.MAX_MOVES_REACHED) {
            if (game.team1Score > game.team2score) {
                winner = TeamEnum.TEAM1;
            } else if (game.team1Score < game.team2score) {
                winner = TeamEnum.TEAM2;
            } else {
                winner = TeamEnum.NONE;
            }
            // Event will be emitted from the main contract
        }

        game.winner = winner;

        _updateTeamStatistics(game, team1, team2);
        return winner;
    }

    function newGameState(
        Game storage game,
        GameState calldata gameState
    ) external {
        game.history.push(gameState);

        game.movesMade++;
        game.lastMoveAt = block.timestamp;

        game.team1Actions = new GameAction[](0);
        game.team2Actions = new GameAction[](0);
        game.lastMoveTeam = TeamEnum.NONE;

        if (gameState.stateType == StateType.GOAL_TEAM1) {
            game.team1Score++;
        } else if (gameState.stateType == StateType.GOAL_TEAM2) {
            game.team2score++;
        }

        return;
    }

    function _updateTeamStatistics(
        Game storage game,
        Team storage team1,
        Team storage team2
    ) private {
        team1.statistic.totalGoalsScored += game.team1Score;
        team1.statistic.totalGoalsConceded += game.team2score;
        team2.statistic.totalGoalsScored += game.team2score;
        team2.statistic.totalGoalsConceded += game.team1Score;

        if (game.team1Score > game.team2score) {
            team1.statistic.wins++;
            team2.statistic.losses++;

            if (
                game.team1Score - game.team2score >
                team1.statistic.biggestWinGoalsScored -
                    team1.statistic.biggestWinGoalsConceded
            ) {
                team1.statistic.biggestWinGoalsScored = game.team1Score;
                team1.statistic.biggestWinGoalsConceded = game.team2score;
            }

            if (
                game.team1Score - game.team2score >
                team2.statistic.biggestLossGoalsConceded -
                    team2.statistic.biggestLossGoalsScored
            ) {
                team2.statistic.biggestLossGoalsScored = game.team2score;
                team2.statistic.biggestLossGoalsConceded = game.team1Score;
            }
        } else if (game.team1Score < game.team2score) {
            team1.statistic.losses++;
            team2.statistic.wins++;

            if (
                game.team2score - game.team1Score >
                team2.statistic.biggestWinGoalsScored -
                    team2.statistic.biggestWinGoalsConceded
            ) {
                team2.statistic.biggestWinGoalsScored = game.team2score;
                team2.statistic.biggestWinGoalsConceded = game.team1Score;
            }

            if (
                game.team2score - game.team1Score >
                team1.statistic.biggestLossGoalsConceded -
                    team1.statistic.biggestLossGoalsScored
            ) {
                team1.statistic.biggestLossGoalsScored = game.team1Score;
                team1.statistic.biggestLossGoalsConceded = game.team2score;
            }
        } else {
            team1.statistic.draws++;
            team2.statistic.draws++;
        }
    }
}
