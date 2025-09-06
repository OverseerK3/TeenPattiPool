const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname)));

// Game state storage
const rooms = new Map();

// Utility functions
function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function generatePlayerId() {
    return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function addToGameLog(room, message) {
    const timestamp = new Date().toLocaleTimeString();
    room.gameLog.push(`[${timestamp}] ${message}`);
    
    // Keep only last 50 entries
    if (room.gameLog.length > 50) {
        room.gameLog = room.gameLog.slice(-50);
    }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create room
    socket.on('createRoom', (data) => {
        const { creatorName, startingBalance } = data;
        
        if (!creatorName || !creatorName.trim()) {
            socket.emit('error', { message: 'Please enter your name' });
            return;
        }

        const roomCode = generateRoomCode();
        const playerId = generatePlayerId();
        
        const room = {
            code: roomCode,
            creator: creatorName,
            startingBalance: parseInt(startingBalance) || 1000,
            players: [{
                id: playerId,
                socketId: socket.id,
                name: creatorName,
                balance: parseInt(startingBalance) || 1000,
                isCreator: true,
                packed: false
            }],
            pool: 0,
            currentTurn: 0,
            round: 1,
            gameLog: [],
            totalBids: 0
        };

        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.playerId = playerId;
        socket.roomCode = roomCode;

        addToGameLog(room, `${creatorName} created the room`);

        socket.emit('roomCreated', {
            success: true,
            roomCode: roomCode,
            player: room.players[0],
            room: room
        });

        console.log(`Room ${roomCode} created by ${creatorName}`);
    });

    // Rejoin room (for reconnections)
    socket.on('rejoinRoom', (data) => {
        const { roomCode, playerId, playerName } = data;
        
        if (!roomCode || !playerId || !playerName) {
            socket.emit('roomRejoined', { success: false, message: 'Invalid rejoin data' });
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('roomRejoined', { success: false, message: 'Room not found' });
            return;
        }

        // Check if player already exists in room
        let player = room.players.find(p => p.id === playerId);
        
        if (player) {
            // Update socket ID for existing player
            player.socketId = socket.id;
            socket.join(roomCode);
            socket.playerId = playerId;
            socket.roomCode = roomCode;

            addToGameLog(room, `${playerName} reconnected`);

            socket.emit('roomRejoined', {
                success: true,
                room: room
            });

            // Notify other players
            socket.to(roomCode).emit('roomUpdate', room);
            console.log(`${playerName} rejoined room ${roomCode}`);
        } else {
            // Player not in room, treat as new join
            socket.emit('roomRejoined', { success: false, message: 'Player not found in room' });
        }
    });
    socket.on('joinRoom', (data) => {
        const { playerName, roomCode } = data;
        
        if (!playerName || !playerName.trim()) {
            socket.emit('error', { message: 'Please enter your name' });
            return;
        }

        if (!roomCode || roomCode.length !== 4) {
            socket.emit('error', { message: 'Please enter a valid 4-digit room code' });
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', { message: 'Room not found. Please check the room code.' });
            return;
        }

        // Check if player name already exists
        if (room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
            socket.emit('error', { message: 'A player with this name already exists in the room' });
            return;
        }

        const playerId = generatePlayerId();
        const newPlayer = {
            id: playerId,
            socketId: socket.id,
            name: playerName,
            balance: room.startingBalance,
            isCreator: false,
            packed: false
        };

        room.players.push(newPlayer);
        socket.join(roomCode);
        socket.playerId = playerId;
        socket.roomCode = roomCode;

        addToGameLog(room, `${playerName} joined the game`);

        // Notify the player who joined
        socket.emit('roomJoined', {
            success: true,
            player: newPlayer,
            room: room
        });

        // Ensure current turn is on an active player
        ensureActiveTurn(room);

        // Notify all players in the room about the update
        io.to(roomCode).emit('roomUpdate', room);

        console.log(`${playerName} joined room ${roomCode}`);
    });

    // Place bid
    socket.on('placeBid', (data) => {
        const { amount } = data;
        const roomCode = socket.roomCode;
        const playerId = socket.playerId;

        if (!roomCode || !playerId) {
            socket.emit('error', { message: 'You are not in a room' });
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        const player = room.players.find(p => p.id === playerId);
        if (!player) {
            socket.emit('error', { message: 'Player not found' });
            return;
        }

        // Validate it's the player's turn
        if (room.players[room.currentTurn].id !== playerId) {
            socket.emit('error', { message: "It's not your turn!" });
            return;
        }

        if (!amount || amount <= 0) {
            socket.emit('error', { message: 'Please enter a valid bid amount' });
            return;
        }

        if (amount > player.balance) {
            socket.emit('error', { message: 'Insufficient balance!' });
            return;
        }

        // Process the bid
        player.balance -= amount;
        room.pool += amount;
        room.totalBids++;
        
        addToGameLog(room, `${player.name} bid ₹${amount}`);
        
        // Move to next active player (skip packed players)
        moveToNextActivePlayer(room);

        // Notify all players in the room
        io.to(roomCode).emit('bidPlaced', {
            success: true,
            player: player.name,
            amount: amount,
            room: room
        });

        io.to(roomCode).emit('roomUpdate', room);

        console.log(`${player.name} bid ₹${amount} in room ${roomCode}`);
    });

    // Pack (fold) functionality
    socket.on('packCards', () => {
        const roomCode = socket.roomCode;
        const playerId = socket.playerId;

        if (!roomCode || !playerId) {
            socket.emit('error', { message: 'You are not in a room' });
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        const playerIndex = room.players.findIndex(p => p.id === playerId);
        const player = room.players[playerIndex];

        if (!player) {
            socket.emit('error', { message: 'Player not found' });
            return;
        }

        if (player.packed) {
            socket.emit('error', { message: 'You have already packed' });
            return;
        }

        // Check if it's player's turn
        if (room.currentTurn !== playerIndex) {
            socket.emit('error', { message: "You can only pack during your turn" });
            return;
        }

        // Pack the player
        player.packed = true;
        addToGameLog(room, `${player.name} packed (folded)`);

        // Move to next active player
        moveToNextActivePlayer(room);

        // Check if only one active player remains
        const activePlayers = room.players.filter(p => !p.packed);
        if (activePlayers.length <= 1) {
            // Automatically declare the remaining player as winner
            if (activePlayers.length === 1) {
                const winner = activePlayers[0];
                const winAmount = room.pool;
                winner.balance += winAmount;
                
                addToGameLog(room, `🏆 ${winner.name} won ₹${winAmount}! (All others packed)`);
                
                // Reset round
                room.pool = 0;
                room.round++;
                room.totalBids = 0;
                
                // Set winner as starting player for next round
                const winnerIndex = room.players.findIndex(p => p.id === winner.id);
                room.currentTurn = winnerIndex >= 0 ? winnerIndex : 0;
                
                // Unpack all players for next round
                room.players.forEach(p => p.packed = false);
                
                io.to(roomCode).emit('winnerDeclared', {
                    success: true,
                    winner: { name: winner.name, amount: winAmount },
                    declaredBy: 'System (Auto)',
                    room: room
                });
            }
        }

        // Notify all players
        io.to(roomCode).emit('playerPacked', {
            success: true,
            player: player.name,
            room: room
        });

        // Ensure current turn is on an active player
        ensureActiveTurn(room);

        io.to(roomCode).emit('roomUpdate', room);

        console.log(`${player.name} packed in room ${roomCode}`);
    });

    // Reset pool (creator only)
    socket.on('resetPool', () => {
        const roomCode = socket.roomCode;
        const playerId = socket.playerId;

        if (!roomCode || !playerId) {
            socket.emit('error', { message: 'You are not in a room' });
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        const player = room.players.find(p => p.id === playerId);
        if (!player || !player.isCreator) {
            socket.emit('error', { message: 'Only the room creator can reset the pool' });
            return;
        }

        const finalPoolAmount = room.pool;
        room.pool = 0;
        room.round = 1; // Reset round to 1
        room.totalBids = 0;
        room.currentTurn = 0;

        // Reset all players' balances to starting balance and unpack them
        room.players.forEach(player => {
            player.balance = room.startingBalance;
            player.packed = false; // Unpack all players
        });

        addToGameLog(room, `Pool reset by ${player.name}. Game restarted - Round ${room.round}. All balances restored to ₹${room.startingBalance}.`);

        // Notify all players in the room
        io.to(roomCode).emit('poolReset', {
            success: true,
            finalAmount: finalPoolAmount,
            room: room,
            message: `All player balances have been reset to ₹${room.startingBalance}`
        });

        io.to(roomCode).emit('roomUpdate', room);

        console.log(`Pool reset in room ${roomCode} by ${player.name}`);
    });

    // Declare winner (host only)
    socket.on('declareWinner', (data) => {
        const { winnerId } = data;
        const roomCode = socket.roomCode;
        const playerId = socket.playerId;

        if (!roomCode || !playerId) {
            socket.emit('error', { message: 'You are not in a room' });
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        const hostPlayer = room.players.find(p => p.id === playerId);
        if (!hostPlayer || !hostPlayer.isCreator) {
            socket.emit('error', { message: 'Only the host can declare a winner' });
            return;
        }

        const winner = room.players.find(p => p.id === winnerId);
        if (!winner) {
            socket.emit('error', { message: 'Winner not found' });
            return;
        }

        if (room.pool <= 0) {
            socket.emit('error', { message: 'Pool is empty. No winnings to distribute.' });
            return;
        }

        // Transfer pool amount to winner
        const winAmount = room.pool;
        winner.balance += winAmount;
        
        addToGameLog(room, `🏆 ${winner.name} won ₹${winAmount}! Declared by ${hostPlayer.name}`);
        
        // Reset pool and start new round
        room.pool = 0;
        room.round++;
        room.totalBids = 0;
        
        // Set winner as starting player for next round
        const winnerIndex = room.players.findIndex(p => p.id === winner.id);
        room.currentTurn = winnerIndex >= 0 ? winnerIndex : 0;

        // Unpack all players for next round
        room.players.forEach(p => p.packed = false);

        // Notify all players about the winner
        io.to(roomCode).emit('winnerDeclared', {
            success: true,
            winner: {
                id: winner.id,
                name: winner.name,
                amount: winAmount
            },
            declaredBy: hostPlayer.name,
            room: room
        });

        io.to(roomCode).emit('roomUpdate', room);

        console.log(`${winner.name} declared winner of ₹${winAmount} in room ${roomCode} by ${hostPlayer.name}`);
    });

    // Remove player (host only)
    socket.on('removePlayer', (data) => {
        const { playerIdToRemove } = data;
        const roomCode = socket.roomCode;
        const playerId = socket.playerId;

        if (!roomCode || !playerId) {
            socket.emit('error', { message: 'You are not in a room' });
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        const hostPlayer = room.players.find(p => p.id === playerId);
        if (!hostPlayer || !hostPlayer.isCreator) {
            socket.emit('error', { message: 'Only the host can remove players' });
            return;
        }

        const playerToRemove = room.players.find(p => p.id === playerIdToRemove);
        if (!playerToRemove) {
            socket.emit('error', { message: 'Player not found' });
            return;
        }

        if (playerToRemove.isCreator) {
            socket.emit('error', { message: 'Host cannot remove themselves. Use Leave Room instead.' });
            return;
        }

        // Remove the player
        const playerIndex = room.players.findIndex(p => p.id === playerIdToRemove);
        if (playerIndex !== -1) {
            const removedPlayerName = room.players[playerIndex].name;
            const removedPlayerSocketId = room.players[playerIndex].socketId;
            
            room.players.splice(playerIndex, 1);
            addToGameLog(room, `${removedPlayerName} was removed by ${hostPlayer.name}`);
            
            // Adjust current turn if necessary
            if (room.currentTurn >= room.players.length) {
                room.currentTurn = 0;
            } else if (playerIndex < room.currentTurn) {
                room.currentTurn--;
            }

            // Notify the removed player
            if (removedPlayerSocketId) {
                io.to(removedPlayerSocketId).emit('playerRemoved', {
                    message: `You have been removed from the room by ${hostPlayer.name}`,
                    hostName: hostPlayer.name
                });
            }

            // Notify all remaining players in the room
            io.to(roomCode).emit('playerLeft', {
                playerName: removedPlayerName,
                removedBy: hostPlayer.name,
                room: room
            });

            io.to(roomCode).emit('roomUpdate', room);

            console.log(`${removedPlayerName} was removed from room ${roomCode} by ${hostPlayer.name}`);
        }
    });

    // Change turn (host only)
    socket.on('changeTurn', (data) => {
        const { newTurnPlayerId } = data;
        const roomCode = socket.roomCode;
        const playerId = socket.playerId;

        if (!roomCode || !playerId) {
            socket.emit('error', { message: 'You are not in a room' });
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        const hostPlayer = room.players.find(p => p.id === playerId);
        if (!hostPlayer || !hostPlayer.isCreator) {
            socket.emit('error', { message: 'Only the host can change turn' });
            return;
        }

        const newTurnPlayerIndex = room.players.findIndex(p => p.id === newTurnPlayerId);
        if (newTurnPlayerIndex === -1) {
            socket.emit('error', { message: 'Player not found' });
            return;
        }

        const newTurnPlayer = room.players[newTurnPlayerIndex];

        // Check if the selected player is packed
        if (newTurnPlayer.packed) {
            socket.emit('error', { message: 'Cannot set turn to a packed player' });
            return;
        }

        // Change the turn
        room.currentTurn = newTurnPlayerIndex;
        
        addToGameLog(room, `Turn changed to ${newTurnPlayer.name} by ${hostPlayer.name}`);

        // Notify all players
        io.to(roomCode).emit('turnChanged', {
            success: true,
            newTurnPlayer: newTurnPlayer.name,
            changedBy: hostPlayer.name,
            room: room
        });

        io.to(roomCode).emit('roomUpdate', room);

        console.log(`Turn changed to ${newTurnPlayer.name} in room ${roomCode} by ${hostPlayer.name}`);
    });

    // Leave room
    socket.on('leaveRoom', () => {
        const roomCode = socket.roomCode;
        const playerId = socket.playerId;

        if (!roomCode || !playerId) {
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            return;
        }

        const playerIndex = room.players.findIndex(p => p.id === playerId);
        if (playerIndex !== -1) {
            const playerName = room.players[playerIndex].name;
            const wasCreator = room.players[playerIndex].isCreator;
            
            room.players.splice(playerIndex, 1);
            addToGameLog(room, `${playerName} left the game`);
            
            // If creator left and there are other players, make the first player the new creator
            if (wasCreator && room.players.length > 0) {
                room.players[0].isCreator = true;
                room.creator = room.players[0].name;
            }
            
            // If room is empty, delete it
            if (room.players.length === 0) {
                rooms.delete(roomCode);
                console.log(`Room ${roomCode} deleted (empty)`);
            } else {
                // Adjust current turn if necessary
                if (room.currentTurn >= room.players.length) {
                    room.currentTurn = 0;
                }
                
                // Notify remaining players
                io.to(roomCode).emit('playerLeft', {
                    playerName: playerName,
                    room: room
                });
                
                io.to(roomCode).emit('roomUpdate', room);
            }

            console.log(`${playerName} left room ${roomCode}`);
        }

        socket.leave(roomCode);
        socket.playerId = null;
        socket.roomCode = null;
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Don't immediately remove player - they might reconnect
        // Just mark them as disconnected and set a timeout
        for (const [roomCode, room] of rooms.entries()) {
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                console.log(`${player.name} disconnected from room ${roomCode}, waiting for reconnection...`);
                
                // Set a timeout to remove player if they don't reconnect
                setTimeout(() => {
                    // Check if player still exists and hasn't reconnected
                    const currentRoom = rooms.get(roomCode);
                    if (currentRoom) {
                        const currentPlayer = currentRoom.players.find(p => p.id === player.id);
                        if (currentPlayer && currentPlayer.socketId === socket.id) {
                            // Player hasn't reconnected, remove them
                            const finalPlayerIndex = currentRoom.players.findIndex(p => p.id === player.id);
                            if (finalPlayerIndex !== -1) {
                                const playerName = currentRoom.players[finalPlayerIndex].name;
                                const wasCreator = currentRoom.players[finalPlayerIndex].isCreator;
                                
                                currentRoom.players.splice(finalPlayerIndex, 1);
                                addToGameLog(currentRoom, `${playerName} left the game (timeout)`);
                                
                                // If creator left and there are other players, make the first player the new creator
                                if (wasCreator && currentRoom.players.length > 0) {
                                    currentRoom.players[0].isCreator = true;
                                    currentRoom.creator = currentRoom.players[0].name;
                                }
                                
                                // If room is empty, delete it
                                if (currentRoom.players.length === 0) {
                                    rooms.delete(roomCode);
                                    console.log(`Room ${roomCode} deleted (empty after timeout)`);
                                } else {
                                    // Adjust current turn if necessary
                                    if (currentRoom.currentTurn >= currentRoom.players.length) {
                                        currentRoom.currentTurn = 0;
                                    }
                                    
                                    // Notify remaining players
                                    io.to(roomCode).emit('playerLeft', {
                                        playerName: playerName,
                                        room: currentRoom
                                    });
                                    
                                    io.to(roomCode).emit('roomUpdate', currentRoom);
                                }

                                console.log(`${playerName} removed from room ${roomCode} after timeout`);
                            }
                        }
                    }
                }, 30000); // 30 second timeout before removing player
                
                break;
            }
        }
    });
});

// Helper function to move to next active (non-packed) player
function moveToNextActivePlayer(room) {
    if (!room || room.players.length === 0) return;
    
    const totalPlayers = room.players.length;
    let attempts = 0;
    
    // Move to next player
    room.currentTurn = (room.currentTurn + 1) % totalPlayers;
    
    // Keep moving until we find an active player or check all players
    while (room.players[room.currentTurn].packed && attempts < totalPlayers) {
        room.currentTurn = (room.currentTurn + 1) % totalPlayers;
        attempts++;
    }
    
    // If all players are packed (shouldn't happen due to winner logic), reset to first active player
    if (attempts >= totalPlayers) {
        for (let i = 0; i < totalPlayers; i++) {
            if (!room.players[i].packed) {
                room.currentTurn = i;
                break;
            }
        }
    }
}

// Helper function to ensure current turn is on an active player
function ensureActiveTurn(room) {
    if (!room || room.players.length === 0) return;
    
    const currentPlayer = room.players[room.currentTurn];
    if (currentPlayer && currentPlayer.packed) {
        // If current player is packed, move to next active player
        let attempts = 0;
        const totalPlayers = room.players.length;
        
        while (room.players[room.currentTurn].packed && attempts < totalPlayers) {
            room.currentTurn = (room.currentTurn + 1) % totalPlayers;
            attempts++;
        }
        
        // If all players are packed, find first active player
        if (attempts >= totalPlayers) {
            for (let i = 0; i < totalPlayers; i++) {
                if (!room.players[i].packed) {
                    room.currentTurn = i;
                    break;
                }
            }
        }
    }
}

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Teen Patti Pool server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});
