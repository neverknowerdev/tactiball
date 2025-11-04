import { useState, useEffect } from 'react';
import { CellState, CellType, FIELD_WIDTH, FIELD_HEIGHT } from '../types';
import { isPosEquals } from '@/lib/game';

export function useCellStates() {
    const [cellStates, setCellStates] = useState<CellState[][]>([]);

    useEffect(() => {
        // Generate cell states
        const generateCellStates = (): CellState[][] => {
            const cells: CellState[][] = [];

            for (let x = 0; x < FIELD_WIDTH; x++) {
                const colCells: CellState[] = [];
                for (let y = 0; y < FIELD_HEIGHT; y++) {
                    // Determine if this is a field margin or field cell
                    const isMargin = x === 0 || x === FIELD_WIDTH - 1;
                    const type: CellType = isMargin ? CellType.FIELD_MARGIN : CellType.FIELD_CELL;

                    // Determine if cell should be highlighted (for now, we can add logic later)
                    const highlighted = false;

                    colCells.push({
                        position: { x: x, y: y },
                        highlighted,
                        type
                    });
                }
                cells.push(colCells);
            }

            return cells;
        };

        setCellStates(generateCellStates());
    }, []);

    const updateCellHighlights = (availablePositions: { x: number, y: number }[]) => {
        const newCellStates = cellStates.map(row =>
            row.map(cell => ({
                ...cell,
                highlighted: availablePositions.some(pos => isPosEquals(pos, cell.position))
            }))
        );
        setCellStates(newCellStates);
    }

    const clearCellHighlights = () => {
        const newCellStates = cellStates.map(row =>
            row.map(cell => ({
                ...cell,
                highlighted: false
            }))
        );
        setCellStates(newCellStates);
    }

    return {
        cellStates,
        setCellStates,
        updateCellHighlights,
        clearCellHighlights
    };
}

