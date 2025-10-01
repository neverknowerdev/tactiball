// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {FixedPointMathLib as fp} from "solmate/src/utils/FixedPointMathLib.sol";

library Elo {
    uint256 public constant MAX_DELTA = 3000; // Example: 30.00 ELO points (scaled by 100)
    uint256 public constant MIN_DELTA = 0; // scaled by 100

    function sixteenthRoot(uint256 x) internal pure returns (uint256) {
        return fp.sqrt(fp.sqrt(fp.sqrt(fp.sqrt(x))));
    }

    function ratingChange(
        uint256 ratingA,
        uint256 ratingB,
        uint256 score,
        uint256 kFactor
    ) internal pure returns (uint256 change, bool negative) {
        require(score <= 100, "Elo: Invalid score (must be 0, 50, or 100)");

        uint256 _kFactor; // scaled up `kFactor` by 100
        uint256 kScore;
        uint256 kExpectedScore;

        bool aIsHigherRated = ratingA > ratingB;
        uint256 absRatingDiff = aIsHigherRated
            ? ratingA - ratingB
            : ratingB - ratingA;

        // Cap absRatingDiff for the exponentiation step to prevent extreme values
        uint256 cappedAbsRatingDiff = absRatingDiff;
        if (cappedAbsRatingDiff > 1125) {
            cappedAbsRatingDiff = 1125;
        }

        unchecked {
            _kFactor = kFactor * 100;
            kScore = kFactor * score; // Actual score with K factor distributed

            uint256 expNumerator = cappedAbsRatingDiff / 25; // Equivalent to (absRatingDiff / 400) * 16
            uint256 expFactor = sixteenthRoot(fp.rpow(10, expNumerator, 1)); // This is 10 ^ (absRatingDiff / 400)

            // Prevent division by zero if diff is huge and expFactor becomes 0
            if (expFactor == 0) expFactor = 1;

            if (aIsHigherRated) {
                // A is higher rated, so B-A is negative
                kExpectedScore = (_kFactor * expFactor) / (expFactor + 100);
            } else {
                // ratingB >= ratingA (A is underdog or equal)
                kExpectedScore = _kFactor / (100 + expFactor);
            }

            // Original logic for change calculation
            negative = kScore < kExpectedScore;
            change = negative
                ? kExpectedScore - kScore
                : kScore - kExpectedScore;

            // Apply MaxDelta cap only in certain cases:
            // 1. When change is positive (player gained points)
            // 2. When player is not a favorite who lost
            if (!(negative && aIsHigherRated)) {
                if (change > MAX_DELTA) {
                    change = MAX_DELTA;
                }
            }

            // Always apply MinDelta cap
            if (change < MIN_DELTA) {
                change = MIN_DELTA;
            }
        }
    }
}
