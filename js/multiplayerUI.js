// Multiplayer UI system
const multiplayerUI = {
    playerListInterval: null,

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    getVisibleColor(color) {
        const c = (color || '#fff').toLowerCase();
        return (c === '#ffffff' || c === '#fff' || c === 'white') ? '#111' : color;
    },

    removeMenu(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    },

    // Show multiplayer menu
    showMenu() {
        // Ensure multiplayer is initialized
        if (typeof multiplayer !== 'undefined' && !multiplayer.playerId) {
            if (!multiplayer.init()) {
                alert('Failed to initialize multiplayer. Please refresh the page.');
                return;
            }
        }

        this.removeMenu('multiplayer-menu');

        const safeName = this.escapeHtml(multiplayer.settings.name || 'Player');
        const visibleNameColor = this.getVisibleColor(multiplayer.settings.nameColor);

        const html = `
            <div class="mp-overlay mp-fade-in">
                <div class="mp-card mp-card-wide">
                    <h1 class="mp-title">Multiplayer</h1>
                    <p class="mp-subtitle">Customize your identity, then host or join a lobby.</p>

                    <div class="mp-field">
                        <label class="mp-label" for="mp-player-name">Player Name</label>
                        <input class="mp-input" type="text" id="mp-player-name" value="${safeName}" maxlength="24">
                        <p id="mp-name-preview" class="mp-hint" style="color:${visibleNameColor};">Preview: ${safeName}</p>
                    </div>

                    <div class="mp-color-grid">
                        <div class="mp-field">
                            <label class="mp-label" for="mp-player-color">Player Color</label>
                            <input class="mp-color-input" type="color" id="mp-player-color" value="${multiplayer.settings.color}">
                        </div>
                        <div class="mp-field">
                            <label class="mp-label" for="mp-name-color">Name Color</label>
                            <input class="mp-color-input" type="color" id="mp-name-color" value="${multiplayer.settings.nameColor}">
                        </div>
                    </div>

                    <div class="mp-actions">
                        <button class="mp-btn mp-btn-success" onclick="multiplayerUI.showCreateLobby()">Create Lobby</button>
                        <button class="mp-btn mp-btn-primary" onclick="multiplayerUI.showJoinLobby()">Join Lobby</button>
                    </div>

                    <button class="mp-btn mp-btn-secondary mp-btn-full" onclick="multiplayerUI.close()">Back</button>
                </div>
            </div>
        `;

        const container = document.createElement('div');
        container.id = 'multiplayer-menu';
        container.innerHTML = html;
        document.body.appendChild(container);

        // Prevent splash click-through starting the game
        const splash = document.getElementById('splash');
        if (splash) splash.style.pointerEvents = 'none';

        // Mark that we are in a multiplayer lobby context
        if (typeof simulation !== 'undefined') simulation.isMultiplayerLobby = true;

        // Update settings on change
        const nameInput = document.getElementById('mp-player-name');
        const nameColorInput = document.getElementById('mp-name-color');
        const previewText = document.getElementById('mp-name-preview');

        const updatePreview = () => {
            const name = (nameInput.value || 'Player').trim() || 'Player';
            const nameColor = nameColorInput.value;
            multiplayer.settings.name = name;
            multiplayer.settings.nameColor = nameColor;
            multiplayer.saveSettings();
            previewText.style.color = this.getVisibleColor(nameColor);
            previewText.textContent = `Preview: ${name}`;
        };

        nameInput.addEventListener('input', updatePreview);
        document.getElementById('mp-player-color').addEventListener('input', (e) => {
            multiplayer.settings.color = e.target.value;
            multiplayer.saveSettings();
        });
        nameColorInput.addEventListener('input', updatePreview);
    },

    // Show create lobby screen
    showCreateLobby() {
        this.removeMenu('create-lobby-menu');

        const defaultLobbyName = this.escapeHtml(`${multiplayer.settings.name}'s Lobby`);
        const html = `
            <div class="mp-overlay mp-fade-in" style="z-index: 21;">
                <div class="mp-card mp-card-wide">
                    <h2 class="mp-title">Create Lobby</h2>

                    <div class="mp-field">
                        <label class="mp-label" for="mp-lobby-name">Lobby Name</label>
                        <input class="mp-input" type="text" id="mp-lobby-name" value="${defaultLobbyName}" maxlength="30">
                    </div>

                    <label class="mp-toggle-row" for="mp-private">
                        <input type="checkbox" id="mp-private">
                        <span>Private Lobby</span>
                    </label>

                    <div id="mp-password-container" class="mp-field" style="display:none;">
                        <label class="mp-label" for="mp-password">Password</label>
                        <input class="mp-input" type="text" id="mp-password" maxlength="40">
                    </div>

                    <label class="mp-toggle-row" for="mp-host-only-exit">
                        <input type="checkbox" id="mp-host-only-exit">
                        <span>Host Only Level Exit</span>
                    </label>
                    <p class="mp-hint">Only the host can trigger level transitions.</p>

                    <label class="mp-toggle-row" for="mp-friendly-fire">
                        <input type="checkbox" id="mp-friendly-fire">
                        <span>Enable Friendly Fire</span>
                    </label>
                    <p class="mp-hint">Allow players to damage each other with weapons.</p>

                    <div class="mp-field">
                        <label class="mp-label" for="mp-gamemode">Game Mode</label>
                        <select class="mp-select" id="mp-gamemode">
                            <option value="adventure">Adventure</option>
                            <option value="progressive">Progressive</option>
                        </select>
                    </div>

                    <div class="mp-actions">
                        <button class="mp-btn mp-btn-success" onclick="multiplayerUI.createLobby()">Create</button>
                        <button class="mp-btn mp-btn-secondary" onclick="multiplayerUI.closeCreateLobby()">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        const container = document.createElement('div');
        container.id = 'create-lobby-menu';
        container.innerHTML = html;
        document.body.appendChild(container);

        document.getElementById('mp-private').addEventListener('change', (e) => {
            document.getElementById('mp-password-container').style.display = e.target.checked ? 'block' : 'none';
        });
    },

    // Show join lobby screen
    async showJoinLobby() {
        this.removeMenu('join-lobby-menu');

        const lobbies = await multiplayer.getPublicLobbies();

        let lobbiesList = '';
        if (lobbies.length === 0) {
            lobbiesList = '<p class="mp-empty">No public lobbies available.</p>';
        } else {
            lobbiesList = '<div class="mp-lobby-list">';
            lobbies.forEach((lobby) => {
                const lobbyName = this.escapeHtml(lobby.name || 'Unnamed Lobby');
                const gameMode = this.escapeHtml((lobby.gameMode || 'adventure').toUpperCase());
                lobbiesList += `
                    <button class="mp-lobby-row" data-lobby-id="${this.escapeHtml(lobby.id)}" type="button">
                        <span class="mp-lobby-name">${lobbyName}</span>
                        <span class="mp-lobby-meta">${gameMode} | Players: ${lobby.playerCount}</span>
                    </button>
                `;
            });
            lobbiesList += '</div>';
        }

        const html = `
            <div class="mp-overlay mp-fade-in" style="z-index: 21;">
                <div class="mp-card mp-card-wide">
                    <h2 class="mp-title">Join Lobby</h2>

                    <h3 class="mp-section-title">Public Lobbies</h3>
                    ${lobbiesList}

                    <div class="mp-divider"></div>

                    <h3 class="mp-section-title">Join Private Lobby</h3>
                    <input class="mp-input" type="text" id="mp-lobby-code" placeholder="Lobby Code">
                    <input class="mp-input" type="text" id="mp-lobby-password" placeholder="Password">
                    <button class="mp-btn mp-btn-primary mp-btn-full" onclick="multiplayerUI.joinPrivateLobby()">Join Private</button>

                    <button class="mp-btn mp-btn-secondary mp-btn-full" onclick="multiplayerUI.closeJoinLobby()">Back</button>
                </div>
            </div>
        `;

        const container = document.createElement('div');
        container.id = 'join-lobby-menu';
        container.innerHTML = html;
        document.body.appendChild(container);

        container.querySelectorAll('.mp-lobby-row').forEach((btn) => {
            btn.addEventListener('click', () => this.joinLobby(btn.dataset.lobbyId));
        });
    },

    // Create lobby
    async createLobby() {
        const lobbyName = document.getElementById('mp-lobby-name').value.trim() || `${multiplayer.settings.name}'s Lobby`;
        const isPrivate = document.getElementById('mp-private').checked;
        const password = isPrivate ? document.getElementById('mp-password').value : null;
        const gameMode = document.getElementById('mp-gamemode').value;
        const hostOnlyExit = document.getElementById('mp-host-only-exit').checked;
        const friendlyFire = document.getElementById('mp-friendly-fire').checked;

        if (isPrivate && !password) {
            alert('Please enter a password for private lobby');
            return;
        }

        this.closeCreateLobby();
        this.close();

        // Create lobby WITHOUT starting game
        try {
            const lobbyId = await multiplayer.createLobby(isPrivate, password, gameMode, lobbyName);

            // Set host-only exit if enabled
            if (hostOnlyExit) {
                await multiplayer.setHostOnlyLevelExit(true);
            }

            // Set friendly fire setting
            await multiplayer.setFriendlyFire(friendlyFire);

            // Show lobby waiting room
            this.showLobbyRoom(lobbyId, isPrivate, password, gameMode);
        } catch (error) {
            alert('Failed to create lobby: ' + error.message);
        }
    },

    // Join public lobby
    async joinLobby(lobbyId) {
        try {
            // Prevent underlying splash from catching this click
            const splash = document.getElementById('splash');
            if (splash) splash.style.pointerEvents = 'none';
            const gameMode = await multiplayer.joinLobby(lobbyId, null);
            this.closeJoinLobby();
            this.close();

            // Show lobby waiting room
            this.showLobbyRoom(lobbyId, false, null, gameMode);
        } catch (error) {
            alert('Failed to join lobby: ' + error.message);
        }
    },

    // Join private lobby
    async joinPrivateLobby() {
        const lobbyCode = document.getElementById('mp-lobby-code').value.trim();
        const password = document.getElementById('mp-lobby-password').value;

        if (!lobbyCode) {
            alert('Please enter a lobby code');
            return;
        }

        try {
            // Prevent underlying splash from catching this click
            const splash = document.getElementById('splash');
            if (splash) splash.style.pointerEvents = 'none';
            const gameMode = await multiplayer.joinLobby(lobbyCode, password);
            this.closeJoinLobby();
            this.close();

            // Show lobby waiting room
            this.showLobbyRoom(lobbyCode, true, password, gameMode);
        } catch (error) {
            alert('Failed to join lobby: ' + error.message);
        }
    },

    // Close menus
    close() {
        this.removeMenu('multiplayer-menu');
        const splash = document.getElementById('splash');
        if (splash) splash.style.pointerEvents = 'auto';
    },

    closeCreateLobby() {
        this.removeMenu('create-lobby-menu');
        const splash = document.getElementById('splash');
        if (splash) splash.style.pointerEvents = 'auto';
    },

    closeJoinLobby() {
        this.removeMenu('join-lobby-menu');
        const splash = document.getElementById('splash');
        if (splash) splash.style.pointerEvents = 'auto';
    },

    // Show lobby waiting room
    showLobbyRoom(lobbyId, isPrivate, password, gameMode) {
        this.removeMenu('lobby-room');

        const safeLobbyId = this.escapeHtml(lobbyId);
        const safeMode = this.escapeHtml((gameMode || 'adventure').toUpperCase());
        const safePassword = this.escapeHtml(password || '');

        const html = `
            <div class="mp-overlay mp-fade-in" style="z-index: 25;">
                <div class="mp-card mp-card-lobby">
                    <h1 class="mp-title">Lobby Room</h1>
                    <div class="mp-lobby-headline">
                        <span class="mp-pill">Code: <strong>${safeLobbyId}</strong></span>
                        ${isPrivate ? `<span class="mp-pill">Password: <strong>${safePassword}</strong></span>` : ''}
                        <span class="mp-pill">Mode: <strong>${safeMode}</strong></span>
                    </div>

                    <div id="player-list" class="mp-player-list">
                        <h3 class="mp-section-title">Players (1/${multiplayer.maxPlayers})</h3>
                        <div id="players-container"></div>
                    </div>

                    ${multiplayer.isHost ? `
                        <button id="start-game-btn" class="mp-btn mp-btn-success mp-btn-full mp-btn-large" onclick="multiplayerUI.startLobbyGame('${gameMode}')">Start Game</button>
                    ` : `
                        <p class="mp-waiting">Waiting for host to start...</p>
                    `}

                    <button class="mp-btn mp-btn-danger mp-btn-full" onclick="multiplayerUI.leaveLobbyRoom()">Leave Lobby</button>
                </div>
            </div>
        `;

        const container = document.createElement('div');
        container.id = 'lobby-room';
        container.innerHTML = html;
        document.body.appendChild(container);

        // Update player list periodically
        this.updatePlayerList();
        if (this.playerListInterval) clearInterval(this.playerListInterval);
        this.playerListInterval = setInterval(() => this.updatePlayerList(), 1000);

        // Listen for game start if not host
        if (!multiplayer.isHost) {
            multiplayer.listenForGameStart(() => {
                this.startLobbyGame(gameMode);
            });
        }
    },

    // Update player list in lobby
    updatePlayerList() {
        const container = document.getElementById('players-container');
        if (!container) return;

        const players = multiplayer.players || {};
        const playerCount = Object.keys(players).length + 1; // +1 for self

        const myNameColor = this.getVisibleColor(multiplayer.settings.nameColor);

        let html = `
            <div class="mp-player-row">
                <div class="mp-player-main">
                    <span class="mp-avatar" style="background:${multiplayer.settings.color};"></span>
                    <strong style="color:${myNameColor};">${this.escapeHtml(multiplayer.settings.name)}</strong>
                    ${multiplayer.isHost ? '<span class="mp-host-tag">HOST</span>' : ''}
                </div>
            </div>
        `;

        for (const [id, player] of Object.entries(players)) {
            const playerNameColor = this.getVisibleColor(player.nameColor);
            html += `
                <div class="mp-player-row">
                    <div class="mp-player-main">
                        <span class="mp-avatar" style="background:${player.color || '#4a9eff'};"></span>
                        <strong style="color:${playerNameColor};">${this.escapeHtml(player.name || 'Player')}</strong>
                    </div>
                    ${multiplayer.isHost ? `<button class="mp-btn mp-btn-danger mp-mini-btn" onclick="multiplayer.kickPlayer('${id}')">Kick</button>` : ''}
                </div>
            `;
        }

        container.innerHTML = html;

        // Update player count
        const listHeader = document.querySelector('#player-list h3');
        if (listHeader) {
            listHeader.textContent = `Players (${playerCount}/${multiplayer.maxPlayers})`;
        }
    },

    // Start game from lobby
    async startLobbyGame(gameMode) {
        // Host: toggle start flag, then proceed
        if (multiplayer.isHost) {
            await multiplayer.startGame();
        }
        // Clients will be called by listenForGameStart callback (gameStarted already verified)

        // Close lobby room UI but keep connection
        this.leaveLobbyRoom(false);

        // Hide splash screen if still visible
        const splash = document.getElementById('splash');
        if (splash) splash.style.display = 'none';

        // Start actual game on both host and clients
        simulation.gameMode = gameMode;
        simulation.startGame();
        if (typeof simulation !== 'undefined') simulation.isMultiplayerLobby = false;

        setTimeout(() => {
            simulation.makeTextLog("<span class='color-text'>Game started!</span>");
        }, 500);
    },

    // Leave lobby room
    async leaveLobbyRoom(disconnect = true) {
        if (this.playerListInterval) {
            clearInterval(this.playerListInterval);
            this.playerListInterval = null;
        }

        const room = document.getElementById('lobby-room');
        if (room) room.remove();

        const splash = document.getElementById('splash');
        if (splash) splash.style.pointerEvents = 'auto';
        if (disconnect && typeof simulation !== 'undefined') simulation.isMultiplayerLobby = false;

        if (disconnect) {
            await multiplayer.leaveLobby();
        }
    }
};

// Export for global use
window.multiplayerUI = multiplayerUI;