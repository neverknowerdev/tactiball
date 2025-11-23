import {
    pgSchema,
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
    date
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const schemaName = process.env.DB_SCHEMA || 'tactiball';
export const mySchema = pgSchema(schemaName);

export const gameStatusEnum = mySchema.enum('game_status', ['active', 'finished', 'finished_by_timeout']);
export const gameResultEnum = mySchema.enum('game_result', ['VICTORY', 'DRAW', 'DEFEAT', 'DEFEAT_BY_TIMEOUT']);
export const statisticPeriodEnum = mySchema.enum('statistic_period', ['week', 'month', 'alltime']);

export const teams = mySchema.table('teams', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow(),
    primaryWallet: varchar('primary_wallet', { length: 255 }),
    name: varchar('name', { length: 255 }).notNull(),
    country: smallint('country').notNull(),
    gameRequestId: integer('game_request_id'),
    activeGameId: bigint('active_game_id', { mode: 'number' }),
    eloRating: numeric('elo_rating').$type<number>().default(sql`100`).notNull(),
    lastGamesResults: gameResultEnum('last_games_results').array(),
    zealyUserId: text('zealy_user_id')
});

export const games = mySchema.table('games', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    lastMoveAt: timestamp('last_move_at', { withTimezone: false }),
    lastMoveTeam: bigint('last_move_team', { mode: 'number' }),
    team1: bigint('team1', { mode: 'number' }).notNull(),
    team2: bigint('team2', { mode: 'number' }).notNull(),
    status: gameStatusEnum('status').default('active').notNull(),
    movesMade: integer('moves_made').default(0).notNull(),
    winner: bigint('winner', { mode: 'number' }),
    history: jsonb('history').$type<any[]>(),
    team1Info: jsonb('team1_info').$type<Record<string, any>>().notNull(),
    team2Info: jsonb('team2_info').$type<Record<string, any>>().notNull(),
    team1Score: smallint('team1_score').default(0).notNull(),
    team2Score: smallint('team2_score').default(0).notNull(),
    historyIpfsCid: varchar('history_ipfs_cid', { length: 255 }),
    isVerified: boolean('is_verified').default(false).notNull(),
    team1Moves: jsonb('team1_moves').$type<any[]>(),
    team2Moves: jsonb('team2_moves').$type<any[]>()
});

export const teamsStatistic = mySchema.table('teams_statistic', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    teamId: bigint('team_id', { mode: 'number' }).notNull(),
    period: statisticPeriodEnum('period').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    wins: integer('wins').default(0).notNull(),
    draws: integer('draws').default(0).notNull(),
    losses: integer('losses').default(0).notNull(),
    goalScored: integer('goal_scored').default(0).notNull(),
    goalConceded: integer('goal_conceded').default(0).notNull(),
    biggestWinDiff: integer('biggest_win_diff').default(0).notNull(),
    biggestWinGoalScored: integer('biggest_win_goal_scored').default(0).notNull(),
    biggestWinGoalsConceded: integer('biggest_win_goals_conceded').default(0).notNull(),
    biggestLossDiff: integer('biggest_loss_diff').default(0).notNull(),
    biggestLossGoalsScored: integer('biggest_loss_goals_scored').default(0).notNull(),
    biggestLossGoalsConceded: integer('biggest_loss_goals_conceded').default(0).notNull(),
    eloRatingDelta: numeric('elo_rating_delta').$type<number>().default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull()
});

export const messages = mySchema.table('messages', {
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

export const waitingRooms = mySchema.table('waiting_rooms', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
    hostTeamId: bigint('host_team_id', { mode: 'number' }).notNull(),
    guestTeamId: bigint('guest_team_id', { mode: 'number' }),
    minimumEloRating: numeric('minimum_elo_rating').$type<number>().default(0).notNull(),
    status: varchar('status', { length: 20 }).default('open').notNull(),
    roomType: varchar('room_type', { length: 10 }).default('public').notNull(),
    gameRequestId: bigint('game_request_id', { mode: 'number' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).default(sql`NOW() + interval '24 hours'`).notNull()
});

export type Team = typeof teams.$inferSelect;
export type Game = typeof games.$inferSelect;
export type TeamsStatistic = typeof teamsStatistic.$inferSelect;
export type WaitingRoom = typeof waitingRooms.$inferSelect;
export type Message = typeof messages.$inferSelect;

