# Teen Patti Pool Management Platform

A real-time multiplayer Teen Patti pool management system built with HTML, CSS, Tailwind CSS, JavaScript, Node.js, Express, and Socket.IO. This application supports multiple players across different browsers with real-time synchronization.

## Features

### 🏠 Home Page (index.html)
- **Create Room**: Generate a random 4-digit room code and set starting balance for all players
- **Join Room**: Enter a room code to join an existing game
- Clean, responsive design with Tailwind CSS

### 🎮 Game Lobby (lobby.html)
- **Room Management**: Display room code at the top
- **Player List**: Show all players with their names, balances, and roles (HOST/YOU indicators)
- **Pool Display**: Central pool showing current total bids and round information
- **Turn-based Bidding**: Clear indication of whose turn it is with visual highlights
- **Game Log**: Track all game actions with timestamps
- **Creator Controls**: Room creator can reset the pool and start new rounds
- **Real-time Updates**: All players see live updates when others join, bid, or leave

### � Multiplayer Features
- **WebSocket Communication**: Real-time synchronization using Socket.IO
- **Cross-browser Support**: Players can join from different browsers/devices
- **Automatic Cleanup**: Rooms are automatically deleted when empty
- **Creator Transfer**: If creator leaves, another player becomes the new creator
- **Connection Status**: Live connection status indicators

### �🎯 Key Functionality
- **Dynamic Pool Updates**: Pool amount updates in real-time as players place bids
- **Balance Management**: Player balances are automatically deducted when placing bids
- **Turn Management**: Automatic turn rotation after each bid
- **Persistent Rooms**: Game state maintained on server
- **Responsive Design**: Works on desktop and mobile devices

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm (comes with Node.js)

### Quick Start
1. **Clone or download** the project files
2. **Open terminal/command prompt** in the project directory
3. **Run the startup script**:
   ```bash
   # On Windows
   start.bat
   
   # Or manually:
   npm install
   npm start
   ```

### Manual Installation
```bash
# Install dependencies
npm install

# Start the server
npm start

# For development with auto-restart
npm run dev
```

The server will start on `http://localhost:3000`

## How to Use

### Getting Started
1. Start the server using the steps above
2. Open `http://localhost:3000` in your web browser
3. Choose either "Create Room" or "Join Room"

### Testing Multiplayer
1. **Open multiple browser windows/tabs** or use different browsers
2. **Navigate to** `http://localhost:3000` in each
3. **Create a room** in one browser
4. **Join the room** using the room code in other browsers
5. **Start playing** - you'll see real-time updates across all browsers!

### Creating a Room
1. Enter your name
2. Set the starting balance (default: ₹1000)
3. Click "Create Room"
4. A 4-digit room code will be generated
5. Share this code with other players

### Joining a Room
1. Enter your name
2. Enter the 4-digit room code
3. Click "Join Room"
4. You'll be taken to the game lobby

### Playing the Game
1. **Wait for Your Turn**: The current player is highlighted in green
2. **Place Bids**: Enter an amount or use quick bid buttons (₹50, ₹100, ₹200)
3. **Monitor Pool**: Watch the central pool amount grow with each bid
4. **Track Progress**: View game log for all actions
5. **New Rounds**: Room creator can reset the pool to start new rounds

### Game Controls
- **Leave Room**: Exit the current game and return to home page
- **Reset Pool** (Creator Only): Clear the pool and start a new round
- **Quick Bids**: Fast bid buttons for common amounts

## Technical Details

### File Structure
```
TeenPattiPool/
├── server.js          # Node.js server with Socket.IO
├── package.json       # Node.js dependencies
├── start.bat          # Windows startup script
├── index.html         # Home page with create/join options
├── lobby.html         # Main game interface
├── app.js             # Frontend game logic with WebSocket
└── README.md          # This file
```

### Technologies Used
- **Backend**: Node.js, Express.js, Socket.IO
- **Frontend**: HTML5, Tailwind CSS (CDN), JavaScript (ES6+)
- **Real-time Communication**: WebSocket via Socket.IO
- **Cross-browser Support**: Modern JavaScript APIs

### Server Features
- **Room Management**: Create, join, and delete rooms
- **Real-time Events**: Bidding, player joins/leaves, pool resets
- **Automatic Cleanup**: Remove disconnected players and empty rooms
- **Error Handling**: Comprehensive validation and error messages
- **CORS Support**: Cross-origin resource sharing enabled

### Client Features
- **Socket Connection**: Auto-connect and reconnect handling
- **Real-time UI Updates**: Live synchronization with server state
- **Input Validation**: Client and server-side validation
- **Responsive Design**: Mobile-friendly interface

## API Events (Socket.IO)

### Client to Server
- `createRoom` - Create a new game room
- `joinRoom` - Join an existing room
- `placeBid` - Place a bid in the current round
- `resetPool` - Reset pool and start new round (creator only)
- `leaveRoom` - Leave the current room

### Server to Client
- `roomCreated` - Room creation confirmation
- `roomJoined` - Room join confirmation
- `roomUpdate` - Full room state update
- `bidPlaced` - Bid placement notification
- `poolReset` - Pool reset notification
- `playerLeft` - Player disconnect notification
- `error` - Error messages

## Deployment

### Local Network Access
To allow other devices on your network to connect:
1. **Find your IP address**: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. **Update server.js** to bind to `0.0.0.0`
3. **Access via**: `http://YOUR_IP:3000`

### Production Deployment
- **Heroku**: Add `Procfile` with `web: node server.js`
- **Railway**: Direct deployment with automatic detection
- **Digital Ocean**: Deploy on droplet with PM2
- **Vercel**: Deploy with serverless functions

## Future Enhancements

### Potential Features to Add
- **User Authentication**: Login system with persistent profiles
- **Game History**: Track statistics and game records
- **Tournament Mode**: Multi-round tournaments with elimination
- **Card Game Integration**: Actual Teen Patti card game mechanics
- **Video Chat**: WebRTC integration for face-to-face gaming
- **Mobile App**: React Native or Flutter mobile application
- **Database Integration**: PostgreSQL or MongoDB for persistence
- **Payment Integration**: Real money transactions (with proper licensing)

### Technical Improvements
- **Database**: Add PostgreSQL/MongoDB for data persistence
- **Authentication**: JWT tokens for secure user sessions
- **Rate Limiting**: Prevent spam and abuse
- **Clustering**: Scale across multiple server instances
- **SSL/HTTPS**: Secure connections in production
- **Docker**: Containerization for easy deployment
- **Testing**: Unit and integration tests
- **Monitoring**: Logging and analytics

## Browser Compatibility

Works on all modern browsers that support:
- WebSocket connections
- ES6+ JavaScript features
- CSS Grid and Flexbox
- Socket.IO client

## Troubleshooting

### Common Issues
1. **"Cannot connect to server"**: Ensure server is running on port 3000
2. **"Room not found"**: Check room code is correct and room still exists
3. **"Not your turn"**: Wait for other players to complete their turns
4. **Page not loading**: Clear browser cache and refresh

### Port Issues
If port 3000 is busy, the server will automatically try the next available port.

## License

This project is open source and available under the MIT License.

---

**Note**: This application now supports real multiplayer functionality across different browsers and devices. The WebSocket server handles all synchronization, making it perfect for testing with multiple browser windows or sharing with friends on the same network!
