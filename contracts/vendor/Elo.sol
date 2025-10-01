// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

/**
 * @title Elo
 * @notice A simplified and more robust ELO rating calculation library
 * @dev Uses lookup tables and bounded arithmetic to avoid overflow/underflow issues
 */
library Elo {
    /// @notice Maximum rating difference we can handle (prevents overflow)
    uint256 private constant MAX_RATING_DIFF = 800;

    /// @notice Scale factor for precision (2 decimal places)
    uint256 private constant SCALE = 100;

    /// @notice Lookup table for expected scores based on rating difference
    /// @dev Maps rating difference (in steps of 25) to expected score * 100
    /// Based on formula: 1 / (1 + 10^(ratingDiff/400))
    function getExpectedScore(
        uint256 ratingDiff
    ) private pure returns (uint256) {
        // For rating differences, we use a piecewise approximation
        // This avoids complex power calculations that cause overflows

        if (ratingDiff == 0) return 50; // Equal ratings = 50% expected
        if (ratingDiff >= 800) return ratingDiff == 800 ? 1 : 0; // Extreme difference

        // Lookup table for common rating differences (every 25 points)
        // Values represent expected score * 100
        if (ratingDiff <= 25) return 46;
        if (ratingDiff <= 50) return 42;
        if (ratingDiff <= 75) return 39;
        if (ratingDiff <= 100) return 36;
        if (ratingDiff <= 125) return 33;
        if (ratingDiff <= 150) return 30;
        if (ratingDiff <= 175) return 27;
        if (ratingDiff <= 200) return 24;
        if (ratingDiff <= 225) return 22;
        if (ratingDiff <= 250) return 20;
        if (ratingDiff <= 275) return 18;
        if (ratingDiff <= 300) return 16;
        if (ratingDiff <= 350) return 13;
        if (ratingDiff <= 400) return 10;
        if (ratingDiff <= 450) return 8;
        if (ratingDiff <= 500) return 6;
        if (ratingDiff <= 600) return 4;
        if (ratingDiff <= 700) return 2;

        return 1; // rating diff between 700-800
    }

    /**
     * @notice Calculates the change in ELO rating after a game outcome
     * @param ratingA The ELO rating of player A
     * @param ratingB The ELO rating of player B
     * @param score The score of player A, scaled by 100. 100 = win, 50 = draw, 0 = loss
     * @param kFactor The k-factor or development multiplier (typically 20-32)
     * @return change The change in ELO rating of player A, with 2 decimals of precision
     * @return negative Whether the change is negative (rating decreased)
     */
    function ratingChange(
        uint256 ratingA,
        uint256 ratingB,
        uint256 score,
        uint256 kFactor
    ) internal pure returns (uint256 change, bool negative) {
        require(score <= 100, "Score must be <= 100");
        require(kFactor > 0 && kFactor <= 100, "Invalid K-factor");

        // Calculate rating difference (absolute value)
        uint256 ratingDiff;
        bool aIsHigher = ratingA > ratingB;

        unchecked {
            ratingDiff = aIsHigher ? ratingA - ratingB : ratingB - ratingA;
        }

        // Bound the rating difference to prevent overflow
        if (ratingDiff > MAX_RATING_DIFF) {
            ratingDiff = MAX_RATING_DIFF;
        }

        // Get expected score for player A (scaled by 100)
        // If A is higher rated, they're expected to win more
        // If B is higher rated, A is expected to win less
        uint256 expectedScore = aIsHigher
            ? (100 - getExpectedScore(ratingDiff)) // A expected to win
            : getExpectedScore(ratingDiff); // B expected to win

        // Calculate rating change: kFactor * (actualScore - expectedScore)
        // Both score and expectedScore are already scaled by 100
        uint256 scoreDiff;

        unchecked {
            if (score >= expectedScore) {
                negative = false;
                scoreDiff = score - expectedScore;
            } else {
                negative = true;
                scoreDiff = expectedScore - score;
            }

            // change = kFactor * scoreDiff / 100 (to account for score scaling)
            // Result is scaled by 100 for 2 decimal precision
            change = (kFactor * scoreDiff);
        }
    }

    /**
     * @notice Apply rating change to a player's current rating
     * @param currentRating The current ELO rating
     * @param change The rating change amount (scaled by 100)
     * @param negative Whether the change is negative
     * @return newRating The updated rating
     */
    function applyRatingChange(
        uint256 currentRating,
        uint256 change,
        bool negative
    ) internal pure returns (uint256 newRating) {
        // Unscale the change (divide by 100 for 2 decimal precision)
        uint256 actualChange = change / SCALE;

        unchecked {
            if (negative) {
                // Prevent underflow - minimum rating of 0
                newRating = actualChange > currentRating
                    ? 0
                    : currentRating - actualChange;
            } else {
                // Cap maximum rating to prevent overflow
                uint256 maxRating = type(uint256).max - actualChange;
                newRating = currentRating > maxRating
                    ? type(uint256).max
                    : currentRating + actualChange;
            }
        }
    }
}
