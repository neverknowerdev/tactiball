// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./GameLib.sol";
import "./EloCalculationLib.sol";

contract ChessBallGame {
    using GameLib for *;

    // Gelato address for automation
    address public gelatoAddress;
    address public relayerAddress;

    // Events
    event GameStarted(uint256 indexed gameId, GameLib.TeamEnum teamWithBall);

    event GoalScored(uint256 indexed gameId, GameLib.TeamEnum scoringTeam);
    event GameFinished(
        uint256 indexed gameId,
        GameLib.TeamEnum winner,
        GameLib.FinishReason finishReason
    );
    event gameActionCommitted(uint256 indexed gameId);
    event NewGameState(
        uint256 indexed gameId,
        uint256 time,
        GameLib.GameState newGameState
    );
    enum ErrorType {
        UNSPECIFIED,
        MOVE_VALIDATION_ERROR
    }
    event GameStateError(
        uint256 indexed gameId,
        GameLib.TeamEnum cauzedByTeam,
        ErrorType errorType,
        uint256 time,
        string errorMsg
    );

    // State variables
    mapping(uint256 => GameLib.Game) public games;
    mapping(uint256 => GameLib.Team) public teams;
    mapping(address => uint256) public teamIdByWallet;

    uint256 public nextGameId;
    uint256 public nextTeamId;

    uint64 public activeGameCount;

    // Game request mappings
    mapping(uint256 => GameLib.GameRequest) public gameRequests;
    uint256 public gameRequestIndex;

    /**
     * @dev Constructor to set the Gelato address
     * @param _gelatoAddress The address of the Gelato automation service
     */
    constructor(address _gelatoAddress, address _relayerAddress) {
        require(_gelatoAddress != address(0), "Gelato address cannot be zero");
        require(
            _relayerAddress != address(0),
            "Relayer address cannot be zero"
        );
        gelatoAddress = _gelatoAddress;
        relayerAddress = _relayerAddress;
    }

    mapping(string => bool) public teamNames;
    // Internal function that creates a team with a specified sender
    function _createTeam(
        address sender,
        string memory name,
        uint8 country
    ) internal {
        require(teamIdByWallet[sender] == 0, "Team already exists");
        require(bytes(name).length > 0, "Name is required");
        require(country > 0, "Country is required");

        name = GameLib.trimSpaces(name);
        require(teamNames[name] == false, "Team name already exists");

        nextTeamId++;
        GameLib.Team memory team = GameLib.createTeam(
            nextTeamId,
            sender,
            name,
            country,
            block.timestamp
        );

        teams[team.id] = team;
        teamNames[name] = true;
        teamIdByWallet[sender] = team.id;
    }

    // Public wrapper that calls internal function with msg.sender
    function createTeam(string memory name, uint8 country) public {
        return _createTeam(msg.sender, name, country);
    }

    // Relayer version that can create team for any address
    function createTeamRelayer(
        address sender,
        string memory name,
        uint8 country
    ) public onlyRelayer {
        _createTeam(sender, name, country);
    }

    event GameRequestCreated(uint256 gameRequestId);
    // Internal function that creates a game request with a specified sender
    function _createGameRequest(
        address sender,
        uint256 team1id,
        uint256 team2id
    ) internal {
        require(teams[team1id].id > 0, "Team 1 does not exist");
        require(teams[team2id].id > 0, "Team 2 does not exist");
        require(
            teams[team1id].id != teams[team2id].id,
            "Teams cannot be the same"
        );
        require(
            teams[team1id].wallet == sender,
            "Team1 owner should call createGameRequest"
        );

        require(
            !teams[team2id].hasActiveGame,
            "Team2 already has an active game"
        );

        if (teams[team1id].gameRequestId > 0) {
            _cancelGameRequest(sender, teams[team1id].gameRequestId);
        }

        gameRequestIndex++;
        GameLib.GameRequest memory request = GameLib.createGameRequest(
            gameRequestIndex,
            team1id,
            team2id
        );

        gameRequests[request.gameRequestId] = request;
        teams[team1id].gameRequestId = request.gameRequestId;

        emit GameRequestCreated(request.gameRequestId);
    }

    // Public wrapper that calls internal function with msg.sender
    function createGameRequest(uint256 team1id, uint256 team2id) public {
        _createGameRequest(msg.sender, team1id, team2id);
    }

    // Relayer version that can create game request for any address
    function createGameRequestRelayer(
        address sender,
        uint256 team1id,
        uint256 team2id
    ) public onlyRelayer {
        _createGameRequest(sender, team1id, team2id);
    }

    // Internal function that cancels a game request with a specified sender
    function _cancelGameRequest(
        address sender,
        uint256 gameRequestId
    ) internal {
        require(gameRequestId > 0, "Game request does not exist");
        require(
            gameRequests[gameRequestId].createdAt > 0,
            "Game request does not exist"
        );
        require(
            teams[gameRequests[gameRequestId].team1id].wallet == sender,
            "You are not the owner of request"
        );
        require(
            gameRequests[gameRequestId].createdAt + 1 minutes < block.timestamp,
            "Game request is not expired (1 minute)"
        );

        GameLib.cancelGameRequest(gameRequests, teams, gameRequestId);
    }

    // Public wrapper that calls internal function with msg.sender
    function cancelGameRequest(uint256 gameRequestId) public {
        _cancelGameRequest(msg.sender, gameRequestId);
    }

    // Relayer version that can cancel game request for any address
    function cancelGameRequestRelayer(
        address sender,
        uint256 gameRequestId
    ) public onlyRelayer {
        _cancelGameRequest(sender, gameRequestId);
    }

    // Internal function that starts a game with a specified sender
    function _startGame(address sender, uint256 gameRequestId) internal {
        require(
            gameRequests[gameRequestId].createdAt > 0,
            "Game request does not exist"
        );
        require(
            teams[gameRequests[gameRequestId].team2id].wallet == sender,
            "Team2 owner should call startGame"
        );

        require(
            !teams[gameRequests[gameRequestId].team1id].hasActiveGame,
            "Team1 have ongoing game already"
        );
        require(
            !teams[gameRequests[gameRequestId].team2id].hasActiveGame,
            "Team2 have ongoing game already"
        );

        if (teams[gameRequests[gameRequestId].team2id].gameRequestId > 0) {
            GameLib.cancelGameRequest(
                gameRequests,
                teams,
                teams[gameRequests[gameRequestId].team2id].gameRequestId
            );
        }

        GameLib.GameRequest storage gameRequest = gameRequests[gameRequestId];
        uint256 team1id = gameRequest.team1id;
        uint256 team2id = gameRequest.team2id;

        nextGameId++;

        GameLib.Game memory game = GameLib.createGame(
            team1id,
            team2id,
            nextGameId,
            teams[team1id].eloRating,
            teams[team2id].eloRating
        );

        games[game.gameId] = game;

        GameLib.cancelGameRequest(gameRequests, teams, gameRequestId);

        teams[team1id].hasActiveGame = true;
        teams[team2id].hasActiveGame = true;

        teams[team1id].games.push(game.gameId);
        teams[team2id].games.push(game.gameId);

        activeGameCount++;

        emit GameStarted(game.gameId, GameLib.TeamEnum.TEAM1);
        // emit with empty arrays to trigger the game worker at the game start
        emit gameActionCommitted(game.gameId);
    }

    // Public wrapper that calls internal function with msg.sender
    function startGame(uint256 gameRequestId) public {
        _startGame(msg.sender, gameRequestId);
    }

    // Relayer version that can start game for any address
    function startGameRelayer(
        address sender,
        uint256 gameRequestId
    ) public onlyRelayer {
        _startGame(sender, gameRequestId);
    }

    // Internal function that commits game actions with a specified sender
    function _commitGameActions(
        address sender,
        uint256 gameId,
        GameLib.TeamEnum team,
        GameLib.GameAction[] calldata actions
    ) internal gameExists(gameId) {
        GameLib.Game storage game = games[gameId];
        require(game.status == GameLib.GameStatus.ACTIVE, "Game is not active");
        require(actions.length > 0, "No actions to commit");

        if (team == GameLib.TeamEnum.TEAM1) {
            require(
                teams[game.team1.teamId].wallet == sender,
                "Your wallet is not participating in the game"
            );
        } else if (team == GameLib.TeamEnum.TEAM2) {
            require(
                teams[game.team2.teamId].wallet == sender,
                "Your wallet is not participating in the game"
            );
        }

        if (
            game.lastMoveTeam != team &&
            game.lastMoveAt + GameLib.MAX_MOVE_TIME < block.timestamp
        ) {
            _finishGame(gameId, GameLib.FinishReason.MOVE_TIMEOUT);
            return;
        }
        if (game.movesMade > GameLib.MAX_MOVES) {
            _finishGame(gameId, GameLib.FinishReason.MAX_MOVES_REACHED);
            return;
        }

        bool bothTeamsCommitted = GameLib.commitGameActions(
            game,
            team,
            actions
        );

        if (bothTeamsCommitted) {
            emit gameActionCommitted(gameId);
        }
    }

    // Public wrapper that calls internal function with msg.sender
    function commitGameActions(
        uint256 gameId,
        GameLib.TeamEnum team,
        GameLib.GameAction[] calldata actions
    ) public gameExists(gameId) {
        _commitGameActions(msg.sender, gameId, team, actions);
    }

    // Relayer version that can commit game actions for any address
    function commitGameActionsRelayer(
        address sender,
        uint256 gameId,
        GameLib.TeamEnum team,
        GameLib.GameAction[] calldata actions
    ) public onlyRelayer gameExists(gameId) {
        _commitGameActions(sender, gameId, team, actions);
    }

    // Internal function that finishes a game by timeout with a specified sender
    function _finishGameByTimeout(
        address sender,
        uint256 gameId
    ) internal gameExists(gameId) {
        GameLib.Game storage game = games[gameId];
        require(game.status == GameLib.GameStatus.ACTIVE, "Game is not active");
        require(
            teams[game.team1.teamId].wallet == sender ||
                teams[game.team2.teamId].wallet == sender,
            "Your wallet is not participating in the game"
        );
        require(
            game.team1.actions.length == 0 || game.team2.actions.length == 0,
            "All moves has been made - cannot finish game by timeout"
        );
        require(
            game.lastMoveAt + GameLib.MAX_MOVE_TIME < block.timestamp,
            "Timeout is not reached"
        );
        require(
            game.lastMoveTeam != GameLib.TeamEnum.NONE,
            "Both teams have not made any moves"
        );

        _finishGame(gameId, GameLib.FinishReason.MOVE_TIMEOUT);
    }

    // Public wrapper that calls internal function with msg.sender
    function finishGameByTimeout(uint256 gameId) public gameExists(gameId) {
        _finishGameByTimeout(msg.sender, gameId);
    }

    // Relayer version that can finish game by timeout for any address
    function finishGameByTimeoutRelayer(
        address sender,
        uint256 gameId
    ) public onlyRelayer gameExists(gameId) {
        _finishGameByTimeout(sender, gameId);
    }

    function _finishGame(
        uint256 gameId,
        GameLib.FinishReason finishReason
    ) internal {
        GameLib.Game storage game = games[gameId];
        GameLib.finishGame(
            game,
            teams[game.team1.teamId],
            teams[game.team2.teamId],
            finishReason
        );

        // Update ELO ratings if game finished normally (not by timeout)
        if (finishReason == GameLib.FinishReason.MAX_MOVES_REACHED) {
            _updateEloRatings(gameId);
        }

        activeGameCount--;
        emit GameFinished(gameId, game.winner, finishReason);
    }

    error GameError(
        uint256 gameId,
        GameLib.TeamEnum cauzedByTeam,
        string errorMsg
    );

    function setGameError(
        uint256 gameId,
        GameLib.TeamEnum cauzedByTeam,
        ErrorType errorType,
        string memory errorMsg
    ) public onlyGelato {
        if (
            errorType == ErrorType.MOVE_VALIDATION_ERROR &&
            cauzedByTeam != GameLib.TeamEnum.NONE
        ) {
            GameLib.Game storage game = games[gameId];

            if (cauzedByTeam == GameLib.TeamEnum.TEAM1) {
                game.lastMoveTeam = GameLib.TeamEnum.TEAM2;
            } else if (cauzedByTeam == GameLib.TeamEnum.TEAM2) {
                game.lastMoveTeam = GameLib.TeamEnum.TEAM1;
            }
        }

        emit GameStateError(
            gameId,
            cauzedByTeam,
            errorType,
            block.timestamp,
            errorMsg
        );
    }

    function newGameState(
        uint256 gameId,
        GameLib.GameState calldata gameState
    ) public gameExists(gameId) onlyGelato {
        GameLib.Game storage game = games[gameId];

        GameLib.newGameState(game, gameState);
        emit NewGameState(gameId, block.timestamp, gameState);

        if (gameState.stateType == GameLib.StateType.GOAL_TEAM1) {
            emit GoalScored(gameId, GameLib.TeamEnum.TEAM1);
        } else if (gameState.stateType == GameLib.StateType.GOAL_TEAM2) {
            emit GoalScored(gameId, GameLib.TeamEnum.TEAM2);
        }

        if (game.movesMade >= GameLib.MAX_MOVES) {
            _finishGame(gameId, GameLib.FinishReason.MAX_MOVES_REACHED);
        }
    }

    // View functions for accessing game data
    function getGame(
        uint256 gameId
    ) public view gameExists(gameId) returns (GameLib.Game memory) {
        return games[gameId];
    }

    function getTeam(uint256 teamId) public view returns (GameLib.Team memory) {
        require(teams[teamId].id > 0, "Team does not exist");
        return teams[teamId];
    }

    function getGameRequest(
        uint256 requestId
    ) public view returns (GameLib.GameRequest memory) {
        require(
            gameRequests[requestId].createdAt > 0,
            "Game request does not exist"
        );
        return gameRequests[requestId];
    }

    function getTeamIdByWallet(address wallet) public view returns (uint256) {
        return teamIdByWallet[wallet];
    }

    modifier gameExists(uint256 gameId) {
        require(games[gameId].createdAt > 0, "Game does not exist");
        _;
    }

    modifier teamExists(uint256 teamId) {
        require(teams[teamId].id > 0, "Team does not exist");
        _;
    }

    modifier onlyGelato() {
        require(
            msg.sender == gelatoAddress,
            "Only gelato can call this function"
        );
        _;
    }

    modifier onlyRelayer() {
        require(
            msg.sender == relayerAddress,
            "Only relayer can call this function"
        );
        _;
    }

    /**
     * @dev Update ELO ratings for both teams after a game
     * @param gameId The ID of the finished game
     */
    function _updateEloRatings(uint256 gameId) private {
        GameLib.Game storage game = games[gameId];
        GameLib.Team storage team1 = teams[game.team1.teamId];
        GameLib.Team storage team2 = teams[game.team2.teamId];

        // Calculate new ELO ratings
        (uint64 team1EloRatingNew, uint64 team2EloRatingNew) = EloCalculationLib
            .calculateNewRatings(
                game.team1.eloRating,
                game.team2.eloRating,
                game.team1.score,
                game.team2.score
            );

        // Update team ratings
        team1.eloRating = team1EloRatingNew;
        team2.eloRating = team2EloRatingNew;

        // Update game team info
        game.team1.eloRatingNew = team1EloRatingNew;
        game.team2.eloRatingNew = team2EloRatingNew;
    }
}
