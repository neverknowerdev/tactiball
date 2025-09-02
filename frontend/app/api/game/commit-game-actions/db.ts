import { createWriteClient } from "@/lib/supabase";
import { GameAction } from "@/lib/game";

export async function saveMovesToDB(gameId: string, teamEnum: number, teamMoves: GameAction[]) {
    const supabase = createWriteClient();
    const updateData = teamEnum === 1 ? { team1_moves: teamMoves } : { team2_moves: teamMoves };
    const { data, error } = await supabase
        .from('games')
        .update(updateData)
        .eq('id', gameId)
        .select();

    if (error) {
        throw new Error(error.message);
    }

    return data;
}
