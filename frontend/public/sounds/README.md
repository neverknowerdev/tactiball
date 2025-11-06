# Game Sound Effects

This directory should contain the following sound files for the chessball game:

1. **move.mp3** - Sound played when a player makes a move (before blockchain confirmation)
   - Should be a subtle, satisfying click/tap sound that complements both chess and football
   - Recommended: Mixkit - "Game Ball Tap" or similar click sound
   - Download from: https://mixkit.co/free-sound-effects/click/

2. **goal.mp3** - Sound played when a player scores a goal
   - Should be a celebration sound that fits both chess and football themes
   - Recommended: Mixkit - "Winning a Coin, Video Game" or similar celebration sound
   - Download from: https://mixkit.co/free-sound-effects/game/

3. **game-end.mp3** - Sound played when the game ends
   - Should be a victory/celebration sound
   - Recommended: Mixkit - "Game Level Completed" or similar victory sound
   - Download from: https://mixkit.co/free-sound-effects/game/

## How to Download Sounds

1. Visit https://mixkit.co/free-sound-effects/ (free, no attribution required)
2. Search for appropriate sounds:
   - For move: Search "click" or "tap"
   - For goal: Search "coin" or "celebration"
   - For game end: Search "victory" or "win"
3. Download the MP3 files and place them in this directory with the names above
4. Ensure files are in MP3 format

## Alternative Sources

- **Freesound**: https://freesound.org/ (requires account, check license)
- **Pixabay**: https://pixabay.com/sound-effects/ (free, no attribution)
- **Zapsplat**: https://www.zapsplat.com/ (free with account)

## Notes

- All sounds should be short (0.5-2 seconds) for best user experience
- Volume is set to 60% in the code, but you can adjust in `useGameSounds.ts`
- Sounds will fail gracefully if files don't exist (will only show console warnings)

