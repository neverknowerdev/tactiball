// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "./Elo.sol";

contract EloTester {
    function ratingChange(
        uint256 ratingA,
        uint256 ratingB,
        uint256 score,
        uint256 kFactor
    ) external pure returns (uint256 change, bool negative) {
        return Elo.ratingChange(ratingA, ratingB, score, kFactor);
    }

    function getMaxDelta() external pure returns (uint256) {
        return Elo.MAX_DELTA;
    }
}
