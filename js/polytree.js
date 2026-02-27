// Progressive Mode - PolyTree System
const polyTree = {
    techTree: [],
    ownedTech: [],
    zoom: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
    _initialized: false,
    
    // Poly Miners
    minerLevel: 0,
    maxMinerLevel: 100,
    polyPerSecond: 0,
    lastMinerTick: Date.now(),
    
    // Generate 3 SEPARATE trees: Tech, Guns, Fields
    generateTechTree() {
        if (!tech || !tech.tech || !b || !b.guns || !m || !m.fieldUpgrades) return;
        
        this.techTree = [];
        const branchWidth = 3; // Nodes per branch
        
        // Helper function to build a tree for a specific type
        const buildTree = (items, type, colOffset) => {
            items.forEach((item, index) => {
                const row = Math.floor(index / branchWidth);
                const col = (index % branchWidth) + colOffset; // Offset columns for each tree
                const baseCost = 3 + (row * 1.5); // MUCH cheaper base cost
                const cost = Math.floor(baseCost * Math.pow(1.12, row)); // Slower growth
                const techId = `${type}_${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
                
                // Tree-like dependencies: each node connects to 1-2 parents IN SAME TREE
                const dependencies = [];
                if (row > 0) {
                    const prevRowStart = (row - 1) * branchWidth;
                    const prevRowEnd = Math.min(prevRowStart + branchWidth, index);
                    
                    // Connect to parent in same column (same tree)
                    const sameColParent = prevRowStart + (index % branchWidth);
                    if (sameColParent < index && sameColParent >= prevRowStart) {
                        const depItem = items[sameColParent];
                        if (depItem) {
                            dependencies.push(`${type}_${depItem.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`);
                        }
                    }
                    
                    // Sometimes add a second parent for branching effect
                    if (Math.random() > 0.5 && prevRowEnd > prevRowStart) {
                        const altCol = ((index % branchWidth) + 1) % branchWidth;
                        const altParent = prevRowStart + altCol;
                        if (altParent < index && altParent >= prevRowStart && altParent < items.length) {
                            const depItem = items[altParent];
                            const depId = `${type}_${depItem.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
                            if (depItem && !dependencies.includes(depId)) {
                                dependencies.push(depId);
                            }
                        }
                    }
                }
                
                this.techTree.push({
                    id: techId,
                    name: item.name,
                    description: item.description || 'No description available',
                    cost: cost,
                    row: row,
                    col: col,
                    dependencies: dependencies,
                    type: type,
                    gunIndex: item.gunIndex,
                    fieldIndex: item.fieldIndex,
                    techData: item.data
                });
            });
        };
        
        // Build TECH tree (left side, columns 0-2)
        const techItems = tech.tech.filter(t => !t.isLore && !t.isJunk && !t.isNonRefundable).map((t, idx) => ({
            name: t.name,
            description: t.description || 'No description',
            techIndex: idx,
            data: t
        }));
        buildTree(techItems, 'tech', 0);
        
        // Build GUN tree (middle, columns 4-6)
        const gunItems = b.guns.map((gun, idx) => ({
            name: gun.name,
            description: gun.description || 'No description',
            gunIndex: idx,
            data: gun
        }));
        buildTree(gunItems, 'gun', 4);
        
        // Build FIELD tree (right side, columns 8-10)
        const fieldItems = m.fieldUpgrades.filter((f, idx) => idx > 0).map((field, idx) => ({
            name: field.name,
            description: field.description || 'No description',
            fieldIndex: idx + 1, // +1 because we skipped index 0
            data: field
        }));
        buildTree(fieldItems, 'field', 8);
    },
    
    init() {
        this.generateTechTree();
        this.loadProgress(); // Load saved progress
        if (simulation.polys === undefined) simulation.polys = 0;
        simulation.firstPowerUpSpawned = false;
        this.updatePolyDisplay();
        
        if (!this._initialized) {
            // Auto-save on page unload
            window.addEventListener('beforeunload', () => {
                this.saveProgress();
            });
            
            // Auto-save every 10 seconds regardless of mode
            setInterval(() => {
                this.saveProgress();
            }, 10000);
            this._initialized = true;
        }
    },
    
    // Save/Load functionality
    saveProgress() {
        const saveData = {
            polys: simulation.polys || 0,
            ownedTech: this.ownedTech,
            minerLevel: this.minerLevel,
            version: 2
        };
        localStorage.setItem('polytree_save', JSON.stringify(saveData));
    },
    
    loadProgress() {
        const saved = localStorage.getItem('polytree_save');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                simulation.polys = Number(data.polys) || 0;
                this.ownedTech = data.ownedTech || [];
                this.minerLevel = data.minerLevel || 0;
                this.updateMinerStats();
                console.log('Loaded polytree progress:', simulation.polys, 'polys,', this.ownedTech.length, 'tech owned, miner level', this.minerLevel);
            } catch (e) {
                console.error('Failed to load polytree save:', e);
                if (!simulation.polys) simulation.polys = 0;
                this.ownedTech = [];
                this.minerLevel = 0;
            }
        } else {
            if (!simulation.polys) simulation.polys = 0;
            this.ownedTech = [];
            this.minerLevel = 0;
            console.log('No saved polytree progress found');
        }
    },
    
    resetProgress() {
        if (confirm('Reset all poly progress? This cannot be undone!')) {
            simulation.polys = 0;
            this.ownedTech = [];
            this.minerLevel = 0;
            this.polyPerSecond = 0;
            localStorage.removeItem('polytree_save');
            this.updatePolyDisplay();
            this.renderTree();
        }
    },
    
    // Poly Miner System
    getMinerCost() {
        if (this.minerLevel >= this.maxMinerLevel) return Infinity;
        return Math.floor(10 * Math.pow(1.12, this.minerLevel));
    },
    
    updateMinerStats() {
        // NERFED: Much slower poly generation
        // Each level gives 0.5 polys/sec base, with very slow exponential growth
        this.polyPerSecond = this.minerLevel > 0 ? (this.minerLevel * 0.5 * Math.pow(1.02, this.minerLevel * 0.3)).toFixed(2) : 0;
        const display = document.getElementById('poly-per-sec');
        if (display) {
            display.textContent = `+${this.polyPerSecond}/sec`;
        }
    },
    
    upgradeMiner() {
        const cost = this.getMinerCost();
        if (simulation.polys >= cost && this.minerLevel < this.maxMinerLevel) {
            simulation.polys -= cost;
            this.minerLevel++;
            this.updateMinerStats();
            this.updatePolyDisplay();
            this.saveProgress();
            this.renderTree();
            return true;
        }
        return false;
    },
    
    tickMiners() {
        if (this.minerLevel === 0) return;
        
        const now = Date.now();
        const deltaTime = (now - this.lastMinerTick) / 1000; // seconds
        
        // Cap deltaTime to prevent huge accumulation when tabbed out or paused
        const cappedDeltaTime = Math.min(deltaTime, 1); // Max 1 second of accumulation per tick
        this.lastMinerTick = now;
        
        const polysEarned = parseFloat(this.polyPerSecond) * cappedDeltaTime;
        if (polysEarned > 0) {
            simulation.polys += polysEarned;
            this.updatePolyDisplay();
        }
    },
    
    addPolys(amount) {
        simulation.polys += amount;
        this.updatePolyDisplay();
        this.saveProgress();
    },
    
    updatePolyDisplay() {
        const polyElement = document.getElementById('poly-count');
        if (polyElement) {
            polyElement.textContent = Math.floor(simulation.polys || 0);
        }
        const perSecElement = document.getElementById('poly-per-sec');
        if (perSecElement) {
            perSecElement.textContent = `+${this.polyPerSecond}/sec`;
        }
    },
    
    canBuy(techId) {
        const techNode = this.techTree.find(t => t.id === techId);
        if (!techNode) return false;
        if (this.ownedTech.includes(techId)) return false;
        if (simulation.polys < techNode.cost) return false;
        
        // Allow purchase if you own ANY of the parent dependencies (branching)
        // OR if there are no dependencies (root nodes)
        if (techNode.dependencies.length === 0) return true;
        
        for (let dep of techNode.dependencies) {
            if (this.ownedTech.includes(dep)) return true; // Only need ONE parent
        }
        return false;
    },
    
    buyTech(techId) {
        if (!this.canBuy(techId)) return false;
        
        const techNode = this.techTree.find(t => t.id === techId);
        simulation.polys -= techNode.cost;
        this.ownedTech.push(techId);
        
        // Give the player the item based on type
        if (techNode.type === 'tech') {
            // Find the tech index and give it
            const techIndex = tech.tech.findIndex(t => t.name === techNode.name);
            if (techIndex !== -1) {
                tech.giveTech(techIndex);
                simulation.makeTextLog(`<span class='color-m'>◆ Tech Unlocked:</span> ${techNode.name}`);
            }
        } else if (techNode.type === 'gun') {
            // Give the gun
            if (techNode.gunIndex !== undefined) {
                b.giveGuns(techNode.gunIndex);
                simulation.makeTextLog(`<span class='color-g'>⚡ Gun Unlocked:</span> ${techNode.name}`);
            }
        } else if (techNode.type === 'field') {
            // Give the field
            if (techNode.fieldIndex !== undefined) {
                m.setField(techNode.fieldIndex);
                simulation.makeTextLog(`<span class='color-f'>◉ Field Unlocked:</span> ${techNode.name}`);
            }
        }
        
        this.updatePolyDisplay();
        this.saveProgress();
        this.renderTree();
        return true;
    },
    
    getRandomOwnedTech() {
        if (this.ownedTech.length === 0) return null;
        return this.ownedTech[Math.floor(Math.random() * this.ownedTech.length)];
    },
    
    // Filter available options based on what's unlocked in polytree
    getAvailableTechIndices() {
        if (simulation.gameMode !== 'progressive') return null; // Not in progressive mode
        const indices = [];
        this.ownedTech.forEach(id => {
            const node = this.techTree.find(t => t.id === id && t.type === 'tech');
            if (node) {
                const techIndex = tech.tech.findIndex(t => t.name === node.name);
                if (techIndex !== -1) indices.push(techIndex);
            }
        });
        return indices;
    },
    
    getAvailableGunIndices() {
        if (simulation.gameMode !== 'progressive') return null;
        const indices = [];
        this.ownedTech.forEach(id => {
            const node = this.techTree.find(t => t.id === id && t.type === 'gun');
            if (node && node.gunIndex !== undefined) {
                indices.push(node.gunIndex);
            }
        });
        return indices;
    },
    
    getAvailableFieldIndices() {
        if (simulation.gameMode !== 'progressive') return null;
        const indices = [];
        this.ownedTech.forEach(id => {
            const node = this.techTree.find(t => t.id === id && t.type === 'field');
            if (node && node.fieldIndex !== undefined) {
                indices.push(node.fieldIndex);
            }
        });
        return indices;
    },
    
    // Visual tech tree renderer
    renderTree() {
        const container = document.getElementById('polytree-content');
        if (!container) return;
        
        if (this.techTree.length === 0) {
            this.generateTechTree();
        }
        
        const nodeW = 180;
        const nodeH = 60;
        const gapX = 100;
        const gapY = 120;
        const maxRow = Math.max(...this.techTree.map(t => t.row));
        const maxCol = Math.max(...this.techTree.map(t => t.col));
        const baseWidth = (maxCol + 1) * (nodeW + gapX) + 200;
        const baseHeight = (maxRow + 1) * (nodeH + gapY) + 200;
        
        let html = `<div class="polytree-canvas-wrap"><svg id="polytree-svg" class="polytree-svg" viewBox="0 0 ${baseWidth} ${baseHeight}" width="100%" preserveAspectRatio="xMidYMin meet">
            <g id="tree-group" transform="translate(${this.panX}, ${this.panY}) scale(${this.zoom})">`;
        
        // Draw tree labels at the top
        html += `<text x="${100 + 1 * (nodeW + gapX)}" y="50" text-anchor="middle" fill="#9ab4ff" font-size="27" font-weight="bold" font-family="Trebuchet MS">TECH CORE</text>`;
        html += `<text x="${100 + 5 * (nodeW + gapX)}" y="50" text-anchor="middle" fill="#ffb866" font-size="27" font-weight="bold" font-family="Trebuchet MS">GUN SYSTEMS</text>`;
        html += `<text x="${100 + 9 * (nodeW + gapX)}" y="50" text-anchor="middle" fill="#66e0ff" font-size="27" font-weight="bold" font-family="Trebuchet MS">FIELD SYSTEMS</text>`;
        
        // Draw dependency lines with curves
        this.techTree.forEach(tech => {
            const x = 100 + tech.col * (nodeW + gapX);
            const y = 100 + tech.row * (nodeH + gapY);
            
            tech.dependencies.forEach(depId => {
                const depTech = this.techTree.find(t => t.id === depId);
                if (depTech) {
                    const depX = 100 + depTech.col * (nodeW + gapX);
                    const depY = 100 + depTech.row * (nodeH + gapY);
                    const isPathOwned = this.ownedTech.includes(tech.id) && this.ownedTech.includes(depId);
                    const lineColor = isPathOwned ? '#2ad08a' : '#3e527a';
                    const midY = (depY + nodeH + y) / 2;
                    // Curved path for tree-like appearance
                    html += `<path d="M${depX + nodeW/2},${depY + nodeH} Q${depX + nodeW/2},${midY} ${x + nodeW/2},${y}" stroke="${lineColor}" stroke-width="3" fill="none"/>`;
                }
            });
        });
        
        // Draw nodes with hover tooltips
        this.techTree.forEach(tech => {
            const x = 100 + tech.col * (nodeW + gapX);
            const y = 100 + tech.row * (nodeH + gapY);
            const isOwned = this.ownedTech.includes(tech.id);
            const canBuy = this.canBuy(tech.id);
            
            let fillColor, strokeColor, textColor;
            if (isOwned) {
                fillColor = '#123e2d';
                strokeColor = '#2ad08a';
                textColor = '#eafff4';
            } else if (canBuy) {
                fillColor = '#453410';
                strokeColor = '#ffbf4a';
                textColor = '#fff8e8';
            } else {
                fillColor = '#1b2740';
                strokeColor = '#51658d';
                textColor = '#b6c8e8';
            }
            
            // Clean description for tooltip
            const cleanDesc = tech.description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
            
            // Type indicator colors
            let typeColor = '#9ab4ff';
            let typeIcon = 'T';
            if (tech.type === 'gun') {
                typeColor = '#ffb866';
                typeIcon = 'G';
            } else if (tech.type === 'field') {
                typeColor = '#66e0ff';
                typeIcon = 'F';
            }
            
            html += `<g class="tech-node" data-tech-id="${tech.id}" data-description="${cleanDesc.replace(/"/g, '&quot;')}" onclick="polyTree.buyTech('${tech.id}')" style="cursor: pointer;">`;
            html += `<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="10" fill="${fillColor}" stroke="${strokeColor}" stroke-width="3"/>`;
            
            // Type indicator in corner
            html += `<text x="${x + 8}" y="${y + 18}" fill="${typeColor}" font-size="13" font-weight="bold" font-family="Trebuchet MS">${typeIcon}</text>`;
            
            const displayName = tech.name.length > 20 ? tech.name.substring(0, 18) + '...' : tech.name;
            html += `<text x="${x + nodeW/2}" y="${y + 28}" text-anchor="middle" fill="${textColor}" font-size="13" font-weight="bold" font-family="Trebuchet MS">${displayName}</text>`;
            
            if (isOwned) {
                html += `<text x="${x + nodeW/2}" y="${y + 48}" text-anchor="middle" fill="#7fffbd" font-size="12" font-weight="bold" font-family="Trebuchet MS">OWNED</text>`;
            } else {
                // Poly diamond logo
                const px = x + nodeW/2 - 30;
                const py = y + 47;
                html += `<polygon points="${px},${py-6} ${px+7},${py} ${px},${py+6} ${px-7},${py}" fill="#7ca3ff" stroke="#3f6fff" stroke-width="2"/>`;
                html += `<text x="${x + nodeW/2 - 18}" y="${y + 50}" text-anchor="start" fill="${textColor}" font-size="13" font-family="Trebuchet MS">${tech.cost}</text>`;
            }
            
            html += `</g>`;
        });
        
        html += '</g></svg></div>';
        
        // Tooltip container
        html += '<div id="tech-tooltip" class="polytree-tooltip"></div>';
        
        // Poly Miner Upgrade Section
        const minerCost = this.getMinerCost();
        const canUpgradeMiner = simulation.polys >= minerCost && this.minerLevel < this.maxMinerLevel;
        html += '<div class="polytree-panel">';
        html += '<h2 style="display:flex; align-items:center; gap:10px; color:#c7d7ff;"><svg width="28" height="28"><polygon points="14,4 24,14 14,24 4,14" fill="#7ca3ff" stroke="#3f6fff" stroke-width="2"/></svg> Poly Miner</h2>';
        html += `<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">`;
        html += `<div><strong style="font-size: 18px;">Level: ${this.minerLevel} / ${this.maxMinerLevel}</strong><br><span style="color: #66e4a8; font-size: 16px;">Earning: ${this.polyPerSecond} polys/sec</span></div>`;
        if (this.minerLevel < this.maxMinerLevel) {
            const btnText = canUpgradeMiner ? `Upgrade (${minerCost} polys)` : `Need ${minerCost} polys`;
            const btnState = canUpgradeMiner ? '' : 'opacity:0.6; cursor:not-allowed;';
            html += `<button onclick="polyTree.upgradeMiner()" class="mp-btn mp-btn-success" style="${btnState}">${btnText}</button>`;
        } else {
            html += '<div class="mp-pill" style="background: rgba(240,165,49,0.25); border-color: rgba(240,165,49,0.4);">Max Level</div>';
        }
        html += '</div>';
        if (this.minerLevel < this.maxMinerLevel) {
            const nextLevelProduction = Math.floor((this.minerLevel + 1) * Math.pow(1.05, (this.minerLevel + 1) * 0.5));
            html += `<p class="mp-hint" style="color:#c4d2ee;">Next level: +${nextLevelProduction} polys/sec</p>`;
        }
        html += '</div>';

        // Controls
        html += '<div class="polytree-panel">';
        html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; gap:10px; flex-wrap:wrap;">';
        html += '<div style="display:flex; gap:10px; flex-wrap:wrap;">';
        html += '<button onclick="polyTree.zoomIn()" class="mp-btn mp-btn-secondary">Zoom +</button>';
        html += '<button onclick="polyTree.zoomOut()" class="mp-btn mp-btn-secondary">Zoom -</button>';
        html += '<button onclick="polyTree.centerTree()" class="mp-btn mp-btn-success">Center</button>';
        html += '</div>';
        html += '<button onclick="polyTree.resetProgress()" class="mp-btn mp-btn-danger">Reset Progress</button>';
        html += '</div>';
        html += '<div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">';
        html += '<svg width="28" height="28"><polygon points="14,6 22,14 14,22 6,14" fill="#7ca3ff" stroke="#3f6fff" stroke-width="2"/></svg>';
        html += '<strong style="font-size: 18px;">Poly Currency</strong></div>';

        const techCount = this.techTree.filter(t => t.type === 'tech').length;
        const gunCount = this.techTree.filter(t => t.type === 'gun').length;
        const fieldCount = this.techTree.filter(t => t.type === 'field').length;

        html += `<p><strong>3 Independent Trees</strong></p>`;
        html += `<p><span style="color: #9ab4ff; font-size: 18px;">T</span> <strong>${techCount} Tech</strong> &nbsp; <span style="color: #ffb866; font-size: 18px;">G</span> <strong>${gunCount} Guns</strong> &nbsp; <span style="color: #66e0ff; font-size: 18px;">F</span> <strong>${fieldCount} Fields</strong></p>`;
        html += '<p style="margin-top: 10px;">Unlock items in any order within each tree.</p>';
        html += '<p><span style="background: #123e2d; color:#eafff4; padding: 3px 8px; border: 1px solid #2ad08a; border-radius: 4px;">Owned</span></p>';
        html += '<p><span style="background: #453410; color:#fff8e8; padding: 3px 8px; border: 1px solid #ffbf4a; border-radius: 4px;">Available</span></p>';
        html += '<p><span style="background: #1b2740; color:#b6c8e8; padding: 3px 8px; border: 1px solid #51658d; border-radius: 4px;">Locked</span></p>';
        html += '<p style="margin-top: 12px; font-weight: bold; color:#dce7ff;">Cheaper scaling: base 3 polys, growth 1.12x per row.</p>';
        html += '</div>';

        container.innerHTML = html;
        this.setupEventListeners();
    },
    
    setupEventListeners() {
        const svg = document.getElementById('polytree-svg');
        const tooltip = document.getElementById('tech-tooltip');
        if (!svg || !tooltip) return;
        
        // Pan functionality
        svg.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'svg' || e.target.id === 'tree-group') {
                this.isDragging = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                svg.style.cursor = 'grabbing';
            }
        });
        
        svg.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const dx = e.clientX - this.lastMouseX;
                const dy = e.clientY - this.lastMouseY;
                this.panX += dx;
                this.panY += dy;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                
                const group = document.getElementById('tree-group');
                if (group) {
                    group.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
                }
            }
        });
        
        svg.addEventListener('mouseup', () => {
            this.isDragging = false;
            svg.style.cursor = 'grab';
        });
        
        svg.addEventListener('mouseleave', () => {
            this.isDragging = false;
            svg.style.cursor = 'grab';
            tooltip.style.display = 'none';
        });
        
        // Tooltip functionality
        const nodes = document.querySelectorAll('.tech-node');
        nodes.forEach(node => {
            node.addEventListener('mouseenter', (e) => {
                const desc = node.getAttribute('data-description');
                const techId = node.getAttribute('data-tech-id');
                const techData = this.techTree.find(t => t.id === techId);
                
                if (techData) {
                    tooltip.innerHTML = `<strong style="font-size: 16px; color: #9ab4ff;">${techData.name}</strong><br><br>${desc}<br><br><em style="color: #ffbf4a;">Cost: ${techData.cost} polys</em>`;
                    tooltip.style.display = 'block';
                }
            });
            
            node.addEventListener('mousemove', (e) => {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            });
            
            node.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
            });
        });
        
        // Zoom with mouse wheel
        svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
                this.zoomIn();
            } else {
                this.zoomOut();
            }
        });
    },
    
    zoomIn() {
        this.zoom = Math.min(this.zoom * 1.2, 3);
        const group = document.getElementById('tree-group');
        if (group) {
            group.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
        }
    },
    
    zoomOut() {
        this.zoom = Math.max(this.zoom / 1.2, 0.3);
        const group = document.getElementById('tree-group');
        if (group) {
            group.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
        }
    },
    
    centerTree() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.renderTree();
    },
    
    awardPolyForKill(mob) {
        if (simulation.gameMode !== 'progressive') return;
        const mass = Number(mob.mass) || 10;
        const radius = Number(mob.radius) || 0;
        let reward = 1 + Math.sqrt(Math.max(mass, 1)) / 5 + radius / 80;
        if (mob.isBoss) reward *= 5;
        this.addPolys(Math.max(1, Math.floor(reward)));
    },
    
    awardPolyForLevel() {
        if (simulation.gameMode !== 'progressive') return;
        const levelReward = 50 + (level.levelsCleared * 10);
        this.addPolys(levelReward);
        simulation.makeTextLog(`<span class='color-text'>Level complete! +${levelReward} polys</span>`);
    }
};
