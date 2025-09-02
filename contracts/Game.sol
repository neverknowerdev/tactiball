// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./GameLib.sol";
import "./vendor/Elo.sol";

// ========================================
// CUSTOM ERRORS
// ========================================

error DoesNotExist();
error InitAddressCannotBeZero();
error CreateTeam_TeamAlreadyExists();
error CreateTeam_NameIsRequired();
error CreateTeam_TeamNameAlreadyExists();
error TeamsCannotBeSame();
error GameOwnerShouldCall();
error TeamAlreadyHasActiveGame();
error GameIsNotActive();
error MovesAlreadyCommitted();
error OnlyRelayerCanCall();
error OnlyGelatoCanCall();
error GameRequestNotExpired();
error GameRequestTimeoutNotReached();
error ActionsNotCommitted();
error FinishGameByTimeout_NoLastMove();
error GameHasNotReachedMaxMoves();
error OnlyGameEngineServerCanCall();
error InvalidTeam();

contract ChessBallGame is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    using GameLib for *;

    // ========================================
    // STATE VARIABLES
    // ========================================

    // Gelato address for automation
    address public gelatoAddress;
    address public relayerAddress;
    address public gameEngineServerAddress;

    // State variables
    mapping(uint256 => GameLib.Game) public games;
    mapping(uint256 => GameLib.Team) public teams;
    mapping(address => uint256) public teamIdByWallet;

    uint256 public nextGameId;
    uint256 public nextTeamId;

    uint256[] public activeGames;

    // Game request mappings
    mapping(uint256 => GameLib.GameRequest) public gameRequests;
    uint256 public gameRequestIndex;

    mapping(string => bool) public teamNames;

    uint256[100] private __gap;

    // ========================================
    // EVENTS
    // ========================================

    event GameStarted(
        uint256 indexed gameId,
        uint256 indexed team1id,
        uint256 indexed team2id,
        GameLib.TeamEnum teamWithBall
    );
    event TeamCreated(
        uint256 indexed teamId,
        address indexed owner,
        string name,
        uint8 country
    );
    event GoalScored(uint256 indexed gameId, GameLib.TeamEnum scoringTeam);
    event GameFinished(
        uint256 indexed gameId,
        GameLib.TeamEnum winner,
        GameLib.FinishReason finishReason
    );
    event gameActionCommitted(uint256 indexed gameId, uint256 timestamp);
    event NewGameState(
        uint256 indexed gameId,
        GameLib.StateType stateType,
        uint256 time,
        uint8[] clashRandomNumbers,
        GameLib.GameAction[] team1Actions,
        GameLib.GameAction[] team2Actions,
        GameLib.Position ballPosition,
        GameLib.TeamEnum ballOwner
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
    event GameRequestCreated(
        uint256 gameRequestId,
        uint256 team1id,
        uint256 team2id
    );
    event GameRequestCancelled(
        uint256 gameRequestId,
        uint256 team1id,
        uint256 team2id
    );
    // ========================================
    // CONSTRUCTOR & INITIALIZATION
    // ========================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializer function to set the Gelato address
     * @param _gelatoAddress The address of the Gelato automation service
     * @param _relayerAddress The address of the relayer service
     * @param _gameEngineServerAddress The address of the game engine server
     */
    function initialize(
        address _gelatoAddress,
        address _relayerAddress,
        address _gameEngineServerAddress
    ) public initializer {
        if (_gelatoAddress == address(0)) revert InitAddressCannotBeZero();
        if (_relayerAddress == address(0)) revert InitAddressCannotBeZero();
        if (_gameEngineServerAddress == address(0))
            revert InitAddressCannotBeZero();
        gelatoAddress = _gelatoAddress;
        relayerAddress = _relayerAddress;
        gameEngineServerAddress = _gameEngineServerAddress;
        __Ownable_init(msg.sender);
    }

    /**
     * @dev Required by the OZ UUPS module
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    // ========================================
    // CREATE TEAM
    // ========================================

    // Internal function that creates a team with a specified sender
    function _createTeam(
        address sender,
        string memory name,
        uint8 country
    ) internal {
        if (teamIdByWallet[sender] > 0) revert CreateTeam_TeamAlreadyExists();
        if (bytes(name).length == 0) revert CreateTeam_NameIsRequired();

        name = GameLib.trimSpaces(name);
        if (teamNames[name]) revert CreateTeam_TeamNameAlreadyExists();

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

        emit TeamCreated(team.id, sender, name, country);
    }

    // Public wrapper that calls internal function with msg.sender
    function createTeam(string memory name, uint8 country) public {
        _createTeam(msg.sender, name, country);
    }

    // Relayer version that can create team for any address
    function createTeamRelayer(
        address sender,
        string memory name,
        uint8 country
    ) public onlyRelayer {
        _createTeam(sender, name, country);
    }

    // ========================================
    // CREATE GAME REQUEST
    // ========================================

    // Internal function that creates a game request with a specified sender
    function _createGameRequest(
        address sender,
        uint256 team1id,
        uint256 team2id
    ) internal {
        if (teams[team1id].id == 0) revert DoesNotExist();
        if (teams[team2id].id == 0) revert DoesNotExist();
        if (teams[team1id].id == teams[team2id].id) revert TeamsCannotBeSame();
        if (teams[team1id].wallet != sender) revert GameOwnerShouldCall();

        if (teams[team2id].hasActiveGame) revert TeamAlreadyHasActiveGame();

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

        emit GameRequestCreated(request.gameRequestId, team1id, team2id);
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
        if (gameRequestId == 0) revert DoesNotExist();
        if (gameRequests[gameRequestId].createdAt == 0) revert DoesNotExist();
        if (teams[gameRequests[gameRequestId].team1id].wallet != sender)
            revert GameOwnerShouldCall();
        if (
            gameRequests[gameRequestId].createdAt + 1 minutes >= block.timestamp
        ) revert GameRequestNotExpired();

        uint256 team1id = gameRequests[gameRequestId].team1id;
        uint256 team2id = gameRequests[gameRequestId].team2id;

        GameLib.cancelGameRequest(gameRequests, teams, gameRequestId);

        emit GameRequestCancelled(gameRequestId, team1id, team2id);
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

    // ========================================
    // START GAME
    // ========================================

    // Internal function that starts a game with a specified sender
    function _startGame(address sender, uint256 gameRequestId) internal {
        if (gameRequests[gameRequestId].createdAt == 0) revert DoesNotExist();
        if (teams[gameRequests[gameRequestId].team2id].wallet != sender)
            revert GameOwnerShouldCall();

        if (teams[gameRequests[gameRequestId].team1id].hasActiveGame)
            revert TeamAlreadyHasActiveGame();
        if (teams[gameRequests[gameRequestId].team2id].hasActiveGame)
            revert TeamAlreadyHasActiveGame();

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

        activeGames.push(game.gameId);

        emit GameStarted(game.gameId, team1id, team2id, GameLib.TeamEnum.TEAM1);
        // emit with empty arrays to trigger the game worker at the game start
        emit gameActionCommitted(game.gameId, block.timestamp);
    }

    function testTriggerGameActionCommitted(uint256 gameId) public onlyOwner {
        emit gameActionCommitted(gameId, block.timestamp);
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

    // ========================================
    // MAKING MOVE
    // ========================================

    // Internal function that commits game actions with a specified sender
    function _commitGameActions(
        address sender,
        uint256 gameId,
        GameLib.TeamEnum team
    ) internal gameExists(gameId) {
        GameLib.Game storage game = games[gameId];
        if (game.status != GameLib.GameStatus.ACTIVE) revert GameIsNotActive();
        if (team == GameLib.TeamEnum.NONE) revert InvalidTeam();
        if (team == GameLib.TeamEnum.TEAM1 && game.gameState.team1MadeMove)
            revert MovesAlreadyCommitted();
        if (team == GameLib.TeamEnum.TEAM2 && game.gameState.team2MadeMove)
            revert MovesAlreadyCommitted();

        if (team == GameLib.TeamEnum.TEAM1) {
            if (teams[game.team1.teamId].wallet != sender)
                revert GameOwnerShouldCall();
        } else if (team == GameLib.TeamEnum.TEAM2) {
            if (teams[game.team2.teamId].wallet != sender)
                revert GameOwnerShouldCall();
        }

        if (game.gameState.movesMade >= GameLib.MAX_MOVES) {
            _finishGame(gameId, GameLib.FinishReason.MAX_MOVES_REACHED);
            return;
        }

        bool bothTeamsCommitted = GameLib.commitGameActions(
            game.gameState,
            team
        );

        if (bothTeamsCommitted) {
            emit gameActionCommitted(gameId, block.timestamp);
        }
    }

    // Public wrapper that calls internal function with msg.sender
    // function commitGameActions(uint256 gameId, GameLib.TeamEnum team) public {
    //     _commitGameActions(msg.sender, gameId, team);
    // }

    // Relayer version that can commit game actions for any address
    function commitGameActionsRelayer(
        address sender,
        uint256 gameId,
        GameLib.TeamEnum team
    ) public onlyRelayer {
        _commitGameActions(sender, gameId, team);
    }

    // ========================================
    // FINISH GAME
    // ========================================

    // Internal function that finishes a game by timeout with a specified sender
    function _finishGameByTimeout(
        address sender,
        uint256 gameId
    ) internal gameExists(gameId) {
        GameLib.Game storage game = games[gameId];
        if (game.status != GameLib.GameStatus.ACTIVE) revert GameIsNotActive();
        if (
            teams[game.team1.teamId].wallet != sender &&
            teams[game.team2.teamId].wallet != sender
        ) revert GameOwnerShouldCall();
        if (
            game.gameState.team1MadeMove == false ||
            game.gameState.team2MadeMove == false
        ) revert ActionsNotCommitted();
        if (
            game.gameState.lastMoveAt + GameLib.MAX_MOVE_TIME >= block.timestamp
        ) revert GameRequestTimeoutNotReached();
        if (game.gameState.lastMoveTeam == GameLib.TeamEnum.NONE)
            revert FinishGameByTimeout_NoLastMove();

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
        if (
            finishReason == GameLib.FinishReason.MAX_MOVES_REACHED &&
            game.gameState.movesMade < GameLib.MAX_MOVES
        ) {
            revert GameHasNotReachedMaxMoves();
        }

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

        _removeGameFromActiveGames(gameId);
        emit GameFinished(gameId, game.winner, finishReason);
    }

    /**
     * @dev Remove a game ID from the activeGames array
     * @param gameId The ID of the game to remove
     */
    function _removeGameFromActiveGames(uint256 gameId) private {
        for (uint256 i = 0; i < activeGames.length; i++) {
            if (activeGames[i] == gameId) {
                // Replace the element to remove with the last element and pop
                activeGames[i] = activeGames[activeGames.length - 1];
                activeGames.pop();
                break;
            }
        }
    }

    // ========================================
    // GELATO ORACLE FUNCTIONS
    // ========================================

    function setGameError(
        uint256 gameId,
        GameLib.TeamEnum cauzedByTeam,
        ErrorType errorType,
        string memory errorMsg
    ) public onlyGameEngine {
        if (
            errorType == ErrorType.MOVE_VALIDATION_ERROR &&
            cauzedByTeam != GameLib.TeamEnum.NONE
        ) {
            GameLib.Game storage game = games[gameId];

            if (cauzedByTeam == GameLib.TeamEnum.TEAM1) {
                game.gameState.lastMoveTeam = GameLib.TeamEnum.TEAM2;
            } else if (cauzedByTeam == GameLib.TeamEnum.TEAM2) {
                game.gameState.lastMoveTeam = GameLib.TeamEnum.TEAM1;
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
        GameLib.StateType stateType,
        uint8[] calldata clashRandomNumbers,
        GameLib.GameAction[] calldata team1Actions,
        GameLib.GameAction[] calldata team2Actions,
        GameLib.Position calldata ballPosition,
        GameLib.TeamEnum ballOwner
    ) public gameExists(gameId) onlyGameEngine {
        GameLib.Game storage game = games[gameId];

        if (game.status != GameLib.GameStatus.ACTIVE) revert GameIsNotActive();

        if (game.gameState.movesMade > 0) {
            if (
                game.gameState.team1MadeMove == false ||
                game.gameState.team2MadeMove == false
            ) revert ActionsNotCommitted();
        }

        game.gameState = GameLib.GameState({
            movesMade: game.gameState.movesMade + 1,
            lastMoveAt: uint64(block.timestamp),
            team1MadeMove: false,
            team2MadeMove: false,
            lastMoveTeam: GameLib.TeamEnum.NONE,
            team1score: stateType == GameLib.StateType.GOAL_TEAM1
                ? game.gameState.team1score + 1
                : game.gameState.team1score,
            team2score: stateType == GameLib.StateType.GOAL_TEAM2
                ? game.gameState.team2score + 1
                : game.gameState.team2score
        });

        if (stateType == GameLib.StateType.GOAL_TEAM1) {
            emit GoalScored(gameId, GameLib.TeamEnum.TEAM1);
        } else if (stateType == GameLib.StateType.GOAL_TEAM2) {
            emit GoalScored(gameId, GameLib.TeamEnum.TEAM2);
        }

        emit NewGameState(
            game.gameId,
            stateType,
            block.timestamp,
            clashRandomNumbers,
            team1Actions,
            team2Actions,
            ballPosition,
            ballOwner
        );

        if (game.gameState.movesMade >= GameLib.MAX_MOVES) {
            _finishGame(gameId, GameLib.FinishReason.MAX_MOVES_REACHED);
        }
    }

    // ========================================
    // VIEW FUNCTIONS
    // ========================================

    // View functions for accessing game data
    function getGame(
        uint256 gameId
    ) public view gameExists(gameId) returns (GameLib.Game memory) {
        return games[gameId];
    }

    function getGameStatus(
        uint256 gameId
    ) public view gameExists(gameId) returns (GameLib.GameStatus) {
        return games[gameId].status;
    }

    function getTeam(uint256 teamId) public view returns (GameLib.Team memory) {
        if (teams[teamId].id == 0) revert DoesNotExist();
        return teams[teamId];
    }

    function getGameRequest(
        uint256 requestId
    ) public view returns (GameLib.GameRequest memory) {
        if (gameRequests[requestId].createdAt == 0) revert DoesNotExist();
        return gameRequests[requestId];
    }

    function getTeamIdByWallet(address wallet) public view returns (uint256) {
        return teamIdByWallet[wallet];
    }

    function getActiveGames() public view returns (uint256[] memory) {
        return activeGames;
    }

    function getActiveGameCount() public view returns (uint256) {
        return activeGames.length;
    }

    /**
     * @dev Get the last N games of a team
     * @param teamId The ID of the team
     * @param n The number of recent games to return
     * @return An array of Game structs representing the last N games
     */
    function getLastNGames(
        uint256 teamId,
        uint256 n
    ) public view teamExists(teamId) returns (GameLib.Game[] memory) {
        GameLib.Team storage team = teams[teamId];
        uint256 totalGames = team.games.length;

        if (totalGames == 0) {
            return new GameLib.Game[](0);
        }

        // If n is greater than total games, return all games
        if (n >= totalGames) {
            GameLib.Game[] memory allGames = new GameLib.Game[](totalGames);
            for (uint256 i = 0; i < totalGames; i++) {
                allGames[i] = games[team.games[i]];
            }
            return allGames;
        }

        // Create array for last N games
        GameLib.Game[] memory lastNGames = new GameLib.Game[](n);

        // Copy the last N games (games are stored in chronological order)
        for (uint256 i = 0; i < n; i++) {
            uint256 gameId = team.games[totalGames - n + i];
            lastNGames[i] = games[gameId];
        }

        return lastNGames;
    }

    // ========================================
    // ELO RATING
    // ========================================

    /**
     * @dev Update ELO ratings for both teams after a game
     * @param gameId The ID of the finished game
     */
    function _updateEloRatings(uint256 gameId) private {
        GameLib.Game storage game = games[gameId];
        GameLib.Team storage team1 = teams[game.team1.teamId];
        GameLib.Team storage team2 = teams[game.team2.teamId];

        uint256 result = 50;
        if (game.gameState.team1score > game.gameState.team2score) {
            result = 100;
        } else if (game.gameState.team1score < game.gameState.team2score) {
            result = 0;
        }

        if (team1.games.length == 0 && team1.eloRating == 100) {
            team1.eloRating = 10000;
            if (game.team1.eloRating == 100) {
                game.team1.eloRating = 10000;
            }
        }
        if (team2.games.length == 0 && team2.eloRating == 100) {
            team2.eloRating = 10000;
            if (game.team2.eloRating == 100) {
                game.team2.eloRating = 10000;
            }
        }

        (uint256 change, bool negative) = Elo.ratingChange(
            game.team1.eloRating,
            game.team2.eloRating,
            result,
            20
        );

        // team2 win
        if (negative) {
            team2.eloRating += uint64(change);
            team1.eloRating -= uint64(change);
        } else {
            team1.eloRating += uint64(change);
            team2.eloRating -= uint64(change);
        }

        // Apply minimum ELO limit (50 = 5000 with 2 decimal precision)
        if (team1.eloRating < 5000) {
            team1.eloRating = 5000;
        }
        if (team2.eloRating < 5000) {
            team2.eloRating = 5000;
        }

        // Update game team info
        game.team1.eloRatingNew = team1.eloRating;
        game.team2.eloRatingNew = team2.eloRating;
    }

    // ========================================
    // MODIFIERS
    // ========================================

    modifier gameExists(uint256 gameId) {
        if (games[gameId].createdAt == 0) revert DoesNotExist();
        _;
    }

    modifier teamExists(uint256 teamId) {
        if (teams[teamId].id == 0) revert DoesNotExist();
        _;
    }

    modifier onlyGelato() {
        if (msg.sender != gelatoAddress) revert OnlyGelatoCanCall();
        _;
    }

    modifier onlyGameEngine() {
        if (
            msg.sender != gameEngineServerAddress && msg.sender != gelatoAddress
        ) revert OnlyGameEngineServerCanCall();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayerAddress) revert OnlyRelayerCanCall();
        _;
    }
}
