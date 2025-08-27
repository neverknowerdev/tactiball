# Ably WebSocket Setup Guide

## Overview
This project uses Ably for real-time WebSocket communication to implement the opponent finding system.

## Setup Steps

### 1. Create Ably Account
- Go to [ably.com](https://ably.com) and create a free account
- Create a new app in your Ably dashboard

### 2. Get API Key
- In your Ably app dashboard, go to "API Keys"
- Copy the "Root" API key (or create a new one with appropriate permissions)
- The key will look like: `your-app-key:your-app-secret`

### 3. Environment Configuration
Add your Ably API key to your `.env.local` file:

```bash
NEXT_PUBLIC_ABLY_API_KEY=your-app-key:your-app-secret
```

### 4. Features Implemented

#### Opponent Finding Room
- **Channel**: `opponent-finding`
- **Presence Data**: 
  - `teamName`: Name of the user's team
  - `teamId`: Unique team identifier
  - `userWalletAddress`: User's wallet address
  - `username`: User's display name
  - `eloRating`: Team's ELO rating
  - `timestamp`: When they joined

#### Real-time Events
- **User Joins**: Logs when new users enter the opponent finding room
- **User Leaves**: Logs when users leave the room
- **Presence Updates**: Logs when users update their presence data

### 5. How It Works

1. **User clicks "Play Now"**: Modal opens and user joins the `opponent-finding` room
2. **Presence Entry**: User's team info is broadcast to all other users in the room
3. **Real-time Monitoring**: All users can see who's looking for opponents
4. **Match Discovery**: Users can see potential opponents with their team details
5. **Clean Exit**: When user cancels or closes modal, they leave the room

### 6. Security Considerations

- **Client ID**: All clients use `chessball-client` as identifier
- **Presence Data**: Only public team information is shared
- **Wallet Privacy**: Wallet addresses are included but can be filtered if needed
- **Rate Limiting**: Ably provides built-in rate limiting and abuse prevention

### 7. Testing

To test the WebSocket functionality:

1. Open the app in multiple browser tabs/windows
2. Connect different wallets with different teams
3. Click "Play Now" in each tab
4. Check browser console for real-time logs
5. Verify presence data is being shared between clients

### 8. Troubleshooting

**Common Issues:**
- **Connection Failed**: Check if API key is correct and has proper permissions
- **No Real-time Updates**: Ensure you're not blocking WebSocket connections
- **Presence Not Working**: Verify the channel name matches exactly

**Debug Mode:**
Enable Ably debug mode by adding this to your environment:
```bash
NEXT_PUBLIC_ABLY_DEBUG=true
```

## Next Steps

Future enhancements could include:
- Automatic opponent matching based on ELO rating
- Direct game invitation system
- Real-time game state synchronization
- Team chat functionality
