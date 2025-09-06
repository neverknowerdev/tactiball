import { createAnonClient, createWriteClient } from "@/lib/supabase";
import { DBGame } from "./types";
import { GameState } from "@/lib/game";

export async function getGame(gameId: string): Promise<DBGame | null> {
    const supabase = createAnonClient();
    const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single();

    if (error) {
        throw new Error(error.message);
    }

    return data as DBGame;
}

export async function addToGameHistory(gameId: string, history: GameState[], newStates: GameState[]) {
    history.push(...newStates);
    const supabase = createWriteClient();
    const { data, error } = await supabase
        .from('games')
        .update({
            history: history
        })
        .eq('id', gameId)
        .select();

    if (error) {
        throw new Error(error.message);
    }

    return data;
}