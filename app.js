// Teen Patti Pool Game with WebSocket Support
class TeenPattiPool {
    constructor() {
        this.socket = null;
        this.currentRoom = null;
        this.currentPlayer = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.init();
    }

    init() {
        console.log('Initializing TeenPattiPool...');
        
        // Load persisted state first
        this.loadState();
        console.log('State loaded:', { hasRoom: !!this.currentRoom, hasPlayer: !!this.currentPlayer });
        
        this.connectSocket();
        
        // Initialize page-specific functionality
        if (window.location.pathname.includes('lobby.html')) {
            console.log('On lobby page, initializing lobby...');
            // Check if we have room data from redirect or localStorage
            const urlParams = new URLSearchParams(window.location.search);
            const roomCode = urlParams.get('room') || (this.currentRoom ? this.currentRoom.code : null);
            
            console.log('Room code determined:', roomCode);
            
            if (!roomCode) {
                console.log('No room code available, redirecting to home');
                // No room data, redirect to home
                window.location.href = 'index.html';
                return;
            }
            
            this.initLobby();
        } else {
            console.log('On home page');
        }
    }

    connectSocket() {
        this.socket = io({
            forceNew: false,
            reconnection: true,
            timeout: 20000,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000
        });
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.showMessage('Connected to server', 'success');
            
            // Try to rejoin room if we have previous room data
            if (this.currentRoom && this.currentPlayer) {
                console.log('Attempting to rejoin room:', this.currentRoom.code);
                this.socket.emit('rejoinRoom', {
                    roomCode: this.currentRoom.code,
                    playerId: this.currentPlayer.id,
                    playerName: this.currentPlayer.name
                });
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);
            this.isConnected = false;
            this.showMessage('Disconnected from server', 'error');
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log('Reconnected after', attemptNumber, 'attempts');
            this.showMessage('Reconnected to server', 'success');
        });

        this.socket.on('reconnect_error', (error) => {
            this.reconnectAttempts++;
            console.log('Reconnection failed:', error);
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                this.showMessage('Connection lost. Please refresh the page.', 'error');
            }
        });

        // Room creation response
        this.socket.on('roomCreated', (data) => {
            if (data.success) {
                this.currentRoom = data.room;
                this.currentPlayer = data.player;
                this.saveState();
                this.showMessage(`Room ${data.roomCode} created successfully!`, 'success');
                setTimeout(() => {
                    window.location.href = `lobby.html?room=${data.roomCode}`;
                }, 1000);
            }
        });

        // Room join/rejoin response
        this.socket.on('roomJoined', (data) => {
            if (data.success) {
                console.log('Room joined successfully:', data);
                this.currentRoom = data.room;
                this.currentPlayer = data.player;
                this.saveState();
                this.showMessage(`Successfully joined room!`, 'success');
                
                // Always redirect to lobby page for new joiners
                setTimeout(() => {
                    window.location.href = `lobby.html?room=${data.room.code}`;
                }, 1000);
            }
        });

        // Handle rejoin response
        this.socket.on('roomRejoined', (data) => {
            if (data.success) {
                console.log('Successfully rejoined room');
                this.currentRoom = data.room;
                // Update current player data
                this.currentPlayer = data.room.players.find(p => p.id === this.currentPlayer.id);
                this.saveState();
                this.showMessage('Rejoined room successfully', 'success');
                if (window.location.pathname.includes('lobby.html')) {
                    this.updateLobbyUI();
                }
            } else {
                console.log('Failed to rejoin room:', data.message);
                this.clearState();
                if (window.location.pathname.includes('lobby.html')) {
                    this.showMessage('Room no longer exists. Redirecting...', 'error');
                    setTimeout(() => {
                        window.location.href = 'index.html';
                    }, 2000);
                }
            }
        });

        // Room updates
        this.socket.on('roomUpdate', (room) => {
            this.currentRoom = room;
            if (window.location.pathname.includes('lobby.html')) {
                this.updateLobbyUI();
            }
        });

        // Bid placed
        this.socket.on('bidPlaced', (data) => {
            if (data.success) {
                // Trigger bid animation
                this.animateBidToPool(data.amount, data.player);
                
                // Clear bid input if it's the current player
                const bidInput = document.getElementById('bidAmount');
                if (bidInput && data.player === this.currentPlayer.name) {
                    bidInput.value = '';
                }
            }
        });

        // Pool reset
        this.socket.on('poolReset', (data) => {
            if (data.success) {
                this.showMessage('Pool has been reset. New round started!', 'info');
                if (data.message) {
                    this.showMessage(data.message, 'success');
                }
                if (data.finalAmount > 0) {
                    this.showWinnerModal(data.finalAmount);
                }
            }
        });

        // Winner declared
        this.socket.on('winnerDeclared', (data) => {
            if (data.success) {
                this.showMessage(`🏆 ${data.winner.name} won ₹${data.winner.amount}!`, 'success');
                this.showWinnerDeclaredModal(data.winner, data.declaredBy);
            }
        });

        // Player left
        this.socket.on('playerLeft', (data) => {
            if (data.removedBy) {
                this.showMessage(`${data.playerName} was removed by ${data.removedBy}`, 'info');
            } else {
                this.showMessage(`${data.playerName} left the game`, 'info');
            }
        });

        // Player removed (when you are the one being removed)
        this.socket.on('playerRemoved', (data) => {
            this.showMessage(data.message, 'error');
            this.clearState();
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 3000);
        });

        // Error handling
        this.socket.on('error', (data) => {
            this.showMessage(data.message, 'error');
        });
    }

    // Room Management
    createRoom(creatorName, startingBalance) {
        if (!creatorName.trim()) {
            this.showMessage('Please enter your name', 'error');
            return false;
        }

        if (!this.isConnected) {
            this.showMessage('Not connected to server', 'error');
            return false;
        }

        this.socket.emit('createRoom', {
            creatorName: creatorName.trim(),
            startingBalance: parseInt(startingBalance) || 1000
        });

        return true;
    }

    joinRoom(playerName, roomCode) {
        if (!playerName.trim()) {
            this.showMessage('Please enter your name', 'error');
            return false;
        }

        if (!roomCode || roomCode.length !== 4) {
            this.showMessage('Please enter a valid 4-digit room code', 'error');
            return false;
        }

        if (!this.isConnected) {
            this.showMessage('Not connected to server', 'error');
            return false;
        }

        console.log('Attempting to join room:', roomCode, 'with name:', playerName);
        
        this.socket.emit('joinRoom', {
            playerName: playerName.trim(),
            roomCode: roomCode
        });

        return true;
    }

    leaveRoom() {
        if (this.socket && this.isConnected) {
            this.socket.emit('leaveRoom');
        }
        
        this.currentRoom = null;
        this.currentPlayer = null;
        
        window.location.href = 'index.html';
    }

    // Game Logic
    placeBid(amount) {
        if (!this.currentRoom || !this.currentPlayer) return false;

        if (!this.isConnected) {
            this.showMessage('Not connected to server', 'error');
            return false;
        }

        // Client-side validation
        if (!amount || amount <= 0) {
            this.showMessage('Please enter a valid bid amount', 'error');
            return false;
        }

        if (amount > this.currentPlayer.balance) {
            this.showMessage('Insufficient balance!', 'error');
            return false;
        }

        // Check if it's player's turn
        const currentTurnPlayer = this.currentRoom.players[this.currentRoom.currentTurn];
        if (currentTurnPlayer.id !== this.currentPlayer.id) {
            this.showMessage("It's not your turn!", 'error');
            return false;
        }

        this.socket.emit('placeBid', { amount: parseInt(amount) });
        return true;
    }

    resetPool() {
        if (!this.currentRoom || !this.currentPlayer || !this.currentPlayer.isCreator) {
            this.showMessage('Only the room creator can reset the pool', 'error');
            return;
        }

        if (!this.isConnected) {
            this.showMessage('Not connected to server', 'error');
            return;
        }

        this.socket.emit('resetPool');
    }

    removePlayer(playerId) {
        if (!this.currentRoom || !this.currentPlayer || !this.currentPlayer.isCreator) {
            this.showMessage('Only the host can remove players', 'error');
            return;
        }

        if (!this.isConnected) {
            this.showMessage('Not connected to server', 'error');
            return;
        }

        this.socket.emit('removePlayer', { playerIdToRemove: playerId });
    }

    declareWinner(winnerId) {
        if (!this.currentRoom || !this.currentPlayer || !this.currentPlayer.isCreator) {
            this.showMessage('Only the host can declare a winner', 'error');
            return;
        }

        if (!this.isConnected) {
            this.showMessage('Not connected to server', 'error');
            return;
        }

        if (this.currentRoom.pool <= 0) {
            this.showMessage('Pool is empty. No winnings to distribute.', 'error');
            return;
        }

        this.socket.emit('declareWinner', { winnerId: winnerId });
    }

    showWinnerSelectionModal() {
        if (!this.currentRoom || !this.currentPlayer || !this.currentPlayer.isCreator) {
            this.showMessage('Only the host can declare a winner', 'error');
            return;
        }

        if (this.currentRoom.pool <= 0) {
            this.showMessage('Pool is empty. No winnings to distribute.', 'error');
            return;
        }

        const modal = document.getElementById('winnerSelectionModal');
        if (modal) {
            // Populate player list
            const playersList = document.getElementById('winnerPlayersList');
            if (playersList) {
                playersList.innerHTML = '';
                this.currentRoom.players.forEach(player => {
                    const playerOption = document.createElement('div');
                    playerOption.className = 'p-3 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors flex justify-between items-center';
                    playerOption.onclick = () => this.selectWinner(player.id, player.name);
                    
                    playerOption.innerHTML = `
                        <div>
                            <h4 class="font-semibold text-gray-800">${player.name}</h4>
                            <p class="text-sm text-gray-600">Balance: ₹${player.balance}</p>
                        </div>
                        <div class="text-2xl"><i class="fas fa-crown text-yellow-500"></i></div>
                    `;
                    
                    playersList.appendChild(playerOption);
                });
            }
            
            // Update pool amount
            const poolAmountSpan = document.getElementById('modalPoolAmount');
            if (poolAmountSpan) {
                poolAmountSpan.textContent = this.currentRoom.pool;
            }
            
            modal.style.display = 'flex';
        }
    }

    selectWinner(winnerId, winnerName) {
        if (confirm(`Declare ${winnerName} as the winner and give them ₹${this.currentRoom.pool}?`)) {
            this.declareWinner(winnerId);
            this.closeWinnerSelectionModal();
        }
    }

    closeWinnerSelectionModal() {
        const modal = document.getElementById('winnerSelectionModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // UI Management
    initLobby() {
        console.log('Initializing lobby...');
        
        // Get room code from URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomCode = urlParams.get('room');
        
        console.log('Room code from URL:', roomCode);
        
        if (!roomCode) {
            console.log('No room code found, redirecting to home');
            window.location.href = 'index.html';
            return;
        }
        
        if (roomCode) {
            // Display room code immediately
            const roomCodeDisplay = document.getElementById('roomCodeDisplay');
            if (roomCodeDisplay) {
                roomCodeDisplay.textContent = roomCode;
            }
        }

        // If we don't have current room/player data, try to use saved state
        if (!this.currentRoom || !this.currentPlayer) {
            console.log('No room/player data, checking saved state...');
            this.loadState();
        }

        // Wait for socket connection and room data
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds total
        
        const checkRoomData = setInterval(() => {
            attempts++;
            console.log(`Checking room data, attempt ${attempts}:`, {
                hasRoom: !!this.currentRoom,
                hasPlayer: !!this.currentPlayer,
                isConnected: this.isConnected
            });
            
            if (this.currentRoom && this.currentPlayer) {
                console.log('Room and player data available, updating UI');
                clearInterval(checkRoomData);
                this.updateLobbyUI();
                
                // Show creator controls if current player is creator
                if (this.currentPlayer.isCreator) {
                    const creatorControls = document.getElementById('creatorControls');
                    if (creatorControls) {
                        creatorControls.style.display = 'block';
                    }
                }
            } else if (attempts >= maxAttempts) {
                console.log('Timeout waiting for room data');
                clearInterval(checkRoomData);
                this.showMessage('Failed to load room data. Redirecting...', 'error');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            }
        }, 100);
    }

    updateLobbyUI() {
        if (!this.currentRoom) return;

        const room = this.currentRoom;
        
        // Update room code
        const roomCodeDisplay = document.getElementById('roomCodeDisplay');
        if (roomCodeDisplay) {
            roomCodeDisplay.textContent = room.code;
        }

        // Update pool amount
        const poolAmount = document.getElementById('poolAmount');
        if (poolAmount) {
            poolAmount.textContent = `₹${room.pool}`;
        }

        // Update round number
        const roundNumber = document.getElementById('roundNumber');
        if (roundNumber) {
            roundNumber.textContent = room.round;
        }

        // Update total bids
        const totalBids = document.getElementById('totalBids');
        if (totalBids) {
            totalBids.textContent = room.totalBids;
        }

        // Update current player data
        const currentPlayerData = room.players.find(p => p.id === this.currentPlayer.id);
        if (currentPlayerData) {
            this.currentPlayer = currentPlayerData;
        }

        // Update players list
        this.updatePlayersList();

        
        // Update turn indicator
        this.updateTurnIndicator();
        
        // Update bidding area
        this.updateBiddingArea();
        
        // Update game log
        this.updateGameLog();
    }

    updatePlayersList() {
        const playersCircle = document.getElementById('playersCircle');
        const playersList = document.getElementById('playersList'); // Fallback for compatibility
        
        if (!this.currentRoom) return;

        // Mobile circular layout
        if (playersCircle) {
            playersCircle.innerHTML = '';
            const players = this.currentRoom.players;
            
            // Get container dimensions
            const container = playersCircle.parentElement;
            const containerSize = Math.min(container.offsetWidth, container.offsetHeight);
            const radius = (containerSize * 0.35); // 35% of container size for better spacing
            const centerX = containerSize / 2;
            const centerY = containerSize / 2;

            players.forEach((player, index) => {
                // Calculate position around the circle - start from top and go clockwise
                const angle = (index * 2 * Math.PI) / players.length - Math.PI / 2; // Start from top
                const x = centerX + radius * Math.cos(angle);
                const y = centerY + radius * Math.sin(angle);

                const playerElement = document.createElement('div');
                playerElement.className = 'absolute transition-all duration-500 ease-in-out';
                playerElement.style.left = `${x}px`;
                playerElement.style.top = `${y}px`;
                playerElement.style.transform = 'translate(-50%, -50%)';
                
                const isCurrentTurn = this.currentRoom.currentTurn === index;
                const isCurrentPlayer = player.id === this.currentPlayer?.id;
                const isCreator = player.isCreator;

                // Responsive player circle size based on number of players and container size
                const playerCount = players.length;
                let circleSize, textSize, balanceSize;
                
                if (containerSize < 300) {
                    circleSize = playerCount > 4 ? 'w-12 h-12' : 'w-14 h-14';
                    textSize = 'text-[8px]';
                    balanceSize = 'text-[9px]';
                } else if (containerSize < 400) {
                    circleSize = playerCount > 6 ? 'w-14 h-14' : 'w-16 h-16';
                    textSize = 'text-[9px]';
                    balanceSize = 'text-[10px]';
                } else {
                    circleSize = playerCount > 6 ? 'w-16 h-16' : 'w-18 h-18';
                    textSize = 'text-[10px]';
                    balanceSize = 'text-xs';
                }

                playerElement.innerHTML = `
                    <div class="relative">
                        <div class="${circleSize} rounded-full border-2 ${isCurrentTurn ? 'border-yellow-400 shadow-xl ring-2 ring-yellow-300 ring-opacity-50' : 'border-white'} 
                             bg-gradient-to-br ${isCreator ? 'from-purple-500 to-purple-600' : isCurrentPlayer ? 'from-emerald-500 to-emerald-600' : 'from-blue-500 to-blue-600'} 
                             flex flex-col items-center justify-center text-white font-bold shadow-lg transition-all duration-300
                             ${isCurrentTurn ? 'scale-110 animate-pulse' : 'hover:scale-105'}">
                            <div class="text-center px-1">
                                <div class="${textSize} leading-tight font-semibold text-center">${player.name.substring(0, 4)}</div>
                                <div class="${balanceSize} font-bold text-yellow-100 text-center">₹${player.balance}</div>
                            </div>
                        </div>
                        
                        ${isCreator ? `<div class="absolute -top-0.5 -right-0.5 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center shadow-md border border-white">
                            <i class="fas fa-crown text-yellow-800" style="font-size: 7px;"></i>
                        </div>` : ''}
                        
                        ${isCurrentTurn ? '<div class="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-yellow-400 rounded-full animate-bounce shadow-md"></div>' : ''}
                        
                        ${this.currentPlayer?.isCreator && player.id !== this.currentPlayer.id ? 
                            `<button onclick="removePlayer('${player.id}')" class="absolute -top-0.5 -left-0.5 w-4 h-4 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow-md border border-white" title="Remove ${player.name}">
                                <i class="fas fa-times" style="font-size: 7px;"></i>
                            </button>` : ''}
                    </div>
                `;

                playersCircle.appendChild(playerElement);
            });
        }

        // Legacy desktop layout (for compatibility)
        if (playersList) {
            playersList.innerHTML = '';
            this.currentRoom.players.forEach((player, index) => {
                const isCurrentTurn = index === this.currentRoom.currentTurn;
                const isCurrentPlayer = player.id === this.currentPlayer.id;
                const isHost = this.currentPlayer.isCreator;
                const canRemove = isHost && !isCurrentPlayer && !player.isCreator;
                
                const playerCard = document.createElement('div');
                playerCard.className = `p-4 rounded-lg border-2 transition-colors ${
                    isCurrentTurn 
                        ? 'border-teen-patti-green bg-green-50' 
                        : 'border-gray-200 bg-gray-50'
                } ${isCurrentPlayer ? 'ring-2 ring-blue-500' : ''}`;
                
                playerCard.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div class="flex-1">
                            <div class="flex items-center justify-between">
                                <h3 class="font-semibold text-gray-800">
                                    ${player.name}
                                    ${player.isCreator ? '<span class="text-xs bg-teen-patti-gold text-teen-patti-green px-2 py-1 rounded-full ml-2">HOST</span>' : ''}
                                    ${isCurrentPlayer ? '<span class="text-xs bg-blue-500 text-white px-2 py-1 rounded-full ml-2">YOU</span>' : ''}
                                </h3>
                                ${canRemove ? `
                                    <button onclick="removePlayer('${player.id}')" 
                                            class="ml-2 bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded transition-colors"
                                            title="Remove ${player.name}">
                                        <i class="fas fa-times"></i>
                                    </button>
                                ` : ''}
                            </div>
                            <p class="text-sm text-gray-600">Balance: ₹${player.balance}</p>
                        </div>
                        ${isCurrentTurn ? '<div class="animate-pulse ml-2"><div class="w-3 h-3 bg-teen-patti-green rounded-full"></div></div>' : ''}
                    </div>
                `;
                
                playersList.appendChild(playerCard);
            });
        }

        // Update mobile host controls visibility
        this.updateHostControls();
        
        // Update balance display
        this.updatePlayerBalance();
        
        // Refresh positioning after DOM updates
        setTimeout(() => this.repositionPlayers(), 100);
    }

    repositionPlayers() {
        const playersCircle = document.getElementById('playersCircle');
        if (!playersCircle || !this.currentRoom) return;

        const players = this.currentRoom.players;
        const container = playersCircle.parentElement;
        
        if (!container) return;

        const containerSize = Math.min(container.offsetWidth, container.offsetHeight);
        const radius = (containerSize * 0.35);
        const centerX = containerSize / 2;
        const centerY = containerSize / 2;

        // Update positions of existing player elements
        const playerElements = playersCircle.children;
        for (let i = 0; i < playerElements.length && i < players.length; i++) {
            const angle = (i * 2 * Math.PI) / players.length - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            playerElements[i].style.left = `${x}px`;
            playerElements[i].style.top = `${y}px`;
        }
    }

    updateHostControls() {
        const creatorControlsMobile = document.getElementById('creatorControlsMobile');
        const creatorControls = document.getElementById('creatorControls');
        
        if (this.currentPlayer?.isCreator) {
            if (creatorControlsMobile) {
                creatorControlsMobile.style.display = 'block';
            }
            if (creatorControls) {
                creatorControls.style.display = 'block';
            }
        } else {
            if (creatorControlsMobile) {
                creatorControlsMobile.style.display = 'none';
            }
            if (creatorControls) {
                creatorControls.style.display = 'none';
            }
        }
    }

    updatePlayerBalance() {
        const currentBalance = document.getElementById('currentBalance');
        if (currentBalance && this.currentPlayer) {
            currentBalance.textContent = this.currentPlayer.balance || 0;
        }
    }

    animateBidToPool(bidAmount, playerName) {
        const bidAnimationContainer = document.getElementById('bidAnimationContainer');
        const poolAmount = document.getElementById('poolAmount');
        
        if (!bidAnimationContainer || !poolAmount) return;

        // Create animated bid element
        const bidElement = document.createElement('div');
        bidElement.className = 'absolute inset-0 flex items-center justify-center pointer-events-none';
        bidElement.innerHTML = `
            <div class="bg-yellow-400 text-teen-patti-green px-3 py-1 rounded-full font-bold text-sm animate-bid-fly">
                +₹${bidAmount}
            </div>
        `;

        bidAnimationContainer.appendChild(bidElement);

        // Add bounce animation to pool
        poolAmount.classList.add('animate-pool-bounce');

        // Clean up animation
        setTimeout(() => {
            if (bidElement.parentNode) {
                bidElement.parentNode.removeChild(bidElement);
            }
            poolAmount.classList.remove('animate-pool-bounce');
        }, 1000);

        // Show floating message
        this.showFloatingMessage(`${playerName} bid ₹${bidAmount}!`, 'success');
    }

    showFloatingMessage(message, type = 'info') {
        const container = document.createElement('div');
        container.className = 'fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50 animate-bounce';
        
        const messageEl = document.createElement('div');
        messageEl.className = `px-4 py-2 rounded-lg shadow-lg text-white font-semibold ${
            type === 'success' ? 'bg-green-500' :
            type === 'error' ? 'bg-red-500' :
            'bg-blue-500'
        }`;
        messageEl.textContent = message;

        container.appendChild(messageEl);
        document.body.appendChild(container);

        // Auto remove after 2 seconds
        setTimeout(() => {
            if (container.parentNode) {
                container.parentNode.removeChild(container);
            }
        }, 2000);
    }

    updateTurnIndicator() {
        const currentTurnPlayer = document.getElementById('currentTurnPlayer');
        if (!currentTurnPlayer || !this.currentRoom) return;

        const currentPlayer = this.currentRoom.players[this.currentRoom.currentTurn];
        currentTurnPlayer.textContent = currentPlayer ? currentPlayer.name : '-';
    }

    updateBiddingArea() {
        const biddingArea = document.getElementById('biddingArea');
        const notYourTurn = document.getElementById('notYourTurn');
        const bidButton = document.getElementById('bidButton');
        
        if (!this.currentRoom || !this.currentPlayer) return;

        const isYourTurn = this.currentRoom.players[this.currentRoom.currentTurn].id === this.currentPlayer.id;
        
        if (biddingArea) biddingArea.style.display = isYourTurn ? 'block' : 'none';
        if (notYourTurn) notYourTurn.style.display = isYourTurn ? 'none' : 'block';
        
        if (bidButton) {
            bidButton.disabled = !isYourTurn || this.currentPlayer.balance <= 0;
        }
    }

    updateGameLog() {
        const gameLog = document.getElementById('gameLog');
        if (!gameLog || !this.currentRoom) return;

        gameLog.innerHTML = '';
        
        this.currentRoom.gameLog.slice(-10).forEach(logEntry => {
            const logItem = document.createElement('div');
            logItem.className = 'text-sm text-gray-600 p-2 bg-gray-50 rounded';
            logItem.textContent = logEntry;
            gameLog.appendChild(logItem);
        });
        
        // Scroll to bottom
        gameLog.scrollTop = gameLog.scrollHeight;
    }

    showWinnerModal(amount) {
        const modal = document.getElementById('winnerModal');
        const finalPoolAmount = document.getElementById('finalPoolAmount');
        
        if (modal && finalPoolAmount) {
            finalPoolAmount.textContent = amount;
            modal.style.display = 'flex';
        }
    }

    showWinnerDeclaredModal(winner, declaredBy) {
        const modal = document.getElementById('winnerDeclaredModal');
        const winnerNameSpan = document.getElementById('declaredWinnerName');
        const winnerAmountSpan = document.getElementById('declaredWinnerAmount');
        const declaredBySpan = document.getElementById('declaredBy');
        
        if (modal && winnerNameSpan && winnerAmountSpan && declaredBySpan) {
            winnerNameSpan.textContent = winner.name;
            winnerAmountSpan.textContent = winner.amount;
            declaredBySpan.textContent = declaredBy;
            modal.style.display = 'flex';
            
            // Auto close after 5 seconds
            setTimeout(() => {
                this.closeWinnerDeclaredModal();
            }, 5000);
        }
    }

    closeWinnerDeclaredModal() {
        const modal = document.getElementById('winnerDeclaredModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    closeWinnerModal() {
        const modal = document.getElementById('winnerModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    showMessage(message, type = 'info') {
        const container = document.getElementById('messageContainer');
        if (!container) return;

        const messageEl = document.createElement('div');
        messageEl.className = `p-4 rounded-lg shadow-lg mb-2 transition-opacity duration-500 ${
            type === 'success' ? 'bg-green-500 text-white' :
            type === 'error' ? 'bg-red-500 text-white' :
            'bg-blue-500 text-white'
        }`;
        messageEl.textContent = message;

        container.appendChild(messageEl);

        // Auto remove after 3 seconds
        setTimeout(() => {
            messageEl.style.opacity = '0';
            setTimeout(() => {
                if (messageEl.parentNode) {
                    messageEl.parentNode.removeChild(messageEl);
                }
            }, 500);
        }, 3000);
    }

    // State Persistence
    saveState() {
        const state = {
            currentRoom: this.currentRoom,
            currentPlayer: this.currentPlayer
        };
        localStorage.setItem('teenPattiPoolState', JSON.stringify(state));
    }

    loadState() {
        const savedState = localStorage.getItem('teenPattiPoolState');
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                this.currentRoom = state.currentRoom;
                this.currentPlayer = state.currentPlayer;
                console.log('Loaded previous state:', state);
            } catch (e) {
                console.error('Error loading state:', e);
                this.clearState();
            }
        }
    }

    clearState() {
        localStorage.removeItem('teenPattiPoolState');
        this.currentRoom = null;
        this.currentPlayer = null;
    }
}

// Global instance
const game = new TeenPattiPool();

// Global functions for HTML event handlers
function createRoom() {
    const creatorName = document.getElementById('creatorName').value;
    const startingBalance = document.getElementById('startingBalance').value || 1000;
    game.createRoom(creatorName, startingBalance);
}

function joinRoom() {
    const playerName = document.getElementById('playerName').value;
    const roomCode = document.getElementById('roomCode').value;
    game.joinRoom(playerName, roomCode);
}

function leaveRoom() {
    if (confirm('Are you sure you want to leave the room?')) {
        game.isExplicitLeave = true;
        game.clearState();
        game.leaveRoom();
    }
}

function placeBid() {
    const bidAmount = parseInt(document.getElementById('bidAmount').value);
    game.placeBid(bidAmount);
}

function setQuickBid(amount) {
    const bidInput = document.getElementById('bidAmount');
    if (bidInput) {
        bidInput.value = amount;
    }
}

function resetPool() {
    if (confirm('Are you sure you want to reset the pool and start a new round? This will restore all players to their starting balance.')) {
        game.resetPool();
    }
}

function removePlayer(playerId) {
    // Find player name for confirmation
    const player = game.currentRoom?.players.find(p => p.id === playerId);
    const playerName = player ? player.name : 'this player';
    
    if (confirm(`Are you sure you want to remove ${playerName} from the room?`)) {
        game.removePlayer(playerId);
    }
}

function declareWinner() {
    game.showWinnerSelectionModal();
}

function closeWinnerModal() {
    game.closeWinnerModal();
}

function closeWinnerSelectionModal() {
    game.closeWinnerSelectionModal();
}

function closeWinnerDeclaredModal() {
    game.closeWinnerDeclaredModal();
}

// Auto-format room code input and other event handlers
document.addEventListener('DOMContentLoaded', function() {
    const roomCodeInput = document.getElementById('roomCode');
    if (roomCodeInput) {
        roomCodeInput.addEventListener('input', function(e) {
            // Only allow numbers and limit to 4 digits
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
        });
        
        roomCodeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                joinRoom();
            }
        });
    }
    
    // Auto-submit on Enter key for other inputs
    const inputs = ['creatorName', 'playerName', 'bidAmount'];
    inputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    if (inputId === 'creatorName') createRoom();
                    else if (inputId === 'playerName') joinRoom();
                    else if (inputId === 'bidAmount') placeBid();
                }
            });
        }
    });
});

// Handle window resize for responsive circular layout
window.addEventListener('resize', function() {
    if (game && game.repositionPlayers) {
        // Debounce resize events
        clearTimeout(window.resizeTimeout);
        window.resizeTimeout = setTimeout(() => {
            game.repositionPlayers();
        }, 250);
    }
});

// Handle orientation change for mobile devices
window.addEventListener('orientationchange', function() {
    setTimeout(() => {
        if (game && game.repositionPlayers) {
            game.repositionPlayers();
        }
    }, 500); // Wait for orientation change to complete
});

// Cleanup on page unload - Don't leave room on page navigation
window.addEventListener('beforeunload', function() {
    // Only leave room if explicitly leaving or closing browser
    // Don't leave on simple page navigation
    if (game.isExplicitLeave) {
        if (game.socket && game.isConnected) {
            game.socket.emit('leaveRoom');
        }
    }
});

// Handle explicit leave actions
function leaveRoom() {
    if (confirm('Are you sure you want to leave the room?')) {
        game.isExplicitLeave = true;
        game.clearState();
        game.leaveRoom();
    }
}
