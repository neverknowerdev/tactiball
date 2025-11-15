import {
    pgTable,
    bigserial,
    bigint,
    integer,
    smallint,
    numeric,
    varchar,
    text,
    jsonb,
    timestamp,
    boolean,
    date,
    pgEnum
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const gameStatusEnum = pgEnum('game_status', ['active', 'finished', 'finished_by_timeout']);
export const gameResultEnum = pgEnum('game_result', ['VICTORY', 'DRAW', 'DEFEAT', 'DEFEAT_BY_TIMEOUT']);
export const statisticPeriodEnum = pgEnum('statistic_period', ['week', 'month', 'alltime']);

export const teams = pgTable('teams', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
    primaryWallet: varchar('primary_wallet', { length: 255 }),
    name: varchar('name', { length: 255 }),
    country: smallint('country'),
    gameRequestId: integer('game_request_id'),
    activeGameId: bigint('active_game_id', { mode: 'number' }),
    eloRating: numeric('elo_rating').$type<number>().default(sql`100`),
    statistics: jsonb('statistics'),
    lastGamesResults: gameResultEnum('last_games_results').array(),
    zealyUserId: text('zealy_user_id')
});

export const games = pgTable('games', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
    lastMoveAt: timestamp('last_move_at', { withTimezone: false }),
    lastMoveTeam: bigint('last_move_team', { mode: 'number' }),
    team1: bigint('team1', { mode: 'number' }),
    team2: bigint('team2', { mode: 'number' }),
    status: gameStatusEnum('status').default('active'),
    movesMade: integer('moves_made').default(0),
    winner: bigint('winner', { mode: 'number' }),
    history: jsonb('history').$type<any[]>(),
    team1Info: jsonb('team1_info').$type<Record<string, any>>(),
    team2Info: jsonb('team2_info').$type<Record<string, any>>(),
    team1Score: smallint('team1_score').default(0),
    team2Score: smallint('team2_score').default(0),
    historyIpfsCid: varchar('history_ipfs_cid', { length: 255 }),
    isVerified: boolean('is_verified').default(false),
    team1Moves: jsonb('team1_moves').$type<any[]>(),
    team2Moves: jsonb('team2_moves').$type<any[]>()
});

export const teamsStatistic = pgTable('teams_statistic', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    teamId: bigint('team_id', { mode: 'number' }).notNull(),
    period: statisticPeriodEnum('period').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    wins: integer('wins').default(0),
    draws: integer('draws').default(0),
    losses: integer('losses').default(0),
    goalScored: integer('goal_scored').default(0),
    goalConceded: integer('goal_conceded').default(0),
    biggestWinDiff: integer('biggest_win_diff').default(0),
    biggestWinGoalScored: integer('biggest_win_goal_scored').default(0),
    biggestWinGoalsConceded: integer('biggest_win_goals_conceded').default(0),
    biggestLossDiff: integer('biggest_loss_diff').default(0),
    biggestLossGoalsScored: integer('biggest_loss_goals_scored').default(0),
    biggestLossGoalsConceded: integer('biggest_loss_goals_conceded').default(0),
    eloRatingDelta: numeric('elo_rating_delta').$type<number>().default(0),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow()
});

export const messages = pgTable('messages', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
    transactionHash: varchar('transaction_hash', { length: 66 }).notNull(),
    logIndex: integer('log_index').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    eventName: varchar('event_name', { length: 255 }).notNull(),
    args: jsonb('args').$type<Record<string, any>>().default(sql`'{}'::jsonb`),
    isProcessed: boolean('is_processed').default(false),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`)
});

export const waitingRooms = pgTable('waiting_rooms', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
    hostTeamId: bigint('host_team_id', { mode: 'number' }).notNull(),
    guestTeamId: bigint('guest_team_id', { mode: 'number' }),
    minimumEloRating: numeric('minimum_elo_rating').$type<number>().default(0),
    status: varchar('status', { length: 20 }).default('open'),
    roomType: varchar('room_type', { length: 10 }).default('public'),
    gameRequestId: bigint('game_request_id', { mode: 'number' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).default(sql`NOW() + interval '24 hours'`)
});

export type Team = typeof teams.$inferSelect;
export type Game = typeof games.$inferSelect;
export type TeamsStatistic = typeof teamsStatistic.$inferSelect;
export type WaitingRoom = typeof waitingRooms.$inferSelect;
export type Message = typeof messages.$inferSelect;

