export const SmartContractABI = [
    {
        "name": "gameActionCommitted",
        "type": "event",
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "gameId",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "time",
                "type": "uint256"
            },
            {
                "components": [
                    {
                        "internalType": "uint256",
                        "name": "playerId",
                        "type": "uint256"
                    },
                    {
                        "internalType": "enum GameLib.MoveType",
                        "name": "moveType",
                        "type": "uint8"
                    },
                    {
                        "components": [
                            {
                                "internalType": "uint8",
                                "name": "x",
                                "type": "uint8"
                            },
                            {
                                "internalType": "uint8",
                                "name": "y",
                                "type": "uint8"
                            }
                        ],
                        "internalType": "struct GameLib.Position",
                        "name": "oldPosition",
                        "type": "tuple"
                    },
                    {
                        "components": [
                            {
                                "internalType": "uint8",
                                "name": "x",
                                "type": "uint8"
                            },
                            {
                                "internalType": "uint8",
                                "name": "y",
                                "type": "uint8"
                            }
                        ],
                        "internalType": "struct GameLib.Position",
                        "name": "newPosition",
                        "type": "tuple"
                    }
                ],
                "indexed": false,
                "internalType": "struct GameLib.GameAction[]",
                "name": "team1Actions",
                "type": "tuple[]"
            },
            {
                "components": [
                    {
                        "internalType": "uint256",
                        "name": "playerId",
                        "type": "uint256"
                    },
                    {
                        "internalType": "enum GameLib.MoveType",
                        "name": "moveType",
                        "type": "uint8"
                    },
                    {
                        "components": [
                            {
                                "internalType": "uint8",
                                "name": "x",
                                "type": "uint8"
                            },
                            {
                                "internalType": "uint8",
                                "name": "y",
                                "type": "uint8"
                            }
                        ],
                        "internalType": "struct GameLib.Position",
                        "name": "oldPosition",
                        "type": "tuple"
                    },
                    {
                        "components": [
                            {
                                "internalType": "uint8",
                                "name": "x",
                                "type": "uint8"
                            },
                            {
                                "internalType": "uint8",
                                "name": "y",
                                "type": "uint8"
                            }
                        ],
                        "internalType": "struct GameLib.Position",
                        "name": "newPosition",
                        "type": "tuple"
                    }
                ],
                "indexed": false,
                "internalType": "struct GameLib.GameAction[]",
                "name": "team2Actions",
                "type": "tuple[]"
            }
        ],
    },
    {
        "name": "getGame",
        "type": "function",
        "stateMutability": "view",
        "inputs": [
            {
                "internalType": "uint256",
                "name": "gameId",
                "type": "uint256"
            }
        ],
        "outputs": [
            {
                "components": [
                    {
                        "internalType": "uint256",
                        "name": "gameId",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "team1id",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "team2id",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "createdAt",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "lastMoveAt",
                        "type": "uint256"
                    },
                    {
                        "internalType": "enum GameLib.TeamEnum",
                        "name": "lastMoveTeam",
                        "type": "uint8"
                    },
                    {
                        "internalType": "uint8",
                        "name": "team1Score",
                        "type": "uint8"
                    },
                    {
                        "internalType": "uint8",
                        "name": "team2score",
                        "type": "uint8"
                    },
                    {
                        "components": [
                            {
                                "components": [
                                    {
                                        "internalType": "uint8",
                                        "name": "x",
                                        "type": "uint8"
                                    },
                                    {
                                        "internalType": "uint8",
                                        "name": "y",
                                        "type": "uint8"
                                    }
                                ],
                                "internalType": "struct GameLib.Position[]",
                                "name": "team1Positions",
                                "type": "tuple[]"
                            },
                            {
                                "components": [
                                    {
                                        "internalType": "uint8",
                                        "name": "x",
                                        "type": "uint8"
                                    },
                                    {
                                        "internalType": "uint8",
                                        "name": "y",
                                        "type": "uint8"
                                    }
                                ],
                                "internalType": "struct GameLib.Position[]",
                                "name": "team2Positions",
                                "type": "tuple[]"
                            },
                            {
                                "components": [
                                    {
                                        "internalType": "uint8",
                                        "name": "x",
                                        "type": "uint8"
                                    },
                                    {
                                        "internalType": "uint8",
                                        "name": "y",
                                        "type": "uint8"
                                    }
                                ],
                                "internalType": "struct GameLib.Position",
                                "name": "ballPosition",
                                "type": "tuple"
                            },
                            {
                                "internalType": "enum GameLib.TeamEnum",
                                "name": "ballOwner",
                                "type": "uint8"
                            },
                            {
                                "internalType": "uint8[]",
                                "name": "clashRandomResults",
                                "type": "uint8[]"
                            },
                            {
                                "internalType": "string",
                                "name": "stateType",
                                "type": "string"
                            }
                        ],
                        "internalType": "struct GameLib.GameState[]",
                        "name": "history",
                        "type": "tuple[]"
                    },
                    {
                        "internalType": "enum GameLib.GameStatus",
                        "name": "status",
                        "type": "uint8"
                    },
                    {
                        "components": [
                            {
                                "internalType": "uint256",
                                "name": "playerId",
                                "type": "uint256"
                            },
                            {
                                "internalType": "enum GameLib.MoveType",
                                "name": "moveType",
                                "type": "uint8"
                            },
                            {
                                "components": [
                                    {
                                        "internalType": "uint8",
                                        "name": "x",
                                        "type": "uint8"
                                    },
                                    {
                                        "internalType": "uint8",
                                        "name": "y",
                                        "type": "uint8"
                                    }
                                ],
                                "internalType": "struct GameLib.Position",
                                "name": "oldPosition",
                                "type": "tuple"
                            },
                            {
                                "components": [
                                    {
                                        "internalType": "uint8",
                                        "name": "x",
                                        "type": "uint8"
                                    },
                                    {
                                        "internalType": "uint8",
                                        "name": "y",
                                        "type": "uint8"
                                    }
                                ],
                                "internalType": "struct GameLib.Position",
                                "name": "newPosition",
                                "type": "tuple"
                            }
                        ],
                        "internalType": "struct GameLib.GameAction[]",
                        "name": "team1Actions",
                        "type": "tuple[]"
                    },
                    {
                        "components": [
                            {
                                "internalType": "uint256",
                                "name": "playerId",
                                "type": "uint256"
                            },
                            {
                                "internalType": "enum GameLib.MoveType",
                                "name": "moveType",
                                "type": "uint8"
                            },
                            {
                                "components": [
                                    {
                                        "internalType": "uint8",
                                        "name": "x",
                                        "type": "uint8"
                                    },
                                    {
                                        "internalType": "uint8",
                                        "name": "y",
                                        "type": "uint8"
                                    }
                                ],
                                "internalType": "struct GameLib.Position",
                                "name": "oldPosition",
                                "type": "tuple"
                            },
                            {
                                "components": [
                                    {
                                        "internalType": "uint8",
                                        "name": "x",
                                        "type": "uint8"
                                    },
                                    {
                                        "internalType": "uint8",
                                        "name": "y",
                                        "type": "uint8"
                                    }
                                ],
                                "internalType": "struct GameLib.Position",
                                "name": "newPosition",
                                "type": "tuple"
                            }
                        ],
                        "internalType": "struct GameLib.GameAction[]",
                        "name": "team2Actions",
                        "type": "tuple[]"
                    },
                    {
                        "internalType": "uint8",
                        "name": "movesMade",
                        "type": "uint8"
                    },
                    {
                        "internalType": "enum GameLib.TeamEnum",
                        "name": "winner",
                        "type": "uint8"
                    }
                ],
                "internalType": "struct GameLib.Game",
                "name": "",
                "type": "tuple"
            }
        ]
    },
    {
        "name": "newGameState",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
        "inputs": [
            {
                "internalType": "uint256",
                "name": "gameId",
                "type": "uint256"
            },
            {
                "components": [
                    {
                        "components": [
                            {
                                "internalType": "uint8",
                                "name": "x",
                                "type": "uint8"
                            },
                            {
                                "internalType": "uint8",
                                "name": "y",
                                "type": "uint8"
                            }
                        ],
                        "internalType": "struct GameLib.Position[]",
                        "name": "team1Positions",
                        "type": "tuple[]"
                    },
                    {
                        "components": [
                            {
                                "internalType": "uint8",
                                "name": "x",
                                "type": "uint8"
                            },
                            {
                                "internalType": "uint8",
                                "name": "y",
                                "type": "uint8"
                            }
                        ],
                        "internalType": "struct GameLib.Position[]",
                        "name": "team2Positions",
                        "type": "tuple[]"
                    },
                    {
                        "components": [
                            {
                                "internalType": "uint8",
                                "name": "x",
                                "type": "uint8"
                            },
                            {
                                "internalType": "uint8",
                                "name": "y",
                                "type": "uint8"
                            }
                        ],
                        "internalType": "struct GameLib.Position",
                        "name": "ballPosition",
                        "type": "tuple"
                    },
                    {
                        "internalType": "enum GameLib.TeamEnum",
                        "name": "ballOwner",
                        "type": "uint8"
                    },
                    {
                        "internalType": "uint8[]",
                        "name": "clashRandomResults",
                        "type": "uint8[]"
                    },
                    {
                        "internalType": "string",
                        "name": "stateType",
                        "type": "string"
                    }
                ],
                "internalType": "struct GameLib.GameState",
                "name": "gameState",
                "type": "tuple"
            },
            {
                "internalType": "string",
                "name": "errorMsg",
                "type": "string"
            }
        ]
    },
    {
        "name": "recordTeamScore",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
        "inputs": [
            {
                "internalType": "uint256",
                "name": "gameId",
                "type": "uint256"
            },
            {
                "internalType": "enum GameLib.TeamEnum",
                "name": "team",
                "type": "uint8"
            }
        ]
    },
];