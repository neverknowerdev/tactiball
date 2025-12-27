import { expect } from 'chai';
import { pool } from '../../frontend/db/client';
import * as dotenv from 'dotenv';

dotenv.config();

const TEST_TEAM_ID = Number(process.env.TEST_TEAM_ID || 1);

describe('Team Stats Recalculation (DB health)', () => {
    it('should have a valid database connection', async () => {
        const { rows: [{ count }] } = await pool.query<{ count: string }>(
            'SELECT COUNT(*)::int AS count FROM teams'
        );
        expect(Number(count)).to.be.a('number');
    });

    it('should read team_stats view for an existing team if available', async () => {
        const { rows } = await pool.query(
            `SELECT team_id, total_games, wins, draws, losses, last_game_results
             FROM team_stats
             WHERE team_id = $1
             LIMIT 1`,
            [TEST_TEAM_ID]
        );

        if (rows.length === 0) {
            console.warn(`⚠️  No team_stats row found for team ${TEST_TEAM_ID}. Skipping assertions.`);
            return;
        }

        const stats = rows[0];
        // PostgreSQL returns bigint as string, so convert to number for comparison
        expect(Number(stats.team_id)).to.equal(TEST_TEAM_ID);
        expect(Number(stats.total_games)).to.be.at.least(0);
        expect(Number(stats.wins) + Number(stats.draws) + Number(stats.losses)).to.equal(Number(stats.total_games));
        if (stats.last_game_results) {
            expect(stats.last_game_results.length).to.be.at.most(10);
        }
    });

    it('should ensure last_game_results never exceeds 10 entries globally', async () => {
        const { rows } = await pool.query(
            `SELECT team_id, array_length(last_game_results, 1) AS result_count
             FROM team_stats
             WHERE array_length(last_game_results, 1) IS NOT NULL
             ORDER BY result_count DESC
             LIMIT 5`
        );

        rows.forEach(row => {
            expect(Number(row.result_count)).to.be.at.most(10);
        });
    });
});

