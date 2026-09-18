(() => {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const canvas = $('game-canvas');
    const ctx = canvas.getContext('2d');
    const canvasWrap = canvas.parentElement;
    const comicFxLayer = $('comic-fx-layer');
    const startShell = document.querySelector('.start-shell');
    const heroInteraction = $('hero-interaction');
    const menuFxLayer = $('menu-fx-layer');
    const menuHuntCount = $('menu-hunt-count');
    const DinoSprites = window.DinoSprites;
    const heroCanvas = $('hero-sprite');
    const heroContext = heroCanvas.getContext('2d');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const screens = {
        start: $('start-screen'),
        tutorial: $('tutorial-screen'),
        mode: $('mode-screen'),
        shop: $('shop-screen'),
        ranking: $('leaderboard-screen'),
        game: $('mini-game')
    };
    const resultPanel = $('result-panel');
    const pausePanel = $('pause-panel');
    const jumpHint = $('jump-hint');
    const toastEl = $('shell-toast');
    const scoreEl = $('score');
    const amberEl = $('amber');
    const speedEl = $('speed');
    const livesEl = $('lives');
    const lifeHudEl = livesEl.parentElement;
    const bestEl = $('best');
    const bestLabelEl = $('best-label');
    const nextLevelButton = $('next-level');
    const gameModeTitle = $('game-mode-title');
    const gameModeSubtitle = $('game-mode-subtitle');
    const nativeHost = !!(window.android && typeof window.android.openMainGame === 'function');

    if (!nativeHost) document.documentElement.classList.add('browser-qa');

    const bestKey = 'primal_runner_best_v1';
    const recordsKey = 'primal_runner_records_v1';
    const statsKey = 'primal_runner_stats_v1';
    const levelRecordsKey = 'primal_runner_level_records_v1';
    const unlockedLevelKey = 'primal_runner_unlocked_level_v1';
    const shopKey = 'primal_runner_shop_v1';
    const tutorialSeenKey = 'primal_runner_tutorial_seen_v1';
    const legacyBestKey = 'egg_rescue_best_v1';
    const legalUrls = new Set([
        'https://d1udhm4c9vjzph.cloudfront.net/ios-legal/terms-of-service.html',
        'https://d1udhm4c9vjzph.cloudfront.net/ios-legal/privacy-policy.html',
        'https://d1udhm4c9vjzph.cloudfront.net/ios-legal/account-deletion.html'
    ]);
    const levels = [
        { target: 70, speed: 174, gapMin: 1.9, gapMax: 2.35, name: '蕨葉草原', theme: 'meadow' },
        { target: 100, speed: 182, gapMin: 1.78, gapMax: 2.18, name: '彩石峽谷', theme: 'canyon' },
        { target: 135, speed: 190, gapMin: 1.66, gapMax: 2.05, name: '琥珀洞窟', theme: 'cave' },
        { target: 175, speed: 198, gapMin: 1.55, gapMax: 1.92, name: '白骨荒原', theme: 'bones' },
        { target: 220, speed: 207, gapMin: 1.44, gapMax: 1.8, name: '熔岩火山', theme: 'volcano' },
        { target: 280, speed: 216, gapMin: 1.34, gapMax: 1.68, name: '月光遺跡', theme: 'ruins' }
    ];
    const mapThemes = [
        { id: 'meadow', name: '蕨葉草原', skyTop: '#61d2c1', skyBottom: '#fff0af', celestial: '#ff7959', far: '#6d9a78', near: '#315c55', ground: '#d6b65c', edge: '#ff7050', detail: '#705579', decor: 'ferns', obstacles: ['stump', 'mushroom', 'rock'] },
        { id: 'canyon', name: '彩石峽谷', skyTop: '#ffb37c', skyBottom: '#ffe6aa', celestial: '#ffd84f', far: '#bd6d62', near: '#705579', ground: '#d98b58', edge: '#ffd84f', detail: '#493d62', decor: 'mesas', obstacles: ['rock', 'crystal', 'totem'] },
        { id: 'cave', name: '琥珀洞窟', skyTop: '#312a4a', skyBottom: '#80658b', celestial: '#ffd84f', far: '#493d62', near: '#25233c', ground: '#58445f', edge: '#f3b83f', detail: '#c8bdd2', decor: 'cave', obstacles: ['crystal', 'mushroom', 'rock'] },
        { id: 'bones', name: '白骨荒原', skyTop: '#ed986a', skyBottom: '#ffe2aa', celestial: '#fff5cf', far: '#b66f5d', near: '#5b4d5c', ground: '#d5b47d', edge: '#fff5cf', detail: '#80658b', decor: 'bones', obstacles: ['bone', 'thorns', 'totem'] },
        { id: 'volcano', name: '熔岩火山', skyTop: '#6a3448', skyBottom: '#ef7957', celestial: '#ffd84f', far: '#5a3547', near: '#27283a', ground: '#56404b', edge: '#ff7050', detail: '#ffb04d', decor: 'lava', obstacles: ['rock', 'thorns', 'totem', 'crystal'] },
        { id: 'ruins', name: '月光遺跡', skyTop: '#263353', skyBottom: '#80658b', celestial: '#fff5cf', far: '#574e70', near: '#292f46', ground: '#7b7185', edge: '#9bd9d1', detail: '#ffd84f', decor: 'ruins', obstacles: ['crystal', 'bone', 'totem', 'thorns'] }
    ];
    const skins = [
        { id: 'meadow', name: '草原小跑手', description: '經典青綠配色，天生就是荒野主角。', price: 0, body: '#38b9ad', head: '#4ccbc0', dark: '#187b79', belly: '#ffd84f', accent: '#ff6f4d', preview: '#f3df9b' },
        { id: 'sunset', name: '落日火尾', description: '像夕陽一樣醒目，跑起來熱力十足。', price: 10, body: '#ff795d', head: '#ff9278', dark: '#bd3f37', belly: '#ffd84f', accent: '#172638', preview: '#9bd9d1' },
        { id: 'moon', name: '月夜獵手', description: '深紫夜行造型，低調又神祕。', price: 80, body: '#80658b', head: '#9d82a7', dark: '#493d62', belly: '#9bd9d1', accent: '#ffd84f', preview: '#bbc6d5' },
        { id: 'gold', name: '黃金聖獸', description: '琥珀收藏家的終極閃耀造型。', price: 180, body: '#f3b83f', head: '#ffd45e', dark: '#b66f2f', belly: '#fff5cf', accent: '#ff6f4d', preview: '#ffad91' }
    ];
    const shopItems = [
        { id: 'shield', name: '護盾圖騰', description: '抵擋下一次障礙碰撞，本局未觸發前一直有效。', price: 5, icon: '◇', color: '#38b9ad', background: '#a8e1d6' },
        { id: 'magnet', name: '琥珀磁石', description: '8 秒內自動吸取靠近畫面的琥珀。', price: 5, icon: '✦', color: '#ff6f4d', background: '#ffd9a1' },
        { id: 'slow', name: '慢速號角', description: '7 秒內讓地圖速度降低，從容躲開障礙。', price: 5, icon: '◖', color: '#705579', background: '#c8bdd2' },
        { id: 'rush', name: '獸王暴走', description: '10 秒內 3 倍加速、完全無敵，並自動吸取全畫面琥珀。', price: 50, icon: '⚡', color: '#bd3f37', background: '#ffd84f', premium: true }
    ];
    const pickupDrops = [
        { id: 'shield', name: '護盾圖騰', icon: '◇', color: '#38b9ad', weight: 25, itemId: 'shield' },
        { id: 'magnet', name: '琥珀磁石', icon: '✦', color: '#ff7959', weight: 24, itemId: 'magnet' },
        { id: 'slow', name: '慢速號角', icon: '◖', color: '#80658b', weight: 22, itemId: 'slow' },
        { id: 'heart', name: '生命果實', icon: '♥', color: '#ef5d57', weight: 16, instant: 'heart' },
        { id: 'amberPack', name: '琥珀小包', icon: '◆', color: '#f3b83f', weight: 10, instant: 'amber' },
        { id: 'rush', name: '獸王暴走', icon: '⚡', color: '#bd3f37', weight: 3, itemId: 'rush' }
    ];

    let width = 390;
    let height = 520;
    let dpr = 1;
    let groundY = 405;
    let state = 'idle';
    let lastTime = 0;
    let elapsed = 0;
    let distance = 0;
    let amber = 0;
    const maxLives = 3;
    let lives = maxLives;
    let speed = 250;
    let baseSpeed = 250;
    let worldOffset = 0;
    let obstacleClock = 1.25;
    let amberClock = 1.8;
    let pickupClock = 5.5;
    let raf = 0;
    let hitFlash = 0;
    let invulnerable = 0;
    let jumpBuffer = 0;
    let coyoteTimer = 0;
    let jumpHoldTimer = 0;
    let jumpHeld = false;
    let jumpCutPending = false;
    let currentMode = 'endless';
    let selectedLevel = 0;
    let rankingMode = 'level';
    let shopCategory = 'skins';
    let shieldReady = false;
    let magnetTimer = 0;
    let slowTimer = 0;
    let rushTimer = 0;
    let comicCollectCooldown = 0;
    let menuAmberCount = 0;
    let menuAmberResetTimer = 0;
    let heroTapCount = 0;
    let menuAnimationFrame = 0;
    let menuLastDraw = -Infinity;
    let heroCheerUntil = 0;
    let heroCheerTimer = 0;
    let menuSkinId = 'meadow';
    let peakSpeedRatio = 1;
    let itemInventory = { shield: 0, magnet: 0, slow: 0, rush: 0 };
    let contentMode = 'both';
    let toastTimer = 0;
    let player = null;
    let obstacles = [];
    let ambers = [];
    let pickups = [];
    let particles = [];
    let clouds = [];
    let activeSkin = skins[0];

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const random = (min, max) => min + Math.random() * (max - min);

    function readJson(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            return value == null ? fallback : value;
        } catch (_) {
            return fallback;
        }
    }

    function getBest() {
        const runnerBest = Number(localStorage.getItem(bestKey) || 0);
        if (runnerBest > 0) return Math.floor(runnerBest);
        return Math.floor(Number(localStorage.getItem(legacyBestKey) || 0));
    }

    function getStats() {
        const stored = readJson(statsKey, { games: 0, amber: 0 });
        return {
            games: Math.max(0, Number(stored.games) || 0),
            amber: Math.max(0, Number(stored.amber) || 0)
        };
    }

    function saveShopState(shop) {
        localStorage.setItem(shopKey, JSON.stringify(shop));
    }

    function getShopState() {
        const totalEarned = getStats().amber;
        const stored = readJson(shopKey, null);
        const validIds = new Set(skins.map((skin) => skin.id));
        const shop = stored && typeof stored === 'object' ? stored : {
            balance: totalEarned,
            owned: ['meadow'],
            equipped: 'meadow',
            items: {},
            syncedEarned: totalEarned
        };
        shop.balance = Math.max(0, Math.floor(Number(shop.balance) || 0));
        shop.syncedEarned = Math.max(0, Math.floor(Number(shop.syncedEarned) || 0));
        if (totalEarned > shop.syncedEarned) shop.balance += totalEarned - shop.syncedEarned;
        shop.syncedEarned = totalEarned;
        shop.owned = Array.isArray(shop.owned) ? [...new Set(shop.owned.filter((id) => validIds.has(id)))] : [];
        if (!shop.owned.includes('meadow')) shop.owned.unshift('meadow');
        if (!shop.owned.includes(shop.equipped)) shop.equipped = 'meadow';
        if (!shop.items || typeof shop.items !== 'object') shop.items = {};
        shopItems.forEach((item) => {
            shop.items[item.id] = clamp(Math.floor(Number(shop.items[item.id]) || 0), 0, 99);
        });
        saveShopState(shop);
        return shop;
    }

    function getEquippedSkin() {
        const shop = getShopState();
        return skins.find((skin) => skin.id === shop.equipped) || skins[0];
    }

    function getRecords() {
        const records = readJson(recordsKey, []);
        if (Array.isArray(records) && records.length) return records;
        const previousBest = getBest();
        return previousBest > 0
            ? [{ distance: previousBest, amber: null, playedAt: null, legacy: true }]
            : [];
    }

    function getUnlockedLevel() {
        return clamp(Math.floor(Number(localStorage.getItem(unlockedLevelKey) || 1)), 1, levels.length);
    }

    function getLevelRecords() {
        const records = readJson(levelRecordsKey, []);
        return Array.isArray(records) ? records.filter((item) => Number(item.level) >= 1) : [];
    }

    function saveRunStats(finalAmber) {
        const stats = getStats();
        const shop = getShopState();
        stats.games += 1;
        stats.amber += finalAmber;
        localStorage.setItem(statsKey, JSON.stringify(stats));
        shop.balance += finalAmber;
        shop.syncedEarned = stats.amber;
        saveShopState(shop);
    }

    function saveEndlessResult(finalDistance, finalAmber) {
        const previousBest = getBest();
        const isRecord = finalDistance > previousBest;
        if (isRecord) localStorage.setItem(bestKey, String(finalDistance));

        const records = getRecords().filter((item) => !item.legacy);
        records.push({ distance: finalDistance, amber: finalAmber, playedAt: Date.now() });
        records.sort((a, b) => b.distance - a.distance || b.amber - a.amber || a.playedAt - b.playedAt);
        localStorage.setItem(recordsKey, JSON.stringify(records.slice(0, 10)));
        saveRunStats(finalAmber);
        return isRecord;
    }

    function saveLevelResult(levelIndex, clearTime, finalAmber) {
        const levelNumber = levelIndex + 1;
        const records = getLevelRecords();
        const previous = records.find((item) => Number(item.level) === levelNumber);
        const isRecord = !previous || clearTime < Number(previous.time || Infinity);
        const next = records.filter((item) => Number(item.level) !== levelNumber);
        next.push(isRecord ? {
            level: levelNumber,
            time: Number(clearTime.toFixed(2)),
            amber: finalAmber,
            playedAt: Date.now()
        } : previous);
        next.sort((a, b) => a.level - b.level);
        localStorage.setItem(levelRecordsKey, JSON.stringify(next));
        const unlocked = Math.max(getUnlockedLevel(), Math.min(levels.length, levelNumber + 1));
        localStorage.setItem(unlockedLevelKey, String(unlocked));
        saveRunStats(finalAmber);
        return isRecord;
    }

    function renderStartStats() {
        menuSkinId = getEquippedSkin().id;
        DinoSprites.load(menuSkinId);
        const shop = getShopState();
        $('start-best').textContent = getBest();
        $('start-games').textContent = `${getLevelRecords().length}/${levels.length}`;
        $('start-amber').textContent = shop.balance;
        bestEl.textContent = getBest();
    }

    function equipOrBuySkin(skinId) {
        const skin = skins.find((item) => item.id === skinId);
        if (!skin) return;
        const shop = getShopState();
        const owned = shop.owned.includes(skin.id);
        if (!owned && shop.balance < skin.price) {
            showToast(`還差 ${skin.price - shop.balance} 枚琥珀`);
            return;
        }
        if (!owned) {
            shop.balance -= skin.price;
            shop.owned.push(skin.id);
            showToast(`已購買「${skin.name}」並裝備`);
            sfx('gem');
        } else if (shop.equipped !== skin.id) {
            showToast(`已裝備「${skin.name}」`);
            sfx('equip');
        }
        shop.equipped = skin.id;
        saveShopState(shop);
        renderShop();
        renderStartStats();
    }

    function buyGameItem(itemId) {
        const item = shopItems.find((entry) => entry.id === itemId);
        if (!item) return;
        const shop = getShopState();
        const count = shop.items[item.id] || 0;
        if (count >= 99) {
            showToast('這個道具已經裝滿了');
            return;
        }
        if (shop.balance < item.price) {
            showToast(`還差 ${item.price - shop.balance} 枚琥珀`);
            return;
        }
        shop.balance -= item.price;
        shop.items[item.id] = count + 1;
        saveShopState(shop);
        showToast(`已購買「${item.name}」· 持有 ${shop.items[item.id]}`);
        sfx('gem');
        renderShop();
        renderStartStats();
    }

    function renderShop() {
        const shop = getShopState();
        $('shop-balance').textContent = shop.balance;
        const skinsTab = $('shop-skins-tab');
        const itemsTab = $('shop-items-tab');
        skinsTab.classList.toggle('active', shopCategory === 'skins');
        itemsTab.classList.toggle('active', shopCategory === 'items');
        skinsTab.setAttribute('aria-selected', String(shopCategory === 'skins'));
        itemsTab.setAttribute('aria-selected', String(shopCategory === 'items'));
        $('shop-category-kicker').textContent = shopCategory === 'skins' ? 'RUNNER SKINS' : 'RUN SUPPLIES';
        $('shop-category-title').textContent = shopCategory === 'skins' ? '聖獸造型' : '冒險道具';
        $('shop-owned-count').textContent = shopCategory === 'skins'
            ? `${shop.owned.length} / ${skins.length}`
            : `庫存 ${shopItems.reduce((total, item) => total + (shop.items[item.id] || 0), 0)}`;
        const grid = $('shop-grid');
        grid.replaceChildren();
        if (shopCategory === 'skins') {
            skins.forEach((skin) => {
                const owned = shop.owned.includes(skin.id);
                const equipped = shop.equipped === skin.id;
                const affordable = shop.balance >= skin.price;
                const card = document.createElement('article');
                card.className = `shop-item${equipped ? ' equipped' : ''}`;
                card.style.setProperty('--preview-bg', skin.preview);

                const preview = document.createElement('div');
                preview.className = 'skin-preview';
                preview.setAttribute('aria-hidden', 'true');
                const sprite = document.createElement('canvas');
                sprite.width = 248;
                sprite.height = 164;
                sprite.className = 'skin-sprite';
                sprite.dataset.skin = skin.id;
                preview.append(sprite);
                const drawPreview = () => {
                    const context = sprite.getContext('2d');
                    context.clearRect(0, 0, sprite.width, sprite.height);
                    DinoSprites.draw(context, skin.id, 6, 128, 146, 132);
                };
                drawPreview();
                DinoSprites.load(skin.id).then(drawPreview);
                const name = document.createElement('h3');
                name.textContent = skin.name;
                const description = document.createElement('p');
                description.textContent = skin.description;
                const action = document.createElement('button');
                action.type = 'button';
                action.textContent = equipped ? '✓ 已裝備' : owned ? '立即裝備' : `◆ ${skin.price} 購買`;
                action.className = !owned && affordable ? 'buyable' : '';
                action.disabled = equipped || (!owned && !affordable);
                action.setAttribute('aria-label', equipped ? `${skin.name}已裝備` : owned ? `裝備${skin.name}` : `使用${skin.price}琥珀購買${skin.name}`);
                action.addEventListener('click', () => equipOrBuySkin(skin.id));
                card.append(preview, name, description, action);
                grid.append(card);
            });
            return;
        }

        shopItems.forEach((item) => {
            const count = shop.items[item.id] || 0;
            const affordable = shop.balance >= item.price;
            const card = document.createElement('article');
            card.className = `shop-item supply-item${item.premium ? ' premium' : ''}`;
            card.style.setProperty('--item-color', item.color);
            card.style.setProperty('--item-bg', item.background);
            const preview = document.createElement('div');
            preview.className = 'item-preview';
            preview.setAttribute('aria-hidden', 'true');
            const icon = document.createElement('span');
            icon.textContent = item.icon;
            preview.append(icon);
            const name = document.createElement('h3');
            name.textContent = item.name;
            const description = document.createElement('p');
            description.textContent = item.description;
            const stock = document.createElement('span');
            stock.className = 'item-stock';
            stock.textContent = `持有 ${count}`;
            const action = document.createElement('button');
            action.type = 'button';
            action.textContent = count >= 99 ? '庫存已滿' : `◆ ${item.price} 購買`;
            action.className = affordable && count < 99 ? 'buyable' : '';
            action.disabled = !affordable || count >= 99;
            action.setAttribute('aria-label', `使用${item.price}琥珀購買${item.name}，目前持有${count}`);
            action.addEventListener('click', () => buyGameItem(item.id));
            card.append(preview, name, description, stock, action);
            grid.append(card);
        });
    }

    function renderModeSelector() {
        const unlocked = getUnlockedLevel();
        selectedLevel = clamp(selectedLevel, 0, unlocked - 1);
        $('level-progress').textContent = `第 ${unlocked} 關 / 共 ${levels.length} 關`;
        $('mode-endless-best').textContent = getBest();
        $('level-mode-start').textContent = `開始第 ${selectedLevel + 1} 關 · ${levels[selectedLevel].name} →`;
        const grid = $('level-grid');
        grid.replaceChildren();
        levels.forEach((level, index) => {
            const button = document.createElement('button');
            const unlockedItem = index < unlocked;
            button.className = `level-chip${index === selectedLevel ? ' selected' : ''}${unlockedItem ? '' : ' locked'}`;
            button.textContent = unlockedItem ? String(index + 1) : '×';
            button.disabled = !unlockedItem;
            button.setAttribute('aria-label', unlockedItem ? `選擇第${index + 1}關` : `第${index + 1}關尚未解鎖`);
            if (unlockedItem) {
                button.addEventListener('click', () => {
                    selectedLevel = index;
                    renderModeSelector();
                });
            }
            grid.append(button);
        });
    }

    function renderLeaderboard() {
        const list = $('ranking-list');
        const empty = $('ranking-empty');
        const levelTab = $('ranking-level-tab');
        const endlessTab = $('ranking-endless-tab');
        levelTab.classList.toggle('active', rankingMode === 'level');
        endlessTab.classList.toggle('active', rankingMode === 'endless');
        levelTab.setAttribute('aria-selected', String(rankingMode === 'level'));
        endlessTab.setAttribute('aria-selected', String(rankingMode === 'endless'));
        const records = rankingMode === 'level'
            ? [...getLevelRecords()].sort((a, b) => b.level - a.level)
            : getRecords();
        const summary = document.querySelector('.ranking-summary');
        summary.querySelector('h2').textContent = rankingMode === 'level' ? '闖關成績榜' : '無盡距離榜';
        summary.querySelector('p:last-child').textContent = rankingMode === 'level'
            ? '每關只保留最快通關時間，兩種模式的成績分開記錄。'
            : '依無盡挑戰的奔跑距離排序，只記錄這臺裝置的成績。';
        $('ranking-empty-title').textContent = rankingMode === 'level' ? '還沒有通關紀錄' : '還沒有無盡紀錄';
        $('ranking-empty-copy').textContent = rankingMode === 'level' ? '完成第一個關卡後，時間會記在這裡。' : '完成一次無盡挑戰後，距離會記在這裡。';
        $('ranking-start').textContent = rankingMode === 'level' ? '開始闖關' : '開始無盡挑戰';
        list.replaceChildren();
        empty.hidden = records.length > 0;
        list.hidden = records.length === 0;

        records.forEach((record, index) => {
            const row = document.createElement('li');
            row.className = 'ranking-row';

            const rank = document.createElement('span');
            rank.className = 'rank-number';
            rank.textContent = rankingMode === 'level' ? `L${record.level}` : String(index + 1).padStart(2, '0');

            const detail = document.createElement('div');
            detail.className = 'rank-main';
            const title = document.createElement('strong');
            title.textContent = rankingMode === 'level'
                ? `${levels[record.level - 1]?.name || `第 ${record.level} 關`} · ${record.amber || 0} 琥珀`
                : (record.amber == null ? '歷史最佳里程' : `收集 ${record.amber} 枚琥珀`);
            const date = document.createElement('small');
            date.textContent = record.playedAt
                ? new Date(record.playedAt).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })
                : '既有本機成績';
            detail.append(title, date);

            const value = document.createElement('span');
            value.className = 'rank-score';
            value.innerHTML = rankingMode === 'level'
                ? `${Number(record.time || 0).toFixed(1)}<small> s</small>`
                : `${Math.floor(record.distance)}<small> m</small>`;
            row.append(rank, detail, value);
            list.append(row);
        });
    }

    function showScreen(name) {
        cancelAnimationFrame(menuAnimationFrame);
        menuAnimationFrame = 0;
        Object.entries(screens).forEach(([key, screen]) => screen.classList.toggle('active', key === name));
        window.MenuMusic?.setScreen(name);
        if (name === 'start') renderStartStats();
        if (name === 'mode') renderModeSelector();
        if (name === 'shop') renderShop();
        if (name === 'ranking') renderLeaderboard();
        if (name !== 'game') {
            cancelAnimationFrame(raf);
            state = 'idle';
            resultPanel.classList.remove('show');
            pausePanel.classList.remove('show');
            canvasWrap.classList.remove('comic-running', 'rush-active', 'comic-impact');
            comicFxLayer.replaceChildren();
        }
        if (name === 'start') startMenuAnimation();
        else {
            menuFxLayer.replaceChildren();
            resetMenuWorld();
        }
    }

    function openModeWithTutorial() {
        showScreen(localStorage.getItem(tutorialSeenKey) === '1' ? 'mode' : 'tutorial');
    }

    function completeTutorial() {
        localStorage.setItem(tutorialSeenKey, '1');
        showScreen('mode');
    }

    function showToast(message) {
        clearTimeout(toastTimer);
        toastEl.textContent = message;
        toastEl.hidden = false;
        toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
    }

    function showMenuPop(text, x, y, variant = '') {
        const effect = document.createElement('span');
        effect.className = `menu-pop${variant ? ` ${variant}` : ''}`;
        effect.textContent = text;
        effect.style.left = `${x}px`;
        effect.style.top = `${y}px`;
        menuFxLayer.append(effect);
        effect.addEventListener('animationend', () => effect.remove(), { once: true });
        setTimeout(() => effect.remove(), 1050);
    }

    function cheerMenuHero() {
        heroCheerUntil = performance.now() + 900;
        clearTimeout(heroCheerTimer);
        const heroRect = heroInteraction.getBoundingClientRect();
        const shellRect = startShell.getBoundingClientRect();
        const messages = ['嗷嗚！', '出發！', '再摸一下！'];
        heroInteraction.classList.add('hero-visited');
        heroInteraction.classList.remove('hero-cheer');
        void heroInteraction.offsetWidth;
        heroInteraction.classList.add('hero-cheer');
        showMenuPop(
            messages[heroTapCount % messages.length],
            heroRect.left - shellRect.left + heroRect.width * .7,
            heroRect.top - shellRect.top + heroRect.height * .23,
            'hero-pop'
        );
        heroTapCount += 1;
        sfx('hero');
        vibrate(10);
        heroCheerTimer = setTimeout(() => heroInteraction.classList.remove('hero-cheer'), 920);
    }

    function resetMenuAmbers() {
        menuAmberCount = 0;
        menuHuntCount.textContent = '0 / 3';
        menuHuntCount.parentElement.classList.remove('complete');
        document.querySelectorAll('[data-menu-amber]').forEach((button) => button.classList.remove('collected'));
    }

    function collectMenuAmber(button) {
        if (button.classList.contains('collected')) return;
        const gemRect = button.getBoundingClientRect();
        const shellRect = startShell.getBoundingClientRect();
        button.classList.add('collected');
        menuAmberCount += 1;
        menuHuntCount.textContent = `${menuAmberCount} / 3`;
        showMenuPop('找到！', gemRect.left - shellRect.left + gemRect.width / 2, gemRect.top - shellRect.top + gemRect.height / 2);
        sfx('collect');
        vibrate(8);
        if (menuAmberCount === 3) {
            menuHuntCount.parentElement.classList.add('complete');
            setTimeout(() => showMenuPop('全部找到了！', shellRect.width / 2, shellRect.height * .54, 'complete-pop'), 260);
            clearTimeout(menuAmberResetTimer);
            menuAmberResetTimer = setTimeout(resetMenuAmbers, 2700);
        }
    }

    function moveMenuWorld(event) {
        if (!screens.start.classList.contains('active')) return;
        const rect = startShell.getBoundingClientRect();
        const x = clamp((event.clientX - rect.left) / Math.max(rect.width, 1) * 2 - 1, -1, 1);
        const y = clamp((event.clientY - rect.top) / Math.max(rect.height, 1) * 2 - 1, -1, 1);
        startShell.style.setProperty('--menu-x', `${(x * 4).toFixed(1)}px`);
        startShell.style.setProperty('--menu-y', `${(y * 3).toFixed(1)}px`);
    }

    function resetMenuWorld() {
        startShell.style.setProperty('--menu-x', '0px');
        startShell.style.setProperty('--menu-y', '0px');
    }

    function drawMenuDino(now) {
        if (!screens.start.classList.contains('active') || document.hidden) return;
        if (now - menuLastDraw >= 80) {
            menuLastDraw = now;
            const celebrating = now < heroCheerUntil;
            const resting = reducedMotion.matches || Math.floor(now / 5200) % 3 === 2;
            const spriteFrame = celebrating ? 11 : resting ? (now % 2800 > 2630 ? 7 : 6) : Math.floor(now / 95) % 6;
            heroContext.setTransform(2, 0, 0, 2, 0, 0);
            heroContext.clearRect(0, 0, 244, 188);
            DinoSprites.draw(heroContext, menuSkinId, spriteFrame, 133, 181, 168);
            heroCanvas.dataset.dinoFrame = String(spriteFrame);
        }
        menuAnimationFrame = requestAnimationFrame(drawMenuDino);
    }

    function startMenuAnimation() {
        cancelAnimationFrame(menuAnimationFrame);
        menuLastDraw = -Infinity;
        menuAnimationFrame = requestAnimationFrame(drawMenuDino);
    }

    function showComicFx(text, x, y, variant = '') {
        const effect = document.createElement('span');
        effect.className = `comic-fx${variant ? ` ${variant}` : ''}`;
        effect.textContent = text;
        effect.style.left = `${clamp(x / Math.max(width, 1) * 100, 10, 90)}%`;
        effect.style.top = `${clamp(y / Math.max(height, 1) * 100, 12, 88)}%`;
        comicFxLayer.append(effect);
        effect.addEventListener('animationend', () => effect.remove(), { once: true });
        setTimeout(() => effect.remove(), 1100);
    }

    function triggerComicImpact(text, variant = 'impact') {
        showComicFx(text, player ? player.x + 38 : width * .3, player ? player.y - 55 : height * .5, variant);
        canvasWrap.classList.remove('comic-impact');
        void canvasWrap.offsetWidth;
        canvasWrap.classList.add('comic-impact');
        setTimeout(() => canvasWrap.classList.remove('comic-impact'), 320);
    }

    function updateItemDock() {
        const activeLabels = [];
        if (shieldReady) activeLabels.push('◇ 護盾待命');
        if (magnetTimer > 0) activeLabels.push(`✦ 磁石 ${Math.ceil(magnetTimer)}s`);
        if (slowTimer > 0) activeLabels.push(`◖ 減速 ${Math.ceil(slowTimer)}s`);
        if (rushTimer > 0) activeLabels.push(`⚡ 獸王暴走 ${Math.ceil(rushTimer)}s`);
        const status = $('item-status');
        status.hidden = activeLabels.length === 0;
        status.textContent = activeLabels.join(' · ');

        document.querySelectorAll('[data-use-item]').forEach((button) => {
            const itemId = button.dataset.useItem;
            const isActive = itemId === 'shield'
                ? shieldReady
                : itemId === 'magnet'
                    ? magnetTimer > 0
                    : itemId === 'slow'
                        ? slowTimer > 0
                        : rushTimer > 0;
            button.classList.toggle('active', isActive);
            button.disabled = state !== 'running' || (itemInventory[itemId] || 0) <= 0 || isActive;
            $(`item-count-${itemId}`).textContent = itemInventory[itemId] || 0;
        });
    }

    function useGameItem(itemId) {
        if (state !== 'running') return;
        const item = shopItems.find((entry) => entry.id === itemId);
        if (!item || (itemInventory[itemId] || 0) <= 0) {
            showToast('商店裡還沒有這個道具');
            return;
        }
        const alreadyActive = itemId === 'shield'
            ? shieldReady
            : itemId === 'magnet'
                ? magnetTimer > 0
                : itemId === 'slow'
                    ? slowTimer > 0
                    : rushTimer > 0;
        if (alreadyActive) {
            showToast(`${item.name}已經生效中`);
            return;
        }
        const shop = getShopState();
        if ((shop.items[itemId] || 0) <= 0) return;
        shop.items[itemId] -= 1;
        itemInventory[itemId] = shop.items[itemId];
        saveShopState(shop);
        if (itemId === 'shield') {
            shieldReady = true;
            showToast('護盾已展開，可抵擋一次碰撞');
            showComicFx('鏘！', width * .48, height * .37, 'shield');
            sfx('shield');
        } else if (itemId === 'magnet') {
            magnetTimer = 8;
            showToast('琥珀磁石啟動 8 秒');
            showComicFx('吸！', width * .48, height * .37, 'collect');
            sfx('powerup');
        } else if (itemId === 'slow') {
            slowTimer = 7;
            showToast('地圖速度降低 7 秒');
            showComicFx('慢！', width * .48, height * .37, 'shield');
            sfx('powerup');
        } else {
            rushTimer = 10;
            showToast('獸王暴走！10 秒 3 倍速、無敵並吸取琥珀');
            showComicFx('暴走！', width * .5, height * .4, 'rush');
            sfx('rush');
        }
        vibrate(18);
        updateItemDock();
    }

    function setHud() {
        scoreEl.textContent = Math.floor(distance);
        amberEl.textContent = amber;
        speedEl.textContent = `${(speed / baseSpeed).toFixed(1)}×`;
        bestLabelEl.textContent = currentMode === 'level' ? '目標' : '最佳';
        bestEl.textContent = currentMode === 'level'
            ? levels[selectedLevel].target
            : Math.max(getBest(), Math.floor(distance));
        livesEl.textContent = `${'♥'.repeat(lives)}${'♡'.repeat(maxLives - lives)}`;
        livesEl.setAttribute('aria-label', `剩餘${lives}次生命`);
        updateItemDock();
    }

    function animateLives(kind = 'hit') {
        lifeHudEl.classList.remove('life-hit', 'life-heal');
        void lifeHudEl.offsetWidth;
        lifeHudEl.classList.add(kind === 'heal' ? 'life-heal' : 'life-hit');
    }

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20) return;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = rect.width;
        height = rect.height;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        groundY = Math.round(height * .79);
        baseSpeed = Math.max(190, width * .53);
        if (player && player.grounded) player.y = groundY;
    }

    function resetGame() {
        resizeCanvas();
        activeSkin = getEquippedSkin();
        DinoSprites.load(activeSkin.id);
        baseSpeed = currentMode === 'level'
            ? levels[selectedLevel].speed
            : Math.max(172, width * .46);
        elapsed = 0;
        distance = 0;
        amber = 0;
        lives = maxLives;
        shieldReady = false;
        magnetTimer = 0;
        slowTimer = 0;
        rushTimer = 0;
        comicCollectCooldown = 0;
        peakSpeedRatio = 1;
        const shop = getShopState();
        itemInventory = {
            shield: shop.items.shield || 0,
            magnet: shop.items.magnet || 0,
            slow: shop.items.slow || 0,
            rush: shop.items.rush || 0
        };
        speed = baseSpeed;
        worldOffset = 0;
        obstacleClock = currentMode === 'level' ? 2.05 : 2.2;
        amberClock = 1.35;
        pickupClock = random(4.8, 7.2);
        hitFlash = 0;
        invulnerable = 0;
        jumpBuffer = 0;
        coyoteTimer = .12;
        jumpHoldTimer = 0;
        jumpHeld = false;
        jumpCutPending = false;
        $('jump-button').classList.remove('pressed');
        obstacles = [];
        ambers = [];
        pickups = [];
        particles = [];
        comicFxLayer.replaceChildren();
        canvasWrap.classList.remove('comic-impact', 'rush-active');
        canvasWrap.classList.add('comic-running');
        clouds = Array.from({ length: 5 }, (_, index) => ({
            x: index * width * .31 + random(-30, 45),
            y: random(height * .09, height * .34),
            scale: random(.55, 1.1)
        }));
        player = {
            x: clamp(width * .19, 60, 82),
            y: groundY,
            vy: 0,
            grounded: true,
            jumpsUsed: 0,
            runPhase: 0,
            squash: 0,
            hurtTimer: 0,
            landTimer: 0
        };
        resultPanel.classList.remove('show');
        pausePanel.classList.remove('show');
        nextLevelButton.hidden = true;
        $('restart-game').textContent = currentMode === 'level' ? '重新挑戰本關' : 'GO！再跑一次';
        gameModeTitle.textContent = currentMode === 'level' ? `闖關 · 第 ${selectedLevel + 1} 關` : '無盡挑戰';
        gameModeSubtitle.textContent = currentMode === 'level'
            ? `${levels[selectedLevel].name.toUpperCase()} · ${levels[selectedLevel].target}M`
            : '6 MAPS · EASY START · GETS HARDER';
        jumpHint.hidden = false;
        setHud();
    }

    function startGame(mode = currentMode, levelIndex = selectedLevel) {
        currentMode = mode;
        selectedLevel = clamp(levelIndex, 0, getUnlockedLevel() - 1);
        // Start playback during the click, before the animation-frame callback, for iOS.
        window.MenuMusic?.setGameState('running', { restart: true });
        showScreen('game');
        requestAnimationFrame(() => {
            resetGame();
            state = 'running';
            lastTime = performance.now();
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(frame);
        });
    }

    function ensureAudio() {
        window.GameSfx?.unlock();
    }

    function sfx(name) {
        window.GameSfx?.play(name);
    }

    function vibrate(pattern) {
        if (navigator.vibrate) navigator.vibrate(pattern);
    }

    function performJump(isDoubleJump = false) {
        player.landTimer = 0;
        jumpBuffer = 0;
        coyoteTimer = 0;
        jumpHoldTimer = .1;
        jumpCutPending = false;
        player.grounded = false;
        player.jumpsUsed = isDoubleJump ? 2 : 1;
        player.vy = -Math.max(570, height * 1.08) * (isDoubleJump ? .9 : 1);
        player.squash = 1;
        jumpHint.hidden = true;
        sfx(isDoubleJump ? 'doubleJump' : 'jump');
        burst(player.x + 8, player.y - 3, isDoubleJump ? '#ffd84f' : '#d9c483', isDoubleJump ? 16 : 8, isDoubleJump ? 140 : 82);
        showComicFx(isDoubleJump ? '二段跳！' : '咻！', player.x + 35, player.y - 68, isDoubleJump ? 'double-jump' : '');
        if (isDoubleJump) vibrate(10);
    }

    function jump() {
        if (state !== 'running' || !player || jumpHeld) return;
        ensureAudio();
        jumpHeld = true;
        jumpCutPending = false;
        $('jump-button').classList.add('pressed');
        if (player.grounded || (coyoteTimer > 0 && player.jumpsUsed === 0)) {
            performJump();
        } else if (player.jumpsUsed < 2) {
            performJump(true);
        } else {
            // Once both jumps are spent, a fresh press may queue the next ground jump,
            // but must never create a third airborne impulse near the floor.
            jumpBuffer = .2;
        }
    }

    function releaseJump() {
        if (!jumpHeld) return;
        jumpHeld = false;
        jumpCutPending = true;
        $('jump-button').classList.remove('pressed');
    }

    function pauseGame() {
        if (state !== 'running') return;
        releaseJump();
        state = 'paused';
        window.MenuMusic?.setGameState('paused');
        cancelAnimationFrame(raf);
        pausePanel.classList.add('show');
        updateItemDock();
    }

    function resumeGame() {
        if (state !== 'paused') return;
        state = 'running';
        pausePanel.classList.remove('show');
        window.MenuMusic?.setGameState('running');
        lastTime = performance.now();
        updateItemDock();
        raf = requestAnimationFrame(frame);
    }

    function finishGame() {
        if (state !== 'running') return;
        state = 'ended';
        window.MenuMusic?.setGameState('ended');
        canvasWrap.classList.remove('comic-running', 'rush-active');
        releaseJump();
        const finalDistance = Math.floor(distance);
        $('final-score').textContent = finalDistance;
        nextLevelButton.hidden = true;
        if (currentMode === 'endless') {
            const isRecord = saveEndlessResult(finalDistance, amber);
            $('result-title').textContent = isRecord ? '打破無盡紀錄！' : '無盡挑戰結束';
            $('result-detail').textContent = `收集 ${amber} 枚琥珀 · 最高速度 ${peakSpeedRatio.toFixed(1)}×`;
        } else {
            saveRunStats(amber);
            const remaining = Math.max(0, levels[selectedLevel].target - finalDistance);
            $('result-title').textContent = `第 ${selectedLevel + 1} 關 · 再試一次`;
            $('result-detail').textContent = `距離終點還有 ${remaining}m · 本局收集 ${amber} 枚琥珀`;
        }
        bestEl.textContent = getBest();
        resultPanel.classList.add('show');
        sfx('defeat');
        vibrate([40, 35, 90]);
    }

    function completeLevel() {
        if (state !== 'running' || currentMode !== 'level') return;
        state = 'ended';
        window.MenuMusic?.setGameState('ended');
        canvasWrap.classList.remove('comic-running', 'rush-active');
        releaseJump();
        const level = levels[selectedLevel];
        const clearTime = Math.max(.1, elapsed);
        const isRecord = saveLevelResult(selectedLevel, clearTime, amber);
        $('final-score').textContent = level.target;
        $('result-title').textContent = `第 ${selectedLevel + 1} 關完成！`;
        $('result-detail').textContent = `${clearTime.toFixed(1)} 秒抵達終點 · ${amber} 枚琥珀${isRecord ? ' · 新紀錄' : ''}`;
        nextLevelButton.hidden = selectedLevel >= levels.length - 1;
        $('restart-game').textContent = '再跑一次本關';
        resultPanel.classList.add('show');
        sfx('win');
        vibrate([20, 25, 20]);
    }

    function burst(x, y, color, count = 8, force = 120) {
        for (let i = 0; i < count; i += 1) {
            const angle = random(Math.PI, Math.PI * 2);
            particles.push({
                x, y,
                vx: Math.cos(angle) * random(force * .35, force),
                vy: Math.sin(angle) * random(force * .35, force),
                life: random(.35, .75),
                maxLife: .75,
                size: random(2, 5),
                color
            });
        }
    }

    function getCurrentMapTheme() {
        if (currentMode === 'level') {
            return mapThemes.find((theme) => theme.id === levels[selectedLevel].theme) || mapThemes[0];
        }
        return mapThemes[Math.floor(Math.max(0, distance) / 115) % mapThemes.length];
    }

    function spawnObstacle() {
        const theme = getCurrentMapTheme();
        let pool = theme.obstacles;
        if (currentMode === 'endless' && distance < 35) pool = pool.slice(0, 2);
        const type = pool[Math.floor(Math.random() * pool.length)];
        const sizes = {
            rock: () => ({ w: random(34, 48), h: random(31, 49) }),
            stump: () => ({ w: random(31, 42), h: random(40, 57) }),
            thorns: () => ({ w: random(48, 68), h: random(24, 34) }),
            mushroom: () => ({ w: random(40, 53), h: random(38, 51) }),
            crystal: () => ({ w: random(31, 43), h: random(48, 63) }),
            bone: () => ({ w: random(50, 66), h: random(27, 37) }),
            totem: () => ({ w: random(30, 41), h: random(49, 64) })
        };
        const obstacle = { type, ...sizes[type]() };
        obstacle.x = width + 32;
        obstacle.y = groundY;
        obstacle.variant = Math.random();
        obstacles.push(obstacle);
        if (currentMode === 'level') {
            const config = levels[selectedLevel];
            obstacleClock = random(config.gapMin, config.gapMax);
        } else {
            const difficulty = clamp((distance - 40) / 460, 0, 1);
            obstacleClock = random(2.02 - difficulty * .72, 2.42 - difficulty * .82);
        }
    }

    function spawnAmberTrail() {
        const count = Math.random() < .32 ? 5 : 3;
        const lift = Math.random() < .48 ? random(78, 116) : random(38, 60);
        for (let i = 0; i < count; i += 1) {
            const arc = count > 3 ? Math.sin((i / (count - 1)) * Math.PI) * 28 : 0;
            ambers.push({
                x: width + 55 + i * 31,
                y: groundY - lift - arc,
                r: 8,
                spin: random(0, Math.PI * 2),
                collected: false
            });
        }
        amberClock = random(1.8, 2.8);
    }

    function choosePickupDrop() {
        const totalWeight = pickupDrops.reduce((sum, drop) => sum + drop.weight, 0);
        let roll = Math.random() * totalWeight;
        for (const drop of pickupDrops) {
            roll -= drop.weight;
            if (roll <= 0) return drop;
        }
        return pickupDrops[0];
    }

    function spawnPickup() {
        const drop = choosePickupDrop();
        const obstacleNearby = obstacles.some((item) => item.x > width * .72);
        pickups.push({
            ...drop,
            x: width + 48,
            y: groundY - (obstacleNearby ? random(91, 112) : random(54, 96)),
            r: 18,
            phase: random(0, Math.PI * 2),
            spin: 0,
            collected: false
        });
        pickupClock = random(8.5, 13);
    }

    function collectPickup(pickup) {
        if (pickup.collected) return;
        pickup.collected = true;
        burst(pickup.x, pickup.y, pickup.color, 14, 145);
        let comicLabel = '入袋！';
        let comicVariant = 'collect';
        if (pickup.itemId) {
            if (pickup.id === 'rush') {
                comicLabel = '暴走！';
                comicVariant = 'rush';
            }
            const shop = getShopState();
            const currentCount = shop.items[pickup.itemId] || 0;
            if (currentCount >= 99) {
                amber += 3;
                showToast(`${pickup.name}已滿，轉換成 3 枚琥珀`);
            } else {
                shop.items[pickup.itemId] = currentCount + 1;
                itemInventory[pickup.itemId] = shop.items[pickup.itemId];
                saveShopState(shop);
                updateItemDock();
                showToast(`撿到「${pickup.name}」！已放入快捷欄`);
            }
        } else if (pickup.instant === 'heart') {
            if (lives < maxLives) {
                lives += 1;
                animateLives();
                showToast('生命果實：恢復 1 顆心');
                comicLabel = '回血！';
            } else {
                amber += 2;
                showToast('生命已滿，果實轉換成 2 枚琥珀');
                comicLabel = '+2！';
            }
        } else {
            amber += 5;
            showToast('琥珀小包：獲得 5 枚琥珀');
            comicLabel = '+5！';
        }
        showComicFx(comicLabel, pickup.x, pickup.y - 22, comicVariant);
        sfx(pickup.id === 'rush' ? 'rush' : pickup.instant === 'heart' ? 'heal' : pickup.itemId ? 'powerup' : 'gem');
        vibrate([12, 18, 12]);
        setHud();
    }

    function rectsOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function playerHitBox() {
        return { x: player.x - 15, y: player.y - 51, w: 38, h: 45 };
    }

    function canStompMushroom(item, previousFeetY) {
        if (item.type !== 'mushroom' || item.stomped) return false;
        const capY = item.y - item.h + 3;
        const fallDistance = player.y - previousFeetY;
        // Cross the cap from above. Rising into it or touching its side is not a stomp.
        if (fallDistance <= 0 || previousFeetY > capY || player.y < capY) return false;
        const impactTime = (capY - previousFeetY) / fallDistance;
        const previousX = item.previousX ?? item.x;
        const capX = previousX + (item.x - previousX) * impactTime;
        // Use the cap position at contact, not at frame end (important during a rush).
        const overlap = Math.min(player.x + 20, capX + item.w - 6)
            - Math.max(player.x - 12, capX + 6);
        return overlap >= 4;
    }

    function stompMushroom(item) {
        if (item.stomped) return;
        item.stomped = true;
        item.stompTimer = .32;
        const healed = lives < maxLives;
        lives = Math.min(maxLives, lives + 1);
        player.y = item.y - item.h + 3;
        player.vy = -Math.max(350, height * .62);
        player.grounded = false;
        // The mushroom bounce replaces the first jump and restores one air jump.
        player.jumpsUsed = 1;
        player.squash = 1.15;
        player.hurtTimer = 0;
        player.landTimer = 0;
        releaseJump();
        jumpBuffer = 0;
        coyoteTimer = 0;
        jumpHoldTimer = .1;
        jumpCutPending = false;
        burst(item.x + item.w / 2, player.y, '#38b9ad', 16, 140);
        burst(item.x + item.w / 2, player.y, '#ffd84f', 8, 110);
        showComicFx(healed ? '♥ +1' : '滿血！', player.x + 28, player.y - 64, 'heal');
        if (healed) animateLives('heal');
        showToast(healed ? '踩中蘑菇！恢復 1 顆心' : '踩中蘑菇！生命已滿，彈跳繼續');
        sfx(healed ? 'heal' : 'stomp');
        vibrate([9, 16, 9]);
        setHud();
    }

    function collectAmberItem(item) {
        if (item.collected) return;
        item.collected = true;
        amber += 1;
        distance += 4;
        burst(item.x, item.y, '#ffc64a', 9, 120);
        if (comicCollectCooldown <= 0 || amber % 10 === 0) {
            showComicFx(amber % 10 === 0 ? '加心！' : '收！', item.x, item.y - 18, 'collect');
            comicCollectCooldown = .18;
        }
        if (amber % 10 === 0 && lives < maxLives) {
            lives += 1;
            animateLives();
            showToast('集滿 10 枚琥珀，補回 1 顆心');
            sfx('heal');
        } else {
            sfx('collect');
        }
        vibrate(12);
    }

    function update(dt) {
        elapsed += dt;
        magnetTimer = Math.max(0, magnetTimer - dt);
        slowTimer = Math.max(0, slowTimer - dt);
        rushTimer = Math.max(0, rushTimer - dt);
        comicCollectCooldown = Math.max(0, comicCollectCooldown - dt);
        canvasWrap.classList.toggle('comic-running', state === 'running');
        canvasWrap.classList.toggle('rush-active', rushTimer > 0);
        if (currentMode === 'level') {
            speed = baseSpeed;
        } else {
            const difficulty = clamp((distance - 45) / 455, 0, 1);
            speed = baseSpeed * (1 + difficulty * .72);
        }
        if (rushTimer > 0) speed *= 3;
        else if (slowTimer > 0) speed *= .72;
        peakSpeedRatio = Math.max(peakSpeedRatio, speed / baseSpeed);
        worldOffset += speed * dt;
        distance += speed * dt * .034;
        hitFlash = Math.max(0, hitFlash - dt * 3.5);
        invulnerable = Math.max(0, invulnerable - dt);
        jumpBuffer = Math.max(0, jumpBuffer - dt);
        jumpHoldTimer = Math.max(0, jumpHoldTimer - dt);
        coyoteTimer = player.grounded ? .12 : Math.max(0, coyoteTimer - dt);
        player.runPhase += dt * (9.5 + speed / 80);
        player.hurtTimer = Math.max(0, player.hurtTimer - dt);
        player.landTimer = Math.max(0, player.landTimer - dt);

        const previousFeetY = player.y;
        if (!player.grounded) {
            if (!jumpHeld && jumpCutPending && jumpHoldTimer <= 0 && player.vy < -150) {
                player.vy *= .56;
                jumpCutPending = false;
            }
            if (player.vy >= 0) jumpCutPending = false;
            const baseGravity = Math.max(1350, height * 2.45);
            const gravityScale = player.vy < 0
                ? (jumpHeld || jumpHoldTimer > 0 ? .7 : 1.34)
                : 1.18;
            player.vy = Math.min(1180, player.vy + baseGravity * gravityScale * dt);
            player.y += player.vy * dt;
            // Keep the entire sprite in view on shorter screens during a double jump.
            const ceilingY = Math.min(100, groundY - 50);
            if (player.y < ceilingY) {
                player.y = ceilingY;
                player.vy = Math.max(0, player.vy);
            }
            if (player.y >= groundY) {
                const landingSpeed = player.vy;
                player.y = groundY;
                player.vy = 0;
                player.grounded = true;
                player.jumpsUsed = 0;
                coyoteTimer = .12;
                jumpCutPending = false;
                player.squash = clamp(.62 + landingSpeed / 900, .72, 1.18);
                player.landTimer = .1;
                burst(player.x + 2, groundY - 2, '#d9c483', landingSpeed > 560 ? 10 : 7, 72);
                sfx('land');
                if (landingSpeed > 560) vibrate(7);
                if (jumpBuffer > 0) performJump();
            }
        }
        player.squash = Math.max(0, player.squash - dt * 5.5);

        const worldTimeScale = rushTimer > 0 ? 1 : slowTimer > 0 ? .72 : 1;
        obstacleClock -= dt * worldTimeScale;
        amberClock -= dt * worldTimeScale;
        pickupClock -= dt * worldTimeScale;
        if (obstacleClock <= 0) spawnObstacle();
        if (amberClock <= 0) spawnAmberTrail();
        if (pickupClock <= 0) spawnPickup();

        obstacles.forEach((item) => {
            item.previousX = item.x;
            item.x -= speed * dt;
            if (item.stomped) item.stompTimer = Math.max(0, item.stompTimer - dt);
        });
        ambers.forEach((item) => { item.x -= speed * dt; item.spin += dt * 7; });
        pickups.forEach((item) => { item.x -= speed * dt; item.spin += dt * 3.5; });
        obstacles = obstacles.filter((item) => item.x + item.w > -30 && (!item.stomped || item.stompTimer > 0));
        ambers = ambers.filter((item) => item.x + item.r > -30 && !item.collected);
        pickups = pickups.filter((item) => item.x + item.r > -30 && !item.collected);

        let hitBox = playerHitBox();
        for (const item of obstacles) {
            if (item.stomped) continue;
            // A valid top landing wins over damage, shield consumption or rush destruction.
            if (canStompMushroom(item, previousFeetY)) {
                stompMushroom(item);
                hitBox = playerHitBox();
                break;
            }
            const padding = item.type === 'thorns' ? 11 : item.type === 'bone' ? 9 : item.type === 'crystal' ? 7 : 8;
            const obstacleBox = {
                x: item.x + padding,
                y: item.y - item.h + padding,
                w: item.w - padding * 2,
                h: item.h - padding
            };
            if ((rushTimer > 0 || invulnerable <= 0) && rectsOverlap(hitBox, obstacleBox)) {
                if (rushTimer > 0) {
                    item.x = -item.w - 40;
                    obstacleClock = Math.max(obstacleClock, .72);
                    burst(player.x + 16, player.y - 34, '#ffd84f', 14, 190);
                    burst(player.x + 24, player.y - 28, '#ff6f4d', 8, 155);
                    triggerComicImpact('撞飛！', 'rush');
                    sfx('smash');
                    vibrate(12);
                    break;
                } else if (shieldReady) {
                    shieldReady = false;
                    invulnerable = 1.1;
                    item.x = -item.w - 40;
                    obstacleClock = Math.max(obstacleClock, 1.15);
                    player.grounded = false;
                    player.jumpsUsed = Math.max(1, player.jumpsUsed);
                    coyoteTimer = 0;
                    player.vy = -Math.max(210, height * .34);
                    burst(player.x + 8, player.y - 37, '#ffd84f', 18, 175);
                    triggerComicImpact('擋！', 'shield');
                    showToast('護盾擋住了這次碰撞！');
                    sfx('shield');
                    vibrate([18, 20, 18]);
                    updateItemDock();
                    break;
                }
                hitFlash = 1;
                player.hurtTimer = .4;
                lives = Math.max(0, lives - 1);
                invulnerable = 1.65;
                item.x = -item.w - 40;
                obstacleClock = Math.max(obstacleClock, 1.15);
                player.grounded = false;
                player.jumpsUsed = Math.max(1, player.jumpsUsed);
                coyoteTimer = 0;
                player.vy = -Math.max(300, height * .48);
                burst(player.x + 10, player.y - 34, '#f06b4f', 13, 155);
                triggerComicImpact('砰！');
                animateLives();
                setHud();
                if (lives <= 0) {
                    finishGame();
                } else {
                    showToast(item.type === 'mushroom'
                        ? `側面撞到蘑菇！扣 1 顆心，還有 ${lives} 次機會`
                        : `別急，還有 ${lives} 次機會`);
                    sfx('hurt');
                    vibrate([25, 25, 45]);
                }
                break;
            }
        }

        if (state === 'running') {
            for (const item of ambers) {
                const closestX = clamp(item.x, hitBox.x, hitBox.x + hitBox.w);
                const closestY = clamp(item.y, hitBox.y, hitBox.y + hitBox.h);
                const touching = (item.x - closestX) ** 2 + (item.y - closestY) ** 2 < (item.r + 4) ** 2;
                const magnetCatch = (magnetTimer > 0 || rushTimer > 0)
                    && item.x >= hitBox.x - 30
                    && item.x <= (rushTimer > 0 ? width + 30 : hitBox.x + 185);
                if (touching || magnetCatch) collectAmberItem(item);
            }
            for (const pickup of pickups) {
                const pickupY = pickup.y + Math.sin(elapsed * 4 + pickup.phase) * 5;
                const closestX = clamp(pickup.x, hitBox.x, hitBox.x + hitBox.w);
                const closestY = clamp(pickupY, hitBox.y, hitBox.y + hitBox.h);
                const touching = (pickup.x - closestX) ** 2 + (pickupY - closestY) ** 2 < (pickup.r + 5) ** 2;
                const rushCatch = rushTimer > 0 && pickup.x >= hitBox.x - 30 && pickup.x <= width + 30;
                if (touching || rushCatch) collectPickup(pickup);
            }
        }

        particles.forEach((particle) => {
            particle.life -= dt;
            particle.vy += 340 * dt;
            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;
            particle.vx *= .985;
        });
        particles = particles.filter((particle) => particle.life > 0);
        if (state === 'running' && currentMode === 'level' && distance >= levels[selectedLevel].target) {
            distance = levels[selectedLevel].target;
            completeLevel();
        }
        setHud();
    }

    function roundedRect(x, y, w, h, radius, fill) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, radius);
        ctx.fillStyle = fill;
        ctx.fill();
    }

    function drawCloud(x, y, scale, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#fffdf2';
        ctx.beginPath();
        ctx.ellipse(x, y, 35 * scale, 12 * scale, 0, 0, Math.PI * 2);
        ctx.ellipse(x - 18 * scale, y - 6 * scale, 18 * scale, 17 * scale, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 13 * scale, y - 9 * scale, 22 * scale, 21 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawMountainLayer(color, baseY, amplitude, step, factor) {
        const offset = -((worldOffset * factor) % step);
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(offset - step, baseY);
        for (let x = offset - step; x < width + step * 2; x += step) {
            ctx.lineTo(x + step * .5, baseY - amplitude * (.68 + ((Math.floor((x + worldOffset * factor) / step) & 1) * .25)));
            ctx.lineTo(x + step, baseY);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    function drawMapDecor(theme) {
        const decorOffset = -((worldOffset * .38) % 128);
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        if (theme.decor === 'ferns') {
            ctx.strokeStyle = '#315c55';
            ctx.lineWidth = 3;
            for (let x = decorOffset - 30; x < width + 80; x += 92) {
                ctx.beginPath();
                ctx.moveTo(x, groundY);
                ctx.quadraticCurveTo(x + 4, groundY - 25, x + 14, groundY - 39);
                for (let leaf = 0; leaf < 3; leaf += 1) {
                    const leafY = groundY - 13 - leaf * 8;
                    ctx.moveTo(x + 5 + leaf * 3, leafY);
                    ctx.lineTo(x - 7 + leaf * 2, leafY - 8);
                    ctx.moveTo(x + 7 + leaf * 3, leafY - 2);
                    ctx.lineTo(x + 20 + leaf * 4, leafY - 11);
                }
                ctx.stroke();
            }
        } else if (theme.decor === 'mesas') {
            for (let x = decorOffset - 90; x < width + 140; x += 128) {
                const mesaY = groundY - 84 - ((Math.floor((x - decorOffset) / 128) & 1) * 25);
                ctx.globalAlpha = .48;
                ctx.fillStyle = '#8e5261';
                ctx.fillRect(x + 16, mesaY, 58, groundY - mesaY);
                ctx.fillStyle = '#f3a56f';
                ctx.fillRect(x + 7, mesaY, 76, 13);
                ctx.fillStyle = '#ffd080';
                ctx.fillRect(x + 22, mesaY + 26, 44, 7);
            }
        } else if (theme.decor === 'cave') {
            ctx.globalAlpha = .96;
            ctx.fillStyle = '#25233c';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(width, 0);
            for (let x = width; x >= -45; x -= 54) {
                const tooth = 24 + (Math.floor(x / 54) & 1) * 22;
                ctx.lineTo(x, tooth);
                ctx.lineTo(x - 18, tooth + 29);
                ctx.lineTo(x - 34, tooth);
            }
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = .7;
            ctx.fillStyle = '#ffd84f';
            for (let x = decorOffset; x < width + 100; x += 128) {
                ctx.beginPath();
                ctx.moveTo(x + 17, groundY - 3);
                ctx.lineTo(x + 27, groundY - 34);
                ctx.lineTo(x + 37, groundY - 3);
                ctx.closePath();
                ctx.fill();
            }
        } else if (theme.decor === 'bones') {
            ctx.strokeStyle = 'rgba(255,245,207,.72)';
            ctx.lineWidth = 7;
            for (let x = decorOffset - 40; x < width + 120; x += 136) {
                for (let rib = 0; rib < 3; rib += 1) {
                    ctx.beginPath();
                    ctx.arc(x + rib * 15, groundY + 2, 30 + rib * 3, Math.PI, Math.PI * 1.63);
                    ctx.stroke();
                }
                ctx.beginPath();
                ctx.moveTo(x - 31, groundY - 2);
                ctx.lineTo(x + 46, groundY - 46);
                ctx.stroke();
            }
        } else if (theme.decor === 'lava') {
            ctx.strokeStyle = '#ff9d43';
            ctx.lineWidth = 4;
            for (let x = decorOffset - 30; x < width + 120; x += 105) {
                ctx.beginPath();
                ctx.moveTo(x, groundY + 22);
                ctx.lineTo(x + 16, groundY + 34);
                ctx.lineTo(x + 7, groundY + 49);
                ctx.lineTo(x + 30, groundY + 66);
                ctx.stroke();
            }
            ctx.globalAlpha = .34;
            ctx.fillStyle = '#ffd84f';
            for (let x = decorOffset + 35; x < width + 120; x += 128) {
                ctx.beginPath();
                ctx.arc(x, groundY - 60, 12, 0, Math.PI * 2);
                ctx.arc(x + 8, groundY - 82, 8, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (theme.decor === 'ruins') {
            ctx.globalAlpha = .5;
            ctx.fillStyle = '#c8bdd2';
            ctx.strokeStyle = '#292f46';
            ctx.lineWidth = 3;
            for (let x = decorOffset - 60; x < width + 140; x += 128) {
                const ruinH = 65 + (Math.floor((x - decorOffset) / 128) & 1) * 25;
                ctx.fillRect(x, groundY - ruinH, 34, ruinH);
                ctx.strokeRect(x, groundY - ruinH, 34, ruinH);
                ctx.fillRect(x - 8, groundY - ruinH, 50, 10);
                ctx.strokeRect(x - 8, groundY - ruinH, 50, 10);
                ctx.fillStyle = '#292f46';
                ctx.fillRect(x + 12, groundY - ruinH + 22, 10, ruinH - 22);
                ctx.fillStyle = '#c8bdd2';
            }
        }
        ctx.restore();
    }

    function drawBackground() {
        const theme = getCurrentMapTheme();
        const sky = ctx.createLinearGradient(0, 0, 0, groundY);
        sky.addColorStop(0, theme.skyTop);
        sky.addColorStop(.56, theme.skyBottom);
        sky.addColorStop(1, theme.ground);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.globalAlpha = .86;
        ctx.fillStyle = theme.celestial;
        ctx.beginPath();
        ctx.arc(width * .79, height * .18, Math.min(width, height) * .09, 0, Math.PI * 2);
        ctx.fill();
        if (theme.id === 'ruins') {
            ctx.fillStyle = theme.skyTop;
            ctx.beginPath();
            ctx.arc(width * .82, height * .155, Math.min(width, height) * .075, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff5cf';
            for (let i = 0; i < 12; i += 1) {
                ctx.globalAlpha = .42 + (i % 3) * .18;
                ctx.fillRect((i * 73 + 19) % width, 34 + (i * 47) % Math.max(80, groundY - 150), 2 + (i & 1), 2 + (i & 1));
            }
        }
        ctx.restore();

        clouds.forEach((cloud, index) => {
            const span = width + 150;
            const x = ((cloud.x - worldOffset * (.025 + index * .003) + 80) % span + span) % span - 70;
            const cloudAlpha = theme.id === 'cave' ? .05 : theme.id === 'volcano' ? .13 : .26;
            drawCloud(x, cloud.y, cloud.scale, cloudAlpha);
        });
        drawMountainLayer(theme.far, groundY - 64, height * .26, width * .55, .075);
        drawMountainLayer(theme.near, groundY - 30, height * .19, width * .43, .15);

        ctx.fillStyle = theme.ground;
        ctx.fillRect(0, groundY, width, height - groundY);
        ctx.fillStyle = theme.edge;
        ctx.fillRect(0, groundY - 5, width, 7);
        ctx.fillStyle = '#172638';
        ctx.fillRect(0, groundY - 2, width, 2);

        const pebbleOffset = -((worldOffset * .9) % 58);
        for (let x = pebbleOffset - 58; x < width + 58; x += 58) {
            ctx.fillStyle = 'rgba(23,38,56,.20)';
            ctx.beginPath();
            ctx.ellipse(x + 18, groundY + 25 + ((x / 58) & 1) * 23, 8, 3, -.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(23,38,56,.26)';
            ctx.fillRect(x + 42, groundY + 57, 3, 9);
        }

        const grassOffset = -((worldOffset * .65) % 91);
        ctx.strokeStyle = theme.detail;
        ctx.lineWidth = 2;
        for (let x = grassOffset; x < width + 91; x += 91) {
            ctx.beginPath();
            ctx.moveTo(x, groundY);
            ctx.lineTo(x - 5, groundY - 12);
            ctx.moveTo(x, groundY);
            ctx.lineTo(x + 4, groundY - 16);
            ctx.moveTo(x, groundY);
            ctx.lineTo(x + 10, groundY - 9);
            ctx.stroke();
        }
        drawMapDecor(theme);

        ctx.save();
        ctx.font = '900 9px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const badgeWidth = Math.max(65, ctx.measureText(theme.name).width + 22);
        ctx.fillStyle = 'rgba(23,38,56,.82)';
        ctx.beginPath();
        ctx.roundRect(width - badgeWidth - 8, 10, badgeWidth, 24, 12);
        ctx.fill();
        ctx.fillStyle = '#fff5cf';
        ctx.fillText(`MAP · ${theme.name}`, width - 18, 22);
        ctx.restore();
    }

    function drawDino() {
        let spriteFrame;
        if (state === 'ended') {
            spriteFrame = currentMode === 'level' && lives > 0 && distance >= levels[selectedLevel].target ? 11 : 10;
        } else if (player.hurtTimer > 0) {
            spriteFrame = 10;
        } else if (!player.grounded) {
            spriteFrame = player.vy < 0 ? 8 : 9;
        } else if (player.landTimer > 0) {
            spriteFrame = 1;
        } else {
            spriteFrame = DinoSprites.runFrame(player.runPhase);
        }
        canvas.dataset.dinoAction = ['run', 'run', 'run', 'run', 'run', 'run', 'idle', 'blink', 'jump', 'fall', 'hurt', 'cheer'][spriteFrame];
        canvas.dataset.dinoFrame = String(spriteFrame);
        canvas.dataset.dinoSkin = activeSkin.id;

        ctx.save();
        ctx.globalAlpha = clamp(1 - (groundY - player.y) / 260, .25, .5);
        ctx.fillStyle = '#172638';
        ctx.beginPath();
        ctx.ellipse(player.x + 3, groundY + 3, 31, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = invulnerable > 0 && player.hurtTimer <= 0 && Math.floor(invulnerable * 12) % 2 === 0 ? .4 : 1;
        ctx.translate(player.x, player.y + 2);
        ctx.rotate(player.grounded ? 0 : clamp(player.vy / 6500, -.06, .07));
        ctx.scale(1 + player.squash * .055, 1 - player.squash * .045);
        DinoSprites.draw(ctx, activeSkin.id, spriteFrame, 0, spriteFrame === 3 ? -3 : 0, 96);
        ctx.restore();
    }

    function drawItemEffects() {
        if (!player) return;
        const centerX = player.x + 1;
        const centerY = player.y - 43;
        ctx.save();
        if (rushTimer > 0) {
            const pulse = 46 + Math.sin(elapsed * 11) * 3;
            ctx.globalAlpha = .2;
            ctx.fillStyle = '#ffd84f';
            ctx.beginPath();
            ctx.arc(centerX, centerY, pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = .88;
            ctx.strokeStyle = '#ff6f4d';
            ctx.lineWidth = 5;
            ctx.setLineDash([13, 7]);
            ctx.lineDashOffset = -elapsed * 55;
            ctx.beginPath();
            ctx.arc(centerX, centerY, pulse, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineCap = 'round';
            for (let i = 0; i < 5; i += 1) {
                const trailY = centerY - 25 + i * 12;
                const trailLength = 26 + ((i * 11 + elapsed * 65) % 27);
                ctx.globalAlpha = .48 + i * .07;
                ctx.strokeStyle = i % 2 ? '#ffd84f' : '#ff6f4d';
                ctx.lineWidth = i % 2 ? 4 : 6;
                ctx.beginPath();
                ctx.moveTo(centerX - 26, trailY);
                ctx.lineTo(centerX - 26 - trailLength, trailY);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
        if (shieldReady) {
            const pulse = 43 + Math.sin(elapsed * 6) * 2;
            ctx.globalAlpha = .24;
            ctx.fillStyle = '#8ce7dc';
            ctx.beginPath();
            ctx.arc(centerX, centerY, pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = .9;
            ctx.strokeStyle = '#fff5cf';
            ctx.lineWidth = 3;
            ctx.setLineDash([9, 5]);
            ctx.beginPath();
            ctx.arc(centerX, centerY, pulse, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        if (magnetTimer > 0 || rushTimer > 0) {
            ctx.fillStyle = '#ffd84f';
            ctx.strokeStyle = '#172638';
            ctx.lineWidth = 2;
            for (let i = 0; i < 4; i += 1) {
                const angle = elapsed * 4 + i * Math.PI / 2;
                const orbitX = centerX + Math.cos(angle) * 49;
                const orbitY = centerY + Math.sin(angle) * 30;
                ctx.beginPath();
                ctx.moveTo(orbitX, orbitY - 6);
                ctx.lineTo(orbitX + 3, orbitY - 2);
                ctx.lineTo(orbitX + 7, orbitY);
                ctx.lineTo(orbitX + 3, orbitY + 2);
                ctx.lineTo(orbitX, orbitY + 6);
                ctx.lineTo(orbitX - 3, orbitY + 2);
                ctx.lineTo(orbitX - 7, orbitY);
                ctx.lineTo(orbitX - 3, orbitY - 2);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        }
        if (slowTimer > 0 && rushTimer <= 0) {
            ctx.globalAlpha = .38;
            ctx.strokeStyle = '#fff5cf';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            for (let i = 0; i < 4; i += 1) {
                const lineY = height * (.18 + i * .13);
                const offset = (elapsed * 28 + i * 23) % 34;
                ctx.beginPath();
                ctx.moveTo(width - 64 - offset, lineY);
                ctx.lineTo(width - 18 - offset, lineY);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    function drawObstacle(item) {
        const top = item.y - item.h;
        const ink = '#172638';
        const fillAndInk = (fill, lineWidth = 3) => {
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.strokeStyle = ink;
            ctx.lineWidth = lineWidth;
            ctx.lineJoin = 'round';
            ctx.stroke();
        };

        ctx.save();
        ctx.fillStyle = 'rgba(23,38,56,.22)';
        ctx.beginPath();
        ctx.ellipse(item.x + item.w / 2 + 3, item.y + 3, item.w * .52, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        if (item.stomped) {
            ctx.globalAlpha = clamp(item.stompTimer / .32, 0, 1);
            ctx.translate(0, item.y);
            ctx.scale(1, .28);
            ctx.translate(0, -item.y);
        }

        if (item.type === 'rock') {
            ctx.beginPath();
            ctx.moveTo(item.x + 1, item.y);
            ctx.lineTo(item.x + 4, top + 15);
            ctx.lineTo(item.x + item.w * .31, top + 2);
            ctx.lineTo(item.x + item.w * .48, top);
            ctx.lineTo(item.x + item.w * .69, top + 7);
            ctx.lineTo(item.x + item.w - 3, top + 12);
            ctx.lineTo(item.x + item.w, item.y);
            ctx.closePath();
            fillAndInk('#705579', 3.5);

            /* Poster-like highlighted face. */
            ctx.beginPath();
            ctx.moveTo(item.x + 7, top + 16);
            ctx.lineTo(item.x + item.w * .34, top + 5);
            ctx.lineTo(item.x + item.w * .56, top + 9);
            ctx.lineTo(item.x + item.w * .42, top + 24);
            ctx.closePath();
            fillAndInk('#b49abb', 2);

            ctx.strokeStyle = '#ffd84f';
            ctx.lineWidth = 2.4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(item.x + item.w * .62, top + 12);
            ctx.lineTo(item.x + item.w * .53, top + 24);
            ctx.lineTo(item.x + item.w * .65, top + 30);
            ctx.lineTo(item.x + item.w * .57, item.y - 5);
            ctx.stroke();

            ctx.fillStyle = '#ff7050';
            [0, 1, 2].forEach((dot) => {
                ctx.beginPath();
                ctx.arc(item.x + item.w * .75 + dot * 4, item.y - 9 - (dot & 1) * 4, 1.6, 0, Math.PI * 2);
                ctx.fill();
            });
        } else if (item.type === 'stump') {
            ctx.beginPath();
            ctx.roundRect(item.x + 5, top + 4, item.w - 10, item.h - 3, 7);
            fillAndInk('#9a5548', 3.5);

            ctx.beginPath();
            ctx.ellipse(item.x + item.w / 2, top + 5, item.w * .43, 9, 0, 0, Math.PI * 2);
            fillAndInk('#ff7959', 3);

            ctx.strokeStyle = '#ffd84f';
            ctx.lineWidth = 2.3;
            ctx.beginPath();
            ctx.ellipse(item.x + item.w / 2, top + 5, item.w * .22, 4, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(item.x + item.w * .34, top + 18);
            ctx.quadraticCurveTo(item.x + item.w * .53, top + item.h * .49, item.x + item.w * .43, item.y - 7);
            ctx.moveTo(item.x + item.w * .7, top + 17);
            ctx.quadraticCurveTo(item.x + item.w * .59, top + item.h * .61, item.x + item.w * .7, item.y - 5);
            ctx.stroke();

            /* Little comic warning badge. */
            const badgeX = item.x + item.w * .52;
            const badgeY = top + item.h * .54;
            ctx.beginPath();
            ctx.moveTo(badgeX, badgeY - 8);
            ctx.lineTo(badgeX + 8, badgeY);
            ctx.lineTo(badgeX, badgeY + 8);
            ctx.lineTo(badgeX - 8, badgeY);
            ctx.closePath();
            fillAndInk('#ffd84f', 2);
            ctx.fillStyle = ink;
            ctx.font = '900 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('!', badgeX, badgeY + .5);
        } else if (item.type === 'thorns') {
            /* Separate colorful spikes are clearer and feel hand-inked. */
            ctx.beginPath();
            ctx.ellipse(item.x + item.w / 2, item.y - 3, item.w * .49, 8, 0, 0, Math.PI * 2);
            fillAndInk('#493d62', 3);
            for (let i = 0; i < 5; i += 1) {
                const left = item.x + i * item.w / 5;
                const right = item.x + (i + 1.18) * item.w / 5;
                const pointX = (left + right) / 2;
                ctx.beginPath();
                ctx.moveTo(left, item.y - 4);
                ctx.lineTo(pointX, top + (i % 2) * 6);
                ctx.lineTo(right, item.y - 4);
                ctx.closePath();
                fillAndInk(i % 2 ? '#ff7050' : '#705579', 2.7);
            }

            ctx.fillStyle = '#ffd84f';
            for (let i = 0; i < 4; i += 1) {
                ctx.beginPath();
                ctx.arc(item.x + 9 + i * (item.w - 18) / 3, item.y - 6, 2.4, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (item.type === 'mushroom') {
            ctx.beginPath();
            ctx.roundRect(item.x + item.w * .34, top + item.h * .37, item.w * .32, item.h * .63, 8);
            fillAndInk('#fff0c4', 3);
            ctx.beginPath();
            ctx.moveTo(item.x + 2, top + item.h * .42);
            ctx.quadraticCurveTo(item.x + item.w * .12, top - 3, item.x + item.w * .5, top);
            ctx.quadraticCurveTo(item.x + item.w * .88, top - 3, item.x + item.w - 2, top + item.h * .42);
            ctx.quadraticCurveTo(item.x + item.w * .52, top + item.h * .55, item.x + 2, top + item.h * .42);
            ctx.closePath();
            fillAndInk(item.variant > .5 ? '#ff7050' : '#38b9ad', 3.4);
            ctx.fillStyle = '#ffd84f';
            [
                [item.x + item.w * .27, top + item.h * .2, 4],
                [item.x + item.w * .57, top + item.h * .13, 5],
                [item.x + item.w * .76, top + item.h * .29, 3.5]
            ].forEach(([x, y, r]) => {
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.fillStyle = ink;
            ctx.beginPath();
            ctx.arc(item.x + item.w * .44, top + item.h * .67, 2, 0, Math.PI * 2);
            ctx.arc(item.x + item.w * .58, top + item.h * .67, 2, 0, Math.PI * 2);
            ctx.fill();
            if (!item.stomped) {
                const markerX = item.x + item.w / 2;
                const markerY = top - 18 + Math.sin(elapsed * 4 + item.variant * 6) * 2;
                ctx.font = '900 15px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.lineWidth = 3;
                ctx.strokeStyle = ink;
                ctx.fillStyle = '#fff5cf';
                ctx.strokeText('♥', markerX, markerY);
                ctx.fillText('♥', markerX, markerY);
                ctx.beginPath();
                ctx.moveTo(markerX - 4, markerY + 10);
                ctx.lineTo(markerX, markerY + 14);
                ctx.lineTo(markerX + 4, markerY + 10);
                ctx.stroke();
            }
        } else if (item.type === 'crystal') {
            const crystals = [
                { x: item.x + 1, w: item.w * .43, h: item.h * .66, color: '#9bd9d1' },
                { x: item.x + item.w * .28, w: item.w * .5, h: item.h, color: '#ffd84f' },
                { x: item.x + item.w * .61, w: item.w * .38, h: item.h * .57, color: '#ff7959' }
            ];
            crystals.forEach((crystal) => {
                const crystalTop = item.y - crystal.h;
                ctx.beginPath();
                ctx.moveTo(crystal.x + crystal.w * .5, crystalTop);
                ctx.lineTo(crystal.x + crystal.w, crystalTop + crystal.h * .3);
                ctx.lineTo(crystal.x + crystal.w * .84, item.y);
                ctx.lineTo(crystal.x + crystal.w * .12, item.y);
                ctx.lineTo(crystal.x, crystalTop + crystal.h * .32);
                ctx.closePath();
                fillAndInk(crystal.color, 2.7);
                ctx.strokeStyle = 'rgba(255,255,255,.7)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(crystal.x + crystal.w * .5, crystalTop + 5);
                ctx.lineTo(crystal.x + crystal.w * .35, item.y - 7);
                ctx.stroke();
            });
        } else if (item.type === 'bone') {
            ctx.strokeStyle = '#fff5cf';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(item.x + 9, item.y - 8);
            ctx.lineTo(item.x + item.w - 12, top + 8);
            ctx.moveTo(item.x + 12, top + 8);
            ctx.lineTo(item.x + item.w - 9, item.y - 8);
            ctx.stroke();
            ctx.fillStyle = '#fff5cf';
            [[8, -8], [12, -14], [item.w - 8, -8], [item.w - 12, -14]].forEach(([dx, dy]) => {
                ctx.beginPath();
                ctx.arc(item.x + dx, item.y + dy, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = ink;
                ctx.lineWidth = 2;
                ctx.stroke();
            });
            ctx.beginPath();
            ctx.ellipse(item.x + item.w * .52, top + 11, item.w * .2, 12, -.08, 0, Math.PI * 2);
            fillAndInk('#fff5cf', 3);
            ctx.fillStyle = ink;
            ctx.beginPath();
            ctx.arc(item.x + item.w * .47, top + 9, 2.6, 0, Math.PI * 2);
            ctx.arc(item.x + item.w * .58, top + 9, 2.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(item.x + item.w * .52, top + 13);
            ctx.lineTo(item.x + item.w * .48, top + 18);
            ctx.lineTo(item.x + item.w * .56, top + 18);
            ctx.closePath();
            ctx.fill();
        } else if (item.type === 'totem') {
            ctx.beginPath();
            ctx.moveTo(item.x + 5, item.y);
            ctx.lineTo(item.x + 2, top + 12);
            ctx.lineTo(item.x + item.w * .25, top + 2);
            ctx.lineTo(item.x + item.w * .78, top + 5);
            ctx.lineTo(item.x + item.w - 2, top + 15);
            ctx.lineTo(item.x + item.w - 5, item.y);
            ctx.closePath();
            fillAndInk(item.variant > .5 ? '#e28a55' : '#80658b', 3.4);
            ctx.fillStyle = '#ffd84f';
            ctx.strokeStyle = ink;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(item.x + item.w * .22, top + item.h * .3);
            ctx.lineTo(item.x + item.w * .43, top + item.h * .22);
            ctx.lineTo(item.x + item.w * .39, top + item.h * .42);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(item.x + item.w * .78, top + item.h * .3);
            ctx.lineTo(item.x + item.w * .57, top + item.h * .22);
            ctx.lineTo(item.x + item.w * .61, top + item.h * .42);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.strokeStyle = '#fff5cf';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(item.x + item.w * .28, top + item.h * .68);
            ctx.lineTo(item.x + item.w * .5, top + item.h * .78);
            ctx.lineTo(item.x + item.w * .72, top + item.h * .68);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawPickup(item) {
        const bobY = item.y + Math.sin(elapsed * 4 + item.phase) * 5;
        const pulse = 1 + Math.sin(elapsed * 6 + item.phase) * .05;
        ctx.save();
        ctx.translate(item.x, bobY);
        ctx.scale(pulse, pulse);

        ctx.globalAlpha = .24;
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(0, 0, 27, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = .78;
        ctx.strokeStyle = '#fff5cf';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -item.spin * 8;
        ctx.beginPath();
        ctx.arc(0, 0, 23, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        ctx.rotate(Math.sin(elapsed * 2.5 + item.phase) * .08);
        ctx.fillStyle = '#fff5cf';
        ctx.strokeStyle = '#172638';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-16, -16, 32, 32, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = item.color;
        ctx.font = '1000 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.icon, 0, 1);

        ctx.fillStyle = '#172638';
        ctx.beginPath();
        ctx.moveTo(-7, -20);
        ctx.lineTo(0, -27);
        ctx.lineTo(7, -20);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function drawAmber(item) {
        const pulse = 1 + Math.sin(item.spin) * .08;
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.scale(pulse, pulse);
        ctx.rotate(item.spin * .14);
        ctx.shadowColor = '#ffc64a';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ffc64a';
        ctx.beginPath();
        ctx.moveTo(0, -10); ctx.lineTo(8, -4); ctx.lineTo(6, 7); ctx.lineTo(0, 11); ctx.lineTo(-7, 5); ctx.lineTo(-8, -4); ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff0a4';
        ctx.beginPath();
        ctx.moveTo(-2, -6); ctx.lineTo(3, -3); ctx.lineTo(1, 2); ctx.lineTo(-3, 0); ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function drawParticles() {
        particles.forEach((particle) => {
            ctx.save();
            ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }

    function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        drawBackground();
        ambers.forEach((item) => { if (!item.collected) drawAmber(item); });
        obstacles.forEach(drawObstacle);
        pickups.forEach((item) => { if (!item.collected) drawPickup(item); });
        if (player) {
            drawDino();
            drawItemEffects();
        }
        drawParticles();

        if (hitFlash > 0) {
            ctx.fillStyle = `rgba(240,107,79,${hitFlash * .28})`;
            ctx.fillRect(0, 0, width, height);
        }
    }

    function frame(now) {
        if (state !== 'running') return;
        const dt = clamp((now - lastTime) / 1000, 0, .033);
        lastTime = now;
        update(dt);
        draw();
        if (state === 'running') raf = requestAnimationFrame(frame);
    }

    function openMainGame() {
        if (contentMode === 'mini_only') {
            showToast('目前渠道僅開放小遊戲');
            return;
        }
        if (nativeHost) {
            window.MenuMusic?.setScreen('online');
            window.android.openMainGame();
        } else {
            showToast('App 內可進入線上主遊戲');
        }
    }

    function openLegal(url) {
        if (!legalUrls.has(url)) return;
        if (nativeHost && typeof window.android.sdkToBrowser === 'function') {
            window.android.sdkToBrowser(url);
        } else {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    }

    window.setShellContentMode = (mode) => {
        contentMode = String(mode || 'both').toLowerCase();
        const onlineAllowed = contentMode !== 'mini_only';
        $('open-online-game').hidden = !onlineAllowed;
        if (contentMode === 'online_only') openMainGame();
    };

    window.handleNativeBack = () => {
        if (screens.tutorial.classList.contains('active')) {
            showScreen('start');
            return true;
        }
        if (screens.mode.classList.contains('active')) {
            showScreen('start');
            return true;
        }
        if (screens.shop.classList.contains('active')) {
            showScreen('start');
            return true;
        }
        if (screens.ranking.classList.contains('active')) {
            showScreen('start');
            return true;
        }
        if (screens.game.classList.contains('active')) {
            if (state === 'paused') {
                resumeGame();
            } else if (state === 'running') {
                pauseGame();
            } else {
                showScreen('mode');
            }
            return true;
        }
        return false;
    };

    $('quick-start').addEventListener('click', openModeWithTutorial);
    heroInteraction.addEventListener('click', cheerMenuHero);
    document.querySelectorAll('[data-menu-amber]').forEach((button) => {
        button.addEventListener('click', () => collectMenuAmber(button));
    });
    startShell.addEventListener('pointermove', moveMenuWorld);
    startShell.addEventListener('pointerleave', resetMenuWorld);
    $('open-tutorial').addEventListener('click', () => showScreen('tutorial'));
    $('tutorial-back').addEventListener('click', () => showScreen('start'));
    $('tutorial-start').addEventListener('click', completeTutorial);
    $('mode-back').addEventListener('click', () => showScreen('start'));
    $('open-shop').addEventListener('click', () => showScreen('shop'));
    $('shop-back').addEventListener('click', () => showScreen('start'));
    $('shop-skins-tab').addEventListener('click', () => { shopCategory = 'skins'; renderShop(); });
    $('shop-items-tab').addEventListener('click', () => { shopCategory = 'items'; renderShop(); });
    $('level-mode-start').addEventListener('click', () => startGame('level', selectedLevel));
    $('endless-mode-start').addEventListener('click', () => startGame('endless'));
    $('ranking-start').addEventListener('click', () => {
        if (rankingMode === 'level') {
            selectedLevel = getUnlockedLevel() - 1;
            startGame('level', selectedLevel);
        } else {
            startGame('endless');
        }
    });
    $('restart-game').addEventListener('click', () => startGame(currentMode, selectedLevel));
    nextLevelButton.addEventListener('click', () => {
        selectedLevel = Math.min(levels.length - 1, selectedLevel + 1);
        startGame('level', selectedLevel);
    });
    $('open-leaderboard').addEventListener('click', () => showScreen('ranking'));
    $('result-ranking').addEventListener('click', () => {
        rankingMode = currentMode;
        showScreen('ranking');
    });
    $('ranking-level-tab').addEventListener('click', () => { rankingMode = 'level'; renderLeaderboard(); });
    $('ranking-endless-tab').addEventListener('click', () => { rankingMode = 'endless'; renderLeaderboard(); });
    $('ranking-back').addEventListener('click', () => showScreen('start'));
    $('back-start').addEventListener('click', () => {
        if (state === 'running') pauseGame();
        else showScreen('mode');
    });
    $('result-start').addEventListener('click', () => showScreen('start'));
    $('pause-game').addEventListener('click', pauseGame);
    $('resume-game').addEventListener('click', resumeGame);
    $('pause-exit').addEventListener('click', () => showScreen('mode'));
    $('jump-button').addEventListener('pointerdown', (event) => { event.preventDefault(); jump(); });
    document.addEventListener('pointerup', releaseJump);
    document.addEventListener('pointercancel', releaseJump);
    document.querySelectorAll('[data-use-item]').forEach((button) => {
        button.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            useGameItem(button.dataset.useItem);
        });
    });
    canvas.addEventListener('pointerdown', (event) => { event.preventDefault(); jump(); });
    $('open-online-game').addEventListener('click', openMainGame);
    $('legal-links').addEventListener('click', (event) => {
        const button = event.target.closest('[data-legal-url]');
        if (button) openLegal(button.dataset.legalUrl);
    });

    document.addEventListener('keydown', (event) => {
        if (event.target?.closest?.('#menu-music-toggle, [data-sfx-toggle]')) return;
        if (event.code === 'Space' || event.code === 'ArrowUp') {
            event.preventDefault();
            if (!event.repeat) jump();
        } else if (event.code === 'Escape') {
            window.handleNativeBack();
        }
    });
    document.addEventListener('keyup', (event) => {
        if (event.code === 'Space' || event.code === 'ArrowUp') releaseJump();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && state === 'running') pauseGame();
        if (document.hidden) cancelAnimationFrame(menuAnimationFrame);
        else if (screens.start.classList.contains('active')) startMenuAnimation();
    });
    window.addEventListener('resize', () => {
        if (screens.game.classList.contains('active')) {
            resizeCanvas();
            draw();
        }
    });

    $('open-online-game').hidden = !nativeHost;
    renderStartStats();
    startMenuAnimation();
})();
