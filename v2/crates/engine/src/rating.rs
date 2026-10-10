//! ELO with goal margin, ported from `contracts/vendor/Elo.sol` with the same
//! fixed-point maths, plus the rules `ChessBallGame._updateEloRatings` applies
//! around it (K = 32, floor of 5000). Ratings carry two decimals: 10000 = 100.00.

use primitive_types::U256;

pub const DEFAULT_RATING: u64 = 10_000;
pub const MIN_RATING: u64 = 5_000;
pub const K_FACTOR: u64 = 32;
pub const MAX_DELTA: u64 = 10_000;
pub const MAX_GOALS: u8 = 20;

fn sixteenth_root(x: U256) -> U256 {
    x.integer_sqrt().integer_sqrt().integer_sqrt().integer_sqrt()
}

/// `Elo.ratingChange`: score is 0, 50 or 100 (loss, draw, win).
pub fn rating_change(rating_a: u64, rating_b: u64, score: u64, k_factor: u64) -> (u64, bool) {
    assert!(score <= 100, "invalid score");
    let k = U256::from(k_factor) * U256::from(100u8);
    let k_score = U256::from(k_factor) * U256::from(score);
    let k_expected = if rating_a == rating_b {
        k / U256::from(2u8)
    } else {
        let a_higher = rating_a > rating_b;
        let diff = rating_a.abs_diff(rating_b).min(1125);
        let exp_numerator = diff / 25;
        let mut exp_factor = sixteenth_root(U256::from(10u8).pow(U256::from(exp_numerator)));
        if exp_factor.is_zero() {
            exp_factor = U256::one();
        }
        if a_higher {
            (k * exp_factor) / (exp_factor + U256::from(100u8))
        } else {
            k / (U256::from(100u8) + exp_factor)
        }
    };
    let negative = k_score < k_expected;
    let change = if negative { k_expected - k_score } else { k_score - k_expected };
    (change.min(U256::from(MAX_DELTA)).as_u64(), negative)
}

/// `Elo.getGoalMultiplier`, in percent.
pub fn goal_multiplier(goals_a: u8, goals_b: u8) -> u64 {
    match goals_a.abs_diff(goals_b) {
        0 | 1 => 100,
        2 => 150,
        3 => 175,
        _ => 200,
    }
}

/// `Elo.ratingChangeWithGoals`.
pub fn rating_change_with_goals(rating_a: u64, rating_b: u64, goals_a: u8, goals_b: u8, k_factor: u64) -> (u64, bool) {
    let goals_a = goals_a.min(MAX_GOALS);
    let goals_b = goals_b.min(MAX_GOALS);
    let score = match goals_a.cmp(&goals_b) {
        core::cmp::Ordering::Equal => 50,
        core::cmp::Ordering::Greater => 100,
        core::cmp::Ordering::Less => 0,
    };
    let (base, negative) = rating_change(rating_a, rating_b, score, k_factor);
    let change = if goals_a != goals_b { base * goal_multiplier(goals_a, goals_b) / 100 } else { base };
    (change.min(MAX_DELTA), negative)
}

/// New ratings after a finished game, including the v1 contract's floor.
pub fn new_ratings(rating_1: u64, rating_2: u64, goals_1: u8, goals_2: u8) -> (u64, u64) {
    let (c1, n1) = rating_change_with_goals(rating_1, rating_2, goals_1, goals_2, K_FACTOR);
    let (c2, n2) = rating_change_with_goals(rating_2, rating_1, goals_2, goals_1, K_FACTOR);
    let apply = |r: u64, c: u64, neg: bool| if neg { r.saturating_sub(c) } else { r + c };
    (apply(rating_1, c1, n1).max(MIN_RATING), apply(rating_2, c2, n2).max(MIN_RATING))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn draw_between_equal_teams_changes_nothing() {
        assert_eq!(new_ratings(10_000, 10_000, 0, 0), (10_000, 10_000));
    }

    #[test]
    fn one_goal_win_between_equal_teams() {
        // Same as EloCalculation.test.ts: difference ~3200 after 1:0.
        let (a, b) = new_ratings(10_000, 10_000, 1, 0);
        assert_eq!((a, b), (11_600, 8_400));
    }

    #[test]
    fn goal_margin_multiplies() {
        assert_eq!(new_ratings(10_000, 10_000, 3, 0), (12_800, 7_200));
        assert_eq!(new_ratings(10_000, 10_000, 5, 0), (13_200, 6_800));
    }

    #[test]
    fn floor_applies() {
        let (_, b) = new_ratings(5_100, 5_100, 5, 0);
        assert_eq!(b, MIN_RATING);
    }

    #[test]
    fn expected_score_uses_capped_difference() {
        // diff 1000 -> 10^(40/16) = 10^2.5 ~ 316 after integer roots.
        let exp = sixteenth_root(U256::from(10u8).pow(U256::from(40u8))).as_u64();
        assert_eq!(exp, 316);
        let (change, negative) = rating_change(11_000, 10_000, 100, 32);
        // kExpected = 3200 * 316 / 416 = 2430 (floor); kScore = 3200.
        assert_eq!((change, negative), (770, false));
        let (change, negative) = rating_change(10_000, 11_000, 100, 32);
        // kExpected = 3200 / 416 = 7; win against a stronger team.
        assert_eq!((change, negative), (3193, false));
    }
}
