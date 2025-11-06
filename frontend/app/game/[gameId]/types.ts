// Types for the game page

export enum CellType {
    FIELD_MARGIN = 'field_margin',
    FIELD_CELL = 'field_cell'
}

export type CellState = {
    position: { x: number, y: number };
    highlighted: boolean;
    type: CellType;
};

export enum GameSubmissionState {
    IDLE = 'idle',
    COMMITTING = 'committing',
    WAITING_FOR_OPPONENT = 'waiting_for_opponent',
    WAITING_FOR_CALCULATION = 'waiting_for_calculation'
}

export const FIELD_WIDTH = 17;
export const FIELD_HEIGHT = 11;

