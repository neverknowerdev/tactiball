#!/usr/bin/env tsx

import { pool } from '../frontend/db/pool';

type Period = 'week' | 'month' | 'alltime';

async function rebuildPeriod(period: Period) {
    const { rows } = await pool.query(
        `SELECT rebuild_all_teams_statistics_period($1::statistic_period, CURRENT_DATE) AS rebuilt`,
        [period]
    );
    console.log(`✅ Rebuilt ${period} statistics (rows affected: ${rows[0]?.rebuilt ?? 0})`);
}

async function main() {
    const args = process.argv.slice(2);
    const periods: Period[] = args.length
        ? args.map(arg => arg.toLowerCase()).filter((val): val is Period =>
            val === 'week' || val === 'month' || val === 'alltime')
        : ['week', 'month', 'alltime'];

    if (periods.length === 0) {
        console.log('Usage: tsx scripts/recalculate-team-stat.ts [week|month|alltime ...]');
        process.exit(1);
    }

    for (const period of periods) {
        await rebuildPeriod(period);
    }

    console.log('🎉 Team statistics recalculation completed');
    await pool.end();
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Failed to rebuild statistics:', error);
        process.exit(1);
    });
}

