(() => {
  // prototypes/emberwild/tutorial.mjs
  var TUTORIAL_STEPS = Object.freeze(["move", "attack", "skill", "build", "reward"]);
  var TUTORIAL_BUILD_RADIUS = 72;
  var freshTutorial = ({ mandatory = false } = {}) => ({ version: 2, mandatory, step: "move", status: "active", started: false, awaiting: false, skillCast: false, attackHits: 0, moveTarget: { x: 455, y: 475 }, buildSpot: null, slot: 0, moved: 0, elapsed: 0, reward: null });
  var tutorialActive = (g) => g.tutorial?.status === "active" && g.wave <= 1;
  var mandatoryTutorial = (g) => !!g && tutorialActive(g) && g.tutorial.mandatory === true;
  var onboardingRequired = (state) => state.run?.tutorial?.mandatory === true && state.run.tutorial.status === "active" || state.profile.tutorialDone === false || state.profile.tutorialDone === void 0 && state.profile.runs === 0;
  var tutorialProtected = (g) => tutorialActive(g) && g.tutorial.step !== "reward";
  var tutorialWaiting = (g) => tutorialActive(g) && g.tutorial.version === 2 && (!g.tutorial.started || g.tutorial.awaiting || mandatoryTutorial(g) && !!g.tutorial.reward);
  function validateTutorial(t) {
    if (t === null || t === void 0) return true;
    return typeof t === "object" && TUTORIAL_STEPS.includes(t.step) && ["active", "done", "skipped"].includes(t.status) && Number.isFinite(t.moved) && t.moved >= 0 && t.moved <= 64 && Number.isFinite(t.elapsed) && t.elapsed >= 0 && t.elapsed <= 1e8 && (t.reward === null || t.status === "active" && t.step === "reward" && ["wood", "bone", "amber"].every((k) => Number.isInteger(t.reward?.[k]) && t.reward[k] >= 0 && t.reward[k] <= 1e3)) && (t.version === void 0 || t.version === 2 && typeof t.started === "boolean" && typeof t.awaiting === "boolean" && (t.mandatory === void 0 || typeof t.mandatory === "boolean") && (!t.mandatory || t.status !== "skipped") && (t.skillCast === void 0 || typeof t.skillCast === "boolean") && Number.isInteger(t.attackHits) && t.attackHits >= 0 && t.attackHits <= 2 && Number.isInteger(t.slot) && t.slot >= 0 && t.slot <= 3 && point(t.moveTarget) && (t.buildSpot === null || point(t.buildSpot)) && (!t.awaiting || t.started && t.step !== "reward") && (t.status !== "active" || (t.step !== "build" || t.buildSpot !== null) && (t.started || t.step === "move")));
  }
  function point(p) {
    return !!p && Number.isFinite(p.x) && p.x >= 55 && p.x <= 665 && Number.isFinite(p.y) && p.y >= 85 && p.y <= 735;
  }

  // prototypes/emberwild/engine.mjs
  var WORLD = Object.freeze({ width: 720, height: 820 });
  var MAX_WAVES = 8;
  var STAGE_BALANCE = Object.freeze([
    { hp: 1, damage: 0.85, speed: 1, spawn: 1.5, wood: 5, bone: 3, amber: 3 },
    { hp: 1.14, damage: 0.9, speed: 1, spawn: 1.36, wood: 6, bone: 3, amber: 3 },
    { hp: 1.34, damage: 0.98, speed: 1.01, spawn: 1.23, wood: 6, bone: 4, amber: 4 },
    { hp: 1.56, damage: 1.06, speed: 1.02, spawn: 1.14, wood: 7, bone: 4, amber: 4 },
    { hp: 1.82, damage: 1.15, speed: 1.03, spawn: 1.06, wood: 7, bone: 5, amber: 5 },
    { hp: 2.1, damage: 1.24, speed: 1.04, spawn: 1.1, wood: 8, bone: 5, amber: 5 },
    { hp: 2.42, damage: 1.33, speed: 1.05, spawn: 1.32, wood: 9, bone: 5, amber: 6 },
    { hp: 2.78, damage: 1.42, speed: 1.06, spawn: 1.05, wood: 10, bone: 6, amber: 7 }
  ].map((v) => Object.freeze(v)));
  var FORTIFICATION_BALANCE = Object.freeze({ incomingDamage: 0.78, betweenStageRepair: 0.35, heroRecovery: 15, eggRecovery: 18 });
  var STAGE_OBJECTIVES = Object.freeze([
    Object.freeze({ type: "defend", icon: "◉", title: "守住聖獸卵", short: "守護目標", detail: "擊退獸群，確保聖獸卵不被摧毀。" }),
    Object.freeze({ type: "escort", icon: "↗", title: "護送採集師", short: "護送 NPC", detail: "靠近採集師帶路，護送他穿過巨蕨巢道。" }),
    Object.freeze({ type: "destroy", icon: "✹", title: "摧毀三座獸巢", short: "摧毀巢穴", detail: "清除沼澤母獸的三座孵化巢，阻斷幼獸增援。" }),
    Object.freeze({ type: "mining", icon: "◆", title: "限時採集熔晶", short: "限時採礦", detail: "在 50 秒內擊碎三處標記晶礦並擊退守衛。" }),
    Object.freeze({ type: "rescue", icon: "⌁", title: "營救受困弓手", short: "營救伙伴", detail: "靠近牢籠並守住救援圈，完成後弓手加入本局。" }),
    Object.freeze({ type: "defend", icon: "◉", title: "守住焦木防線", short: "首領守護", detail: "保護聖獸靈巢，避開衝角獸的蓄力衝鋒。" }),
    Object.freeze({ type: "strongholds", icon: "△", title: "守住三處月骨據點", short: "多點防守", detail: "獸群會分路攻擊三處據點；任一失守都會結束遠征。" }),
    Object.freeze({ type: "defend", icon: "◉", title: "守住泰坦聖所", short: "最終守護", detail: "在琥珀泰坦的震地攻勢下守住最後火種。" })
  ]);
  var ESCORT_PATH = Object.freeze([[125, 650], [205, 585], [275, 515], [390, 435], [500, 325], [585, 235], [640, 145]].map(([x, y]) => Object.freeze({ x, y })));
  var ENEMY_BALANCE = Object.freeze({
    raptor: Object.freeze({ hp: 34, speed: 64, damage: 9, radius: 15, drop: 1, chance: 0.45 }),
    brute: Object.freeze({ hp: 125, speed: 36, damage: 16, radius: 24, drop: 2, chance: 1 }),
    spitter: Object.freeze({ hp: 58, speed: 40, damage: 12, radius: 17, drop: 1, chance: 0.65 }),
    matriarch: Object.freeze({ hp: 550, speed: 28, damage: 16, radius: 38, drop: 8, chance: 1 }),
    charger: Object.freeze({ hp: 900, speed: 38, damage: 24, radius: 44, drop: 10, chance: 1 }),
    boss: Object.freeze({ hp: 1500, speed: 26, damage: 22, radius: 46, drop: 14, chance: 1 })
  });
  var BOSS_WEAKPOINTS = Object.freeze({
    matriarch: Object.freeze({ kind: "brood-core", name: "孵化囊", hp: 105, radius: 17, color: "#b9df78", bonus: 0.12 }),
    charger: Object.freeze({ kind: "shoulder-plate", name: "裂角肩甲", hp: 155, radius: 18, color: "#f0bd71", bonus: 0.1 }),
    boss: Object.freeze({ kind: "amber-core", name: "琥珀核心", hp: 235, radius: 20, color: "#ffc35c", bonus: 0.14 })
  });
  var MAP_EVENT_DEFS = Object.freeze({
    merchant: Object.freeze({ name: "荒境行商", icon: "◇", short: "以 6 琥珀交換補給" }),
    ruin: Object.freeze({ name: "古獸遺跡", icon: "⌘", short: "解讀一枚遠征祝福" }),
    hunter: Object.freeze({ name: "受傷獵人", icon: "⌁", short: "救援後加入本關作戰" }),
    chest: Object.freeze({ name: "荒野寶箱", icon: "▣", short: "開啟取得隨機材料" }),
    elite: Object.freeze({ name: "精英獸群", icon: "♜", short: "擊敗金印獸群領取懸賞" })
  });
  var MAP_EVENT_SPOTS = Object.freeze([[105, 415], [615, 415], [215, 690], [505, 690], [155, 130], [565, 130], [100, 650], [620, 650]].map(([x, y]) => Object.freeze({ x, y })));
  var ACTIVE_SKILLS = Object.freeze({
    volley: Object.freeze({ name: "貫骨齊射", cooldown: 7, description: "向自動鎖定方向射出五支穿透骨矛；可在商人處擴充箭數與穿透。" }),
    shock: Object.freeze({ name: "荒骨震擊", cooldown: 11, description: "震擊身邊敵人並使其減速；可在商人處解鎖持續減速地帶。" })
  });
  var COMPANION_MAX_LEVEL = 10;
  var COMPANIONS = Object.freeze({
    emberclaw: Object.freeze({
      name: "焰脊迅龍",
      title: "烈焰獵手",
      color: "#f3a24d",
      hp: 82,
      radius: 16,
      speed: 205,
      range: 48,
      damage: 17,
      cooldown: 0.66,
      ability: "每第 4 次撲擊引爆焰爪，灼燒周圍敵人。",
      short: "高速近戰 · 焰爪爆發"
    }),
    tideroot: Object.freeze({
      name: "潮汐角龍",
      title: "潮息守護",
      color: "#75cfca",
      hp: 105,
      radius: 18,
      speed: 160,
      range: 245,
      damage: 12,
      cooldown: 1.05,
      ability: "發射潮汐彈緩速敵人，並週期治療獵人與聖獸卵。",
      short: "遠程緩速 · 潮息治療"
    }),
    stoneback: Object.freeze({
      name: "岩甲幼龍",
      title: "晶甲壁壘",
      color: "#d2b36b",
      hp: 165,
      radius: 22,
      speed: 132,
      range: 58,
      damage: 20,
      cooldown: 1.08,
      ability: "主動吸引近敵；晶甲減傷，重擊產生範圍震波。",
      short: "吸引火力 · 晶甲震波"
    })
  });
  var companionXPNeeded = (level) => level >= COMPANION_MAX_LEVEL ? 0 : 45 + level * 35;
  var companionKillXP = Object.freeze({ raptor: 7, spitter: 10, brute: 14, matriarch: 42, charger: 50, boss: 65 });
  var CARDS = Object.freeze({
    watchtower: { name: "獵脊弩台", cost: 5, color: "#d8c58f", short: "連發穿骨", hp: 180, radius: 29, range: 250, description: "快速射出骨弩箭；升級提高傷害，三級可穿透兩名敵人。" },
    catapult: { name: "琥珀投獸器", cost: 6, color: "#e3ad52", short: "拋石震獸", hp: 215, radius: 34, range: 230, description: "拋出琥珀爆彈，落點造成範圍傷害並減速獸群。" },
    torch: { name: "燧火炬", cost: 3, color: "#f5b463", short: "穿火燃矛", hp: 120, radius: 24, range: 148, description: "自動灼燒敵人；投矛穿過火圈會燃燒。" },
    wall: { name: "裂骨牆", cost: 3, color: "#ede2bb", short: "衝刺引爆", hp: 300, radius: 31, range: 120, description: "吸引並阻擋敵人；衝刺穿牆引爆骨片。" },
    nest: { name: "幼獸巢", cost: 5, color: "#b3d99b", short: "孵化戰友", hp: 135, radius: 25, range: 225, description: "孵出幼獸，自動撲擊附近敵人。" },
    spring: { name: "潮汐泉", cost: 5, color: "#91d7d8", short: "回血緩敵", hp: 165, radius: 24, range: 112, description: "附近回復生命並減速敵人；泉邊衝刺釋放寒潮。" }
  });
  var STARTING_BUILD_DECK = Object.freeze(["watchtower", "catapult", "wall", "spring"]);
  var BUILD_CARDS = Object.freeze(Object.fromEntries(STARTING_BUILD_DECK.map((id) => [id, CARDS[id]])));
  var HIRES = Object.freeze({
    hunter: { name: "遊獵弓手", color: "#a6cfb8", short: "遠程跟隨", hp: 65, radius: 15, range: 240, description: "跟隨獵人，以骨箭遠程支援；倒下後需重新雇佣。" },
    guard: { name: "骨盾衛士", color: "#d5c599", short: "近戰護衛", hp: 150, radius: 19, range: 140, description: "跟隨獵人，主動接敵並吸引攻擊；最多同時四名佣兵。" }
  });
  var DEPLOY_CARDS = Object.freeze({ ...CARDS, ...HIRES });
  var WEAPONS = Object.freeze({
    spear: Object.freeze({ name: "骨矛", symbol: "↗", short: "直線穿透", range: 560, ranged: true, description: "穩定投擲並穿透獸群；鍛造後每第三擊分裂成三叉骨矛。" }),
    axe: Object.freeze({ name: "骨斧", symbol: "◈", short: "扇形重斬", range: 104, ranged: false, description: "近身扇形重斬；鍛造後改為環身迴旋斬。" }),
    bow: Object.freeze({ name: "獵骨弓", symbol: "➹", short: "遠程速射", range: 620, ranged: true, description: "最遠射程的高速骨箭；鍛造後每第三箭扇射三發。" }),
    blades: Object.freeze({ name: "裂牙雙刃", symbol: "✕", short: "近戰連斬", range: 94, ranged: false, description: "高速雙段連斬；鍛造後每第四擊突進並環斬。" }),
    hammer: Object.freeze({ name: "震骨重錘", symbol: "⬢", short: "範圍重擊", range: 132, ranged: false, description: "緩慢但寬廣的震退重擊；鍛造後追加地裂波。" })
  });
  var LOADOUT_RULES = Object.freeze({ cardSlots: 4, buildCards: 3, hireCards: 1, weaponSlots: 1, skillSlots: 1 });
  var DEFAULT_LOADOUT = Object.freeze({
    cards: Object.freeze(["watchtower", "catapult", "wall", "hunter"]),
    weapons: Object.freeze(["spear"]),
    skills: Object.freeze(["volley"])
  });
  var LEGACY_LOADOUT = Object.freeze({
    cards: Object.freeze(Object.keys(DEPLOY_CARDS)),
    weapons: Object.freeze(["spear", "axe"]),
    skills: Object.freeze(Object.keys(ACTIVE_SKILLS)),
    legacy: true
  });
  var copyLoadout = (loadout) => ({ cards: [...loadout.cards], weapons: [...loadout.weapons], skills: [...loadout.skills], ...loadout.legacy ? { legacy: true } : {} });
  function isValidLoadout(loadout, { allowLegacy = false } = {}) {
    if (!loadout || typeof loadout !== "object" || !Array.isArray(loadout.cards) || !Array.isArray(loadout.weapons) || !Array.isArray(loadout.skills)) return false;
    const unique = (list2) => new Set(list2).size === list2.length;
    if (!unique(loadout.cards) || !unique(loadout.weapons) || !unique(loadout.skills)) return false;
    if (!loadout.cards.every((id) => Object.hasOwn(DEPLOY_CARDS, id)) || !loadout.weapons.every((id) => Object.hasOwn(WEAPONS, id)) || !loadout.skills.every((id) => Object.hasOwn(ACTIVE_SKILLS, id))) return false;
    if (loadout.legacy === true) return allowLegacy && loadout.cards.length > 0 && loadout.weapons.length > 0 && loadout.skills.length > 0;
    return loadout.cards.length === LOADOUT_RULES.cardSlots && loadout.cards.filter((id) => Object.hasOwn(CARDS, id)).length === LOADOUT_RULES.buildCards && loadout.cards.filter((id) => Object.hasOwn(HIRES, id)).length === LOADOUT_RULES.hireCards && loadout.weapons.length === LOADOUT_RULES.weaponSlots && loadout.skills.length === LOADOUT_RULES.skillSlots;
  }
  function normalizeLoadout(loadout) {
    return copyLoadout(isValidLoadout(loadout) ? loadout : DEFAULT_LOADOUT);
  }
  var CARD_PRICES = Object.freeze({ watchtower: { wood: 5, bone: 2, amber: 0 }, catapult: { wood: 6, bone: 4, amber: 3 }, torch: { wood: 3, bone: 1, amber: 0 }, wall: { wood: 3, bone: 2, amber: 0 }, nest: { wood: 4, bone: 3, amber: 0 }, spring: { wood: 5, bone: 3, amber: 0 }, hunter: { wood: 4, bone: 4, amber: 7 }, guard: { wood: 3, bone: 5, amber: 7 } });
  var UPGRADES = Object.freeze([
    { id: "volley-fan", branch: "volley", rank: 1, maxRank: 2, name: "七矛展翼", symbol: "➶", desc: "貫骨齊射由 5 支提升為 7 支骨矛，扇面覆蓋更寬。", apply: (g) => {
      g.mods.volleyArrows += 2;
    } },
    { id: "volley-pierce", branch: "volley", rank: 2, maxRank: 2, requires: "volley-fan", name: "九矛貫陣", symbol: "↗", desc: "貫骨齊射再增加 2 支骨矛，且每支額外穿透 1 名敵人。", apply: (g) => {
      g.mods.volleyArrows += 2;
      g.mods.volleyPierce++;
    } },
    { id: "shock-field", branch: "shock", rank: 1, maxRank: 2, name: "震地餘波", symbol: "✹", desc: "荒骨震擊後留下 4 秒減速地帶，持續壓制進入區域的敵人。", apply: (g) => {
      g.mods.shockFieldDuration += 4;
    } },
    { id: "shock-resonance", branch: "shock", rank: 2, maxRank: 2, requires: "shock-field", name: "地脈回響", symbol: "◎", desc: "減速地帶延長至 6 秒、範圍擴大，並每秒造成 12 點餘震傷害。", apply: (g) => {
      g.mods.shockFieldDuration += 2;
      g.mods.shockFieldRadius += 25;
      g.mods.shockFieldDamage += 12;
    } },
    { id: "fire", name: "弩機淬火", symbol: "♨", desc: "獵脊弩台傷害 +35%；舊式火炬燃燒亦獲得強化。", apply: (g) => {
      g.mods.fire += 0.35;
      g.mods.torch += 0.35;
    } },
    { id: "bones", name: "碎骨風暴", symbol: "✧", desc: "骨牆引爆傷害 +50%，範圍 +20%。", apply: (g) => {
      g.mods.blast += 0.5;
      g.mods.blastRange += 0.2;
    } },
    { id: "dash", name: "踏風步", symbol: "➶", desc: "衝刺冷卻縮短 25%，移速 +8%。", apply: (g) => {
      g.mods.dash *= 0.75;
      g.mods.speed += 0.08;
    } },
    { id: "spear", weapon: "spear", name: "裂矛三叉", symbol: "↗", desc: "改造矛頭與投擲握法：每第三次投矛同時射出三支分裂骨矛。", apply: (g) => {
      g.mods.spearFork = true;
    } },
    { id: "axe", weapon: "axe", name: "環刃骨斧", symbol: "◈", desc: "重鑄雙面斧刃：骨斧由前方扇斬改為全周圍迴旋斬。", apply: (g) => {
      g.mods.spin = true;
    } },
    { id: "bow", weapon: "bow", name: "三弦齊發", symbol: "➹", desc: "裝上獸筋副弦：每第三次射擊向前方扇射三支骨箭。", apply: (g) => {
      g.mods.bowVolley = true;
    } },
    { id: "blades", weapon: "blades", name: "影步追獵", symbol: "✕", desc: "在雙刃加裝鉤牙配重：每第四次連斬突進穿敵並施展環身雙斬。", apply: (g) => {
      g.mods.bladeRush = true;
    } },
    { id: "hammer", weapon: "hammer", name: "地脈餘震", symbol: "⬢", desc: "將熔晶嵌入錘首：重擊後向前撕開寬廣地裂波，可貫穿獸群。", apply: (g) => {
      g.mods.hammerQuake = true;
    } },
    { id: "beast", name: "投獸匠藝", symbol: "♧", desc: "琥珀投獸器傷害 +40%，裝填間隔縮短 15%。", apply: (g) => {
      g.mods.beast += 0.4;
      g.mods.beastSpeed *= 0.85;
    } },
    { id: "spring", name: "潮汐回響", symbol: "≈", desc: "泉水治療 +50%，泉邊衝刺寒潮傷害翻倍。", apply: (g) => {
      g.mods.heal += 0.5;
      g.mods.frost += 1;
    } },
    { id: "armor", name: "琥珀護甲", symbol: "⬡", desc: "受到傷害降低 15%，立即回復 20 生命。", apply: (g) => {
      g.mods.armor *= 0.85;
      g.heal(20);
    } },
    { id: "builder", name: "荒野工匠", symbol: "⌂", desc: "商人建築卡的木材價格減少 1（最低 1）。", apply: (g) => {
      g.mods.discount++;
    } },
    { id: "heart", name: "巨獸之心", symbol: "♡", desc: "生命上限 +25，立即回滿 25 生命。", apply: (g) => {
      g.hero.maxHp += 25;
      g.heal(25);
    } },
    { id: "loot", name: "拾荒直覺", symbol: "◆", desc: "掉落自動吸附距離 +80，每波多得 3 琥珀。", apply: (g) => {
      g.mods.magnet += 80;
      g.mods.income += 3;
    } },
    { id: "repair", name: "守巢誓約", symbol: "◉", desc: "聖獸卵回復 45，每波結束再回復 15。", apply: (g) => {
      g.base.hp = Math.min(g.base.maxHp, g.base.hp + 45);
      g.mods.repair += 15;
    } }
  ]);
  var UPGRADE_PRICES = Object.freeze({
    "volley-fan": { wood: 0, bone: 2, amber: 10 },
    "volley-pierce": { wood: 0, bone: 4, amber: 16 },
    "shock-field": { wood: 0, bone: 2, amber: 10 },
    "shock-resonance": { wood: 0, bone: 4, amber: 16 },
    fire: { wood: 0, bone: 4, amber: 18 },
    bones: { wood: 0, bone: 3, amber: 14 },
    dash: { wood: 0, bone: 3, amber: 16 },
    spear: { wood: 3, bone: 4, amber: 12 },
    axe: { wood: 3, bone: 4, amber: 12 },
    bow: { wood: 4, bone: 3, amber: 14 },
    blades: { wood: 3, bone: 5, amber: 14 },
    hammer: { wood: 5, bone: 5, amber: 14 },
    beast: { wood: 0, bone: 4, amber: 18 },
    spring: { wood: 0, bone: 3, amber: 16 },
    armor: { wood: 0, bone: 3, amber: 16 },
    builder: { wood: 0, bone: 2, amber: 14 },
    heart: { wood: 0, bone: 3, amber: 16 },
    loot: { wood: 0, bone: 3, amber: 16 },
    repair: { wood: 0, bone: 2, amber: 16 }
  });
  var UPGRADE_CARD_REQUIREMENTS = Object.freeze({ fire: Object.freeze(["watchtower", "torch"]), bones: Object.freeze(["wall"]), beast: Object.freeze(["catapult"]), spring: Object.freeze(["spring"]) });
  var clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  var distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function seededRandom(seed) {
    let s = seed >>> 0;
    const random = () => {
      s = s + 1831565813 >>> 0;
      let t = s;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    random.getState = () => s;
    random.setState = (value) => {
      s = value >>> 0;
    };
    return random;
  }
  function shuffled(values, random) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function createMapEventPlan(seed, allocateId) {
    const random = seededRandom((seed ^ 2654435769) >>> 0), types = shuffled(Object.keys(MAP_EVENT_DEFS), random), stages = shuffled([1, 2, 3, 4, 5, 6, 7], random).slice(0, types.length), spots = shuffled(MAP_EVENT_SPOTS, random);
    return types.map((type, index) => ({ id: allocateId(), type, stage: stages[index], x: spots[index].x, y: spots[index].y, r: type === "elite" ? 34 : 28, variant: Math.floor(random() * 3), status: "pending", eliteIds: [] }));
  }
  function pointToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }
  var SNAPSHOT_KEYS = ["runId", "seed", "nextId", "phase", "wave", "time", "realTime", "waveTime", "amber", "hero", "base", "buildings", "enemies", "projectiles", "drops", "nodes", "hand", "cardTimers", "choices", "selectedUpgrades", "spawnQueue", "spawnTimer", "stats", "mods"];
  var MARKET_KEYS = ["materials", "inventory", "allies"];
  var enemyTypes = ["raptor", "brute", "spitter", "matriarch", "charger", "boss"];
  var STAGE_ROSTERS = Object.freeze([
    Object.freeze(["raptor", "raptor", "raptor", "raptor", "raptor", "raptor", "raptor", "raptor"]),
    Object.freeze(["raptor", "raptor", "brute", "raptor", "raptor", "raptor", "raptor", "brute", "raptor", "raptor", "raptor"]),
    Object.freeze(["raptor", "spitter", "raptor", "spitter", "brute", "raptor", "spitter", "raptor", "matriarch"]),
    Object.freeze(["brute", "raptor", "spitter", "brute", "raptor", "brute", "spitter", "raptor", "brute", "spitter", "raptor", "brute", "raptor", "spitter", "raptor", "raptor"]),
    Object.freeze(["spitter", "raptor", "brute", "raptor", "spitter", "brute", "raptor", "spitter", "raptor", "brute", "spitter", "raptor", "brute", "raptor", "spitter", "brute", "raptor", "spitter", "raptor", "brute"]),
    Object.freeze(["brute", "spitter", "raptor", "brute", "raptor", "spitter", "brute", "raptor", "charger"]),
    Object.freeze(["spitter", "brute", "raptor", "spitter", "raptor", "brute", "spitter", "raptor", "brute", "spitter", "raptor", "brute", "raptor", "spitter", "brute", "raptor", "spitter", "brute"]),
    Object.freeze(["brute", "spitter", "raptor", "brute", "spitter", "raptor", "boss"])
  ]);
  var own = (object, key) => Object.hasOwn(object, key);
  var isNum = (v, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  function required(condition) {
    if (!condition) throw new Error("遠征存檔格式損壞或版本不相容");
  }
  function numbers(object, keys) {
    required(object && typeof object === "object" && !Array.isArray(object));
    for (const key of keys) required(isNum(object[key]));
  }
  function list(value, max) {
    required(Array.isArray(value) && value.length <= max);
  }
  function actor(value) {
    numbers(value, ["x", "y", "hp", "r"]);
    required(isNum(value.x, -100, 820) && isNum(value.y, -100, 920) && isNum(value.r, 1, 100));
  }
  function objectiveActors(objective) {
    return objective ? [objective.npc, objective.captive, ...objective.targets || [], ...objective.points || []].filter(Boolean) : [];
  }
  function validateObjective(objective, wave) {
    required(objective && typeof objective === "object" && objective.stage === wave && STAGE_OBJECTIVES[wave - 1]?.type === objective.type);
    required(typeof objective.completed === "boolean");
    if (objective.type === "escort") {
      actor(objective.npc);
      numbers(objective.npc, ["maxHp", "speed"]);
      required(isNum(objective.npc.maxHp, 1, 1e3) && isNum(objective.npc.hp, 0, objective.npc.maxHp));
      required(Number.isInteger(objective.npc.waypoint) && isNum(objective.npc.waypoint, 0, ESCORT_PATH.length));
      required(typeof objective.npc.reached === "boolean");
    } else if (objective.type === "destroy") {
      list(objective.targets, 3);
      required(objective.targets.length === 3);
      for (const target of objective.targets) {
        actor(target);
        numbers(target, ["maxHp"]);
        required(target.objectiveKind === "nest" && isNum(target.maxHp, 1, 2e3) && isNum(target.hp, 0, target.maxHp));
      }
    } else if (objective.type === "mining") {
      numbers(objective, ["timeLeft", "duration", "mined", "required"]);
      required(Number.isInteger(objective.mined) && Number.isInteger(objective.required) && isNum(objective.mined, 0, 3) && objective.required === 3 && isNum(objective.timeLeft, 0, 50) && objective.duration === 50);
      list(objective.nodeIds, 3);
      required(objective.nodeIds.length === 3 && objective.nodeIds.every(Number.isInteger));
    } else if (objective.type === "rescue") {
      actor(objective.captive);
      numbers(objective.captive, ["maxHp"]);
      numbers(objective, ["progress", "required"]);
      required(isNum(objective.captive.maxHp, 1, 1e3) && isNum(objective.captive.hp, 0, objective.captive.maxHp) && typeof objective.rescued === "boolean" && objective.required === 4 && isNum(objective.progress, 0, objective.required));
    } else if (objective.type === "strongholds") {
      list(objective.points, 3);
      required(objective.points.length === 3);
      for (const point2 of objective.points) {
        actor(point2);
        numbers(point2, ["maxHp"]);
        required(point2.objectiveKind === "stronghold" && isNum(point2.maxHp, 1, 2e3) && isNum(point2.hp, 0, point2.maxHp));
      }
    }
  }
  function validateSnapshot(s) {
    required(s && [1, 2].includes(s.version) && typeof s.runId === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(s.runId));
    required(validateTutorial(s.tutorial));
    if (s.tutorial?.reward) required(s.phase === "prep" && s.wave === 1 && s.stats.waves === 1);
    required(SNAPSHOT_KEYS.every((key) => own(s, key)));
    numbers(s, ["seed", "nextId", "wave", "time", "realTime", "waveTime", "amber", "spawnTimer", "rngState"]);
    required(Number.isInteger(s.rngState) && isNum(s.rngState, 0, 4294967295));
    required(Number.isInteger(s.wave) && isNum(s.wave, 0, MAX_WAVES) && isNum(s.amber, 0, 99));
    required(["prep", "wave", "draft", "win", "lose"].includes(s.phase));
    required(s.phase !== "wave" || s.wave > 0);
    required(s.phase !== "draft" || s.wave > 0 && s.wave < MAX_WAVES);
    required(s.phase !== "win" || s.wave === MAX_WAVES || s.wave === 6);
    actor(s.hero);
    actor(s.base);
    numbers(s.hero, ["maxHp", "angle", "attackCD", "dashCD", "dashTime", "dashX", "dashY", "invulnerable", "swing"]);
    for (const key of ["volleyCD", "shockCD"]) if (s.hero[key] !== void 0) required(isNum(s.hero[key], 0, 1e6));
    if (s.hero.weaponChain !== void 0) required(Number.isInteger(s.hero.weaponChain) && isNum(s.hero.weaponChain, 0, 1e8));
    numbers(s.base, ["maxHp"]);
    required(s.hero.id === "hero" && s.base.id === "base");
    required(own(WEAPONS, s.hero.weapon));
    if (s.loadout !== void 0) {
      required(isValidLoadout(s.loadout, { allowLegacy: true }));
      required(s.loadout.weapons.includes(s.hero.weapon));
    }
    if (s.campUnlocks !== void 0 && s.campUnlocks !== null) {
      list(s.campUnlocks, UPGRADES.length);
      required(s.campUnlocks.every((id) => UPGRADES.some((upgrade) => upgrade.id === id)) && new Set(s.campUnlocks).size === s.campUnlocks.length);
    }
    if (s.campSupplyBonus !== void 0) {
      numbers(s.campSupplyBonus, ["wood", "bone", "amber"]);
      for (const key of ["wood", "bone", "amber"]) required(Number.isInteger(s.campSupplyBonus[key]) && isNum(s.campSupplyBonus[key], 0, 999));
    }
    for (const a of [s.hero, s.base]) required(isNum(a.maxHp, 1, 1e4) && isNum(a.hp, 0, a.maxHp));
    required(["lose", "win"].includes(s.phase) || s.hero.hp > 0 && s.base.hp > 0);
    list(s.buildings, 16);
    list(s.enemies, 120);
    list(s.projectiles, 250);
    list(s.drops, 150);
    list(s.nodes, 30);
    const ids = /* @__PURE__ */ new Set(), mapEvents = s.eventPlan || [];
    if (s.eventPlan !== void 0) {
      list(mapEvents, 5);
      required(mapEvents.length === 5 && new Set(mapEvents.map((event) => event.type)).size === 5 && new Set(mapEvents.map((event) => event.stage)).size === 5);
      for (const event of mapEvents) {
        numbers(event, ["x", "y", "r", "stage", "variant"]);
        required(Number.isInteger(event.id) && event.id > 0 && !ids.has(event.id));
        ids.add(event.id);
        required(own(MAP_EVENT_DEFS, event.type) && isNum(event.x, 40, 680) && isNum(event.y, 60, 760) && isNum(event.r, 10, 60) && Number.isInteger(event.stage) && isNum(event.stage, 1, 7) && Number.isInteger(event.variant) && isNum(event.variant, 0, 2) && ["pending", "active", "completed", "missed"].includes(event.status));
        list(event.eliteIds, 6);
        required(event.eliteIds.every((id) => Number.isInteger(id) && id > 0) && new Set(event.eliteIds).size === event.eliteIds.length);
      }
    }
    if (s.version === 2) {
      required(MARKET_KEYS.every((key) => own(s, key)));
      list(s.allies, 4);
      for (const k of ["wood", "bone"]) required(Number.isInteger(s.materials?.[k]) && isNum(s.materials[k], 0, 999));
      for (const k of Object.keys(DEPLOY_CARDS)) {
        const value = s.inventory?.[k];
        required(value === void 0 && ["watchtower", "catapult"].includes(k) || Number.isInteger(value) && isNum(value, 0, 99));
      }
      for (const a of s.allies) {
        actor(a);
        required(own(HIRES, a.type));
        numbers(a, ["maxHp", "cd", "angle"]);
        required(isNum(a.maxHp, 1, 1e3) && isNum(a.hp, 0, a.maxHp));
      }
      required(s.phase !== "draft");
    }
    if (s.companion !== void 0 && s.companion !== null) {
      const p = s.companion;
      actor(p);
      required(own(COMPANIONS, p.type));
      numbers(p, ["maxHp", "cd", "abilityCD", "angle", "xp", "attackCount"]);
      required(Number.isInteger(p.level) && isNum(p.level, 1, COMPANION_MAX_LEVEL));
      required(Number.isInteger(p.xp) && isNum(p.xp, 0, 1e8));
      required(Number.isInteger(p.attackCount) && isNum(p.attackCount, 0, 1e8));
      required(isNum(p.maxHp, 1, 5e3) && isNum(p.hp, 0, p.maxHp));
    }
    if (s.objective !== void 0 && s.objective !== null) validateObjective(s.objective, s.wave);
    const weakpoints = s.enemies.map((enemy) => enemy.weakpoint).filter(Boolean);
    for (const a of [...s.buildings, ...s.enemies, ...weakpoints, ...s.projectiles, ...s.nodes, ...s.version === 2 ? s.allies : [], ...objectiveActors(s.objective)]) {
      required(Number.isInteger(a.id) && a.id > 0 && !ids.has(a.id));
      ids.add(a.id);
    }
    required(Number.isInteger(s.nextId) && s.nextId > Math.max(0, ...ids));
    for (const b of s.buildings) {
      actor(b);
      required(own(CARDS, b.type));
      numbers(b, ["maxHp", "level", "cd", "healCD"]);
      numbers(b.pet, ["x", "y"]);
      required(Number.isInteger(b.level) && isNum(b.level, 1, 3));
    }
    for (const e of s.enemies) {
      actor(e);
      required(enemyTypes.includes(e.type));
      numbers(e, ["maxHp", "speed", "damage", "cd", "windup", "burn", "slow", "flash", "angle"]);
      if (e.bossPhase !== void 0) required(Number.isInteger(e.bossPhase) && isNum(e.bossPhase, 0, 3));
      if (e.attackCount !== void 0) required(Number.isInteger(e.attackCount) && isNum(e.attackCount, 0, 1e6));
      if (e.attackKind !== void 0) required(typeof e.attackKind === "string" && e.attackKind.length <= 40);
      if (e.elite !== void 0) required(typeof e.elite === "boolean");
      if (e.eliteEventId !== void 0) required(Number.isInteger(e.eliteEventId) && e.eliteEventId > 0 && mapEvents.some((mapEvent) => mapEvent.type === "elite" && mapEvent.id === e.eliteEventId));
      if (e.windup > 0) numbers(e, ["lockX", "lockY"]);
      if (e.weakpoint) {
        const w = e.weakpoint;
        actor(w);
        numbers(w, ["maxHp", "openTime", "bossId"]);
        required(BOSS_WEAKPOINTS[e.type]?.kind === w.kind && w.bossId === e.id && isNum(w.maxHp, 1, 5e3) && isNum(w.hp, 0, w.maxHp) && typeof w.open === "boolean" && typeof w.broken === "boolean");
      }
    }
    for (const p of s.projectiles) {
      numbers(p, ["x", "y", "vx", "vy", "damage", "life"]);
      required(typeof p.hostile === "boolean");
      if (!p.hostile) {
        list(p.hits, 150);
        required(p.hits.every(Number.isInteger));
        numbers(p, ["pierce"]);
        required(typeof p.fire === "boolean");
        if (p.hitRadius !== void 0) required(isNum(p.hitRadius, 1, 80));
        if (p.targetWeakpointId !== void 0) required(Number.isInteger(p.targetWeakpointId) && p.targetWeakpointId >= 0);
        if (p.kind === "catapult") {
          numbers(p, ["startX", "startY", "targetX", "targetY", "maxLife", "radius"]);
          required(isNum(p.maxLife, 0.1, 5) && isNum(p.radius, 1, 300));
        }
        if (p.kind === "shock-field") {
          numbers(p, ["maxLife", "radius", "tickCD"]);
          required(isNum(p.maxLife, 0.1, 10) && isNum(p.radius, 1, 300) && isNum(p.tickCD, -1, 2));
        }
      }
    }
    for (const d of s.drops) numbers(d, ["x", "y", "value", "life"]);
    for (const n of s.nodes) actor(n);
    list(s.hand, 4);
    list(s.cardTimers, 4);
    required(s.hand.length === 4 && s.cardTimers.length === 4);
    s.hand.forEach((type, i) => {
      required(type === null || own(s.version === 2 ? DEPLOY_CARDS : CARDS, type));
      required(isNum(s.cardTimers[i], 0, 10));
      required(s.version === 2 || type !== null || s.cardTimers[i] > 0);
    });
    if (s.loadout !== void 0 && !s.loadout.legacy) required(s.hand.every((type) => type === null || s.loadout.cards.includes(type)));
    const validUpgrade = (id) => UPGRADES.some((u) => u.id === id);
    list(s.choices, 3);
    list(s.selectedUpgrades, s.version === 2 ? 32 : 5);
    required(s.choices.every(validUpgrade) && s.selectedUpgrades.every(validUpgrade));
    required(s.phase !== "draft" || s.choices.length === 3 && new Set(s.choices).size === 3);
    list(s.spawnQueue, 120);
    required(s.spawnQueue.every((t) => enemyTypes.includes(t)));
    numbers(s.stats, ["kills", "buildings", "upgrades", "combos", "damage", "harvested", "waves"]);
    numbers(s.mods, ["fire", "torch", "blast", "blastRange", "dash", "speed", "pierce", "spear", "axe", "beast", "beastSpeed", "heal", "frost", "armor", "discount", "magnet", "income", "repair"]);
    required(typeof s.mods.spin === "boolean");
    for (const key of ["bow", "blades", "hammer"]) if (s.mods[key] !== void 0) required(isNum(s.mods[key], 0, 500));
    for (const key of ["spearFork", "bowVolley", "bladeRush", "hammerQuake"]) if (s.mods[key] !== void 0) required(typeof s.mods[key] === "boolean");
    for (const key of ["volleyArrows", "volleyPierce", "shockFieldDuration", "shockFieldRadius", "shockFieldDamage"]) if (s.mods[key] !== void 0) required(isNum(s.mods[key], 0, 500));
    return true;
  }
  var Expedition = class _Expedition {
    constructor(seed = Date.now(), runId = `run-${seed}-${Math.random().toString(36).slice(2, 12)}`) {
      this.runId = runId;
      this.rng = seededRandom(seed);
      this.seed = seed;
      this.nextId = 1;
      this.phase = "prep";
      this.wave = 0;
      this.time = 0;
      this.realTime = 0;
      this.waveTime = 0;
      this.paused = false;
      this.building = false;
      this.amber = 16;
      this.hero = {
        id: "hero",
        x: 360,
        y: 475,
        hp: 100,
        maxHp: 100,
        r: 16,
        angle: -Math.PI / 2,
        weapon: "spear",
        weaponChain: 0,
        attackCD: 0,
        dashCD: 0,
        volleyCD: 0,
        shockCD: 0,
        dashTime: 0,
        dashX: 0,
        dashY: 0,
        invulnerable: 0,
        swing: 0
      };
      this.base = { id: "base", x: 360, y: 385, hp: 220, maxHp: 220, r: 35 };
      this.buildings = [];
      this.enemies = [];
      this.projectiles = [];
      this.effects = [];
      this.drops = [];
      this.nodes = [];
      this.events = [];
      this.hand = [...STARTING_BUILD_DECK];
      this.cardTimers = [0, 0, 0, 0];
      this.materials = { wood: 8, bone: 4 };
      this.inventory = { watchtower: 2, catapult: 1, torch: 2, wall: 1, nest: 1, spring: 1, hunter: 0, guard: 0 };
      this.allies = [];
      this.companion = null;
      this.objective = null;
      this.loadout = copyLoadout(LEGACY_LOADOUT);
      this.campUnlocks = null;
      this.campSupplyBonus = { wood: 0, bone: 0, amber: 0 };
      this.tutorial = null;
      this.choices = [];
      this.selectedUpgrades = [];
      this.spawnQueue = [];
      this.spawnTimer = 0;
      this.stats = { kills: 0, buildings: 0, upgrades: 0, combos: 0, damage: 0, harvested: 0, waves: 0 };
      this.mods = {
        fire: 1,
        torch: 1,
        blast: 1,
        blastRange: 1,
        dash: 1,
        speed: 1,
        pierce: 0,
        spear: 1,
        axe: 1,
        bow: 1,
        blades: 1,
        hammer: 1,
        spin: false,
        spearFork: false,
        bowVolley: false,
        bladeRush: false,
        hammerQuake: false,
        beast: 1,
        beastSpeed: 1,
        heal: 1,
        frost: 1,
        armor: 1,
        discount: 0,
        magnet: 0,
        income: 0,
        repair: 0,
        volleyArrows: 5,
        volleyPierce: 0,
        shockFieldDuration: 0,
        shockFieldRadius: 145,
        shockFieldDamage: 0
      };
      for (let i = 0; i < 6; i++) {
        const angle = i / 6 * Math.PI * 2 + this.rng() * 0.2;
        this.nodes.push({ id: this.nextId++, x: 360 + Math.cos(angle) * (210 + this.rng() * 30), y: 400 + Math.sin(angle) * (245 + this.rng() * 35), r: 17, hp: 34 });
      }
      this.eventPlan = createMapEventPlan(seed, () => this.nextId++);
    }
    snapshot() {
      const state = { version: 2, rngState: this.rng.getState() };
      for (const key of [...SNAPSHOT_KEYS, ...MARKET_KEYS]) state[key] = this[key];
      state.companion = this.companion;
      state.objective = this.objective;
      state.eventPlan = this.eventPlan;
      state.loadout = this.loadout;
      state.campUnlocks = this.campUnlocks;
      state.campSupplyBonus = this.campSupplyBonus;
      state.tutorial = this.tutorial;
      return JSON.parse(JSON.stringify(state));
    }
    static restore(snapshot) {
      validateSnapshot(snapshot);
      const g = new _Expedition(snapshot.seed, snapshot.runId);
      for (const key of SNAPSHOT_KEYS) g[key] = JSON.parse(JSON.stringify(snapshot[key]));
      if (!Number.isFinite(g.hero.volleyCD)) g.hero.volleyCD = 0;
      if (!Number.isFinite(g.hero.shockCD)) g.hero.shockCD = 0;
      if (!Number.isInteger(g.hero.weaponChain)) g.hero.weaponChain = 0;
      for (const [key, value] of Object.entries({ bow: 1, blades: 1, hammer: 1, volleyArrows: 5, volleyPierce: 0, shockFieldDuration: 0, shockFieldRadius: 145, shockFieldDamage: 0 })) if (!Number.isFinite(g.mods[key])) g.mods[key] = value;
      for (const [key, value] of Object.entries({ spearFork: false, bowVolley: false, bladeRush: false, hammerQuake: false })) if (typeof g.mods[key] !== "boolean") g.mods[key] = value;
      if (g.selectedUpgrades.includes("spear")) g.mods.spearFork = true;
      if (g.selectedUpgrades.includes("axe")) g.mods.spin = true;
      if (g.selectedUpgrades.includes("bow")) g.mods.bowVolley = true;
      if (g.selectedUpgrades.includes("blades")) g.mods.bladeRush = true;
      if (g.selectedUpgrades.includes("hammer")) g.mods.hammerQuake = true;
      if (snapshot.version === 2) {
        for (const key of MARKET_KEYS) g[key] = JSON.parse(JSON.stringify(snapshot[key]));
        for (const type of Object.keys(DEPLOY_CARDS)) if (!Number.isInteger(g.inventory[type])) g.inventory[type] = 0;
      } else {
        const legacy = ["torch", "wall", "nest", "spring"];
        g.hand = g.hand.map((type, i) => type || legacy[i]);
        g.cardTimers = [0, 0, 0, 0];
        if (g.phase === "draft") g.phase = "prep";
        g.choices = [];
      }
      g.companion = snapshot.companion ? JSON.parse(JSON.stringify(snapshot.companion)) : null;
      g.loadout = snapshot.loadout ? copyLoadout(snapshot.loadout) : copyLoadout(LEGACY_LOADOUT);
      g.campUnlocks = Array.isArray(snapshot.campUnlocks) ? [...snapshot.campUnlocks] : null;
      g.campSupplyBonus = snapshot.campSupplyBonus ? { ...snapshot.campSupplyBonus } : { wood: 0, bone: 0, amber: 0 };
      g.tutorial = snapshot.tutorial ? JSON.parse(JSON.stringify(snapshot.tutorial)) : null;
      g.objective = snapshot.objective ? JSON.parse(JSON.stringify(snapshot.objective)) : null;
      const migrateMapEvents = !snapshot.eventPlan;
      g.eventPlan = snapshot.eventPlan ? JSON.parse(JSON.stringify(snapshot.eventPlan)) : createMapEventPlan(g.seed, () => g.nextId++);
      if (migrateMapEvents) {
        for (const mapEvent of g.eventPlan) if (mapEvent.stage <= g.stats.waves) mapEvent.status = "missed";
      }
      if (g.companion) {
        const p = g.companion, d = COMPANIONS[p.type];
        p.cd = Number.isFinite(p.cd) ? p.cd : 0;
        p.abilityCD = Number.isFinite(p.abilityCD) ? p.abilityCD : 2;
        p.attackCount = Number.isInteger(p.attackCount) ? p.attackCount : 0;
        p.angle = Number.isFinite(p.angle) ? p.angle : 0;
        p.maxHp = g.companionMaxHp(p.type, p.level);
        p.hp = clamp(p.hp, 0, p.maxHp);
        p.r = d.radius;
      }
      for (const b of g.buildings) {
        const tunedMax = CARDS[b.type].hp * (1 + (b.level - 1) * 0.6);
        if (Math.abs(b.maxHp - tunedMax) > 1e-3) {
          const ratio = b.hp / b.maxHp;
          b.maxHp = tunedMax;
          b.hp = Math.min(tunedMax, tunedMax * ratio);
        }
      }
      for (const e of g.enemies) {
        if (!Number.isInteger(e.bossPhase)) e.bossPhase = 0;
        if (!Number.isInteger(e.attackCount)) e.attackCount = 0;
        if (typeof e.attackKind !== "string") e.attackKind = "";
        if (BOSS_WEAKPOINTS[e.type] && !e.weakpoint) e.weakpoint = g.createBossWeakpoint(e, STAGE_BALANCE[Math.max(0, g.wave - 1)]?.hp || 1);
      }
      g.rng.setState(snapshot.rngState);
      if (g.phase === "wave" && !g.objective) g.setupObjective();
      if (g.phase === "wave" && !tutorialProtected(g)) g.activateMapEvent();
      g.paused = true;
      g.building = false;
      g.events = [];
      g.effects = [];
      return g;
    }
    event(type, data = {}) {
      this.events.push({ type, ...data });
      if (this.events.length > 120) this.events.shift();
    }
    consumeEvents() {
      const events = this.events;
      this.events = [];
      return events;
    }
    mapEventsForStage(stage = this.wave) {
      return (this.eventPlan || []).filter((mapEvent) => mapEvent.stage === stage);
    }
    activeMapEvents() {
      return this.mapEventsForStage().filter((mapEvent) => mapEvent.status === "active");
    }
    findMapEventSpot(mapEvent) {
      const occupied = [this.base, ...this.buildings.filter((actor2) => actor2.hp > 0), ...this.nodes.filter((actor2) => actor2.hp > 0), ...objectiveActors(this.objective)];
      const choices = [{ x: mapEvent.x, y: mapEvent.y }, ...MAP_EVENT_SPOTS];
      return choices.find((point2) => occupied.every((actor2) => distance(point2, actor2) > mapEvent.r + (actor2.r || 20) + 28)) || choices[0];
    }
    activateMapEvent() {
      if (mandatoryTutorial(this)) return null;
      const mapEvent = this.mapEventsForStage().find((entry) => entry.status === "pending");
      if (!mapEvent || this.phase !== "wave") return null;
      const spot = this.findMapEventSpot(mapEvent);
      mapEvent.x = spot.x;
      mapEvent.y = spot.y;
      mapEvent.status = "active";
      if (mapEvent.type === "elite") {
        const rngState = this.rng.getState(), types = this.wave <= 2 ? ["raptor", "raptor", "raptor"] : this.wave <= 5 ? ["brute", "spitter", "raptor"] : ["brute", "brute", "spitter"];
        mapEvent.eliteIds = types.map((type, index) => {
          const angle = index * Math.PI * 2 / types.length - 0.7, enemy = this.spawnEnemy(type, { x: clamp(mapEvent.x + Math.cos(angle) * 68, 48, 672), y: clamp(mapEvent.y + Math.sin(angle) * 60, 78, 742) });
          enemy.elite = true;
          enemy.eliteEventId = mapEvent.id;
          enemy.maxHp *= 1.42;
          enemy.hp = enemy.maxHp;
          enemy.damage *= 1.22;
          enemy.speed *= 1.06;
          return enemy.id;
        });
        this.rng.setState(rngState);
        this.event("notice", { message: "金印精英獸群現身 · 擊敗全部成員可領取懸賞" });
      } else this.event("notice", { message: `發現地圖事件 · ${MAP_EVENT_DEFS[mapEvent.type].name}` });
      return mapEvent;
    }
    nearbyMapEvent() {
      return this.activeMapEvents().filter((mapEvent) => mapEvent.type !== "elite" && distance(this.hero, mapEvent) <= 92 + mapEvent.r).sort((a, b) => distance(this.hero, a) - distance(this.hero, b))[0] || null;
    }
    mapEventPrompt(mapEvent = this.nearbyMapEvent()) {
      if (!mapEvent) return "";
      if (mapEvent.type === "merchant") return this.amber >= 6 ? "交換補給 · 6 ◆" : "琥珀不足 · 需要 6 ◆";
      return { ruin: "解讀遺跡", hunter: "救援獵人", chest: "開啟寶箱" }[mapEvent.type] || "互動";
    }
    resolveMapEvent(mapEvent, message) {
      if (!mapEvent || mapEvent.status !== "active") return false;
      mapEvent.status = "completed";
      this.effects.push({ kind: "burst", x: mapEvent.x, y: mapEvent.y, r: 78, color: "#f0d183", life: 0.7, maxLife: 0.7 });
      this.float(mapEvent.x, mapEvent.y - 38, "事件完成", "#ffe4a0");
      this.event("map-event", { eventType: mapEvent.type, name: MAP_EVENT_DEFS[mapEvent.type].name, message });
      return true;
    }
    interactMapEvent(id) {
      if (mandatoryTutorial(this)) return false;
      if (this.paused || this.phase !== "wave") return false;
      const mapEvent = this.nearbyMapEvent();
      if (!mapEvent || id !== void 0 && mapEvent.id !== id) return false;
      if (mapEvent.type === "merchant") {
        if (this.amber < 6) {
          this.event("notice", { message: "荒境行商需要 6 琥珀 · 採集晶礦或擊敗敵人後再來" });
          return false;
        }
        this.amber -= 6;
        this.materials.wood = Math.min(999, this.materials.wood + 3);
        this.materials.bone = Math.min(999, this.materials.bone + 2);
        this.heal(20);
        return this.resolveMapEvent(mapEvent, "行商收下琥珀 · 木材 +3、獸骨 +2、生命回復 20");
      }
      if (mapEvent.type === "chest") {
        const rewards = [{ wood: 4, bone: 1, amber: 5 }, { wood: 2, bone: 3, amber: 7 }, { wood: 3, bone: 2, amber: 9 }][mapEvent.variant];
        this.materials.wood = Math.min(999, this.materials.wood + rewards.wood);
        this.materials.bone = Math.min(999, this.materials.bone + rewards.bone);
        this.amber = Math.min(99, this.amber + rewards.amber);
        return this.resolveMapEvent(mapEvent, `寶箱已開啟 · 木材 +${rewards.wood}、獸骨 +${rewards.bone}、琥珀 +${rewards.amber}`);
      }
      if (mapEvent.type === "hunter") {
        if (this.allies.filter((ally) => ally.hp > 0).length < 4) {
          const d = HIRES.hunter;
          this.allies.push({ id: this.nextId++, type: "hunter", eventRescue: true, x: mapEvent.x, y: mapEvent.y, r: d.radius, hp: d.hp, maxHp: d.hp, cd: 0.2, angle: 0 });
          return this.resolveMapEvent(mapEvent, "受傷獵人已包紮 · 本關加入隊伍");
        }
        this.materials.bone = Math.min(999, this.materials.bone + 3);
        this.amber = Math.min(99, this.amber + 5);
        return this.resolveMapEvent(mapEvent, "隊伍已滿，獵人留下謝禮 · 獸骨 +3、琥珀 +5");
      }
      if (mapEvent.type === "ruin") {
        if (mapEvent.variant === 0) {
          this.hero.maxHp += 15;
          this.heal(15);
          return this.resolveMapEvent(mapEvent, "生命刻印甦醒 · 生命上限 +15");
        }
        if (mapEvent.variant === 1) {
          for (const id2 of Object.keys(WEAPONS)) this.mods[id2] += 0.1;
          return this.resolveMapEvent(mapEvent, "獵魂刻印甦醒 · 所有主武器傷害 +10%");
        }
        this.materials.wood = Math.min(999, this.materials.wood + 4);
        this.materials.bone = Math.min(999, this.materials.bone + 3);
        return this.resolveMapEvent(mapEvent, "造物刻印甦醒 · 木材 +4、獸骨 +3");
      }
      return false;
    }
    updateMapEvents() {
      const mapEvent = this.activeMapEvents().find((entry) => entry.type === "elite");
      if (!mapEvent || !mapEvent.eliteIds.length) return;
      if (mapEvent.eliteIds.some((id) => this.enemies.some((enemy) => enemy.id === id && enemy.hp > 0))) return;
      this.materials.bone = Math.min(999, this.materials.bone + 2);
      this.amber = Math.min(99, this.amber + 12);
      this.heal(20);
      this.base.hp = Math.min(this.base.maxHp, this.base.hp + 70);
      this.gainCompanionXP(18);
      this.resolveMapEvent(mapEvent, "精英獸群已擊敗 · 懸賞入袋並修復聖獸靈巢 70");
    }
    setupObjective() {
      const def = STAGE_OBJECTIVES[this.wave - 1] || STAGE_OBJECTIVES[0], base = { stage: this.wave, type: def.type, completed: false };
      this.nodes = this.nodes.filter((node) => node.objectiveKind !== "ore");
      if (def.type === "escort") {
        const start = ESCORT_PATH[0];
        base.npc = { id: this.nextId++, objectiveKind: "escort", x: start.x, y: start.y, r: 18, hp: 180, maxHp: 180, speed: 74, waypoint: 1, reached: false, angle: -Math.PI / 2 };
      } else if (def.type === "destroy") {
        base.targets = [[135, 205], [585, 235], [360, 665]].map(([x, y], index) => ({ id: this.nextId++, objectiveKind: "nest", label: `孵化巢 ${index + 1}`, x, y, r: 31, hp: 165, maxHp: 165 }));
      } else if (def.type === "mining") {
        base.duration = 50;
        base.timeLeft = 50;
        base.mined = 0;
        base.required = 3;
        base.nodeIds = [];
        for (const [x, y] of [[145, 210], [575, 275], [360, 675]]) {
          const node = { id: this.nextId++, objectiveKind: "ore", x, y, r: 20, hp: 42 };
          this.nodes.push(node);
          base.nodeIds.push(node.id);
        }
      } else if (def.type === "rescue") {
        base.progress = 0;
        base.required = 4;
        base.rescued = false;
        base.captive = { id: this.nextId++, objectiveKind: "captive", x: 585, y: 175, r: 17, hp: 100, maxHp: 100, angle: Math.PI };
      } else if (def.type === "strongholds") {
        base.points = [[150, 235], [570, 250], [360, 650]].map(([x, y], index) => ({ id: this.nextId++, objectiveKind: "stronghold", label: `月骨據點 ${index + 1}`, x, y, r: 29, hp: 320, maxHp: 320 }));
      }
      this.objective = base;
      this.event("objective", { objective: def.type, title: def.title });
      return base;
    }
    objectiveDefinition() {
      return STAGE_OBJECTIVES[Math.max(0, (this.objective?.stage || this.wave || 1) - 1)] || STAGE_OBJECTIVES[0];
    }
    attackableObjectives() {
      return this.objective?.type === "destroy" ? this.objective.targets.filter((target) => target.hp > 0) : [];
    }
    objectiveDefenders() {
      if (this.objective?.type === "escort" && this.objective.npc.hp > 0) return [this.objective.npc];
      if (this.objective?.type === "strongholds") return this.objective.points.filter((point2) => point2.hp > 0);
      return [];
    }
    combatDefenders() {
      return [this.hero, this.base, ...this.buildings, ...this.allies, ...this.companion ? [this.companion] : [], ...this.objectiveDefenders()];
    }
    objectiveStatus() {
      const o = this.objective, def = this.objectiveDefinition();
      if (!o) return { ...def, text: "尚未開始", progress: 0, complete: false };
      if (o.type === "escort") {
        const current = Math.max(0, Math.min(o.npc.waypoint - 1, ESCORT_PATH.length - 1));
        return { ...def, text: o.npc.reached ? "採集師已抵達出口" : distance(this.hero, o.npc) > 165 ? "靠近採集師才能帶路" : `路程 ${current} / ${ESCORT_PATH.length - 1}`, progress: o.npc.reached ? 1 : current / (ESCORT_PATH.length - 1), complete: o.npc.reached };
      }
      if (o.type === "destroy") {
        const destroyed = o.targets.filter((target) => target.hp <= 0).length;
        return { ...def, text: `已摧毀 ${destroyed} / ${o.targets.length}`, progress: destroyed / o.targets.length, complete: destroyed === o.targets.length };
      }
      if (o.type === "mining") return { ...def, text: `已採集 ${o.mined} / ${o.required} · 剩餘 ${Math.ceil(o.timeLeft)} 秒`, progress: o.mined / o.required, complete: o.mined >= o.required, timed: true };
      if (o.type === "rescue") return { ...def, text: o.rescued ? "受困弓手已獲救" : `救援 ${o.progress.toFixed(1)} / ${o.required.toFixed(1)} 秒`, progress: o.rescued ? 1 : o.progress / o.required, complete: o.rescued };
      if (o.type === "strongholds") {
        const alive = o.points.filter((point2) => point2.hp > 0), ratio = alive.length ? Math.min(...alive.map((point2) => point2.hp / point2.maxHp)) : 0;
        return { ...def, text: `據點 ${alive.length} / ${o.points.length} · 最低耐久 ${Math.ceil(ratio * 100)}%`, progress: ratio, complete: o.completed };
      }
      return { ...def, text: `聖獸卵 ${Math.ceil(this.base.hp)} / ${this.base.maxHp}`, progress: this.base.hp / this.base.maxHp, complete: o.completed };
    }
    objectiveReady() {
      const o = this.objective;
      if (!o) return true;
      if (o.type === "escort") return o.npc.reached && o.npc.hp > 0;
      if (o.type === "destroy") return o.targets.every((target) => target.hp <= 0);
      if (o.type === "mining") return o.mined >= o.required;
      if (o.type === "rescue") return o.rescued;
      if (o.type === "strongholds") return o.points.every((point2) => point2.hp > 0);
      return this.base.hp > 0;
    }
    completeObjective() {
      const o = this.objective;
      if (!o || o.completed || !this.objectiveReady()) return false;
      o.completed = true;
      const def = this.objectiveDefinition();
      this.effects.push({ kind: "burst", x: this.hero.x, y: this.hero.y, r: 92, color: "#e8d28a", life: 0.65, maxLife: 0.65 });
      this.event("objective-complete", { objective: o.type, title: def.title });
      return true;
    }
    failObjective(reason) {
      if (["lose", "win"].includes(this.phase)) return false;
      this.phase = "lose";
      this.building = false;
      this.event("end", { won: false, reason });
      return true;
    }
    updateObjective(dt) {
      const o = this.objective;
      if (!o || o.completed || this.phase !== "wave") return;
      if (o.type === "escort") {
        const npc = o.npc;
        if (npc.hp <= 0) {
          this.failObjective("護送的採集師倒下了");
          return;
        }
        if (!npc.reached && distance(this.hero, npc) <= 165) {
          const target = ESCORT_PATH[npc.waypoint];
          if (target) {
            const d = distance(npc, target), step = Math.min(d, npc.speed * dt);
            npc.angle = Math.atan2(target.y - npc.y, target.x - npc.x);
            npc.x += Math.cos(npc.angle) * step;
            npc.y += Math.sin(npc.angle) * step;
            if (d < 4) {
              npc.waypoint++;
              if (npc.waypoint >= ESCORT_PATH.length) {
                npc.reached = true;
                this.event("notice", { message: "採集師已抵達出口 · 繼續清除追兵" });
              }
            }
          }
        }
      } else if (o.type === "mining") {
        if (o.mined < o.required) {
          o.timeLeft = Math.max(0, o.timeLeft - dt);
          if (o.timeLeft <= 0) {
            this.failObjective("限時採礦未能完成");
            return;
          }
        }
      } else if (o.type === "rescue" && !o.rescued) {
        const safe = distance(this.hero, o.captive) <= 78 && !this.enemies.some((enemy) => enemy.hp > 0 && distance(enemy, o.captive) < 105 + enemy.r);
        o.progress = clamp(o.progress + (safe ? dt : -dt * 0.35), 0, o.required);
        if (o.progress >= o.required) {
          o.progress = o.required;
          o.rescued = true;
          const d = HIRES.hunter;
          if (this.allies.length < 4) this.allies.push({ id: this.nextId++, type: "hunter", rescued: true, x: o.captive.x, y: o.captive.y, r: d.radius, hp: d.hp, maxHp: d.hp, cd: 0.2, angle: 0 });
          this.effects.push({ kind: "burst", x: o.captive.x, y: o.captive.y, r: 82, color: "#9fd7bc", life: 0.7, maxLife: 0.7 });
          this.event("notice", { message: "受困弓手已獲救 · 本關加入隊伍" });
        }
      } else if (o.type === "strongholds" && o.points.some((point2) => point2.hp <= 0)) {
        this.failObjective("月骨據點失守");
      }
    }
    hitObjective(target, damage) {
      if (!target || target.hp <= 0 || target.objectiveKind !== "nest") return false;
      const before = target.hp;
      target.hp = Math.max(0, target.hp - damage);
      this.stats.damage += Math.min(before, damage);
      this.effects.push({ kind: "spark", x: target.x, y: target.y - 10, r: 25, color: "#e9b477", life: 0.35, maxLife: 0.35 });
      if (target.hp <= 0) {
        const status = this.objectiveStatus();
        this.effects.push({ kind: "burst", x: target.x, y: target.y, r: 74, color: "#e39a5f", life: 0.65, maxLife: 0.65 });
        this.event("notice", { message: `孵化巢已摧毀 · ${status.text}` });
      }
      return true;
    }
    get canBuild() {
      return !this.paused && (this.phase === "prep" || this.phase === "wave");
    }
    companionMaxHp(type, level) {
      const d = COMPANIONS[type];
      return Math.round(d.hp * (1 + (Math.max(1, level) - 1) * 0.12));
    }
    setCompanion(type, progress = {}) {
      const d = COMPANIONS[type];
      if (!d) return false;
      const level = clamp(Math.floor(Number(progress.level) || 1), 1, COMPANION_MAX_LEVEL), xp = Math.max(0, Math.floor(Number(progress.xp) || 0));
      const same = this.companion?.type === type, prior = same ? this.companion : null, maxHp = this.companionMaxHp(type, level);
      this.companion = {
        id: "companion",
        type,
        level,
        xp,
        x: prior?.x ?? this.hero.x - 42,
        y: prior?.y ?? this.hero.y + 34,
        r: d.radius,
        hp: prior ? Math.min(maxHp, prior.hp) : maxHp,
        maxHp,
        cd: prior?.cd ?? 0.2,
        abilityCD: prior?.abilityCD ?? 2.5,
        attackCount: prior?.attackCount ?? 0,
        angle: prior?.angle ?? 0
      };
      this.event("companion-ready", { companion: type, name: d.name, level });
      return true;
    }
    companionProgress() {
      const p = this.companion;
      return p ? { type: p.type, level: p.level, xp: p.xp } : null;
    }
    gainCompanionXP(amount) {
      const p = this.companion;
      if (!p || p.hp <= 0 || p.level >= COMPANION_MAX_LEVEL) return false;
      p.xp += Math.max(0, Math.floor(amount));
      let leveled = false;
      while (p.level < COMPANION_MAX_LEVEL) {
        const need2 = companionXPNeeded(p.level);
        if (p.xp < need2) break;
        p.xp -= need2;
        p.level++;
        const old = p.maxHp;
        p.maxHp = this.companionMaxHp(p.type, p.level);
        p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - old) + 18);
        leveled = true;
      }
      if (leveled) {
        const d = COMPANIONS[p.type];
        this.effects.push({ kind: "burst", x: p.x, y: p.y, r: 72, color: d.color, life: 0.65, maxLife: 0.65 });
        this.event("companion-level", { companion: p.type, name: d.name, level: p.level });
      }
      return leveled;
    }
    cost() {
      return 0;
    }
    // Materials are paid at the merchant; deploying consumes one owned card.
    applyLoadout(loadout) {
      if (!isValidLoadout(loadout)) throw new Error("出征配置不完整：需要 3 張建造卡、1 張佣兵卡、1 把武器與 1 個主動技能");
      this.loadout = copyLoadout(loadout);
      this.hero.weapon = this.loadout.weapons[0];
      this.hero.weaponChain = 0;
      const starter = { watchtower: 2, catapult: 1, torch: 2, wall: 1, nest: 1, spring: 1, hunter: 1, guard: 1 };
      for (const id of Object.keys(DEPLOY_CARDS)) this.inventory[id] = this.loadout.cards.includes(id) ? starter[id] : 0;
      this.setDeck("build");
      return this.loadout;
    }
    carriesCard(id) {
      return this.loadout?.legacy === true || this.loadout?.cards.includes(id);
    }
    carriesWeapon(id) {
      return this.loadout?.legacy === true || this.loadout?.weapons.includes(id);
    }
    carriesSkill(id) {
      return this.loadout?.legacy === true || this.loadout?.skills.includes(id);
    }
    upgradeFitsLoadout(skill) {
      if (!skill) return false;
      if (Array.isArray(this.campUnlocks) && !this.campUnlocks.includes(skill.id)) return false;
      if (skill.branch && !this.carriesSkill(skill.branch)) return false;
      if (skill.weapon && !this.carriesWeapon(skill.weapon)) return false;
      const cards = UPGRADE_CARD_REQUIREMENTS[skill.id];
      return !cards || cards.some((id) => this.carriesCard(id));
    }
    setDeck(kind) {
      if (mandatoryTutorial(this) && this.wave > 0 && (this.tutorial.step !== "build" || kind !== "build")) return false;
      if (!this.canBuild) return false;
      const source = this.loadout?.legacy ? kind === "hire" ? Object.keys(HIRES) : STARTING_BUILD_DECK : this.loadout?.cards || Object.keys(DEPLOY_CARDS);
      const cards = source.filter((id) => kind === "hire" ? own(HIRES, id) : own(CARDS, id)).slice(0, 4);
      this.hand = [...cards, ...Array(4 - cards.length).fill(null)];
      this.cardTimers = [0, 0, 0, 0];
      return true;
    }
    price(id) {
      if (own(CARD_PRICES, id)) {
        const price = { ...CARD_PRICES[id] };
        if (own(CARDS, id)) price.wood = Math.max(1, price.wood - this.mods.discount);
        return price;
      }
      if (typeof id === "string" && id.startsWith("skill-")) return UPGRADE_PRICES[id.slice(6)] || null;
      return null;
    }
    purchasePlan(id) {
      if (this.tutorial?.reward) return { ok: false, reason: "先領取第一關獎勵，再找商人整備" };
      if (!["prep", "wave", "rest"].includes(this.phase)) return { ok: false, reason: "目前遠征已結束，請先返回營地" };
      if (this.phase === "wave" && !this.paused) return { ok: false, reason: "打開商店後戰鬥會自動暫停，再進行購買" };
      const price = this.price(id);
      if (!price) return { ok: false, reason: "找不到這件商品" };
      if (own(DEPLOY_CARDS, id) && !this.carriesCard(id)) return { ok: false, reason: "這張卡未加入本次出征卡組" };
      if (own(DEPLOY_CARDS, id) && this.inventory[id] >= 99) return { ok: false, reason: "這張卡已達持有上限" };
      if (!own(DEPLOY_CARDS, id) && this.selectedUpgrades.includes(id.slice(6))) return { ok: false, reason: "本次遠征已學會這項強化" };
      if (!own(DEPLOY_CARDS, id)) {
        const skill = UPGRADES.find((u) => u.id === id.slice(6));
        if (!this.upgradeFitsLoadout(skill)) return { ok: false, reason: "這項強化不屬於本次出征配置" };
        if (skill?.requires && !this.selectedUpgrades.includes(skill.requires)) return { ok: false, reason: "需要先購買前一階技能強化" };
      }
      if (this.materials.wood < price.wood || this.materials.bone < price.bone || this.amber < price.amber) return { ok: false, reason: "材料不足，完成獸潮或採集晶礦後再來" };
      return { ok: true, price };
    }
    buy(id) {
      const plan = this.purchasePlan(id);
      if (!plan.ok) return plan;
      this.materials.wood -= plan.price.wood;
      this.materials.bone -= plan.price.bone;
      this.amber -= plan.price.amber;
      if (own(DEPLOY_CARDS, id)) this.inventory[id]++;
      else {
        const skill = UPGRADES.find((u) => u.id === id.slice(6));
        skill.apply(this);
        this.selectedUpgrades.push(skill.id);
      }
      this.event("purchase", { id });
      return plan;
    }
    buildingAt(x, y) {
      return this.buildings.find((b) => b.hp > 0 && distance(b, { x, y }) < b.r + 12);
    }
    placement(slot, x, y, findingTutorialSpot = false) {
      const type = this.hand[slot];
      if (mandatoryTutorial(this) && this.tutorial.step !== "build") return { ok: false, reason: "完成目前教學步驟後才會解鎖建造" };
      if (tutorialWaiting(this)) return { ok: false, reason: "先點擊教學面板繼續" };
      if (!findingTutorialSpot && tutorialProtected(this) && this.tutorial.version === 2 && this.tutorial.step === "build") {
        if (!Number.isFinite(x) || !Number.isFinite(y) || slot !== this.tutorial.slot || distance({ x, y }, this.tutorial.buildSpot) > TUTORIAL_BUILD_RADIUS) return { ok: false, reason: "將發光卡牌拖到金色虛線圈內，再放開" };
        ({ x, y } = this.tutorial.buildSpot);
      }
      if (tutorialProtected(this) && (this.tutorial.step !== "build" || own(HIRES, type))) return { ok: false, reason: "先完成上方引導，再拖建造卡到空地" };
      if (!this.canBuild || !type || this.cardTimers[slot] > 0) return { ok: false, reason: "現在不能使用這張卡" };
      if (!this.inventory[type]) return { ok: false, reason: "這張卡已用完，休整時找商人補貨" };
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 55 || x > 665 || y < 85 || y > 735) return { ok: false, reason: "請拖到戰場內的空地" };
      const cost = 0;
      if (own(HIRES, type)) {
        if (this.allies.filter((a) => a.hp > 0).length >= 4) return { ok: false, reason: "最多同時四名佣兵；卡片保留，不會消耗" };
        if (distance(this.base, { x, y }) < 60 || [...this.buildings, ...this.allies, ...this.nodes].some((a) => a.hp > 0 && distance(a, { x, y }) < a.r + HIRES[type].radius + 5)) return { ok: false, reason: "請將佣兵放在空地" };
        return { ok: true, x, y, cost, type, hire: true };
      }
      const found = this.buildingAt(x, y);
      if (found) {
        if (found.type !== type) return { ok: false, reason: "只有同類建築才能疊卡升級" };
        if (found.level >= 3) return { ok: false, reason: "已達最高三級" };
        return { ok: true, upgrade: found, cost, x: found.x, y: found.y, type };
      }
      if (this.buildings.filter((b) => b.hp > 0).length >= 12) return { ok: false, reason: "戰場最多 12 座建築；可用同類卡升級" };
      if (distance(this.base, { x, y }) < 73) return { ok: false, reason: "請留出聖獸卵的位置" };
      if (this.buildings.some((b) => b.hp > 0 && distance(b, { x, y }) < b.r + CARDS[type].radius + 10)) return { ok: false, reason: "與旁邊建築太近，稍微移開一點" };
      if (this.nodes.some((n) => n.hp > 0 && distance(n, { x, y }) < n.r + 35)) return { ok: false, reason: "這裡有晶礦，先用武器採集" };
      if (this.activeMapEvents().some((mapEvent) => distance(mapEvent, { x, y }) < mapEvent.r + 42)) return { ok: false, reason: "請為地圖事件留出互動空間" };
      return { ok: true, x, y, cost, type };
    }
    placeCard(slot, x, y) {
      const target = this.placement(slot, x, y);
      if (!target.ok) {
        this.event("notice", { message: target.reason });
        return target;
      }
      ({ x, y } = target);
      this.inventory[target.type]--;
      this.cardTimers[slot] = 0.3;
      if (target.hire) {
        const d = HIRES[target.type], ally = { id: this.nextId++, type: target.type, x, y, r: d.radius, hp: d.hp, maxHp: d.hp, cd: 0.2, angle: 0 };
        this.allies.push(ally);
        this.event("build");
        this.event("notice", { message: `${d.name} 加入隊伍 · 本次遠征跟隨作戰` });
        return { ...target, ally };
      }
      let b = target.upgrade;
      if (b) {
        b.level++;
        b.maxHp = CARDS[b.type].hp * (1 + (b.level - 1) * 0.6);
        b.hp = b.maxHp;
        this.stats.upgrades++;
        this.event("notice", { message: `${CARDS[b.type].name} → ${b.level} 級，耐久回滿` });
      } else {
        const def = CARDS[target.type];
        b = { id: this.nextId++, type: target.type, x, y, r: def.radius, hp: def.hp, maxHp: def.hp, level: 1, cd: 0.3, healCD: 2, pet: { x: x + 25, y: y + 16 } };
        this.buildings.push(b);
        this.stats.buildings++;
        this.event("notice", { message: `${def.name} 已建造 · ${def.short}` });
      }
      this.effects.push({ kind: "build", x: b.x, y: b.y, life: 0.7, maxLife: 0.7, color: "#eed48b", r: 55 });
      this.advanceTutorial("build");
      this.event("build");
      return { ...target, building: b };
    }
    enableTutorial(options) {
      if (this.wave === 0) this.tutorial = freshTutorial(options);
    }
    confirmTutorial() {
      if (!tutorialActive(this) || this.tutorial.version !== 2 || this.phase !== "wave" || this.paused) return false;
      const t = this.tutorial;
      if (!t.started) {
        t.started = true;
        this.event("tutorial-step", { step: t.step });
        return true;
      }
      if (!t.awaiting) return false;
      t.awaiting = false;
      return this.advanceTutorial(t.step, true);
    }
    advanceTutorial(step, confirmed = false) {
      if (!tutorialActive(this) || this.phase !== "wave" || this.tutorial.step !== step) return false;
      const t = this.tutorial;
      if (t.version === 2 && !confirmed) {
        if (!t.started || t.awaiting) return false;
        t.awaiting = true;
        this.building = false;
        this.event("tutorial-success", { step });
        return true;
      }
      const next = TUTORIAL_STEPS[TUTORIAL_STEPS.indexOf(step) + 1];
      if (!next) return false;
      this.tutorial.step = next;
      this.tutorial.elapsed = 0;
      if (next === "attack" && !this.enemies.some((e) => e.hp > 0) && this.spawnQueue.length) {
        const h = this.hero, enemy = this.spawnEnemy(this.spawnQueue.shift(), { x: h.x, y: clamp(h.y - 72, 100, 710) });
        if (t.version === 2) {
          enemy.hp = enemy.maxHp = Math.max(enemy.maxHp, 180);
          this.hero.attackCD = 0;
        }
      }
      if (next === "build") {
        this.setDeck("build");
        if (t.version === 2) {
          t.slot = this.hand.findIndex((type) => CARDS[type] && this.inventory[type] > 0);
          const spots = [{ x: 220, y: 490 }, ...Array.from({ length: 96 }, (_, i) => ({ x: 80 + i % 12 * 50, y: 180 + Math.floor(i / 12) * 65 }))];
          t.buildSpot = spots.find((p) => this.placement(t.slot, p.x, p.y, true).ok) || null;
          if (!t.buildSpot) {
            t.slot = 0;
            this.skipTutorial();
            this.event("notice", { message: "目前沒有可用建造空地，已解除教學；可從首頁重玩新手試煉。" });
            return true;
          }
        }
      }
      if (next === "reward") {
        if (mandatoryTutorial(this)) {
          this.spawnQueue = this.spawnQueue.slice(0, 2);
          this.spawnTimer = 0.45;
        } else this.activateMapEvent();
      }
      this.event("tutorial-step", { step: next });
      return true;
    }
    claimTutorialReward() {
      if (this.phase !== "prep" || !this.tutorial?.reward) return false;
      const reward = this.tutorial.reward;
      this.materials.wood = Math.min(999, this.materials.wood + reward.wood);
      this.materials.bone = Math.min(999, this.materials.bone + reward.bone);
      this.amber = Math.min(99, this.amber + reward.amber);
      this.tutorial.reward = null;
      this.tutorial.status = "done";
      return true;
    }
    skipTutorial() {
      if (mandatoryTutorial(this)) return false;
      if (!tutorialActive(this)) return false;
      this.claimTutorialReward();
      this.tutorial.status = "skipped";
      if (this.phase === "wave") this.activateMapEvent();
      return true;
    }
    startWave() {
      if (this.phase !== "prep" || this.paused || this.wave >= MAX_WAVES || this.tutorial?.reward) return false;
      this.wave++;
      this.phase = "wave";
      this.waveTime = 0;
      this.spawnTimer = 0.8;
      const roster = STAGE_ROSTERS[this.wave - 1], count = 5 + this.wave * 3;
      this.spawnQueue = roster ? [...roster] : Array.from({ length: count }, (_, i) => this.wave >= 2 && i % 5 === 3 ? "brute" : this.wave >= 3 && i % 5 === 1 ? "spitter" : "raptor");
      this.setupObjective();
      if (!tutorialProtected(this)) this.activateMapEvent();
      this.event("wave", { wave: this.wave, objective: this.objective.type });
      return true;
    }
    createBossWeakpoint(boss, hpScale = 1) {
      const def = BOSS_WEAKPOINTS[boss.type], maxHp = Math.round(def.hp * hpScale), weakpoint = { id: this.nextId++, bossId: boss.id, kind: def.kind, name: def.name, x: boss.x, y: boss.y - boss.r * 0.45, r: def.radius, hp: maxHp, maxHp, open: false, openTime: 0, broken: false };
      this.syncBossWeakpoint(boss, 0, weakpoint);
      return weakpoint;
    }
    syncBossWeakpoint(boss, dt = 0, override) {
      const w = override || boss.weakpoint;
      if (!w) return;
      if (!w.broken && w.openTime > 0) {
        w.openTime = Math.max(0, w.openTime - dt);
        if (w.openTime <= 0) w.open = false;
      }
      if (w.broken) {
        w.open = false;
        w.openTime = 0;
      }
      const a = boss.angle || 0, forward = boss.type === "charger" ? boss.r * 0.38 : boss.type === "matriarch" ? boss.r * 0.18 : 0, side = boss.type === "charger" ? -boss.r * 0.46 : boss.type === "matriarch" ? boss.r * 0.32 : 0, lift = boss.type === "boss" ? boss.r * 0.42 : boss.r * 0.35;
      w.x = boss.x + Math.cos(a) * forward + Math.cos(a + Math.PI / 2) * side;
      w.y = boss.y + Math.sin(a) * forward + Math.sin(a + Math.PI / 2) * side - lift;
    }
    bossWeakpoints() {
      return this.enemies.filter((enemy) => enemy.hp > 0 && enemy.weakpoint?.open && !enemy.weakpoint.broken && enemy.weakpoint.hp > 0).map((enemy) => enemy.weakpoint);
    }
    openBossWeakpoint(boss, duration, message) {
      const w = boss.weakpoint;
      if (!w || w.broken || w.hp <= 0) return false;
      const wasOpen = w.open;
      w.open = true;
      w.openTime = Math.max(w.openTime, duration);
      this.syncBossWeakpoint(boss);
      if (!wasOpen) this.event("notice", { message: message || `${w.name}已暴露 · 集火可打斷首領能力` });
      return true;
    }
    hitBossWeakpoint(w, damage) {
      const boss = this.enemies.find((enemy) => enemy.id === w?.bossId && enemy.hp > 0);
      if (!boss || boss.weakpoint !== w || !w.open || w.broken || w.hp <= 0) return false;
      const before = w.hp, def = BOSS_WEAKPOINTS[boss.type];
      w.hp = Math.max(0, w.hp - damage);
      this.stats.damage += Math.min(before, damage);
      this.float(w.x, w.y - w.r, String(Math.round(damage)), def.color);
      this.effects.push({ kind: "spark", x: w.x, y: w.y, r: w.r + 11, color: def.color, life: 0.36, maxLife: 0.36 });
      if (w.hp <= 0) {
        w.broken = true;
        w.open = false;
        w.openTime = 0;
        boss.windup = 0;
        boss.cd = Math.max(boss.cd, 3.2);
        const bonus = boss.maxHp * def.bonus;
        this.hitEnemy(boss, bonus, def.color);
        if (boss.type === "matriarch") boss.summonSuppressed = true;
        else if (boss.type === "charger") {
          boss.speed = Math.max(22, boss.speed - 9);
          boss.damage *= 0.72;
        } else boss.damage *= 0.82;
        this.effects.push({ kind: "burst", x: w.x, y: w.y, r: 92, color: def.color, life: 0.75, maxLife: 0.75 });
        this.event("weakpoint-broken", { boss: boss.type, name: def.name, bonus });
        this.event("notice", { message: `${def.name}已破壞 · 首領能力被削弱` });
      }
      return true;
    }
    summonBossAdds(boss, types) {
      if (!boss || boss.hp <= 0) return [];
      const spawned = [];
      for (const [index, type] of types.entries()) {
        const angle = boss.angle + Math.PI * 2 * index / types.length + 0.65, range = boss.r + 54 + index % 2 * 18;
        spawned.push(this.spawnEnemy(type, { x: clamp(boss.x + Math.cos(angle) * range, 45, 675), y: clamp(boss.y + Math.sin(angle) * range, 72, 748) }));
      }
      return spawned;
    }
    spawnEnemy(type = "raptor", position) {
      const roll = this.rng(), remaining = this.spawnQueue.length;
      let p = position;
      if (!p && this.wave === 2) {
        const left = remaining % 2 === 0;
        p = { x: left ? 42 : 678, y: 105 + roll * 610 };
      } else if (!p && this.wave === 3) {
        const top = remaining % 2 === 0;
        p = { x: 85 + roll * 550, y: top ? 68 : 752 };
      } else if (!p && this.wave === 4) {
        const corners = [[72, 105], [648, 105], [72, 715], [648, 715]], base = corners[remaining % 4];
        p = { x: base[0] + (roll - 0.5) * 38, y: base[1] + (this.rng() - 0.5) * 38 };
      } else if (!p && this.wave === 5) {
        const angle = (remaining * 0.93 + roll * 0.35) * Math.PI * 2;
        p = { x: clamp(360 + Math.cos(angle) * 375, 40, 680), y: clamp(400 + Math.sin(angle) * 445, 60, 760) };
      } else if (!p) {
        const angle = roll * Math.PI * 2;
        p = { x: clamp(360 + Math.cos(angle) * 370, 40, 680), y: clamp(400 + Math.sin(angle) * 440, 60, 760) };
      }
      const values = ENEMY_BALANCE[type], stage = STAGE_BALANCE[Math.max(0, this.wave - 1)] || STAGE_BALANCE[0];
      const hp = values.hp * stage.hp;
      const e = { id: this.nextId++, type, x: p.x, y: p.y, r: values.radius, hp, maxHp: hp, speed: values.speed * stage.speed, damage: values.damage * stage.damage, cd: 0.9, windup: 0, burn: 0, slow: 0, flash: 0, angle: 0, bossPhase: 0, attackCount: 0, attackKind: "" };
      if (BOSS_WEAKPOINTS[type]) e.weakpoint = this.createBossWeakpoint(e, stage.hp);
      this.enemies.push(e);
      this.effects.push({ kind: "spawn", x: e.x, y: e.y, life: 0.7, maxLife: 0.7, r: e.r + 15, color: "#f2ab85" });
      return e;
    }
    attack(aim) {
      if (mandatoryTutorial(this) && !["attack", "reward"].includes(this.tutorial.step)) return false;
      if (tutorialWaiting(this)) return false;
      const h = this.hero;
      if (this.paused || !["prep", "wave"].includes(this.phase) || h.attackCD > 0 || h.dashTime > 0) return false;
      let target = aim;
      if (!target) {
        const liveEnemies = this.enemies.filter((e) => e.hp > 0);
        const weakpoints = this.bossWeakpoints(), objectives = this.attackableObjectives(), nearby = objectives.filter((entry) => distance(h, entry) <= 190), ore = this.objective?.type === "mining" ? this.nodes.filter((node) => node.hp > 0 && node.objectiveKind === "ore" && distance(h, node) <= 190) : [];
        const candidates = weakpoints.length ? weakpoints : ore.length ? ore : nearby.length ? nearby : liveEnemies.length ? liveEnemies : objectives.length ? objectives : this.nodes.filter((n) => n.hp > 0);
        target = candidates.reduce((best, e) => !best || distance(h, e) < distance(h, best) ? e : best, null);
      }
      if (target && distance(h, target) > 1) h.angle = Math.atan2(target.y - h.y, target.x - h.x);
      h.swing = 0.2;
      h.weaponChain = (h.weaponChain || 0) + 1;
      const targets = () => [...this.enemies, ...this.bossWeakpoints(), ...this.attackableObjectives(), ...this.nodes];
      const hit = (entry, damage, color) => entry.type ? this.hitEnemy(entry, damage, color, "hero") : entry.bossId ? this.hitBossWeakpoint(entry, damage) : entry.objectiveKind === "nest" ? this.hitObjective(entry, damage) : this.hitNode(entry, damage);
      const slash = (range, spread, damage, color = "#f5ddac", angle = h.angle, knockback = 0) => {
        for (const entry of targets()) {
          if (entry.hp <= 0 || distance(h, entry) > range + entry.r) continue;
          const direction = Math.atan2(entry.y - h.y, entry.x - h.x), difference = Math.abs(Math.atan2(Math.sin(direction - angle), Math.cos(direction - angle)));
          if (difference > spread) continue;
          hit(entry, damage, color);
          if (knockback > 0 && entry.type && !BOSS_WEAKPOINTS[entry.type] && !tutorialProtected(this)) {
            const d = distance(h, entry) || 1;
            entry.x = clamp(entry.x + (entry.x - h.x) / d * knockback, 43, WORLD.width - 43);
            entry.y = clamp(entry.y + (entry.y - h.y) / d * knockback, 70, WORLD.height - 55);
            entry.slow = Math.max(entry.slow, 0.7);
          }
        }
        this.effects.push({ kind: "slash", x: h.x, y: h.y, angle, spread, r: range, life: 0.22, maxLife: 0.22, color });
      };
      const shoot = (kind, angle, speed, damage, life, pierce, hitRadius) => this.projectiles.push({ id: this.nextId++, kind, source: "hero", x: h.x + Math.cos(angle) * 20, y: h.y + Math.sin(angle) * 20, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, damage, life, fire: false, hits: [], pierce, hostile: false, ...hitRadius ? { hitRadius } : {}, targetWeakpointId: target?.bossId ? target.id : 0 });
      if (h.weapon === "spear") {
        h.attackCD = 0.44;
        const split = this.mods.spearFork && h.weaponChain % 3 === 0;
        for (const spread of split ? [-0.17, 0, 0.17] : [0]) shoot("spear", h.angle + spread, 530, 23 * this.mods.spear, 1.2, this.mods.pierce + 1);
        if (split) this.effects.push({ kind: "burst", x: h.x, y: h.y, r: 44, color: "#f3d897", life: 0.3, maxLife: 0.3 });
      } else if (h.weapon === "bow") {
        h.attackCD = 0.32;
        const volley = this.mods.bowVolley && h.weaponChain % 3 === 0;
        for (const spread of volley ? [-0.14, 0, 0.14] : [0]) shoot("arrow", h.angle + spread, 650, 14 * this.mods.bow, 1.08, 1);
        if (volley) this.effects.push({ kind: "muzzle", x: h.x, y: h.y, angle: h.angle, r: 24, color: "#d7edba", life: 0.16, maxLife: 0.16 });
      } else if (h.weapon === "blades") {
        h.attackCD = 0.3;
        const rush = this.mods.bladeRush && h.weaponChain % 4 === 0;
        if (rush) {
          const step = target ? Math.min(58, Math.max(0, distance(h, target) - 24)) : 50;
          h.x = clamp(h.x + Math.cos(h.angle) * step, 43, WORLD.width - 43);
          h.y = clamp(h.y + Math.sin(h.angle) * step, 70, WORLD.height - 55);
          h.invulnerable = Math.max(h.invulnerable, 0.2);
          slash(106, Math.PI, 17 * this.mods.blades, "#dcefc6");
          slash(106, Math.PI, 17 * this.mods.blades, "#f2d89d", h.angle + Math.PI);
          this.effects.push({ kind: "trail", x: h.x - Math.cos(h.angle) * step / 2, y: h.y - Math.sin(h.angle) * step / 2, angle: h.angle, r: 24, color: "#c5e5c4", life: 0.25, maxLife: 0.25 });
        } else {
          slash(90, 0.72, 14 * this.mods.blades, "#e6edc8", h.angle - 0.15);
          slash(94, 0.72, 14 * this.mods.blades, "#f4d7a0", h.angle + 0.15);
        }
      } else if (h.weapon === "hammer") {
        h.attackCD = 0.82;
        slash(128, 0.82, 48 * this.mods.hammer, "#f1ca83", h.angle, 42);
        this.effects.push({ kind: "ring", x: h.x + Math.cos(h.angle) * 58, y: h.y + Math.sin(h.angle) * 58, r: 72, color: "#e4b96d", life: 0.38, maxLife: 0.38 });
        if (this.mods.hammerQuake) shoot("quake-wave", h.angle, 310, 30 * this.mods.hammer, 0.72, 8, 34);
      } else {
        h.attackCD = 0.52;
        const spread = this.mods.spin ? Math.PI : Math.PI * 0.55;
        slash(100, spread, 40 * this.mods.axe);
      }
      this.event("attack");
      return true;
    }
    autoAttack() {
      if (tutorialWaiting(this) || tutorialProtected(this) && this.tutorial.version === 2 && this.tutorial.step !== "attack") return false;
      if (tutorialProtected(this) && (this.tutorial.step === "move" || this.tutorial.step === "attack" && this.tutorial.elapsed < 2)) return false;
      if (this.paused || !["prep", "wave"].includes(this.phase) || this.hero.dashTime > 0) return false;
      const enemies = this.enemies.filter((e) => e.hp > 0), weakpoints = this.bossWeakpoints(), objectives = this.attackableObjectives(), nearbyObjectives = objectives.filter((entry) => distance(this.hero, entry) <= 190), ore = this.objective?.type === "mining" ? this.nodes.filter((node) => node.hp > 0 && node.objectiveKind === "ore" && distance(this.hero, node) <= 190) : [], targets = weakpoints.length ? weakpoints : ore.length ? ore : nearbyObjectives.length ? nearbyObjectives : enemies.length ? enemies : objectives.length ? objectives : this.nodes.filter((n) => n.hp > 0);
      const target = targets.sort((a, b) => distance(this.hero, a) - distance(this.hero, b))[0];
      if (!target) return false;
      const weapon = WEAPONS[this.hero.weapon] || WEAPONS.spear, rangedTarget = target.type || target.bossId || target.objectiveKind === "nest";
      const range = weapon.ranged ? rangedTarget ? weapon.range : 190 : weapon.range + target.r;
      const fired = distance(this.hero, target) <= range ? this.attack(target) : false;
      if (fired && target.type && this.tutorial?.version !== 2) this.advanceTutorial("attack");
      return fired;
    }
    castSkill(id) {
      if (mandatoryTutorial(this) && this.tutorial.step !== "skill") return false;
      if (tutorialWaiting(this) || tutorialProtected(this) && this.tutorial.version === 2 && (this.tutorial.step !== "skill" || id !== this.loadout.skills[0])) return false;
      if (tutorialProtected(this) && !["skill", "build"].includes(this.tutorial.step)) return false;
      const h = this.hero, skill = ACTIVE_SKILLS[id];
      if (!skill || !this.carriesSkill(id) || this.paused || this.phase !== "wave" || h.dashTime > 0) return false;
      const key = id === "volley" ? "volleyCD" : "shockCD";
      if (h[key] > 0) return false;
      const live = this.enemies.filter((e) => e.hp > 0);
      if (!live.length) return false;
      if (id === "volley") {
        const target = live.sort((a, b) => distance(h, a) - distance(h, b))[0];
        h.angle = Math.atan2(target.y - h.y, target.x - h.x);
        h.swing = 0.28;
        h[key] = skill.cooldown;
        const arrows = Math.max(5, Math.floor(this.mods.volleyArrows)), spacing = 0.12;
        for (let i = 0; i < arrows; i++) {
          const spread = (i - (arrows - 1) / 2) * spacing;
          const angle = h.angle + spread;
          this.projectiles.push({ id: this.nextId++, kind: "skill-bolt", x: h.x + Math.cos(angle) * 24, y: h.y + Math.sin(angle) * 24, vx: Math.cos(angle) * 560, vy: Math.sin(angle) * 560, damage: 26 * this.mods.spear, life: 1.15, fire: false, hits: [], pierce: 2 + this.mods.pierce + this.mods.volleyPierce, hostile: false });
        }
        this.effects.push({ kind: "burst", x: h.x, y: h.y, r: 54, color: "#f5d58a", life: 0.36, maxLife: 0.36 });
      } else {
        const nearby = live.filter((e) => distance(h, e) < 175 + e.r);
        if (!nearby.length) return false;
        h[key] = skill.cooldown;
        h.invulnerable = Math.max(h.invulnerable, 0.9);
        h.swing = 0.32;
        for (const e of nearby) {
          e.windup = 0;
          e.cd = Math.max(e.cd, 1.15);
          if (!["matriarch", "charger", "boss"].includes(e.type)) {
            const dx = e.x - h.x, dy = e.y - h.y, d = Math.hypot(dx, dy) || 1;
            e.x = clamp(e.x + dx / d * 64, 43, WORLD.width - 43);
            e.y = clamp(e.y + dy / d * 64, 70, WORLD.height - 55);
          }
        }
        this.burst(h.x, h.y, 170, 52 * this.mods.axe, "#d8e7bd", "frost");
        if (this.mods.shockFieldDuration > 0) this.projectiles.push({ id: this.nextId++, kind: "shock-field", x: h.x, y: h.y, vx: 0, vy: 0, damage: this.mods.shockFieldDamage, life: this.mods.shockFieldDuration, maxLife: this.mods.shockFieldDuration, radius: this.mods.shockFieldRadius, tickCD: 0.85, fire: false, hits: [], pierce: 999, hostile: false });
      }
      if (tutorialActive(this) && this.tutorial.version === 2 && this.tutorial.step === "skill") {
        this.tutorial.skillCast = true;
        this.tutorial.elapsed = 0;
      } else this.advanceTutorial("skill");
      this.event("skill", { skill: id, name: skill.name });
      return true;
    }
    dash(input = {}) {
      if (mandatoryTutorial(this)) return false;
      if (tutorialProtected(this) && this.tutorial.version === 2) return false;
      const h = this.hero;
      if (this.paused || !["prep", "wave"].includes(this.phase) || h.dashCD > 0) return false;
      const len = Math.hypot(input.x || 0, input.y || 0);
      const a = len > 0.1 ? Math.atan2(input.y, input.x) : h.angle;
      h.dashX = Math.cos(a);
      h.dashY = Math.sin(a);
      h.angle = a;
      h.dashTime = 0.22;
      h.invulnerable = 0.35;
      h.dashCD = 3.1 * this.mods.dash;
      const spring = this.buildings.find((b) => b.hp > 0 && b.type === "spring" && distance(b, h) < CARDS.spring.range);
      if (spring) {
        this.burst(h.x, h.y, 140, 24 * this.mods.frost, "#a0e6e5", "frost");
        this.stats.combos++;
        this.event("combo", { message: "潮汐共鳴 · 寒潮衝刺" });
      }
      this.event("dash");
      return true;
    }
    switchWeapon() {
      if (mandatoryTutorial(this)) return false;
      if (this.paused || !["prep", "wave"].includes(this.phase) || this.loadout?.weapons.length < 2) return false;
      const weapons = this.loadout.weapons, index = Math.max(0, weapons.indexOf(this.hero.weapon));
      this.hero.weapon = weapons[(index + 1) % weapons.length];
      this.hero.weaponChain = 0;
      this.event("weapon", { weapon: this.hero.weapon });
      return true;
    }
    heal(amount) {
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + amount);
    }
    hitNode(n, damage) {
      if (n.hp <= 0) return;
      n.hp = Math.max(0, n.hp - damage);
      this.effects.push({ kind: "spark", x: n.x, y: n.y, life: 0.35, maxLife: 0.35, r: 20, color: "#edc778" });
      if (n.hp <= 0) {
        this.amber = Math.min(99, this.amber + 3);
        this.stats.harvested++;
        this.float(n.x, n.y - 15, "+3 ◆", "#ffe3a1");
        this.event("collect");
        if (n.objectiveKind === "ore" && this.objective?.type === "mining" && this.objective.nodeIds.includes(n.id)) {
          this.objective.mined = Math.min(this.objective.required, this.objective.mined + 1);
          const status = this.objectiveStatus();
          this.effects.push({ kind: "burst", x: n.x, y: n.y, r: 68, color: "#f0ce70", life: 0.6, maxLife: 0.6 });
          this.event("notice", { message: `熔晶採集完成 · ${status.text}` });
        }
      }
    }
    hitEnemy(e, damage, color = "#f7e8bd", source = "") {
      if (e.hp <= 0) return;
      if (tutorialProtected(this)) damage = Math.min(damage, Math.max(0, e.hp - 1));
      this.stats.damage += Math.min(e.hp, damage);
      e.hp -= damage;
      e.flash = 0.12;
      if (source === "hero" && damage > 0 && tutorialActive(this) && this.tutorial.version === 2 && this.tutorial.step === "attack" && !this.tutorial.awaiting) {
        this.tutorial.attackHits = Math.min(2, this.tutorial.attackHits + 1);
        if (this.tutorial.attackHits === 2) this.advanceTutorial("attack");
      }
      if (damage > 5) this.float(e.x, e.y - e.r, String(Math.round(damage)), color);
      if (e.hp <= 0) {
        this.stats.kills++;
        const loot = ENEMY_BALANCE[e.type];
        if (!e.elite && loot.drop > 0 && this.rng() <= loot.chance) this.drops.push({ x: e.x, y: e.y, value: loot.drop, life: 60 });
        this.gainCompanionXP(companionKillXP[e.type] || 7);
        this.effects.push({ kind: "enemy-death", type: e.type, x: e.x, y: e.y, r: e.r, angle: e.angle, life: 0.42, maxLife: 0.42, color: "#d5d691" });
        this.effects.push({ kind: "spark", x: e.x, y: e.y, life: 0.45, maxLife: 0.45, r: e.r + 8, color: "#d5d691" });
        this.event("kill");
      }
    }
    float(x, y, text3, color) {
      this.effects.push({ kind: "text", x, y, text: text3, color, life: 0.65, maxLife: 0.65 });
    }
    burst(x, y, r, damage, color, status) {
      for (const e of this.enemies) if (e.hp > 0 && distance(e, { x, y }) < r + e.r) {
        this.hitEnemy(e, damage, color);
        if (status === "frost") e.slow = 3;
      }
      for (const weakpoint of this.bossWeakpoints()) if (distance(weakpoint, { x, y }) < r + weakpoint.r) this.hitBossWeakpoint(weakpoint, damage);
      for (const target of this.attackableObjectives()) if (distance(target, { x, y }) < r + target.r) this.hitObjective(target, damage);
      this.effects.push({ kind: "burst", x, y, r, color, life: 0.48, maxLife: 0.48 });
    }
    damageTarget(t, amount) {
      if (mandatoryTutorial(this)) return;
      if (tutorialProtected(this)) return;
      if (!t || t.hp <= 0) return;
      if (t === this.hero) {
        if (t.invulnerable > 0) return;
        amount *= this.mods.armor;
        t.invulnerable = 0.65;
        this.event("hurt");
      }
      if (this.buildings.includes(t)) amount *= FORTIFICATION_BALANCE.incomingDamage;
      if (t === this.companion && t.type === "stoneback") amount *= 0.62;
      t.hp = Math.max(0, t.hp - amount);
      this.float(t.x, t.y - (t.r || 25), `−${Math.round(amount)}`, "#ffb29a");
      this.checkDefeat();
    }
    checkDefeat() {
      if (["lose", "win"].includes(this.phase)) return;
      if (this.hero.hp <= 0) {
        this.failObjective("獵人倒下了");
        return;
      }
      if (this.base.hp <= 0) {
        this.failObjective("聖獸卵失去了庇護");
        return;
      }
      if (this.objective?.type === "escort" && this.objective.npc.hp <= 0) {
        this.failObjective("護送的採集師倒下了");
        return;
      }
      if (this.objective?.type === "strongholds" && this.objective.points.some((point2) => point2.hp <= 0)) this.failObjective("月骨據點失守");
    }
    finishWave() {
      if (this.phase !== "wave" || this.stats.waves >= this.wave) return false;
      if (tutorialProtected(this)) return false;
      for (const mapEvent of this.activeMapEvents()) mapEvent.status = "missed";
      const objectiveTitle = this.objectiveDefinition().title;
      const before = { ...this.materials, amber: this.amber };
      this.stats.waves = this.wave;
      const reward = STAGE_BALANCE[this.wave - 1] || STAGE_BALANCE[0];
      const payout = { wood: reward.wood, bone: reward.bone, amber: this.drops.reduce((sum, d) => sum + d.value, 0) + reward.amber + this.mods.income };
      if (tutorialActive(this)) this.tutorial.reward = payout;
      else {
        this.materials.wood = Math.min(999, this.materials.wood + payout.wood);
        this.materials.bone = Math.min(999, this.materials.bone + payout.bone);
        this.amber = Math.min(99, this.amber + payout.amber);
      }
      this.drops = [];
      this.projectiles = [];
      this.buildings = this.buildings.filter((b) => b.hp > 0);
      const survivors = this.buildings.length;
      this.heal(FORTIFICATION_BALANCE.heroRecovery);
      this.base.hp = Math.min(this.base.maxHp, this.base.hp + FORTIFICATION_BALANCE.eggRecovery + this.mods.repair);
      if (this.companion) {
        const revive = this.companion.hp <= 0;
        this.companion.hp = revive ? Math.ceil(this.companion.maxHp * 0.55) : Math.min(this.companion.maxHp, this.companion.hp + this.companion.maxHp * 0.35);
        if (revive) this.event("notice", { message: `${COMPANIONS[this.companion.type].name}重新振作，回到隊伍` });
      }
      for (const b of this.buildings) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * FORTIFICATION_BALANCE.betweenStageRepair);
      this.nodes = this.nodes.filter((node) => node.objectiveKind !== "ore");
      this.objective = null;
      if (this.wave === MAX_WAVES) {
        this.phase = "win";
        this.event("end", { won: true, objective: objectiveTitle });
        return;
      }
      this.phase = "prep";
      this.building = false;
      this.choices = [];
      if (this.tutorial?.reward) {
        this.event("tutorial-reward");
        return true;
      }
      this.event("market-ready", { wood: this.materials.wood - before.wood, bone: this.materials.bone - before.bone, amber: this.amber - before.amber, survivors, repair: Math.round(FORTIFICATION_BALANCE.betweenStageRepair * 100), objective: objectiveTitle });
      return true;
    }
    tick(dt, input = {}) {
      if (tutorialWaiting(this)) return;
      if (mandatoryTutorial(this)) input = this.tutorial.step === "move" ? { x: Math.max(0, input.x || 0), y: 0 } : {};
      if (tutorialProtected(this) && this.tutorial.version === 2 && this.tutorial.step !== "move") input = {};
      if (!Number.isFinite(dt) || dt <= 0 || this.paused || !["prep", "wave"].includes(this.phase)) return;
      dt = Math.min(dt, 0.05);
      const realDt = dt;
      this.realTime += dt;
      if (this.building && this.phase === "wave") dt *= 0.15;
      this.time += dt;
      const h = this.hero;
      for (const k of ["attackCD", "dashCD", "volleyCD", "shockCD", "invulnerable", "swing"]) h[k] = Math.max(0, h[k] - dt);
      for (let i = 0; i < 4; i++) if (this.cardTimers[i] > 0) {
        this.cardTimers[i] = Math.max(0, this.cardTimers[i] - dt);
      }
      const old = { x: h.x, y: h.y };
      if (h.dashTime > 0) {
        const step = Math.min(dt, h.dashTime);
        h.dashTime = Math.max(0, h.dashTime - dt);
        h.x += h.dashX * 700 * step;
        h.y += h.dashY * 700 * step;
        this.effects.push({ kind: "trail", x: old.x, y: old.y, angle: h.angle, life: 0.22, maxLife: 0.22, r: 19, color: "#d2e7bd" });
        for (const b of this.buildings) if (b.hp > 0 && b.type === "wall" && pointToSegment(b, old, h) < b.r + 12) {
          b.hp = 0;
          this.burst(b.x, b.y, 120 * this.mods.blastRange, 75 * b.level * this.mods.blast, "#eee0bc");
          this.stats.combos++;
          this.event("combo", { message: "裂骨共鳴 · 骨片爆破" });
        }
      } else if (!this.building) {
        const x = input.x || 0, y = input.y || 0, len = Math.hypot(x, y);
        if (len > 0.05) {
          const mag = Math.max(1, len);
          h.x += x / mag * 155 * this.mods.speed * dt;
          h.y += y / mag * 155 * this.mods.speed * dt;
          h.angle = Math.atan2(y, x);
        }
      }
      h.x = clamp(h.x, 43, WORLD.width - 43);
      h.y = clamp(h.y, 70, WORLD.height - 55);
      if (tutorialActive(this) && this.phase === "wave") {
        const t = this.tutorial;
        t.elapsed = Math.min(1e8, t.elapsed + dt);
        if (t.step === "move" && Math.abs(input.x || 0) + Math.abs(input.y || 0) > 0.05) {
          t.moved = Math.min(64, t.moved + distance(old, h));
          if (t.version === 2 ? distance(h, t.moveTarget) < 24 : t.moved >= 64) this.advanceTutorial("move");
        }
      }
      this.autoAttack();
      h.x = clamp(h.x, 43, WORLD.width - 43);
      h.y = clamp(h.y, 70, WORLD.height - 55);
      if (!tutorialProtected(this) || this.tutorial.version !== 2) {
        this.updateBuildings(dt);
        this.updateAllies(dt);
        this.updateCompanion(dt);
      }
      this.updateProjectiles(dt);
      if (tutorialActive(this) && this.tutorial.version === 2 && this.tutorial.step === "skill" && this.tutorial.skillCast && this.tutorial.elapsed >= 0.65) this.advanceTutorial("skill");
      if (this.phase === "wave") {
        this.waveTime += dt;
        this.updateObjective(this.objective?.type === "mining" ? realDt : dt);
        if (this.phase !== "wave") return;
        if (!tutorialProtected(this)) {
          this.spawnTimer -= dt;
          if (this.spawnQueue.length && this.spawnTimer <= 0) {
            this.spawnEnemy(this.spawnQueue.shift());
            this.spawnTimer = STAGE_BALANCE[this.wave - 1]?.spawn || 1;
          }
        }
        for (const e of this.enemies) if (e.hp > 0 && this.phase === "wave") this.updateEnemy(e, dt);
        this.enemies = this.enemies.filter((e) => e.hp > 0);
        this.updateMapEvents();
        if (!this.spawnQueue.length && !this.enemies.length && this.phase === "wave" && this.objectiveReady()) {
          this.completeObjective();
          this.finishWave();
        }
      }
      for (const d of this.drops) {
        d.life -= dt;
        const dist2 = distance(h, d);
        if (dist2 < 100 + this.mods.magnet) {
          const step = Math.min(dist2, 430 * dt);
          d.x += (h.x - d.x) / (dist2 || 1) * step;
          d.y += (h.y - d.y) / (dist2 || 1) * step;
        }
        if (distance(h, d) < 25) {
          this.amber = Math.min(99, this.amber + d.value);
          d.life = 0;
          this.float(h.x, h.y - 25, `+${d.value} ◆`, "#f5d687");
          this.event("collect");
        }
      }
      this.drops = this.drops.filter((d) => d.life > 0);
      for (const fx of this.effects) fx.life -= dt;
      this.effects = this.effects.filter((fx) => fx.life > 0).slice(-180);
      this.buildings = this.buildings.filter((b) => b.hp > 0);
      this.allies = this.allies.filter((a) => a.hp > 0);
      this.checkDefeat();
    }
    updateCompanion(dt) {
      const p = this.companion;
      if (!p || p.hp <= 0) return;
      const d = COMPANIONS[p.type];
      p.cd = Math.max(0, p.cd - dt);
      p.abilityCD = Math.max(0, p.abilityCD - dt);
      const live = this.enemies.filter((e) => e.hp > 0), target = live.sort((a, b) => distance(p, a) - distance(p, b))[0];
      const side = Math.cos(this.hero.angle) >= 0 ? -1 : 1, follow = { x: clamp(this.hero.x + side * 46, 48, 672), y: clamp(this.hero.y + 38, 82, 740) };
      const canEngage = target && distance(this.hero, target) < 345, dest = canEngage ? target : follow, dist2 = distance(p, dest), reach = canEngage ? d.range : 17;
      p.angle = Math.atan2(dest.y - p.y, dest.x - p.x);
      if (dist2 > reach) {
        const step = Math.min(dist2 - reach, d.speed * dt);
        p.x = clamp(p.x + Math.cos(p.angle) * step, 43, WORLD.width - 43);
        p.y = clamp(p.y + Math.sin(p.angle) * step, 70, WORLD.height - 55);
      }
      if (p.type === "tideroot" && p.abilityCD <= 0 && (this.hero.hp < this.hero.maxHp || this.base.hp < this.base.maxHp)) {
        const amount = 5 + p.level * 2;
        this.heal(amount);
        this.base.hp = Math.min(this.base.maxHp, this.base.hp + Math.ceil(amount * 0.7));
        this.float(this.hero.x, this.hero.y - 31, `+${amount} ♥`, "#9ce8db");
        this.effects.push({ kind: "burst", x: p.x, y: p.y, r: 88, color: d.color, life: 0.55, maxLife: 0.55 });
        p.abilityCD = Math.max(5.2, 7.4 - p.level * 0.18);
        this.event("companion-skill", { name: "潮息治療" });
      }
      if (!canEngage || dist2 > reach || p.cd > 0) return;
      const levelScale = 1 + (p.level - 1) * 0.11;
      p.attackCount++;
      if (p.type === "tideroot") {
        const speed = 360;
        this.projectiles.push({ id: this.nextId++, kind: "companion-tide", x: p.x, y: p.y - 6, vx: Math.cos(p.angle) * speed, vy: Math.sin(p.angle) * speed, damage: d.damage * levelScale, life: 1.1, fire: false, hits: [], pierce: 1, hostile: false });
      } else if (p.type === "emberclaw") {
        this.hitEnemy(target, d.damage * levelScale, d.color);
        this.effects.push({ kind: "slash", x: p.x, y: p.y, r: 44, spread: 1.55, angle: p.angle, life: 0.17, maxLife: 0.17, color: d.color });
        if (p.attackCount % 4 === 0) {
          for (const e of live) if (e.hp > 0 && distance(p, e) < 82 + e.r) {
            this.hitEnemy(e, (12 + p.level * 2) * levelScale, "#ffc06c");
            e.burn = Math.max(e.burn, 2.5);
          }
          this.effects.push({ kind: "burst", x: p.x, y: p.y, r: 82, color: d.color, life: 0.45, maxLife: 0.45 });
          this.event("companion-skill", { name: "焰爪爆發" });
        }
      } else {
        this.hitEnemy(target, d.damage * levelScale, d.color);
        this.effects.push({ kind: "slash", x: p.x, y: p.y, r: 54, spread: 1.7, angle: p.angle, life: 0.2, maxLife: 0.2, color: d.color });
        if (p.attackCount % 3 === 0) {
          for (const e of live) if (e.hp > 0 && distance(p, e) < 92 + e.r) {
            this.hitEnemy(e, (10 + p.level * 2) * levelScale, "#ead18b");
            e.slow = Math.max(e.slow, 1.25);
          }
          this.effects.push({ kind: "burst", x: p.x, y: p.y, r: 94, color: d.color, life: 0.48, maxLife: 0.48 });
          this.event("companion-skill", { name: "晶甲震波" });
        }
      }
      p.cd = Math.max(0.38, d.cooldown - p.level * 0.025);
    }
    updateAllies(dt) {
      for (const [i, a] of this.allies.entries()) {
        if (a.hp <= 0) continue;
        a.cd = Math.max(0, a.cd - dt);
        const target = this.enemies.filter((e) => e.hp > 0 && distance(a, e) < 300).sort((b, c) => distance(a, b) - distance(a, c))[0];
        const follow = { x: clamp(this.hero.x + (i % 2 ? 38 : -38), 50, 670), y: clamp(this.hero.y + 38 + Math.floor(i / 2) * 28, 85, 735) };
        const dest = target || follow, d = distance(a, dest), reach = target ? a.type === "hunter" ? 210 : target.r + a.r + 12 : 18;
        a.angle = Math.atan2(dest.y - a.y, dest.x - a.x);
        if (d > reach) {
          const step = Math.min(d - reach, 135 * dt);
          a.x += Math.cos(a.angle) * step;
          a.y += Math.sin(a.angle) * step;
        }
        if (target && d <= reach && a.cd <= 0) {
          if (a.type === "hunter") this.projectiles.push({ id: this.nextId++, x: a.x, y: a.y, vx: Math.cos(a.angle) * 390, vy: Math.sin(a.angle) * 390, damage: 15, life: 1, fire: false, hits: [], pierce: 1, hostile: false });
          else {
            this.hitEnemy(target, 23, "#deceb2");
            this.effects.push({ kind: "slash", x: a.x, y: a.y, r: 50, spread: 1.5, angle: a.angle, life: 0.18, maxLife: 0.18, color: "#deceb2" });
          }
          a.cd = a.type === "hunter" ? 0.95 : 1.1;
        }
      }
    }
    updateBuildings(dt) {
      for (const b of this.buildings) {
        if (b.hp <= 0) continue;
        b.cd -= dt;
        b.healCD -= dt;
        const range = CARDS[b.type].range + (b.level - 1) * 14;
        if (b.type === "watchtower" && b.cd <= 0) {
          const target = this.enemies.filter((e) => e.hp > 0 && distance(b, e) < range).sort((a, c) => distance(b, a) - distance(b, c))[0];
          if (target) {
            const angle = Math.atan2(target.y - (b.y - 25), target.x - b.x), speed = 500;
            this.projectiles.push({ id: this.nextId++, kind: "tower-bolt", x: b.x, y: b.y - 25, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, damage: (9 + b.level * 6) * this.mods.torch, life: range / speed + 0.18, fire: false, hits: [], pierce: b.level >= 3 ? 2 : 1, hostile: false });
            this.effects.push({ kind: "muzzle", buildingId: b.id, x: b.x + Math.cos(angle) * 28, y: b.y - 25 + Math.sin(angle) * 18, angle, life: 0.14, maxLife: 0.14, r: 18, color: "#ffe3a0" });
            b.cd = Math.max(0.58, 0.82 - (b.level - 1) * 0.12);
          }
        }
        if (b.type === "catapult" && b.cd <= 0) {
          const candidates = this.enemies.filter((e) => e.hp > 0 && distance(b, e) < range);
          const target = candidates.sort((a, c) => candidates.filter((e) => distance(c, e) < 78).length - candidates.filter((e) => distance(a, e) < 78).length || distance(b, a) - distance(b, c))[0];
          if (target) {
            const maxLife = 0.64;
            this.projectiles.push({ id: this.nextId++, kind: "catapult", x: b.x, y: b.y - 20, startX: b.x, startY: b.y - 20, targetX: target.x, targetY: target.y, vx: 0, vy: 0, damage: (14 + b.level * 10) * this.mods.beast, radius: 44 + b.level * 12, maxLife, life: maxLife, fire: false, hits: [], pierce: 1, hostile: false });
            this.effects.push({ kind: "launch-dust", buildingId: b.id, x: b.x, y: b.y + 12, life: 0.32, maxLife: 0.32, r: 30, color: "#d4b675" });
            b.cd = Math.max(1.35, (2.4 - (b.level - 1) * 0.25) * this.mods.beastSpeed);
          }
        }
        if (b.type === "torch" && b.cd <= 0) {
          const target = this.enemies.find((e) => e.hp > 0 && distance(b, e) < range);
          if (target) {
            this.hitEnemy(target, 11 * b.level * this.mods.torch, "#ffc375");
            target.burn = Math.max(target.burn, 2);
            b.cd = 0.9;
            this.effects.push({ kind: "beam", x: b.x, y: b.y - 20, tx: target.x, ty: target.y, life: 0.18, maxLife: 0.18, color: "#fabb69" });
          }
        }
        if (b.type === "spring") {
          for (const e of this.enemies) if (e.hp > 0 && distance(b, e) < range) e.slow = Math.max(e.slow, 0.3);
          if (b.healCD <= 0 && distance(b, this.hero) < range && this.hero.hp < this.hero.maxHp) {
            const amount = (4 + 3 * b.level) * this.mods.heal;
            this.heal(amount);
            b.healCD = 3;
            this.float(this.hero.x, this.hero.y - 28, `+${Math.round(amount)} ♥`, "#b8efd3");
          }
        }
        if (b.type === "nest") {
          const target = this.enemies.filter((e) => e.hp > 0 && distance(b, e) < range).sort((a, c) => distance(a, b.pet) - distance(c, b.pet))[0];
          const dest = target || { x: b.x + 26, y: b.y + 18 };
          const d = distance(b.pet, dest), step = Math.min(d, 170 * dt);
          if (d > 1) {
            b.pet.x += (dest.x - b.pet.x) / d * step;
            b.pet.y += (dest.y - b.pet.y) / d * step;
          }
          if (target && distance(b.pet, target) < 36 && b.cd <= 0) {
            this.hitEnemy(target, 21 * b.level * this.mods.beast, "#cfe6a6");
            b.cd = 0.85 * this.mods.beastSpeed;
            this.effects.push({ kind: "slash", x: b.pet.x, y: b.pet.y, r: 35, spread: 1.7, angle: Math.atan2(target.y - b.pet.y, target.x - b.pet.x), life: 0.15, maxLife: 0.15, color: "#dbefb5" });
          }
        }
      }
    }
    updateProjectiles(dt) {
      for (const p of this.projectiles) {
        if (p.life <= 0) continue;
        if (p.kind === "shock-field") {
          p.life = Math.max(0, p.life - dt);
          p.tickCD -= dt;
          const inside = this.enemies.filter((e) => e.hp > 0 && distance(p, e) < p.radius + e.r);
          for (const e of inside) e.slow = Math.max(e.slow, 0.3);
          if (p.damage > 0 && p.tickCD <= 0) {
            for (const e of inside) this.hitEnemy(e, p.damage, "#a7ded0");
            p.tickCD = 1;
            this.effects.push({ kind: "ring", x: p.x, y: p.y, r: p.radius, color: "#9cd8c0", life: 0.35, maxLife: 0.35 });
          }
          continue;
        }
        if (p.kind === "catapult") {
          p.life = Math.max(0, p.life - dt);
          const progress = clamp(1 - p.life / p.maxLife, 0, 1);
          p.x = p.startX + (p.targetX - p.startX) * progress;
          p.y = p.startY + (p.targetY - p.startY) * progress;
          if (p.life <= 0) this.burst(p.targetX, p.targetY, p.radius, p.damage, "#f0b34f", "frost");
          continue;
        }
        const from = { x: p.x, y: p.y };
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.hostile) {
          const defenders = this.combatDefenders();
          const t = defenders.find((t2) => t2.hp > 0 && pointToSegment(t2, from, p) < t2.r + 6);
          if (t) {
            this.damageTarget(t, p.damage);
            p.life = 0;
          }
          continue;
        }
        if (!p.fire && this.buildings.some((b) => b.type === "torch" && b.hp > 0 && pointToSegment(b, from, p) < 50 + b.level * 4)) {
          p.fire = true;
          this.stats.combos++;
          this.event("ignite");
        }
        for (const weakpoint of this.bossWeakpoints()) {
          if (p.life <= 0 || p.hits.includes(weakpoint.id) || pointToSegment(weakpoint, from, p) > weakpoint.r + (p.hitRadius || 8)) continue;
          p.hits.push(weakpoint.id);
          this.hitBossWeakpoint(weakpoint, p.damage * (p.fire ? 1.35 : 1));
          if (--p.pierce <= 0) p.life = 0;
        }
        for (const e of this.enemies) {
          if (p.life <= 0 || e.hp <= 0 || p.hits.includes(e.id) || p.targetWeakpointId > 0 && p.targetWeakpointId === e.weakpoint?.id && !p.hits.includes(p.targetWeakpointId) || pointToSegment(e, from, p) > e.r + (p.hitRadius || 7)) continue;
          p.hits.push(e.id);
          this.hitEnemy(e, p.damage * (p.fire ? 1.35 : 1), p.kind === "companion-tide" ? "#8ee3df" : p.fire ? "#ffca77" : "#faf0cb", p.source);
          if (p.kind === "companion-tide") e.slow = Math.max(e.slow, 1.5);
          if (p.fire) e.burn = 3;
          if (--p.pierce <= 0) p.life = 0;
        }
        for (const target of this.attackableObjectives()) if (p.life > 0 && !p.hits.includes(target.id) && pointToSegment(target, from, p) < target.r + (p.hitRadius || 7)) {
          p.hits.push(target.id);
          this.hitObjective(target, p.damage * (p.fire ? 1.35 : 1));
          if (--p.pierce <= 0) p.life = 0;
        }
        for (const n of this.nodes) if (p.life > 0 && n.hp > 0 && !p.hits.includes(n.id) && pointToSegment(n, from, p) < n.r + (p.hitRadius || 5)) {
          p.hits.push(n.id);
          this.hitNode(n, p.damage);
          if (p.kind !== "quake-wave" || --p.pierce <= 0) p.life = 0;
        }
      }
      this.projectiles = this.projectiles.filter((p) => p.life > 0 && p.x > -30 && p.x < WORLD.width + 30 && p.y > -30 && p.y < WORLD.height + 30);
    }
    advanceBossPhase(e) {
      const ratio = e.hp / e.maxHp;
      if (e.type === "matriarch") {
        if (e.bossPhase === 0 && ratio <= 0.7) {
          e.bossPhase = 1;
          e.speed += 3;
          this.summonBossAdds(e, ["raptor", "raptor", "spitter"]);
          this.openBossWeakpoint(e, 8, "母獸孵化囊暴露 · 破壞後可阻止下一輪巢群");
          this.effects.push({ kind: "burst", x: e.x, y: e.y, r: 108, color: "#b7d575", life: 0.7, maxLife: 0.7 });
          this.event("notice", { message: "沼澤母獸進入繁殖狂潮 · 幼獸與毒液獸加入" });
        } else if (e.bossPhase === 1 && ratio <= 0.35) {
          e.bossPhase = 2;
          e.speed += 3;
          e.damage += 4;
          if (!e.summonSuppressed) this.summonBossAdds(e, ["raptor", "spitter", "raptor", "brute"]);
          this.openBossWeakpoint(e, 999, "母獸孵化囊完全暴露 · 摧毀可打斷終末孵化");
          this.effects.push({ kind: "burst", x: e.x, y: e.y, r: 132, color: "#d2e985", life: 0.75, maxLife: 0.75 });
          this.event("notice", { message: e.summonSuppressed ? "孵化囊已破壞 · 終末召喚被阻止" : "母獸進入終末孵化 · 巢群全面湧出" });
        }
      } else if (e.type === "charger") {
        if (e.bossPhase === 0 && ratio <= 0.68) {
          e.bossPhase = 1;
          e.speed += 7;
          e.damage += 4;
          this.summonBossAdds(e, ["raptor", "raptor"]);
          this.openBossWeakpoint(e, 4.5, "衝角獸裂角肩甲鬆動 · 趁現在破甲");
          this.effects.push({ kind: "burst", x: e.x, y: e.y, r: 118, color: "#efad66", life: 0.7, maxLife: 0.7 });
          this.event("notice", { message: "骨甲衝角獸進入裂甲衝鋒 · 迅猛獸加入夾擊" });
        } else if (e.bossPhase === 1 && ratio <= 0.32) {
          e.bossPhase = 2;
          e.speed += 5;
          e.damage += 4;
          this.summonBossAdds(e, ["brute", "raptor", "raptor"]);
          this.openBossWeakpoint(e, 5.5, "裂角肩甲再次暴露 · 破壞可削弱所有衝鋒");
          this.effects.push({ kind: "burst", x: e.x, y: e.y, r: 142, color: "#f3c078", life: 0.75, maxLife: 0.75 });
          this.event("notice", { message: "衝角獸進入碎骨狂飆 · 衝鋒距離與頻率提升" });
        }
      } else if (e.type === "boss") {
        if (e.bossPhase === 0 && ratio <= 0.7) {
          e.bossPhase = 1;
          e.speed += 3;
          e.damage += 3;
          this.summonBossAdds(e, ["spitter", "spitter", "raptor"]);
          this.openBossWeakpoint(e, 4.5, "泰坦琥珀核心暴露 · 可打斷下一次震地");
          this.effects.push({ kind: "burst", x: e.x, y: e.y, r: 142, color: "#f1a056", life: 0.75, maxLife: 0.75 });
          this.event("notice", { message: "琥珀泰坦進入共鳴階段 · 毒液獸受召而來" });
        } else if (e.bossPhase === 1 && ratio <= 0.35) {
          e.bossPhase = 2;
          e.speed += 3;
          e.damage += 4;
          this.summonBossAdds(e, ["brute", "brute", "spitter"]);
          this.openBossWeakpoint(e, 999, "泰坦核心過載 · 摧毀可取消雙重震地");
          this.effects.push({ kind: "burst", x: e.x, y: e.y, r: 176, color: "#ffc160", life: 0.8, maxLife: 0.8 });
          this.event("notice", { message: "琥珀泰坦核心過載 · 震地擴展為內外雙環" });
        }
      }
    }
    prepareEnemyAttack(e, target) {
      e.attackCount = (e.attackCount || 0) + 1;
      e.lockX = target.x;
      e.lockY = target.y;
      e.targetId = target.id;
      if (e.type === "matriarch") {
        e.attackKind = e.bossPhase >= 1 && e.attackCount % 2 === 0 ? "brood-pool" : "venom-fan";
        e.windup = e.attackKind === "brood-pool" ? 1.25 : 0.9;
        if (e.attackKind === "brood-pool") this.openBossWeakpoint(e, 3.2, "母獸蓄積毒沼 · 孵化囊短暫暴露");
      } else if (e.type === "charger") {
        e.attackKind = "bone-charge";
        e.windup = e.bossPhase === 2 ? 0.72 : e.bossPhase === 1 ? 0.86 : 1;
      } else if (e.type === "boss") {
        e.attackKind = e.bossPhase === 2 ? "titan-double" : "titan-slam";
        e.windup = e.bossPhase === 2 ? 1.3 : 1.1;
        this.openBossWeakpoint(e, 2.8, "泰坦正在聚能 · 攻擊琥珀核心可打斷震地");
      } else {
        e.attackKind = e.type === "spitter" ? "spit" : "melee";
        e.windup = e.type === "spitter" ? 0.6 : 0.6;
      }
    }
    resolveEnemyAttack(e) {
      if (e.type === "spitter") {
        const angle = Math.atan2(e.lockY - e.y, e.lockX - e.x);
        this.projectiles.push({ id: this.nextId++, x: e.x, y: e.y, vx: Math.cos(angle) * 195, vy: Math.sin(angle) * 195, damage: e.damage, life: 2.5, hostile: true });
      } else if (e.type === "matriarch") {
        if (e.attackKind === "brood-pool") {
          const radius = e.bossPhase === 2 ? 118 : 94;
          for (const t of this.combatDefenders()) if (t.hp > 0 && distance(t, { x: e.lockX, y: e.lockY }) < radius + t.r) this.damageTarget(t, e.damage * 0.9);
          this.effects.push({ kind: "burst", x: e.lockX, y: e.lockY, r: radius, color: "#b8d66c", life: 0.65, maxLife: 0.65 });
        } else {
          const angle = Math.atan2(e.lockY - e.y, e.lockX - e.x), spreads = e.bossPhase === 2 ? [-0.3, -0.15, 0, 0.15, 0.3] : [-0.18, 0, 0.18];
          for (const spread of spreads) this.projectiles.push({ id: this.nextId++, kind: "venom", x: e.x, y: e.y, vx: Math.cos(angle + spread) * 220, vy: Math.sin(angle + spread) * 220, damage: e.damage * 0.8, life: 2.2, hostile: true });
          this.effects.push({ kind: "burst", x: e.x + Math.cos(angle) * 26, y: e.y + Math.sin(angle) * 26, r: 31, color: "#b8d66c", life: 0.35, maxLife: 0.35 });
        }
      } else if (e.type === "charger") {
        const from = { x: e.x, y: e.y }, angle = Math.atan2(e.lockY - e.y, e.lockX - e.x), cap = e.bossPhase === 2 ? 330 : e.bossPhase === 1 ? 285 : 245, length = Math.min(cap, Math.hypot(e.lockX - e.x, e.lockY - e.y) + 55);
        e.x = clamp(e.x + Math.cos(angle) * length, 43, WORLD.width - 43);
        e.y = clamp(e.y + Math.sin(angle) * length, 70, WORLD.height - 55);
        for (const t of this.combatDefenders()) if (t.hp > 0 && pointToSegment(t, from, e) < t.r + e.r * (e.bossPhase === 2 ? 0.72 : 0.58)) this.damageTarget(t, e.damage);
        this.syncBossWeakpoint(e);
        this.openBossWeakpoint(e, 3.4, "衝鋒結束 · 裂角肩甲暴露 3 秒");
        this.effects.push({ kind: "trail", x: (from.x + e.x) / 2, y: (from.y + e.y) / 2, angle, r: e.bossPhase === 2 ? 47 : 36, color: "#efb06f", life: 0.45, maxLife: 0.45 });
        this.effects.push({ kind: "burst", x: e.x, y: e.y, r: 68, color: "#ef9b65", life: 0.45, maxLife: 0.45 });
      } else if (e.type === "boss") {
        const inner = e.bossPhase === 0 ? 84 : e.bossPhase === 1 ? 108 : 122, outer = e.bossPhase === 2 ? 176 : inner, center2 = { x: e.lockX, y: e.lockY };
        for (const t of this.combatDefenders()) {
          if (t.hp <= 0) continue;
          const d = distance(t, center2);
          if (d < inner + t.r) this.damageTarget(t, e.damage);
          else if (e.bossPhase === 2 && d < outer + t.r) this.damageTarget(t, e.damage * 0.55);
        }
        this.effects.push({ kind: "burst", x: e.lockX, y: e.lockY, r: inner, color: "#ef9971", life: 0.55, maxLife: 0.55 });
        if (e.bossPhase === 2) this.effects.push({ kind: "ring", x: e.lockX, y: e.lockY, r: outer, color: "#ffc66f", life: 0.7, maxLife: 0.7 });
      } else {
        const target = this.combatDefenders().find((t) => t.id === e.targetId && t.hp > 0);
        if (target && distance(target, { x: e.lockX, y: e.lockY }) < target.r + 25) this.damageTarget(target, e.damage);
      }
      e.cd = e.type === "boss" ? e.bossPhase === 2 ? 1.55 : e.bossPhase === 1 ? 1.8 : 2.2 : e.type === "charger" ? e.bossPhase === 2 ? 1.5 : e.bossPhase === 1 ? 1.8 : 2.4 : e.type === "matriarch" ? e.bossPhase === 2 ? 1.65 : 2.15 : 1.2;
    }
    updateEnemy(e, dt) {
      if (tutorialProtected(this) && this.tutorial.version === 2) {
        e.flash = Math.max(0, e.flash - dt);
        return;
      }
      if (!Number.isInteger(e.bossPhase)) e.bossPhase = 0;
      if (!Number.isInteger(e.attackCount)) e.attackCount = 0;
      if (typeof e.attackKind !== "string") e.attackKind = "";
      this.syncBossWeakpoint(e, dt);
      e.flash = Math.max(0, e.flash - dt);
      e.slow = Math.max(0, e.slow - dt);
      e.cd -= dt;
      if (e.burn > 0) {
        e.burn -= dt;
        this.hitEnemy(e, 7 * this.mods.fire * dt, "#ffc075");
        if (e.hp <= 0) return;
      }
      if (BOSS_WEAKPOINTS[e.type]) this.advanceBossPhase(e);
      if (e.windup > 0) {
        e.windup -= dt;
        if (e.windup <= 0) this.resolveEnemyAttack(e);
        return;
      }
      let target = [this.base, ...this.objectiveDefenders()].filter((candidate) => candidate.hp > 0).sort((a, b) => distance(e, a) - distance(e, b))[0] || this.base;
      const heroAggro = e.elite || ["matriarch", "charger", "boss"].includes(e.type) ? 999 : e.type === "raptor" ? 165 : 125;
      if (distance(e, this.hero) < heroAggro) target = this.hero;
      for (const b of [...this.buildings, ...this.allies, ...this.companion ? [this.companion] : []]) if (b.hp > 0 && distance(e, b) < distance(e, target) && distance(e, b) < (b.type === "stoneback" ? 235 : 170)) target = b;
      const d = distance(e, target), reach = e.type === "matriarch" ? 220 : e.type === "charger" ? 245 : e.type === "spitter" ? 185 : e.type === "boss" ? 135 : e.r + target.r + 10;
      e.angle = Math.atan2(target.y - e.y, target.x - e.x);
      if (d <= reach) {
        if (e.cd <= 0) this.prepareEnemyAttack(e, target);
      } else {
        const move = e.speed * (e.slow > 0 ? 0.42 : 1) * dt;
        e.x += Math.cos(e.angle) * move;
        e.y += Math.sin(e.angle) * move;
        for (const other of this.enemies) {
          if (other === e || other.hp <= 0) continue;
          const dist2 = distance(e, other), limit = (e.r + other.r) * 0.75;
          if (dist2 < limit && dist2 > 0.1) {
            const push = Math.min(20 * dt, limit - dist2);
            e.x += (e.x - other.x) / dist2 * push;
            e.y += (e.y - other.y) / dist2 * push;
          }
        }
      }
      this.syncBossWeakpoint(e);
    }
  };

  // prototypes/emberwild/character-art.mjs
  var images = /* @__PURE__ */ new Map();
  var CHARACTER_ART = {
    ranger: {
      file: "assets/motion-v4/scout-run-v1.png",
      cols: 5,
      height: 92,
      pivotX: [195.9, 195.9],
      top: [[17, 14, 13, 15, 16], [0, 0, 0, 0, 0]],
      base: [[401, 401, 401, 401, 401], [378, 371, 380, 376, 360]],
      idle: {
        key: "rangerIdleV4",
        file: "assets/motion-v4/scout-idle-v1.png",
        cols: 5,
        height: 92,
        pivotX: [[192, 183, 183.5, 208.5, 208.5], [225.5, 225.5, 175, 213.5, 196.5]],
        top: [[16, 15, 15, 14, 15], [0, 0, 0, 0, 0]],
        base: [[402, 402, 402, 402, 402], [383, 383, 383, 383, 383]]
      },
      run: {
        key: "rangerRunV4",
        file: "assets/motion-v4/scout-run-v1.png",
        cols: 5,
        height: 92,
        pivotX: [195.9, 195.9],
        top: [[17, 14, 13, 15, 16], [0, 0, 0, 0, 0]],
        base: [[401, 401, 401, 401, 401], [378, 371, 380, 376, 360]]
      },
      attack: {
        spear: {
          key: "rangerSpearAttackV4",
          file: "assets/motion-v4/scout-spear-v1.png",
          scale: [0.24, 0.24],
          rect: [[[0, 0, 391, 402], [391, 0, 391, 402], [782, 0, 392, 402], [1174, 0, 391, 402], [1565, 0, 391, 402]], [[0, 402, 391, 402], [391, 402, 391, 402], [782, 402, 392, 402], [1174, 402, 391, 402], [1565, 402, 391, 402]]],
          pivotX: [[195.5, 195.5, 196, 195.5, 195.5], [195.5, 195.5, 196, 195.5, 195.5]],
          base: [[397, 401, 395, 401, 399], [401, 370, 371, 371, 371]]
        },
        axe: {
          key: "rangerAxeAttackV4",
          file: "assets/motion-v4/scout-axe-v1.png",
          scale: [0.235, 0.235],
          rect: [[[0, 0, 392, 402], [392, 0, 392, 402], [784, 0, 391, 402], [1175, 0, 392, 402], [1567, 0, 392, 402]], [[0, 402, 392, 401], [392, 402, 392, 401], [784, 402, 391, 401], [1175, 402, 392, 401], [1567, 402, 392, 401]]],
          pivotX: [[196, 196, 195.5, 196, 196], [196, 196, 195.5, 196, 196]],
          base: [[401, 401, 401, 401, 401], [400, 385, 382, 400, 385]]
        }
      }
    },
    porter: { height: 79, pivotX: [230, 228], top: [[16, 16, 16, 16, 16], [9, 9, 9, 10, 9]], base: [[388, 389, 392, 391, 391], [360, 361, 361, 373, 361]] },
    hunter: { height: 79, pivotX: [228, 217], top: [[13, 16, 17, 14, 16], [11, 9, 9, 8, 9]], base: [[370, 383, 377, 383, 373], [366, 368, 365, 368, 367]] }
  };
  function preloadCharacters() {
    for (const type of Object.keys(CHARACTER_ART)) if (!images.has(type)) {
      const im = new Image(), art = CHARACTER_ART[type];
      im.decoding = "async";
      im.src = art.file || `assets/motion-v2/${type}.png`;
      images.set(type, im);
    }
    const extras = [CHARACTER_ART.ranger.idle, CHARACTER_ART.ranger.run, ...Object.values(CHARACTER_ART.ranger.attack)];
    for (const art of extras) if (!images.has(art.key)) {
      const im = new Image();
      im.decoding = "async";
      im.src = art.file;
      images.set(art.key, im);
    }
    return Promise.all([...images.values()].map((im) => im.decode().catch(() => {
    })));
  }
  var attackFrame = (attack) => Math.max(0, Math.min(4, Math.floor((1 - attack) * 5 + 1e-6)));
  function drawCharacter(c, type, x, y, pose, { height, weapon } = {}) {
    const rig = CHARACTER_ART[type];
    if (!rig) return null;
    const attack = type === "ranger" && pose.attack > 0 && rig.attack?.[weapon], attackImage = attack && images.get(attack.key);
    if (attackImage?.complete && attackImage.naturalWidth) {
      const row2 = pose.back ? 1 : 0, frame2 = attackFrame(pose.attack), rect = attack.rect[row2][frame2];
      const [sx2, sy2, sw2, sh2] = rect, k2 = attack.scale[row2], pivotX2 = attack.pivotX[row2][frame2], baseline2 = attack.base[row2][frame2];
      c.save();
      c.translate(x, y);
      c.scale(pose.flip ? -1 : 1, 1);
      c.rotate(pose.lean || 0);
      c.drawImage(attackImage, sx2, sy2, sw2, sh2, -pivotX2 * k2, -baseline2 * k2, sw2 * k2, sh2 * k2);
      c.restore();
      return { integratedWeapon: true, attackFrame: frame2 };
    }
    const locomoting = pose.moving || pose.state === "settle" || pose.state === "dash", run = type === "ranger" && locomoting && images.get(rig.run?.key)?.naturalWidth ? rig.run : null;
    const idle = type === "ranger" && !locomoting && images.get(rig.idle?.key)?.naturalWidth ? rig.idle : null;
    const art = run || idle || rig, im = images.get(run?.key || idle?.key || type);
    if (!im?.complete || !im.naturalWidth) return null;
    const row = pose.back ? 1 : 0, cols = art.cols || 5, frame = locomoting ? Math.max(0, Math.min(cols - 1, run ? pose.runFrame ?? pose.frame ?? 0 : pose.frame ?? 0)) : idle ? Math.max(0, Math.min(cols - 1, pose.idleFrame ?? 0)) : 0;
    const sw = im.naturalWidth / cols, sh = im.naturalHeight / 2, sx = frame * sw, sy = row * sh;
    const k = (height || art.height || rig.height) / (art.base[row][0] - art.top[row][0]), pivotX = Array.isArray(art.pivotX[row]) ? art.pivotX[row][frame] : art.pivotX[row], baseline = art.base[row][frame];
    const breathing = idle ? 1 : 1 + (pose.breath || 0) * 6e-3;
    c.save();
    c.translate(x, y);
    c.scale(pose.flip ? -1 : 1, breathing);
    c.rotate(pose.lean || 0);
    c.drawImage(im, sx, sy, sw, sh, -pivotX * k, -baseline * k, sw * k, sh * k);
    c.restore();
    const hand = art.hand?.[row]?.[frame];
    return hand ? { x: (hand[0] - pivotX) * k, y: (hand[1] - baseline) * k * breathing } : {};
  }

  // prototypes/emberwild/painted-art.mjs
  var ATLASES = {
    ranger: { file: "ranger.png", size: [1536, 1024] },
    weapons: { file: "weapons.png", size: [1254, 1254] },
    settlement: { file: "settlement-v2.png", size: [1536, 1024] },
    residents: { file: "residents.png", size: [1536, 1024] },
    scenery: { file: "scenery.png", size: [1536, 1024] },
    cards: { file: "cards-v1.png", size: [1536, 1024] },
    cardTorch: { file: "card-torch-game-v2.png", size: [768, 768] },
    cardWall: { file: "card-wall-game-v2.png", size: [768, 768] },
    cardNest: { file: "card-nest-game-v2.png", size: [768, 768] },
    cardSpring: { file: "card-spring-game-v2.png", size: [768, 768] },
    cardWatchtower: { file: "card-watchtower-v1.png", size: [1254, 1254] },
    cardCatapult: { file: "card-catapult-v1.png", size: [1254, 1254] },
    egg: { file: "sacred-beast-egg-v1.png", size: [1254, 1254] },
    amber: { file: "amber-crystal-node-v1.png", size: [1284, 1225] },
    enemies: { file: "enemies-v1.png", size: [1254, 1254] },
    bosses: { file: "bosses-v1.png", size: [1254, 1254] },
    companionEmberclaw: { file: "companion-emberclaw-v1.png", size: [1024, 1024] },
    companionTideroot: { file: "companion-tideroot-v1.png", size: [1024, 1024] },
    companionStoneback: { file: "companion-stoneback-v1.png", size: [1024, 1024] },
    shopAmberIngot: { file: "shop-amber-ingot-v1.png", size: [1024, 1024] },
    shopPackFortify: { file: "shop-pack-fortify-v1.png", size: [1024, 1024] },
    shopPackHire: { file: "shop-pack-hire-v1.png", size: [1024, 1024] },
    shopPackRelic: { file: "shop-pack-relic-v1.png", size: [1024, 1024] }
  };
  var frames = {
    ranger: [[155, 17, 255, 469], [664, 19, 252, 472], [1196, 20, 237, 470], [144, 512, 238, 469], [685, 518, 268, 465], [1211, 518, 250, 468]],
    weapons: [[270, 13, 120, 1225], [745, 216, 422, 901]],
    settlement: [[87, 89, 365, 356], [582, 90, 360, 363], [1079, 103, 374, 353], [81, 585, 367, 343], [592, 580, 370, 345], [1112, 580, 326, 338]],
    residents: [[105, 20, 376, 480], [622, 12, 324, 494], [1129, 7, 268, 498], [124, 521, 388, 474], [584, 510, 396, 485], [1081, 578, 417, 403]],
    scenery: [[26, 81, 452, 436], [504, 6, 502, 569], [1055, 11, 472, 558], [25, 610, 435, 354], [532, 637, 453, 338], [1057, 655, 458, 280]],
    cards: [[0, 0, 512, 512], [512, 0, 512, 512], [1024, 0, 512, 512], [0, 512, 512, 512], [512, 512, 512, 512], [1024, 512, 512, 512]],
    egg: [[0, 0, 1254, 1254]],
    amber: [[0, 0, 1284, 1225]],
    enemies: [[0, 0, 627, 627], [627, 0, 627, 627], [0, 627, 627, 627], [627, 627, 627, 627]],
    bosses: [[0, 0, 627, 1254], [627, 0, 627, 1254]]
  };
  var SPRITES = {};
  for (const [sheet, names2] of Object.entries({ ranger: ["hero-down-0", "hero-down-1", "hero-down-2", "hero-up-0", "hero-up-1", "hero-up-2"], weapons: ["spear", "axe"], settlement: ["tent", "forge", "cache", "nursery", "merchant-stall", "gate"], residents: ["merchant", "porter", "smith", "hunter", "guard", "pet"], scenery: ["campfire", "broadleaf", "fern-tree", "rocks", "ferns", "fence"], cards: ["card-torch", "card-wall", "card-nest", "card-spring", "card-hunter", "card-guard"], egg: ["sacred-egg"], amber: ["amber-crystal"], enemies: ["enemy-raptor", "enemy-brute", "enemy-spitter", "enemy-boss"], bosses: ["enemy-matriarch", "enemy-charger"] })) names2.forEach((name, i) => SPRITES[name] = { sheet, rect: frames[sheet][i] });
  SPRITES["card-torch"] = { sheet: "cardTorch", rect: [0, 0, 768, 768] };
  SPRITES["card-wall"] = { sheet: "cardWall", rect: [0, 0, 768, 768] };
  SPRITES["card-nest"] = { sheet: "cardNest", rect: [0, 0, 768, 768] };
  SPRITES["card-spring"] = { sheet: "cardSpring", rect: [0, 0, 768, 768] };
  SPRITES["card-watchtower"] = { sheet: "cardWatchtower", rect: [0, 0, 1254, 1254] };
  SPRITES["card-catapult"] = { sheet: "cardCatapult", rect: [0, 0, 1254, 1254] };
  SPRITES["building-watchtower"] = { sheet: "cardWatchtower", rect: [0, 0, 1254, 1254] };
  SPRITES["building-catapult"] = { sheet: "cardCatapult", rect: [0, 0, 1254, 1254] };
  for (const type of ["torch", "wall", "nest", "spring"]) SPRITES[`building-${type}`] = SPRITES[`card-${type}`];
  SPRITES["companion-emberclaw"] = { sheet: "companionEmberclaw", rect: [0, 0, 1024, 1024] };
  SPRITES["companion-tideroot"] = { sheet: "companionTideroot", rect: [0, 0, 1024, 1024] };
  SPRITES["companion-stoneback"] = { sheet: "companionStoneback", rect: [0, 0, 1024, 1024] };
  SPRITES["shop-amber-ingot"] = { sheet: "shopAmberIngot", rect: [0, 0, 1024, 1024] };
  SPRITES["shop-pack-fortify"] = { sheet: "shopPackFortify", rect: [0, 0, 1024, 1024] };
  SPRITES["shop-pack-hire"] = { sheet: "shopPackHire", rect: [0, 0, 1024, 1024] };
  SPRITES["shop-pack-relic"] = { sheet: "shopPackRelic", rect: [0, 0, 1024, 1024] };
  var spriteURL = (sheet) => `assets/painted-v1/${ATLASES[sheet].file}`;
  var images2 = /* @__PURE__ */ new Map();
  function preloadArt() {
    for (const sheet of Object.keys(ATLASES)) if (!images2.has(sheet)) {
      const image = new Image();
      image.decoding = "async";
      image.src = spriteURL(sheet);
      images2.set(sheet, image);
    }
    return Promise.all([preloadCharacters(), ...[...images2.values()].map((image) => image.decode().catch(() => {
    }))]);
  }
  function drawSprite(c, key, x, y, { height = 90, width = Infinity, anchorX = 0.5, anchorY = 1, flip = false, rotation = 0, alpha = 1 } = {}) {
    const s = SPRITES[key], image = s && images2.get(s.sheet);
    if (!image?.complete || !image.naturalWidth) return false;
    const [sx, sy, sw, sh] = s.rect, k = Math.min(height / sh, width / sw), w = sw * k, h = sh * k;
    c.save();
    c.translate(x, y);
    c.rotate(rotation);
    c.scale(flip ? -1 : 1, 1);
    c.globalAlpha *= alpha;
    c.imageSmoothingEnabled = true;
    c.drawImage(image, sx, sy, sw, sh, -w * anchorX, -h * anchorY, w, h);
    c.restore();
    return true;
  }
  function spriteIcon(key, className = "card-icon") {
    const s = SPRITES[key];
    if (!s) {
      const shapes2 = { bow: '<path d="M18 7q28 21 0 42M18 7q-7 21 0 42M16 28h30m-9-6 9 6-9 6" fill="none" stroke="#ead69b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>', blades: '<path d="M13 44L39 10l5 3-23 36zm30 0L20 10l-5 3 20 36z" fill="#e7dfbd" stroke="#8b9478" stroke-width="2"/><path d="M10 39l13 10m23-10L33 49" stroke="#c99b5e" stroke-width="5"/>', hammer: '<path d="M27 18v33" stroke="#a98150" stroke-width="7"/><path d="M9 8h38l4 17H5z" fill="#ddd3aa" stroke="#81896c" stroke-width="3"/><path d="M13 12h30" stroke="#f1e4bd" stroke-width="3"/>' };
      if (!shapes2[key]) return "";
      return `<svg class="${className} painted-icon vector-weapon-icon" viewBox="0 0 56 56" aria-hidden="true" focusable="false">${shapes2[key]}</svg>`;
    }
    const atlas = ATLASES[s.sheet];
    return `<svg class="${className} painted-icon" viewBox="${s.rect.join(" ")}" aria-hidden="true" focusable="false"><image href="${spriteURL(s.sheet)}" width="${atlas.size[0]}" height="${atlas.size[1]}"/></svg>`;
  }
  function drawWeapon(c, key, x, y, { height = 70, anchorX = 0.5, anchorY = 0.5, flip = false, rotation = 0, alpha = 1 } = {}) {
    if (drawSprite(c, key, x, y, { height, anchorX, anchorY, flip, rotation, alpha })) return true;
    if (!["bow", "blades", "hammer"].includes(key)) return false;
    const scale = height / 70;
    c.save();
    c.translate(x, y);
    c.rotate(rotation);
    c.scale((flip ? -1 : 1) * scale, scale);
    c.globalAlpha *= alpha;
    c.lineCap = "round";
    c.lineJoin = "round";
    if (key === "bow") {
      c.beginPath();
      c.moveTo(-6, -31);
      c.quadraticCurveTo(18, 0, -6, 31);
      c.quadraticCurveTo(-15, 0, -6, -31);
      c.strokeStyle = "#e5cd8d";
      c.lineWidth = 4;
      c.stroke();
      c.beginPath();
      c.moveTo(-8, -30);
      c.lineTo(-8, 30);
      c.strokeStyle = "#e8e4c5";
      c.lineWidth = 1.5;
      c.stroke();
      c.beginPath();
      c.moveTo(-8, 0);
      c.lineTo(27, 0);
      c.strokeStyle = "#baa06b";
      c.lineWidth = 3;
      c.stroke();
      c.beginPath();
      c.moveTo(30, 0);
      c.lineTo(21, -5);
      c.lineTo(23, 0);
      c.lineTo(21, 5);
      c.closePath();
      c.fillStyle = "#eee4bd";
      c.fill();
    } else if (key === "blades") {
      for (const side of [-1, 1]) {
        c.save();
        c.rotate(side * 0.34);
        c.beginPath();
        c.moveTo(side * 4, -32);
        c.lineTo(side * 10, 10);
        c.lineTo(side * 3, 19);
        c.lineTo(side * -2, 9);
        c.closePath();
        c.fillStyle = "#e9e2c1";
        c.strokeStyle = "#879078";
        c.lineWidth = 2;
        c.fill();
        c.stroke();
        c.beginPath();
        c.moveTo(-8, 14);
        c.lineTo(8, 14);
        c.strokeStyle = "#d2a766";
        c.lineWidth = 4;
        c.stroke();
        c.restore();
      }
    } else {
      c.beginPath();
      c.moveTo(0, -14);
      c.lineTo(0, 32);
      c.strokeStyle = "#9d7448";
      c.lineWidth = 7;
      c.stroke();
      c.beginPath();
      c.moveTo(-19, -29);
      c.lineTo(19, -29);
      c.lineTo(24, -10);
      c.lineTo(-24, -10);
      c.closePath();
      c.fillStyle = "#ddd3aa";
      c.strokeStyle = "#7e866c";
      c.lineWidth = 3;
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(-15, -24);
      c.lineTo(16, -24);
      c.strokeStyle = "#f1e5bc";
      c.lineWidth = 3;
      c.stroke();
    }
    c.restore();
    return true;
  }
  function drawRanger(c, h, t, { moving = false, step = 0, reduced = false, pose } = {}) {
    if (pose) {
      c.save();
      if (h.invulnerable > 0 && Math.floor(t * 20) % 2) c.globalAlpha = 0.55;
      const spear = h.weapon === "spear", attacking = h.swing > 0 && !reduced;
      const carry = () => {
        c.save();
        c.translate(h.x, h.y + 13);
        c.scale(pose.flip ? -1 : 1, 1);
        c.rotate(pose.lean || 0);
        drawWeapon(c, h.weapon, spear ? 0 : -3, spear ? -58 : -51, { height: spear ? 70 : h.weapon === "hammer" ? 58 : 52, anchorX: spear ? 0.5 : 0.34, anchorY: 0.5, rotation: spear ? -0.88 : -0.78 });
        c.restore();
      };
      if (!attacking && !pose.back) carry();
      const grip = drawCharacter(c, "ranger", h.x, h.y + 13, pose, { weapon: h.weapon });
      if (grip) {
        if (!attacking && pose.back) carry();
        if (attacking && !grip.integratedWeapon) {
          c.save();
          c.translate(h.x, h.y + 13);
          c.scale(pose.flip ? -1 : 1, 1);
          c.rotate(pose.lean || 0);
          const age = 1 - h.swing / 0.2, strike = Math.sin(age * Math.PI);
          c.translate(grip.x, grip.y);
          drawWeapon(c, h.weapon, 0, 0, { height: spear ? 82 : h.weapon === "hammer" ? 68 : 60, anchorX: spear ? 0.5 : 0.28, anchorY: spear ? 0.65 : 0.76, rotation: (spear ? -0.6 : -0.52) + (spear ? 1.55 : 1.7) * strike });
          c.beginPath();
          c.ellipse(0, 0, 1.9, 2.4, 0, 0, Math.PI * 2);
          c.fillStyle = "#806146";
          c.fill();
          c.restore();
        }
        c.restore();
        c.save();
        c.beginPath();
        c.arc(h.x, h.y, 34, h.angle - 0.25, h.angle + 0.25);
        c.strokeStyle = "#efdaa37a";
        c.lineWidth = 2;
        c.stroke();
        c.restore();
        return true;
      }
      c.restore();
    }
    const back = Math.sin(h.angle) < -0.35, flip = Math.cos(h.angle) < 0, frame = moving && !reduced ? [1, 0, 2, 0][Math.floor(step) % 4] : 0;
    const key = `hero-${back ? "up" : "down"}-${frame}`;
    if (!images2.get("ranger")?.naturalWidth) return false;
    c.save();
    c.translate(h.x, h.y);
    c.scale(flip ? -1 : 1, 1);
    if (h.invulnerable > 0 && Math.floor(t * 20) % 2) c.globalAlpha = 0.55;
    const bob = reduced ? 0 : moving ? Math.sin(step * Math.PI) * 1.3 : Math.sin(t * 2.5) * 0.65;
    const weapon = () => {
      const swing = h.swing > 0 ? Math.sin((0.2 - h.swing) / 0.2 * Math.PI) : 0, spear = h.weapon === "spear";
      drawWeapon(c, h.weapon, back ? 14 : 16, -21 + bob, { height: spear ? 94 : h.weapon === "hammer" ? 70 : 63, anchorX: spear ? 0.5 : 0.26, anchorY: spear ? 0.65 : 0.76, rotation: (spear ? 0.12 : -0.15) + swing * (spear ? 1.05 : 1.6) });
    };
    if (back) weapon();
    drawSprite(c, key, 0, 15 + bob, { height: 92 });
    if (!back) weapon();
    c.restore();
    c.save();
    c.beginPath();
    c.arc(h.x, h.y, 34, h.angle - 0.25, h.angle + 0.25);
    c.strokeStyle = "#efdaa37a";
    c.lineWidth = 2;
    c.stroke();
    c.restore();
    return true;
  }

  // prototypes/emberwild/actor-motion.mjs
  var clamp2 = (n, a, b) => Math.max(a, Math.min(b, n));
  var ActorMotion = class {
    constructor({ stride = 96 } = {}) {
      this.stride = stride;
      this.time = -1;
      this.x = 0;
      this.y = 0;
      this.phase = 0;
      this.step = 0;
      this.speed = 0;
      this.amount = 0;
      this.stopAmount = 0;
      this.idleFor = 0;
      this.back = false;
      this.flip = false;
      this.turnAge = 1;
      this.moving = false;
      this.state = "idle";
      this.frame = 0;
      this.runFrame = 0;
      this.idleFrame = 0;
    }
    update(actor2, time, { reduced = false } = {}) {
      const dx = actor2.x - this.x, dy = actor2.y - this.y, d = Math.hypot(dx, dy), dt = time - this.time;
      const reset = this.time < 0 || dt < 0 || dt > 0.25 || d > Math.max(80, Math.max(0, dt) * 1100);
      if (reset) {
        this.phase = 0;
        this.speed = 0;
        this.amount = 0;
        this.stopAmount = 0;
        this.idleFor = 1;
        this.moving = false;
        this.frame = 0;
        this.runFrame = 0;
        this.idleFrame = 0;
        this.state = "idle";
        this.turnAge = 1;
      }
      if (dt > 0 && !reset) {
        const moving = d > 0.025 && actor2.moving !== false, dash = actor2.dashTime > 0;
        this.speed += (moving ? d / dt - this.speed : -this.speed) * (1 - Math.exp(-dt * 15));
        if (moving) {
          if (!this.moving) this.phase = 0;
          this.idleFor = 0;
          if (!dash) this.phase = (this.phase + d / this.stride) % 1;
        } else {
          if (this.moving) this.stopAmount = this.amount;
          this.idleFor += dt;
        }
        this.turnAge += dt;
        this.moving = moving;
        this.state = dash ? "dash" : moving ? "walk" : this.idleFor < 0.1 ? "settle" : "idle";
        const sequence = [1, 2, 0, 3, 4, 0];
        this.frame = reduced || this.state === "idle" ? 0 : dash ? 2 : sequence[Math.floor(this.phase * sequence.length) % sequence.length];
        this.runFrame = reduced || this.state === "idle" ? 0 : dash ? 2 : Math.floor(this.phase * 5) % 5;
        const idleSequence = [0, 1, 2, 3, 4, 3, 2, 1];
        this.idleFrame = reduced || this.state !== "idle" ? 0 : idleSequence[Math.floor(Math.max(0, this.idleFor - 0.18) / 0.42) % idleSequence.length];
      }
      const a = Number.isFinite(actor2.angle) ? actor2.angle : 0, sx = Math.cos(a), sy = Math.sin(a);
      if (reset || this.moving || actor2.swing > 0) {
        const back = this.back ? sy < 0.18 : sy < -0.38;
        const flip = sx < -0.28 ? true : sx > 0.28 ? false : this.flip;
        if (reset || this.turnAge > 0.11 || actor2.swing > 0) {
          if (back !== this.back || flip !== this.flip) this.turnAge = 0;
          this.back = back;
          this.flip = flip;
        }
      }
      this.x = actor2.x;
      this.y = actor2.y;
      this.time = time;
      this.step = this.phase * 6;
      const walking = this.state === "walk", breath = reduced ? 0 : Math.sin(time * 2.2) * 0.22;
      const amount = reduced ? 0 : walking ? Math.min(1, this.speed / (this.stride * 1.25)) : this.state === "settle" ? this.stopAmount * Math.max(0, 1 - this.idleFor / 0.1) : 0;
      this.amount = amount;
      return {
        frame: this.frame,
        runFrame: this.runFrame,
        idleFrame: this.idleFrame,
        back: this.back,
        flip: this.flip,
        state: this.state,
        moving: this.moving,
        phase: this.phase,
        amount,
        stride: this.stride,
        angle: a,
        // All sprites are grounded by an explicit foot pivot; never bob the root.
        breath: walking || actor2.dashTime > 0 ? 0 : breath,
        lean: reduced ? 0 : actor2.dashTime > 0 ? Math.cos(a) * 0.065 : 0,
        attack: reduced ? 0 : clamp2(actor2.swing / 0.2, 0, 1)
      };
    }
  };

  // prototypes/emberwild/experience.mjs
  var STORAGE_KEY = "emberwild_experience_v1";
  var DEFAULTS = Object.freeze({ haptics: true, volume: 0.65, powerSaver: false, fontSize: "normal", quality: "auto" });
  var FONT_SIZES = /* @__PURE__ */ new Set(["small", "normal", "large"]);
  var QUALITIES = /* @__PURE__ */ new Set(["auto", "high", "balanced", "low"]);
  function storage() {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }
  function normalise(value = {}) {
    const volume = Number(value.volume);
    return {
      haptics: value.haptics !== false,
      volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : DEFAULTS.volume,
      powerSaver: value.powerSaver === true,
      fontSize: FONT_SIZES.has(value.fontSize) ? value.fontSize : DEFAULTS.fontSize,
      quality: QUALITIES.has(value.quality) ? value.quality : DEFAULTS.quality
    };
  }
  function load() {
    try {
      return normalise(JSON.parse(storage()?.getItem(STORAGE_KEY) || "{}"));
    } catch {
      return { ...DEFAULTS };
    }
  }
  var preferences = load();
  var nativeLowPower = false;
  var listeners = /* @__PURE__ */ new Set();
  var motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  function effectiveLowPower() {
    return preferences.powerSaver || nativeLowPower;
  }
  function apply() {
    const root = document.documentElement;
    root.dataset.fontSize = preferences.fontSize;
    root.dataset.quality = preferences.quality;
    root.dataset.lowPower = String(effectiveLowPower());
    root.style.colorScheme = "dark";
    listeners.forEach((listener) => listener(experience.settings));
  }
  function persist() {
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
    }
  }
  var experience = {
    get settings() {
      return Object.freeze({ ...preferences, nativeLowPower, effectiveLowPower: effectiveLowPower() });
    },
    update(patch) {
      preferences = normalise({ ...preferences, ...patch });
      persist();
      apply();
      return this.settings;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    renderScale() {
      const dpr = Math.max(1, devicePixelRatio || 1);
      if (effectiveLowPower() || preferences.quality === "low") return Math.min(dpr, 1);
      if (preferences.quality === "balanced") return Math.min(dpr, 1.5);
      if (preferences.quality === "high") return Math.min(dpr, 2);
      return Math.min(dpr, matchMedia("(max-width: 760px)").matches ? 1.5 : 2);
    },
    reducedEffects() {
      return effectiveLowPower() || preferences.quality === "low" || motionQuery.matches;
    },
    haptic(style = "light") {
      if (!preferences.haptics) return false;
      try {
        const bridge = window.webkit?.messageHandlers?.gameHaptics;
        if (bridge) {
          bridge.postMessage({ style });
          return true;
        }
        if (navigator.vibrate) {
          navigator.vibrate(style === "success" ? [18, 35, 24] : style === "warning" ? [30, 40, 30] : style === "heavy" ? 28 : style === "medium" ? 18 : 10);
          return true;
        }
      } catch {
      }
      return false;
    },
    setNativeLowPower(active) {
      nativeLowPower = Boolean(active);
      apply();
    },
    reset() {
      preferences = { ...DEFAULTS };
      persist();
      apply();
    }
  };
  window.setShellLowPowerMode = (active) => experience.setNativeLowPower(active);
  window.setShellAppActive = (active) => window.dispatchEvent(new CustomEvent("emberwild-shell-active", { detail: { active: Boolean(active) } }));
  motionQuery.addEventListener?.("change", apply);
  apply();

  // prototypes/emberwild/control-hints.mjs
  var query = "(pointer: coarse), (max-width: 1024px)";
  var deviceMedia = globalThis.matchMedia?.(query);
  function touchControls(host = globalThis) {
    const media = host === globalThis ? deviceMedia : host.matchMedia?.(query);
    return (host.navigator?.maxTouchPoints || 0) > 0 || !!media?.matches;
  }
  function controlLabel(label, key, touch = touchControls()) {
    return touch ? label : `${label} · ${key}`;
  }

  // prototypes/emberwild/battle-viewport.mjs
  var clamp3 = (n, min, max) => Math.max(min, Math.min(max, n));
  function battleViewport(width, height, world, focus, { close = false } = {}) {
    const fit = Math.min(width / world.width, height / world.height);
    const fill = Math.max(width / world.width, height / world.height);
    const scale = close ? Math.min(fill, fit * 1.35) : fit;
    const offset = (size, extent, point2) => extent * scale <= size ? (size - extent * scale) / 2 : clamp3(size / 2 - point2 * scale, size - extent * scale, 0);
    return { scale, ox: offset(width, world.width, focus.x), oy: offset(height, world.height, focus.y) };
  }

  // prototypes/emberwild/art.mjs
  var shapes = {
    hunter: '<path d="M14 50l3-24h23l4 24" fill="#539781"/><circle cx="28" cy="16" r="10" fill="#d3ab78"/><path d="M15 16L28 2l14 15" fill="#385d46"/><path d="M45 16Q62 33 45 50V16M39 32h16" fill="none" stroke="#e3ce91" stroke-width="3"/>',
    guard: '<circle cx="27" cy="14" r="10" fill="#d3ab78"/><path d="M16 15V6l22 0v10" fill="#b4c5bb"/><path d="M13 52V27h27v25" fill="#9b7f50"/><path d="M24 27l21-5v20l-10 11-11-10z" fill="#719582" stroke="#e6d7ab" stroke-width="3"/><path d="M7 10v42" stroke="#dedec1" stroke-width="4"/>',
    torch: '<path d="M19 47L23 22h10l4 25" fill="#8c8067"/><path d="M17 27h24l-4 7H21z" fill="#c2aa79"/><path d="M29 3c10 9 15 16 8 23-4 5-15 3-18-2-3-6 3-10 5-15 0 6 2 7 3 7 3-3 3-7 2-13" fill="#f4ab51"/><path d="M29 14c6 6 8 11 1 14-7-1-7-5-1-14" fill="#ffe7a4"/><ellipse cx="28" cy="49" rx="21" ry="5" fill="#10291e66"/>',
    wall: '<path d="M8 18l5-9 5 9-2 26H9zm13-6l6-9 5 9-2 35h-8zm16 6l6-10 5 11-2 25h-8z" fill="#e7ddbc"/><path d="M5 25l45 5-1 7-45-5z" fill="#8a7851"/><path d="M11 14v29m15-32v35m16-29v26" stroke="#fff0c9" stroke-width="2"/><path d="M12 28l2 8m12-7l-1 7m16-4l-2 7" stroke="#ba9c64" stroke-width="2"/>',
    nest: '<ellipse cx="28" cy="39" rx="23" ry="12" fill="#917344"/><ellipse cx="28" cy="36" rx="21" ry="9" fill="#4e6140"/><path d="M11 42l14 6 19-7M7 35l8 10M35 46l14-9" stroke="#cead72" stroke-width="3" fill="none"/><ellipse cx="23" cy="27" rx="9" ry="13" fill="#ece4bd" transform="rotate(-15 23 27)"/><ellipse cx="35" cy="31" rx="8" ry="11" fill="#d5deb4" transform="rotate(18 35 31)"/><path d="M20 20l4 3-3 5m11 0l5 3" stroke="#b5ba88" stroke-width="3"/>',
    spring: '<ellipse cx="28" cy="38" rx="25" ry="13" fill="#829a90"/><ellipse cx="28" cy="36" rx="20" ry="9" fill="#65acb0"/><path d="M15 37q13 8 26-1m-24-3q8-4 18 0" stroke="#bce9d4" stroke-width="2" fill="none"/><path d="M28 4c-2 8-10 14-10 20 0 13 21 13 21 0 0-6-8-13-11-20" fill="#91d5d7"/><path d="M25 15c-7 12-3 13 1 14" fill="none" stroke="#e0f7e3" stroke-width="3"/>'
  };
  function icon(type, className = "card-icon") {
    if (["watchtower", "catapult", "torch", "wall", "nest", "spring", "hunter", "guard"].includes(type)) return spriteIcon(`card-${type}`, className);
    return `<svg class="${className}" viewBox="0 0 56 56" aria-hidden="true">${shapes[type] || ""}</svg>`;
  }
  function ellipse(c, x, y, rx, ry, color) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
  }
  function polygon(c, points, color, stroke) {
    c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.closePath();
    c.fillStyle = color;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 2;
      c.stroke();
    }
  }
  function line(c, points, color, width = 2) {
    c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = "round";
    c.stroke();
  }
  function text(c, label, x, y, size, color, weight = 600) {
    c.font = `${weight} ${size}px -apple-system,"PingFang TC",sans-serif`;
    c.textAlign = "center";
    c.fillStyle = color;
    c.fillText(label, x, y);
  }
  var ENEMY_SIZE = { raptor: 78, brute: 112, spitter: 88, matriarch: 186, charger: 190, boss: 176 };
  var BOSS_NAMES = { matriarch: "沼澤母獸", charger: "骨甲衝角獸", boss: "琥珀泰坦" };
  var ESCORT_PATH2 = [[125, 650], [205, 585], [275, 515], [390, 435], [500, 325], [585, 235], [640, 145]].map(([x, y]) => ({ x, y }));
  var Painter = class {
    constructor(canvas) {
      preloadArt();
      this.walkArt = new ActorMotion();
      this.actorMotions = /* @__PURE__ */ new Map();
      this.canvas = canvas;
      this.c = canvas.getContext("2d");
      this.backgrounds = ["assets/fern-valley.png", "assets/painted-v1/stage-2-fern-hollow-v1.png", "assets/painted-v1/stage-3-tidal-marsh-v1.png", "assets/painted-v1/stage-4-beast-ruins-v1.png", "assets/painted-v1/stage-5-amber-ridge-v1.png", "assets/painted-v1/stage-6-ashen-canopy-v1.png", "assets/painted-v1/stage-7-moonbone-ravine-v1.png", "assets/painted-v1/stage-8-titan-sanctuary-v1.png"].map((src) => {
        const image = new Image();
        image.decoding = "async";
        image.src = src;
        return image;
      });
      this.bg = this.backgrounds[0];
      this.scale = 1;
      this.ox = 0;
      this.oy = 0;
      this.w = 720;
      this.h = 820;
      this.shake = 0;
      this.reduced = experience.reducedEffects();
      this.resize();
    }
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = experience.renderScale();
      this.w = rect.width || 720;
      this.h = rect.height || 820;
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.dpr = dpr;
      this.scale = Math.min(this.w / WORLD.width, this.h / WORLD.height);
      this.ox = (this.w - WORLD.width * this.scale) / 2;
      this.oy = (this.h - WORLD.height * this.scale) / 2;
      this.closeCamera = getComputedStyle(this.canvas.parentElement).getPropertyValue("--battle-close-camera").trim() === "1";
      this.cameraReady = false;
    }
    point(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      return { x: (clientX - r.left - this.ox) / this.scale, y: (clientY - r.top - this.oy) / this.scale };
    }
    screen(x, y) {
      const r = this.canvas.getBoundingClientRect();
      return { x: r.left + this.ox + x * this.scale, y: r.top + this.oy + y * this.scale };
    }
    render(g, preview) {
      this.reduced = experience.reducedEffects();
      const close = this.closeCamera && !this.overview;
      if (!g.building || !this.cameraReady) {
        const next = battleViewport(this.w, this.h, WORLD, g.hero, { close });
        const blend = this.cameraReady && this.cameraRun === g.runId && this.scale === next.scale && !this.reduced ? 0.14 : 1;
        this.scale = next.scale;
        this.ox += (next.ox - this.ox) * blend;
        this.oy += (next.oy - this.oy) * blend;
        this.cameraReady = true;
        this.cameraRun = g.runId;
      }
      const c = this.c;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.w, this.h);
      c.fillStyle = "#213c2b";
      c.fillRect(0, 0, this.w, this.h);
      c.translate(this.ox, this.oy);
      c.scale(this.scale, this.scale);
      if (this.shake > 0 && !this.reduced) {
        c.translate(Math.sin(g.time * 100) * this.shake, Math.cos(g.time * 90) * this.shake);
        this.shake *= 0.8;
        if (this.shake < 0.1) this.shake = 0;
      }
      c.save();
      c.beginPath();
      c.rect(0, 0, WORLD.width, WORLD.height);
      c.clip();
      const level = clamp(g.phase === "prep" && !g.tutorial?.reward ? g.wave + 1 : g.wave || 1, 1, 8), bg = this.backgrounds[level - 1];
      if (bg.complete && bg.naturalWidth) c.drawImage(bg, 0, 0, WORLD.width, WORLD.height);
      else {
        c.fillStyle = "#76904f";
        c.fillRect(0, 0, WORLD.width, WORLD.height);
      }
      c.fillStyle = "#15342326";
      c.fillRect(0, 0, WORLD.width, WORLD.height);
      const vig = c.createRadialGradient(360, 400, 140, 360, 400, 550);
      vig.addColorStop(0, "#0c302200");
      vig.addColorStop(1, "#0b241b8c");
      c.fillStyle = vig;
      c.fillRect(0, 0, 720, 820);
      for (let i = 0; i < (this.reduced ? 5 : 15); i++) {
        let x = (i * 149 + 40) % 680 + 20, y = (i * 79 + (!this.reduced ? g.time * 5 : 0)) % 760 + 20;
        ellipse(c, x, y, 1.5, 1.5, "#f6e6a269");
      }
      for (const b of g.buildings) if (b.type === "spring") this.aura(b, g.time);
      this.buildingRecoil = new Map(g.effects.filter((f) => f.buildingId !== void 0).map((f) => [f.buildingId, Math.sin((1 - f.life / f.maxLife) * Math.PI)]));
      if (preview) {
        c.strokeStyle = "#f5eed41a";
        c.lineWidth = 1;
        for (let x = 60; x < 680; x += 40) {
          c.beginPath();
          c.moveTo(x, 85);
          c.lineTo(x, 735);
          c.stroke();
        }
        for (let y = 95; y < 735; y += 40) {
          c.beginPath();
          c.moveTo(55, y);
          c.lineTo(665, y);
          c.stroke();
        }
      }
      this.objectiveGround(g.objective, g.time);
      const mapEvents = (g.eventPlan || []).filter((mapEvent) => mapEvent.stage === g.wave && mapEvent.status === "active");
      for (const mapEvent of mapEvents) this.mapEventGround(mapEvent, g.time);
      for (const enemy of g.enemies) if (enemy.elite) this.eliteGround(enemy, g.time);
      for (const n of g.nodes) if (n.hp > 0) this.crystal(n);
      for (const d of g.drops) {
        c.save();
        c.translate(d.x, d.y);
        c.rotate(Math.PI / 4);
        c.fillStyle = "#f8d276";
        c.fillRect(-5, -5, 10, 10);
        c.restore();
        ellipse(c, d.x - 2, d.y - 2, 2, 2, "#fff0b8");
      }
      for (const p of g.projectiles) if (p.kind === "shock-field") this.projectile(p);
      for (const e of g.enemies) if (e.windup > 0) this.telegraph(e);
      const objectiveActors2 = g.objective ? [g.objective.npc, g.objective.captive, ...g.objective.targets || [], ...g.objective.points || []].filter(Boolean) : [];
      const objects = [{ y: g.base.y, draw: () => this.base(g.base, g.time, !!g.companion) }, ...g.buildings.map((b) => ({ y: b.y, draw: () => this.building(b, g.time) })), ...g.allies.map((a) => ({ y: a.y, draw: () => this.ally(a, g.time) })), ...objectiveActors2.map((a) => ({ y: a.y, draw: () => this.objectiveActor(a, g.objective, g.time) })), ...mapEvents.map((mapEvent) => ({ y: mapEvent.y, draw: () => this.mapEvent(mapEvent, g.time) })), ...g.enemies.map((e) => ({ y: e.y, draw: () => this.enemy(e, g.time) })), ...g.companion ? [{ y: g.companion.y, draw: () => this.companion(g.companion, g.time) }] : [], { y: g.hero.y, draw: () => this.hero(g.hero, g.time) }, ...g.buildings.filter((b) => b.type === "nest").map((b) => ({ y: b.pet.y, draw: () => this.pet(b.pet, g.time) }))].sort((a, b) => a.y - b.y);
      objects.forEach((o) => o.draw());
      for (const e of g.enemies) if (e.hp > 0 && e.weakpoint) this.weakpoint(e, g.time);
      for (const e of g.enemies) if (e.hp > 0 && e.elite) this.eliteMark(e, g.time);
      const liveMotions = /* @__PURE__ */ new Set([...g.allies.map((a) => "ally-" + a.id), ...g.enemies.map((e) => "enemy-" + e.id)]);
      for (const key of this.actorMotions.keys()) if ((key.startsWith("ally-") || key.startsWith("enemy-")) && !liveMotions.has(key)) this.actorMotions.delete(key);
      for (const p of g.projectiles) if (p.kind !== "shock-field") this.projectile(p);
      const effects = this.reduced ? g.effects.filter((f) => ["text", "beam", "muzzle", "slash", "enemy-death", "burst"].includes(f.kind)).slice(-45) : g.effects;
      for (const f of effects) this.effect(f);
      if (preview) this.preview(g, preview);
      c.restore();
      const boss = g.enemies.find((e) => BOSS_NAMES[e.type] && e.hp > 0);
      if (boss) {
        c.save();
        if (this.closeCamera) {
          const s = Math.min(1, (this.w - 24) / 440);
          c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
          c.translate((this.w - 440 * s) / 2 - 140 * s, 145 - 90 * s);
          c.scale(s, s);
        }
        const weak = boss.weakpoint, phase = Math.min(3, (boss.bossPhase || 0) + 1);
        c.fillStyle = "#193323dd";
        c.fillRect(140, 90, 440, 42);
        c.fillStyle = boss.type === "matriarch" ? "#b9cf70" : boss.type === "charger" ? "#e2a765" : "#f0a84f";
        c.fillRect(148, 118, 424 * boss.hp / boss.maxHp, 5);
        text(c, `${BOSS_NAMES[boss.type]} · 階段 ${phase}`, 360, 105, 12, "#ffddad");
        text(c, weak?.broken ? `${weak.name}已破壞` : weak?.open ? `${weak.name}暴露中` : `${weak?.name || "弱點"}尚未暴露`, 360, 116, 8, weak?.broken ? "#9fd8ad" : weak?.open ? "#ffe19a" : "#9eab94");
        c.restore();
      }
    }
    aura(b, t) {
      const c = this.c;
      const r = CARDS.spring.range + (b.level - 1) * 14;
      c.beginPath();
      c.arc(b.x, b.y, r, 0, Math.PI * 2);
      c.fillStyle = "#7cd3d718";
      c.fill();
      c.strokeStyle = "#bbe2c337";
      c.setLineDash([6, 8]);
      c.lineDashOffset = -t * 7;
      c.stroke();
      c.setLineDash([]);
    }
    mapEventGround(event, t) {
      const c = this.c, pulse = this.reduced ? 0 : Math.sin(t * 3.8) * 4;
      c.save();
      c.beginPath();
      c.arc(event.x, event.y, event.r + 18 + pulse, 0, Math.PI * 2);
      c.fillStyle = event.type === "elite" ? "#cf6c3b18" : "#f0d07c13";
      c.fill();
      c.strokeStyle = event.type === "elite" ? "#ff9b65aa" : "#ffe2a28c";
      c.lineWidth = 2;
      c.setLineDash([8, 7]);
      c.lineDashOffset = this.reduced ? 0 : -t * 15;
      c.stroke();
      c.setLineDash([]);
      c.restore();
    }
    mapEvent(event, t) {
      const c = this.c, d = MAP_EVENT_DEFS[event.type], bob = this.reduced ? 0 : Math.sin(t * 2.8) * 1.5;
      c.save();
      c.translate(event.x, event.y + bob);
      ellipse(c, 0, 18, event.r + 9, 11, "#11261e70");
      if (event.type === "merchant") {
        polygon(c, [[-29, -12], [-21, -43], [23, -43], [31, -12]], "#bd8250", "#f0d29a");
        polygon(c, [[-30, -42], [31, -42], [22, -56], [-20, -56]], "#d4a45e", "#ffe0a0");
        line(c, [[-23, -12], [-23, 17]], "#795d3d", 5);
        line(c, [[24, -12], [24, 17]], "#795d3d", 5);
        ellipse(c, 2, -19, 11, 13, "#c99a70");
        polygon(c, [[-12, -8], [14, -8], [18, 17], [-17, 17]], "#426e5d");
        text(c, "◆", 1, -26, 12, "#ffe19a");
      } else if (event.type === "ruin") {
        polygon(c, [[-29, 17], [-24, -36], [-12, -48], [-7, 17]], "#77806a", "#c8c291");
        polygon(c, [[8, 17], [12, -48], [26, -36], [30, 17]], "#77806a", "#c8c291");
        line(c, [[-18, -36], [19, -36]], "#d1c89b", 9);
        polygon(c, [[0, -28], [11, -13], [0, 2], [-11, -13]], "#d9b963", "#fff0ae");
      } else if (event.type === "hunter") {
        polygon(c, [[-30, 13], [-12, 3], [18, 8], [31, 18]], "#396a58");
        ellipse(c, -16, -1, 10, 11, "#d1a072");
        polygon(c, [[-25, -8], [-17, -22], [-5, -7]], "#315744");
        line(c, [[6, 6], [24, -10]], "#e2d19d", 3);
        line(c, [[17, -12], [29, -17]], "#e2d19d", 2);
        text(c, "+", 19, -28, 19, "#9ee0ba");
      } else if (event.type === "chest") {
        polygon(c, [[-29, -3], [29, -3], [25, 22], [-25, 22]], "#8b5d31", "#e5bb6b");
        polygon(c, [[-29, -4], [-22, -25], [22, -25], [29, -4]], "#b0783b", "#f1cf7d");
        line(c, [[0, -24], [0, 22]], "#e8c778", 5);
        polygon(c, [[-7, -7], [7, -7], [8, 7], [-8, 7]], "#f3dc8e", "#6d5630");
      } else {
        polygon(c, [[-9, 18], [-5, -36], [6, -36], [10, 18]], "#8a714d", "#d7bf82");
        polygon(c, [[-22, -32], [0, -55], [23, -32], [10, -25], [0, -37], [-10, -25]], "#be7148", "#ffd08a");
        ellipse(c, 0, -8, 8, 8, "#f2c66f");
      }
      text(c, d.name, 0, event.r + 34, 11, event.type === "elite" ? "#ffc29b" : "#ffe8b2");
      text(c, event.type === "elite" ? "擊敗金印獸群" : controlLabel("靠近後點互動", "E"), 0, event.r + 47, 8, "#d6ddbb");
      c.restore();
    }
    eliteGround(e, t) {
      const c = this.c, pulse = this.reduced ? 0 : Math.sin(t * 6) * 3;
      c.save();
      c.beginPath();
      c.arc(e.x, e.y, e.r + 12 + pulse, 0, Math.PI * 2);
      c.fillStyle = "#f0b25a14";
      c.fill();
      c.strokeStyle = "#ffd37f";
      c.lineWidth = 3;
      c.setLineDash([5, 5]);
      c.stroke();
      c.setLineDash([]);
      c.restore();
    }
    eliteMark(e) {
      text(this.c, "精英", e.x, e.y - e.r - 24, 9, "#ffd88c");
    }
    ally(a, t) {
      const c = this.c, pose = this.actorPose("ally-" + (a.id ?? "preview"), a, t, 76);
      ellipse(c, a.x, a.y + 13, 21, 8, "#132a2559");
      const animated = a.type === "hunter" && drawCharacter(c, "hunter", a.x, a.y + 13, pose, { height: 78 });
      if (animated || drawSprite(c, a.type, a.x, a.y + 17, { height: 78, flip: pose.flip })) {
        text(c, a.type === "guard" ? "盾衛" : "弓手", a.x, a.y + 29, 10, "#edf0bf");
        this.healthbar(a.x, a.y + 35, 35, a.hp / a.maxHp, "#9bd3b4");
        return;
      }
      c.save();
      c.translate(a.x, a.y);
      ellipse(c, 0, 11, 19, 8, "#112e2966");
      const guard = a.type === "guard";
      polygon(c, [[-10, -15], [10, -15], [14, 12], [-14, 12]], guard ? "#998254" : "#568675", "#25493b");
      ellipse(c, 0, -24, 10, 12, "#d2a375");
      if (guard) {
        polygon(c, [[-11, -26], [-9, -37], [8, -37], [11, -26]], "#bdcebb");
        polygon(c, [[1, -12], [20, -17], [20, 2], [11, 14], [1, 4]], "#728d6a", "#e5d5a3");
        line(c, [[-16, -33], [-16, 14]], "#d5caa1", 3);
      } else {
        polygon(c, [[-12, -26], [0, -41], [14, -27]], "#365e47");
        c.beginPath();
        c.arc(9, -9, 21, -1.25, 1.25);
        c.strokeStyle = "#e5cf98";
        c.lineWidth = 3;
        c.stroke();
        line(c, [[16, -29], [16, 11]], "#e5cf98", 1);
        line(c, [[-2, -8], [30, -8]], "#d9c394", 2);
      }
      text(c, guard ? "盾衛" : "弓手", 0, 27, 10, "#edf0bf");
      this.healthbar(0, 33, 35, a.hp / a.maxHp, "#9bd3b4");
      c.restore();
    }
    crystal(n) {
      const c = this.c, variant = Math.round(n.x * 3 + n.y * 5) % 7 / 7, height = 57 + variant * 7, rotation = (variant - 0.5) * 0.07;
      if (n.objectiveKind === "ore") {
        c.save();
        c.beginPath();
        c.arc(n.x, n.y, 34, 0, Math.PI * 2);
        c.setLineDash([7, 6]);
        c.strokeStyle = "#ffe18db8";
        c.lineWidth = 3;
        c.stroke();
        c.setLineDash([]);
        text(c, "限時熔晶", n.x, n.y + 42, 9, "#ffe9ae");
        c.restore();
      }
      ellipse(c, n.x, n.y + 11, 24, 8, "#142d2452");
      ellipse(c, n.x, n.y - 3, 27, 25, "#f6b52f13");
      if (drawSprite(c, "amber-crystal", n.x, n.y + 17, { height, anchorY: 0.91, rotation })) return;
      polygon(c, [[n.x - 13, n.y + 13], [n.x - 18, n.y - 7], [n.x - 5, n.y - 27], [n.x + 5, n.y - 9], [n.x + 2, n.y + 15]], "#d7a74c", "#6d713e");
      polygon(c, [[n.x - 5, n.y - 27], [n.x + 5, n.y - 9], [n.x + 2, n.y + 15], [n.x - 4, n.y + 5]], "#f0ce7a");
      polygon(c, [[n.x + 3, n.y + 11], [n.x + 9, n.y - 13], [n.x + 20, n.y - 4], [n.x + 17, n.y + 15]], "#edd17f", "#7c7944");
    }
    base(b, t, hatched = false) {
      const c = this.c;
      ellipse(c, b.x, b.y + 24, 61, 21, "#132b205c");
      ellipse(c, b.x, b.y + 3, 55, 42, hatched ? "#7bd9c217" : "#f3b84b17");
      if (hatched) {
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          polygon(c, [[b.x + Math.cos(a) * 31, b.y + Math.sin(a) * 18], [b.x + Math.cos(a - 0.16) * 51, b.y + Math.sin(a - 0.16) * 31], [b.x + Math.cos(a + 0.16) * 51, b.y + Math.sin(a + 0.16) * 31]], i % 2 ? "#c9b57b" : "#eee3bc", "#796f4c");
        }
        ellipse(c, b.x, b.y - 3, 31, 18, "#244f45");
        ellipse(c, b.x, b.y - 5, 22, 12, "#76c9b4");
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 2 / 5 + (this.reduced ? 0 : t * 0.18);
          ellipse(c, b.x + Math.cos(a) * 24, b.y - 5 + Math.sin(a) * 11, 3, 3, "#f7dda0");
        }
      }
      const painted = !hatched && drawSprite(c, "sacred-egg", b.x, b.y + 43, { height: 126 + (this.reduced ? 0 : Math.sin(t * 1.55) * 1.1) });
      if (!hatched && !painted) {
        ellipse(c, b.x, b.y, 51, 31, "#6b5c35");
        ellipse(c, b.x, b.y - 4, 43, 25, "#a2915a");
        ellipse(c, b.x, b.y - 7, 36, 19, "#405239");
        for (let i = 0; i < 9; i++) {
          let a = i / 9 * Math.PI * 2;
          line(c, [[b.x + Math.cos(a) * 42, b.y + Math.sin(a) * 24], [b.x + Math.cos(a + 0.6) * 48, b.y + Math.sin(a + 0.6) * 27]], "#c8b276", 4);
        }
        c.save();
        c.translate(b.x, b.y - 17);
        c.rotate(-0.15);
        ellipse(c, 0, 0, 21, 30, "#edf0cf");
        polygon(c, [[3, -19], [11, -9], [6, 0], [-2, -5]], "#b3c798");
        c.restore();
      }
      text(c, hatched ? "聖 獸 靈 巢" : "聖 獸 卵", b.x, b.y + 58, 12, "#fff0c8");
      this.healthbar(b.x, b.y + 68, 82, b.hp / b.maxHp, "#d9e5a9");
    }
    building(b, t, ghost = false) {
      const c = this.c;
      c.save();
      c.translate(b.x, b.y);
      if (ghost) c.globalAlpha = 0.6;
      ellipse(c, 0, 14, b.r + 9, 11, "#18322355");
      let painted = false;
      const recoil = ghost || this.reduced ? 0 : this.buildingRecoil?.get(b.id) || 0;
      if (b.type === "watchtower") painted = drawSprite(c, "building-watchtower", 0, 31 + recoil * 3, { height: 106 - recoil * 2 });
      if (b.type === "catapult") painted = drawSprite(c, "building-catapult", 0, 31 + recoil * 4, { height: 104 - recoil * 3 });
      if (["torch", "wall", "nest", "spring"].includes(b.type)) painted = drawSprite(c, `building-${b.type}`, 0, 28, { height: { torch: 104, wall: 87, nest: 90, spring: 96 }[b.type] });
      if (!painted && b.type === "torch") {
        polygon(c, [[-14, 14], [-11, -22], [9, -22], [15, 14]], "#93856b", "#586346");
        polygon(c, [[-11, -22], [0, -29], [9, -22], [-1, -14]], "#c3b585");
        line(c, [[-3, -12], [-3, 10]], "#b6a577", 3);
        polygon(c, [[-20, -26], [18, -26], [12, -15], [-14, -15]], "#b5a079", "#637450");
        const f = 2 + Math.sin(t * 12) * 3;
        polygon(c, [[-14, -28], [-16, -42], [-8, -51], [-5, -40], [2, -65 - f], [15, -45], [12, -29], [3, -22]], "#f6ae51");
        polygon(c, [[-8, -27], [-6, -42], [1, -35], [5, -50], [10, -35], [5, -24]], "#ffe7a7");
        ellipse(c, 0, -29, 38, 32, "#fac57411");
      }
      if (!painted && b.type === "wall") {
        for (let i = -1; i <= 1; i++) {
          let x = i * 20;
          polygon(c, [[x - 7, 10], [x - 6, -25], [x, -40 - Math.abs(i) * -9], [x + 7, -25], [x + 7, 10]], "#ddd7b4", "#7a7f52");
          line(c, [[x - 1, -24], [x - 1, 8]], "#f6ebc6", 2);
        }
        line(c, [[-34, -12], [32, -7]], "#8e744a", 8);
        line(c, [[-33, -14], [31, -9]], "#baa06b", 2);
        for (let i = -1; i <= 1; i++) line(c, [[i * 20 - 3, -17], [i * 20 + 2, -4]], "#d1b77c", 2);
      }
      if (!painted && b.type === "nest") {
        ellipse(c, 0, 3, 28, 18, "#88744a");
        ellipse(c, 0, -2, 23, 13, "#5b683e");
        line(c, [[-24, 3], [-10, 15], [17, 10], [25, 2]], "#c2ae6c", 4);
        ellipse(c, -8, -7, 10, 14, "#e6e2b6");
        ellipse(c, 9, -5, 9, 12, "#c4d09d");
        ellipse(c, -7, -10, 3, 3, "#b4bc85");
      }
      if (!painted && b.type === "spring") {
        ellipse(c, 0, 5, 31, 20, "#829787");
        ellipse(c, 0, 1, 25, 14, "#67adb1");
        ellipse(c, 0, -1, 18, 8, "#90d1cb");
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.ellipse(0, 1, 10 + i * 5 + Math.sin(t * 3 + i), 4 + i * 2, 0, 0, Math.PI * 2);
          c.strokeStyle = "#c8f0db66";
          c.lineWidth = 1.5;
          c.stroke();
        }
        polygon(c, [[-7, -8], [-4, -24], [0, -36], [6, -24], [9, -10], [1, -3]], "#b5e5d8");
      }
      if (!ghost) {
        for (let i = 0; i < b.level; i++) ellipse(c, (i - (b.level - 1) / 2) * 8, 27, 2.2, 2.2, "#f4d598");
        if (b.hp < b.maxHp) this.healthbar(0, 34, 42, b.hp / b.maxHp, "#cfdbad");
      }
      c.restore();
    }
    actorPose(key, actor2, t, stride = 82) {
      if (!this.actorMotions.has(key)) this.actorMotions.set(key, new ActorMotion({ stride }));
      return this.actorMotions.get(key).update(actor2, t, { reduced: this.reduced });
    }
    hero(h, t) {
      const c = this.c, pose = this.walkArt.update(h, t, { reduced: this.reduced });
      ellipse(c, h.x, h.y + 13, 23, 9, "#14261765");
      if (drawRanger(c, h, t, { moving: pose.moving, step: this.walkArt.step, reduced: this.reduced, pose })) return;
      c.save();
      c.translate(h.x, h.y);
      if (h.invulnerable > 0 && Math.floor(t * 20) % 2) c.globalAlpha = 0.55;
      const facing = Math.cos(h.angle) >= 0 ? 1 : -1;
      c.scale(facing, 1);
      const bob = h.dashTime > 0 ? 0 : Math.sin(t * 5) * 0.8;
      c.translate(0, bob);
      polygon(c, [[-10, -20], [-22, 8], [2, 15], [14, -7], [9, -23]], "#34766b", "#17463b");
      polygon(c, [[-10, -20], [-19, 8], [-10, 4], [-3, -20]], "#619887");
      line(c, [[-6, 4], [-9, 15]], "#573f2b", 9);
      line(c, [[7, 3], [10, 14]], "#67472e", 9);
      ellipse(c, -8, 15, 7, 4, "#3c3b29");
      ellipse(c, 11, 15, 7, 4, "#3c3b29");
      polygon(c, [[-10, -21], [8, -22], [13, 4], [-8, 6]], "#ad7f4d", "#73583a");
      line(c, [[-10, -17], [9, -2]], "#ead9a5", 4);
      ellipse(c, 0, -30, 14, 16, "#c99362");
      polygon(c, [[-15, -29], [-14, -40], [-5, -48], [8, -44], [15, -32], [7, -36], [0, -38], [-7, -27]], "#3c3427");
      line(c, [[-13, -34], [10, -38]], "#b9d3a5", 3);
      ellipse(c, 8, -30, 2, 2, "#273023");
      ellipse(c, 5, -22, 4, 2, "#dca278");
      line(c, [[8, -17], [22, -10]], "#c38d5d", 7);
      c.save();
      c.translate(21, -10);
      c.rotate(h.swing > 0 ? -0.55 : 0.15);
      if (h.weapon === "spear") {
        line(c, [[0, -26], [0, 25]], "#c5aa73", 4);
        polygon(c, [[0, -43], [-6, -25], [0, -20], [7, -26]], "#f1e5ba", "#8e9774");
      } else if (h.weapon === "bow") {
        c.beginPath();
        c.moveTo(-4, -29);
        c.quadraticCurveTo(20, 0, -4, 29);
        c.quadraticCurveTo(-12, 0, -4, -29);
        c.strokeStyle = "#e1ca8c";
        c.lineWidth = 4;
        c.stroke();
        line(c, [[-6, -28], [-6, 28]], "#eee6c8", 1.5);
        line(c, [[-6, 0], [25, 0]], "#c5aa73", 3);
      } else if (h.weapon === "blades") {
        line(c, [[-7, -24], [5, 25]], "#e8dfbb", 5);
        line(c, [[8, -24], [-2, 25]], "#e8dfbb", 5);
        line(c, [[-13, 12], [11, 12]], "#c79a5d", 4);
      } else if (h.weapon === "hammer") {
        line(c, [[0, -12], [0, 27]], "#a47b4c", 7);
        polygon(c, [[-19, -30], [19, -30], [23, -10], [-23, -10]], "#ddd3aa", "#80876d");
      } else {
        line(c, [[0, -26], [0, 25]], "#c5aa73", 4);
        polygon(c, [[-1, -28], [15, -32], [23, -17], [14, -10], [0, -14]], "#e5d9ac", "#92997a");
      }
      c.restore();
      c.restore();
      const v = { x: h.x + Math.cos(h.angle) * 37, y: h.y + Math.sin(h.angle) * 37 };
      this.c.strokeStyle = "#e6eab57a";
      this.c.lineWidth = 2;
      this.c.beginPath();
      this.c.arc(h.x, h.y, 34, h.angle - 0.25, h.angle + 0.25);
      this.c.stroke();
    }
    enemy(e, t) {
      const c = this.c, size = ENEMY_SIZE[e.type] || 78, stride = { raptor: 62, spitter: 74, brute: 92, matriarch: 124, charger: 142, boss: 130 }[e.type], pose = this.actorPose("enemy-" + e.id, e, t, stride), flip = pose.flip;
      const cycle = pose.phase * Math.PI * 2, moving = pose.amount, maxWind = { boss: 1.1, charger: 1, matriarch: 0.9 }[e.type] || 0.6, wind = e.windup > 0 ? Math.max(0, Math.min(1, 1 - e.windup / maxWind)) : 0, attackPulse = Math.sin(wind * Math.PI);
      let lift = 0, sx = 1, sy = 1, rot = 0;
      if (!this.reduced && moving) {
        if (e.type === "raptor") {
          lift = Math.max(0, Math.sin(cycle)) * 4.2 * moving;
          rot = Math.sin(cycle) * 0.035 * moving;
          sx += Math.cos(cycle) * 0.022 * moving;
          sy -= Math.cos(cycle) * 0.018 * moving;
        } else if (e.type === "spitter") {
          lift = (1 - Math.cos(cycle)) * 1.3 * moving;
          rot = Math.sin(cycle) * 0.025 * moving;
          sx += Math.sin(cycle) * 0.018 * moving;
          sy -= Math.sin(cycle) * 0.012 * moving;
        } else {
          lift = Math.max(0, Math.sin(cycle)) * 1.6 * moving;
          rot = Math.sin(cycle) * 0.014 * moving;
          sx += Math.cos(cycle) * 0.012 * moving;
          sy -= Math.cos(cycle) * 0.01 * moving;
        }
      }
      if (e.windup > 0 && !this.reduced) {
        sx += attackPulse * (e.type === "spitter" || e.type === "matriarch" ? 0.08 : 0.055);
        sy -= attackPulse * (e.type === "spitter" || e.type === "matriarch" ? 0.1 : 0.06);
        rot += (flip ? -1 : 1) * attackPulse * (e.type === "boss" || e.type === "charger" ? 0.025 : 0.045);
      }
      if (e.flash > 0 && !this.reduced) {
        sx *= 1.055;
        sy *= 0.945;
      }
      const lunge = this.reduced ? 0 : attackPulse * ({ raptor: 14, brute: 8, spitter: 4, matriarch: 6, charger: 16, boss: 10 }[e.type] || 6), dx = Math.cos(e.angle) * lunge, dy = Math.sin(e.angle) * lunge * 0.58, boss = Boolean(BOSS_NAMES[e.type]);
      ellipse(c, e.x + dx * 0.35, e.y + e.r + 7, (boss ? 59 : e.type === "brute" ? 37 : 25) * (1 - lift * 8e-3), boss ? 17 : 10, "#10251d69");
      c.save();
      c.translate(e.x + dx, e.y + dy - lift);
      c.rotate(rot);
      c.scale(sx, sy);
      const painted = drawSprite(c, `enemy-${e.type}`, 0, e.r + 9, { height: size, flip, alpha: e.flash > 0 ? 0.58 : 1 });
      c.restore();
      if (painted) {
        if (e.burn > 0) text(c, "♨", e.x, e.y - e.r - 18, 18, "#ffc272");
        if (e.hp < e.maxHp) this.healthbar(e.x, e.y + e.r + 13, boss ? 104 : e.type === "brute" ? 48 : 38, e.hp / e.maxHp, boss ? "#f4b05f" : "#e6a179");
        return;
      }
      c.save();
      c.translate(e.x, e.y);
      const scale = boss ? 2.2 : e.type === "brute" ? 1.3 : 1;
      c.scale(scale, scale);
      const face = flip ? -1 : 1;
      c.scale(face, 1);
      ellipse(c, 0, 11, 22, 9, "#213f2859");
      let body = e.type === "brute" ? "#917052" : e.type === "spitter" || e.type === "matriarch" ? "#977f72" : e.type === "charger" ? "#8c704f" : e.type === "boss" ? "#956747" : "#b48f63";
      if (e.flash > 0) body = "#f5e9ca";
      polygon(c, [[-14, -3], [-38, -16], [-27, 3], [-11, 8]], body, "#575f3c");
      ellipse(c, 0, 0, 21, 14, body);
      ellipse(c, 16, -9, 17, 13, body);
      ellipse(c, 25, -5, 12, 7, body);
      polygon(c, [[9, -20], [4, -34], [18, -21]], "#d3be85");
      ellipse(c, 21, -13, 3, 3, "#273220");
      ellipse(c, 22, -14, 1, 1, "#f9dfa0");
      line(c, [[28, -3], [35, -3]], "#624f39", 2);
      line(c, [[-10, 8], [-14, 19]], body, 8);
      line(c, [[9, 7], [15, 17]], body, 7);
      for (let i = 0; i < 3; i++) polygon(c, [[-17 + i * 9, -10], [-17 + i * 9, -18], [-8 + i * 9, -12]], "#6a784b");
      if (e.type === "brute" || boss) {
        ellipse(c, -2, -1, 17, 10, "#717d52");
        line(c, [[-13, -5], [8, 7]], "#a0a478", 3);
      }
      if (e.type === "spitter" || e.type === "matriarch") ellipse(c, 26, 0, 6, 5, "#b8d36d");
      c.restore();
      if (e.burn > 0) {
        text(c, "♨", e.x, e.y - e.r - 10, 18, "#ffc272");
      }
      if (e.hp < e.maxHp) this.healthbar(e.x, e.y + e.r + 10, boss ? 90 : 35, e.hp / e.maxHp, boss ? "#f4b05f" : "#e6a179");
    }
    weakpoint(e, t) {
      const c = this.c, w = e.weakpoint, d = BOSS_WEAKPOINTS[e.type];
      if (!w || !d) return;
      c.save();
      if (w.broken) {
        c.globalAlpha = 0.72;
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + 0.4;
          polygon(c, [[w.x + Math.cos(a) * 5, w.y + Math.sin(a) * 3], [w.x + Math.cos(a - 0.35) * 15, w.y + Math.sin(a - 0.35) * 10], [w.x + Math.cos(a + 0.35) * 13, w.y + Math.sin(a + 0.35) * 9]], "#75664d");
        }
        c.restore();
        return;
      }
      const pulse = this.reduced ? 0 : Math.sin(t * 7) * 3;
      if (w.open) {
        c.beginPath();
        c.arc(w.x, w.y, w.r + 10 + pulse, 0, Math.PI * 2);
        c.fillStyle = `${d.color}25`;
        c.fill();
        c.strokeStyle = d.color;
        c.lineWidth = 3;
        c.setLineDash([6, 5]);
        c.stroke();
        c.setLineDash([]);
      }
      polygon(c, [[w.x, w.y - w.r], [w.x + w.r * 0.8, w.y], [w.x, w.y + w.r], [w.x - w.r * 0.8, w.y]], w.open ? d.color : "#6d705b", w.open ? "#fff0b1" : "#a69d76");
      ellipse(c, w.x - 3, w.y - 4, 4, 4, w.open ? "#fff6c7" : "#8c8d76");
      if (w.open) {
        text(c, w.name, w.x, w.y - w.r - 14, 10, "#fff0ba");
        this.healthbar(w.x, w.y + w.r + 10, 52, w.hp / w.maxHp, d.color);
      }
      c.restore();
    }
    pet(p, t) {
      const c = this.c;
      ellipse(c, p.x, p.y + 11, 24, 9, "#132a254f");
      if (drawSprite(c, "pet", p.x, p.y + 14, { height: 47, rotation: this.reduced ? 0 : Math.sin(t * 3) * 0.015 })) return;
      c.save();
      c.translate(p.x, p.y);
      c.scale(0.72, 0.72);
      ellipse(c, 0, 10, 22, 9, "#17392440");
      polygon(c, [[-15, -1], [-33, -9], [-28, 5], [-11, 10]], "#8ca56e");
      ellipse(c, 0, 0, 21, 15, "#92b77c");
      ellipse(c, 15, -9, 17, 15, "#a6c98a");
      polygon(c, [[22, -18], [31, -29], [29, -13]], "#ede2b7");
      polygon(c, [[9, -23], [9, -32], [15, -21]], "#ede2b7");
      ellipse(c, 23, -8, 2.5, 3, "#27462e");
      line(c, [[-10, 10], [-12, 17]], "#6f915a", 7);
      line(c, [[9, 9], [12, 16]], "#6f915a", 7);
      c.restore();
    }
    companion(p, t, camp = false) {
      const c = this.c, d = COMPANIONS[p.type];
      if (!d) return;
      const moving = Math.hypot(p.vx || 0, p.vy || 0) > 0.5, bob = this.reduced ? 0 : Math.sin(t * (moving ? 8 : 3.2)) * 1.5, flip = Math.cos(p.angle || 0) < 0, height = (camp ? 92 : 74) + Math.min(18, (p.level - 1) * 2);
      ellipse(c, p.x, p.y + 14, height * 0.3, 10, "#132a2558");
      if (!drawSprite(c, `companion-${p.type}`, p.x, p.y + 18 + bob, { height, flip })) {
        this.pet(p, t);
        return;
      }
      if (!camp) {
        text(c, `${d.name} · Lv.${p.level}`, p.x, p.y + 33, 9, "#f7e8b6");
        this.healthbar(p.x, p.y + 39, 43, p.hp / p.maxHp, d.color);
      }
    }
    objectiveGround(o, t) {
      if (!o) return;
      const c = this.c, pulse = this.reduced ? 0 : (Math.sin(t * 4) + 1) * 0.5;
      c.save();
      c.lineWidth = 3;
      c.setLineDash([10, 10]);
      c.lineDashOffset = this.reduced ? 0 : -t * 18;
      if (o.type === "escort" && !o.npc.reached) {
        c.beginPath();
        c.moveTo(o.npc.x, o.npc.y);
        for (let i = o.npc.waypoint; i < ESCORT_PATH2.length; i++) c.lineTo(ESCORT_PATH2[i].x, ESCORT_PATH2[i].y);
        c.strokeStyle = "#a9e1b58f";
        c.stroke();
      }
      const rings = o.type === "rescue" ? [o.captive] : o.type === "strongholds" ? o.points : o.type === "destroy" ? o.targets : [];
      for (const actor2 of rings) {
        if (actor2.hp <= 0 && o.type !== "rescue") continue;
        c.beginPath();
        c.arc(actor2.x, actor2.y, actor2.r + 18 + pulse * 4, 0, Math.PI * 2);
        c.strokeStyle = o.type === "destroy" ? "#ef9567b0" : o.type === "rescue" ? "#8ed8bda8" : "#e7d184a8";
        c.stroke();
      }
      c.setLineDash([]);
      c.restore();
    }
    objectiveActor(a, o, t) {
      const c = this.c;
      if (a.objectiveKind === "escort") {
        ellipse(c, a.x, a.y + 13, 23, 8, "#10251d65");
        const pose = this.actorPose("objective-" + a.id, a, t, 75);
        drawCharacter(c, "hunter", a.x, a.y + 13, pose, { height: 76 });
        text(c, "採集師", a.x, a.y + 33, 10, "#d9f0c8");
        this.healthbar(a.x, a.y + 40, 46, a.hp / a.maxHp, "#9bd3b4");
        return;
      }
      if (a.objectiveKind === "captive") {
        ellipse(c, a.x, a.y + 13, 25, 9, "#10251d65");
        if (!o.rescued) {
          const pose = this.actorPose("objective-" + a.id, a, t, 75);
          drawCharacter(c, "hunter", a.x, a.y + 13, pose, { height: 72 });
          for (const x of [-22, -7, 8, 23]) line(c, [[a.x + x, a.y - 43], [a.x + x, a.y + 24]], "#c7b986", 4);
          line(c, [[a.x - 25, a.y - 43], [a.x + 26, a.y - 43]], "#ece0b4", 5);
          text(c, "救援中", a.x, a.y + 42, 10, "#c8ead2");
        } else text(c, "已獲救", a.x, a.y + 8, 11, "#bde5c8");
        return;
      }
      if (a.objectiveKind === "nest") {
        ellipse(c, a.x, a.y + 15, 38, 13, "#281d176b");
        for (let i = 0; i < 7; i++) {
          const angle = i / 7 * Math.PI * 2;
          polygon(c, [[a.x + Math.cos(angle) * 16, a.y + Math.sin(angle) * 9], [a.x + Math.cos(angle - 0.13) * 38, a.y + Math.sin(angle - 0.13) * 28 - 8], [a.x + Math.cos(angle + 0.13) * 35, a.y + Math.sin(angle + 0.13) * 24]], i % 2 ? "#b38a58" : "#ddc58d", "#604933");
        }
        ellipse(c, a.x, a.y, 25, 18, "#674b38");
        ellipse(c, a.x, a.y - 3, 16, 10, "#302821");
        text(c, "敵對獸巢", a.x, a.y + 45, 10, "#ffd0ad");
        this.healthbar(a.x, a.y + 52, 58, a.hp / a.maxHp, "#e58d65");
        return;
      }
      if (a.objectiveKind === "stronghold") {
        ellipse(c, a.x, a.y + 16, 37, 12, "#10251d69");
        polygon(c, [[a.x - 19, a.y + 14], [a.x - 12, a.y - 28], [a.x, a.y - 45], [a.x + 13, a.y - 27], [a.x + 20, a.y + 14]], "#9d986d", "#e4d39a");
        polygon(c, [[a.x - 7, a.y - 20], [a.x, a.y - 34], [a.x + 8, a.y - 20], [a.x, a.y - 8]], "#d6bd6d");
        text(c, a.label, a.x, a.y + 37, 9, "#f0e2b0");
        this.healthbar(a.x, a.y + 44, 54, a.hp / a.maxHp, "#d8ce83");
      }
    }
    telegraph(e) {
      const c = this.c;
      c.save();
      if (e.type === "charger") {
        c.beginPath();
        c.moveTo(e.x, e.y);
        c.lineTo(e.lockX, e.lockY);
        c.strokeStyle = "#e9864b32";
        c.lineWidth = e.r * (e.bossPhase === 2 ? 1.58 : 1.25);
        c.lineCap = "round";
        c.stroke();
        c.setLineDash([8, 7]);
        line(c, [[e.x, e.y], [e.lockX, e.lockY]], "#ffc085c7", 3);
        c.setLineDash([]);
      } else {
        const r = e.type === "boss" ? e.bossPhase === 2 ? 122 : e.bossPhase === 1 ? 108 : 84 : e.type === "matriarch" && e.attackKind === "brood-pool" ? e.bossPhase === 2 ? 118 : 94 : e.type === "matriarch" ? 24 : e.type === "spitter" ? 17 : 30;
        c.beginPath();
        c.arc(e.lockX, e.lockY, r, 0, Math.PI * 2);
        c.fillStyle = e.type === "matriarch" ? "#a8cf5d2e" : "#e879502b";
        c.fill();
        c.strokeStyle = e.type === "matriarch" ? "#d8ee8fc0" : "#ffad80b3";
        c.lineWidth = 2;
        c.setLineDash([5, 5]);
        c.stroke();
        c.setLineDash([]);
        if (e.type === "boss" && e.bossPhase === 2) {
          c.beginPath();
          c.arc(e.lockX, e.lockY, 176, 0, Math.PI * 2);
          c.strokeStyle = "#ffd078b8";
          c.lineWidth = 4;
          c.setLineDash([12, 8]);
          c.stroke();
          c.setLineDash([]);
        }
        if (e.type === "spitter" || e.type === "matriarch") line(c, [[e.x, e.y], [e.lockX, e.lockY]], e.type === "matriarch" ? "#cde68b7d" : "#ecc38465", 2);
      }
      c.restore();
    }
    projectile(p) {
      const c = this.c;
      if (p.kind === "shock-field") {
        const a = clamp(p.life / p.maxLife, 0, 1), pulse = 0.55 + 0.1 * Math.sin(p.life * 7), g = c.createRadialGradient(p.x, p.y, 10, p.x, p.y, p.radius);
        g.addColorStop(0, `rgba(129,207,181,${0.16 * a})`);
        g.addColorStop(0.72, `rgba(114,190,168,${0.1 * a})`);
        g.addColorStop(1, "rgba(93,169,151,0)");
        c.fillStyle = g;
        c.beginPath();
        c.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        c.fill();
        c.save();
        c.globalAlpha = a;
        c.beginPath();
        c.arc(p.x, p.y, p.radius * pulse, 0, Math.PI * 2);
        c.strokeStyle = "#b9ead1";
        c.lineWidth = 3;
        c.setLineDash([9, 10]);
        c.stroke();
        c.setLineDash([]);
        c.restore();
        return;
      }
      if (p.hostile) {
        ellipse(c, p.x, p.y, 8, 8, "#bad56b");
        ellipse(c, p.x - 2, p.y - 2, 3, 3, "#e1f19a");
        return;
      }
      if (p.kind === "catapult") {
        const progress = clamp(1 - p.life / p.maxLife, 0, 1), lift = Math.sin(progress * Math.PI) * 78;
        ellipse(c, p.x, p.y + 6, 11 * (1 - lift / 260), 5 * (1 - lift / 260), "#142a205c");
        c.save();
        c.translate(p.x, p.y - lift);
        c.rotate(progress * Math.PI * 3);
        ellipse(c, 0, 0, 11, 9, "#e7a632");
        polygon(c, [[-7, -6], [-1, -11], [8, -7], [10, 2], [3, 9], [-8, 6]], "#efb743", "#8b6732");
        ellipse(c, -2, -3, 4, 3, "#fff0a2");
        c.restore();
        return;
      }
      if (p.kind === "companion-tide") {
        ellipse(c, p.x, p.y, 12, 12, "#65d7d2");
        ellipse(c, p.x - 2, p.y - 2, 6, 6, "#d9fff3");
        c.beginPath();
        c.arc(p.x, p.y, 17, 0, Math.PI * 2);
        c.strokeStyle = "#a9f3e5a0";
        c.stroke();
        return;
      }
      c.save();
      c.translate(p.x, p.y);
      c.rotate(Math.atan2(p.vy, p.vx));
      if (p.kind === "tower-bolt") {
        line(c, [[-13, 0], [9, 0]], "#d9c493", 3);
        polygon(c, [[17, 0], [7, -5], [9, 0], [7, 5]], "#f1e4c1");
        line(c, [[-14, -4], [-7, 0], [-14, 4]], "#b5a675", 2);
        c.restore();
        return;
      }
      if (p.kind === "arrow") {
        line(c, [[-17, 0], [10, 0]], "#d9c493", 2.5);
        polygon(c, [[18, 0], [8, -4], [10, 0], [8, 4]], "#edf0ce");
        line(c, [[-17, -4], [-10, 0], [-17, 4]], "#a9c48c", 2);
        c.restore();
        return;
      }
      if (p.kind === "quake-wave") {
        c.globalAlpha = 0.82;
        polygon(c, [[-24, -27], [18, -20], [31, 0], [18, 20], [-24, 27], [-10, 0]], "#d2a654", "#f1d28b");
        line(c, [[-18, -15], [13, -8], [22, 0], [10, 9], [-18, 16]], "#ffe6a4", 3);
        c.restore();
        return;
      }
      if (drawSprite(c, "spear", 0, 0, { height: 42, anchorY: 0.5, rotation: Math.PI / 2 })) {
        if (p.fire) {
          line(c, [[-33, 0], [-16, 0]], "#ed985a99", 5);
          line(c, [[-28, -2], [-13, 0]], "#ffe6a9", 2);
        }
        c.restore();
        return;
      }
      line(c, [[-19, 0], [9, 0]], p.fire ? "#ffba63" : "#dbc597", 3);
      polygon(c, [[17, 0], [5, -5], [7, 0], [5, 5]], p.fire ? "#ffe6a9" : "#f4ebce");
      if (p.fire) {
        line(c, [[-35, -3], [-18, 0]], "#ec935a88", 4);
        line(c, [[-29, 5], [-15, 0]], "#ffd17d88", 3);
      }
      c.restore();
    }
    effect(f) {
      const c = this.c;
      const a = clamp(f.life / f.maxLife, 0, 1), age = 1 - a;
      c.save();
      c.globalAlpha = a;
      if (f.kind === "text") {
        text(c, f.text, f.x, f.y - age * 32, 15, f.color, 700);
      } else if (f.kind === "beam") {
        line(c, [[f.x, f.y], [f.tx, f.ty]], f.color, 3);
      } else if (f.kind === "muzzle") {
        c.save();
        c.translate(f.x, f.y);
        c.rotate(f.angle);
        polygon(c, [[0, 0], [-12, -7], [5, -3], [17, 0], [5, 3], [-12, 7]], f.color);
        ellipse(c, 3, 0, 4, 4, "#fff7ce");
        c.restore();
      } else if (f.kind === "launch-dust") {
        for (let i = 0; i < 5; i++) {
          const an = i * Math.PI * 2 / 5 + 0.4, r = f.r * age;
          ellipse(c, f.x + Math.cos(an) * r, f.y + Math.sin(an) * r * 0.35, 5 * (1 - age) + 2, 3 * (1 - age) + 1, f.color);
        }
      } else if (f.kind === "slash") {
        c.beginPath();
        c.arc(f.x, f.y, f.r * (0.6 + age * 0.4), f.angle - f.spread, f.angle + f.spread);
        c.lineWidth = 7 * (1 - age) + 2;
        c.strokeStyle = f.color;
        c.stroke();
      } else if (f.kind === "trail") {
        ellipse(c, f.x, f.y, 12, 16, f.color);
      } else if (f.kind === "enemy-death") {
        const size = ENEMY_SIZE[f.type] || 78, flip = Math.cos(f.angle || 0) < 0;
        ellipse(c, f.x, f.y + (f.r || 20) + 8, Math.max(12, (f.r || 20) * (1 - age * 0.55)), 7, "#10251d55");
        c.save();
        c.translate(f.x, f.y + age * 15);
        c.rotate((flip ? -1 : 1) * age * 0.38);
        c.scale(1 + age * 0.08, 1 - age * 0.35);
        drawSprite(c, `enemy-${f.type}`, 0, (f.r || 20) + 9, { height: size, flip, alpha: a });
        c.restore();
      } else {
        const r = f.r * (0.25 + age * 0.75);
        c.beginPath();
        c.arc(f.x, f.y, r, 0, Math.PI * 2);
        c.strokeStyle = f.color;
        c.lineWidth = f.kind === "burst" ? 6 : 2;
        c.stroke();
        for (let i = 0; i < 7; i++) {
          let an = i * Math.PI * 2 / 7;
          ellipse(c, f.x + Math.cos(an) * r, f.y + Math.sin(an) * r, 3 * (1 - age) + 1, 3 * (1 - age) + 1, f.color);
        }
      }
      c.restore();
    }
    preview(g, p) {
      const c = this.c;
      const type = g.hand[p.slot];
      if (!type) return;
      const target = g.placement(p.slot, p.x, p.y);
      const x = target.ok ? target.x : p.x, y = target.ok ? target.y : p.y;
      c.save();
      c.beginPath();
      c.arc(x, y, DEPLOY_CARDS[type].range, 0, Math.PI * 2);
      c.fillStyle = target.ok ? "#ddec9d15" : "#d3666618";
      c.fill();
      c.strokeStyle = target.ok ? "#edeca0c4" : "#ef9c85";
      c.setLineDash([6, 6]);
      c.lineWidth = 2;
      c.stroke();
      c.setLineDash([]);
      if (HIRES[type]) {
        c.globalAlpha = 0.65;
        this.ally({ x, y, type, hp: 1, maxHp: 1 }, g.time);
        c.globalAlpha = 1;
      } else this.building({ x, y, type, r: CARDS[type].radius }, g.time, true);
      text(c, target.ok ? target.hire ? "放開派遣" : target.upgrade ? "疊卡升級" : "放開建造" : target.reason, x, Math.min(720, y + 62), 13, target.ok ? "#fef2c0" : "#ffc1a1");
      c.restore();
    }
    healthbar(x, y, w, v, color) {
      const c = this.c;
      c.fillStyle = "#193322bf";
      c.fillRect(x - w / 2, y, w, 4);
      c.fillStyle = color;
      c.fillRect(x - w / 2, y, w * clamp(v, 0, 1), 4);
    }
  };

  // prototypes/emberwild/shop.mjs
  var SHOP_PAYMENT_COPY = "僅在 iOS App 內使用 App Store 付款；實際金額與幣別以系統付款頁為準。未驗證成功不會發放卡牌。";
  var SHOP_CURRENCY = Object.freeze({ id: "ingot", name: "晶錠", balance: 0 });
  var SHOP_PACKS = Object.freeze([
    Object.freeze({
      id: "pack-fortify",
      productId: "pbm_tier_099",
      goodsId: 910001,
      name: "新手防線禮包",
      priceLabel: "以系統顯示為準",
      art: "shop-pack-fortify",
      tag: "新手限定 · 一次",
      copies: 2,
      limit: "once",
      promotion: "starter",
      cards: Object.freeze(["watchtower", "catapult", "wall"]),
      description: "獵脊弩台、琥珀投獸器與裂骨牆各兩張，發放到目前遠征。"
    }),
    Object.freeze({
      id: "pack-hire",
      productId: "pbm_tier_199",
      goodsId: 910003,
      name: "遊獵契約包",
      priceLabel: "以系統顯示為準",
      art: "shop-pack-hire",
      tag: "傭兵卡包",
      copies: 3,
      cards: Object.freeze(["hunter", "guard"]),
      description: "遊獵弓手與骨盾守衛各三張，補強遠征隊伍。"
    }),
    Object.freeze({
      id: "pack-scout",
      productId: "pbm_tier_299",
      goodsId: 910004,
      name: "探索者補給",
      priceLabel: "以系統顯示為準",
      art: "shop-pack-fortify",
      tag: "攻防混合",
      copies: 2,
      cards: Object.freeze(["watchtower", "catapult", "spring", "hunter"]),
      description: "建造與傭兵混合補給，每種各兩張。"
    }),
    Object.freeze({
      id: "pack-relic",
      productId: "pbm_tier_499",
      goodsId: 910002,
      name: "每週荒境禮包",
      priceLabel: "以系統顯示為準",
      art: "shop-pack-relic",
      tag: "每週限定 · 一次",
      copies: 3,
      limit: "weekly",
      promotion: "weekly",
      cards: Object.freeze(["watchtower", "catapult", "spring", "hunter"]),
      description: "建造與僱傭混合卡組，含潮汐泉，每種各三張。"
    }),
    Object.freeze({
      id: "pack-titan",
      productId: "pbm_tier_999",
      goodsId: 910005,
      name: "泰坦遠征箱",
      priceLabel: "以系統顯示為準",
      art: "shop-pack-relic",
      tag: "大型遠征補給",
      copies: 5,
      cards: Object.freeze(["watchtower", "catapult", "wall", "spring", "hunter", "guard"]),
      description: "六種核心建造與傭兵卡各五張，適合長線遠征。"
    })
  ]);
  function offerWeekKey(time = Date.now()) {
    const date = new Date(time), utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
    const year = utc.getUTCFullYear(), start = new Date(Date.UTC(year, 0, 1));
    return `${year}-W${String(Math.ceil(((utc - start) / 864e5 + 1) / 7)).padStart(2, "0")}`;
  }
  function offerAvailable(offer, transactions = [], time = Date.now()) {
    if (!offer) return false;
    const records = Array.isArray(transactions) ? transactions : [];
    if (offer.limit === "once") return !records.some((item) => item.offerId === offer.id);
    if (offer.limit === "weekly") return !records.some((item) => item.offerId === offer.id && offerWeekKey(item.deliveredAt) === offerWeekKey(time));
    return true;
  }
  function shopOffer(id) {
    const pack = SHOP_PACKS.find((item) => item.id === id);
    return pack || null;
  }
  function offerContents(offer) {
    return offer.cards.map((id) => `${DEPLOY_CARDS[id]?.name || id} ×${offer.copies}`).join(" · ");
  }
  function offerRewardChips(offer) {
    return offer.cards.map((id) => `<span>${DEPLOY_CARDS[id]?.name || id}<b>×${offer.copies}</b></span>`).join("");
  }
  var shopCrest = () => `<svg class="shop-crest" viewBox="0 0 72 72" aria-hidden="true"><path d="M36 4 55 14l9 20-9 24-19 10-19-10L8 34l9-20Z"/><path d="m36 14 7 14 14 7-14 7-7 16-7-16-14-7 14-7Z"/><circle cx="36" cy="35" r="5"/></svg>`;
  function shopCatalogHTML(artFor, transactions = []) {
    return `<section class="shop-store" aria-label="卡包支付">
    <header class="shop-pay-head">
      <span class="shop-brand-seal">${shopCrest()}</span>
      <div class="shop-head-copy"><small>原始文明：聖獸覺醒</small><b>荒境遠征補給站</b><p>挑選需要的卡牌補給，再由 App Store 顯示本地價格。</p></div>
      <div class="shop-wallet"><span>安全付款</span><b></b><small>App Store</small></div>
    </header>
    <div class="shop-guard"><span aria-hidden="true">◆</span><p><b>補給只在伺服器驗證付款後發放</b><small>取消、待確認或驗證失敗都不會扣除卡牌額度。</small></p></div>
    <div class="shop-grid" aria-label="遠征補給商品">${SHOP_PACKS.map((offer, index) => {
      const available = offerAvailable(offer, transactions);
      return `<article class="shop-pack tier-${index + 1}${available ? "" : " sold"}" data-product-id="${offer.productId}">
      <span class="shop-ribbon">${offer.tag}</span>
      <div class="shop-pack-art-wrap">${artFor(offer)}<span class="shop-price-tag">${index === 0 ? "推薦" : offer.limit === "weekly" ? "每週" : "補給"}</span></div>
      <div class="shop-pack-copy"><small>遠征物資箱 · ${String(index + 1).padStart(2, "0")}</small><h3>${offer.name}</h3><p>${offer.description}</p></div>
      <div class="shop-reward-chips" aria-label="禮包內容">${offerRewardChips(offer)}</div>
      <button type="button" class="shop-pay-btn" data-shop-offer="${offer.id}" ${available ? "" : "disabled"}><span><i>${available ? "APP STORE" : "LIMIT REACHED"}</i><b>${available ? "查看價格並購買" : offer.limit === "weekly" ? "本週已購買" : "新手禮包已購買"}</b></span><em aria-hidden="true">›</em></button>
    </article>`;
    }).join("")}</div>
    <p class="shop-disclaimer">${SHOP_PAYMENT_COPY}</p>
  </section>`;
  }
  function shopCheckoutHTML(offer, phase = "confirm", orderId = "", art = "", detail = "") {
    if (!offer) return "";
    const pending = phase === "pending", done = phase === "done", failed = phase === "error";
    const title = done ? "發放完成" : failed ? "未完成付款" : pending ? "正在等待 App Store" : "確認支付";
    const copy = detail || (done ? "付款已由伺服器驗證，卡牌已存入目前遠征。" : failed ? "沒有發放卡牌；如已收到扣款通知，請勿重複購買。" : pending ? "請在系統付款頁完成操作，不要重複點擊。" : `將購買「${offer.name}」，實際金額以 App Store 顯示為準。`);
    const actions = done || failed ? '<button type="button" class="shop-pay-btn" data-action="shop-done">完成 · 返回商店</button>' : `<button type="button" class="shop-pay-btn" data-action="shop-confirm" ${pending ? "disabled" : ""}>${pending ? "等待 App Store…" : "使用 App Store 付款"}</button><button type="button" class="secondary" data-action="shop-cancel" ${pending ? "disabled" : ""}>取消</button>`;
    return `<div class="shop-sheet" id="shop-sheet" role="dialog" aria-modal="true" aria-labelledby="shop-checkout-title">
    <article class="shop-checkout ${phase}">
      <header class="shop-checkout-head"><span class="shop-brand-seal">${shopCrest()}</span><div><small>SECURE APP STORE CHECKOUT</small><b>荒境補給確認</b></div></header>
      <div class="shop-checkout-hero"><div class="shop-checkout-art">${art}</div><div><small>遠征物資箱</small><h3>${offer.name}</h3><p>${offer.description}</p></div></div>
      <div class="shop-state"><i aria-hidden="true">${done ? "✓" : failed ? "!" : pending ? "•••" : "◆"}</i><div><small>付款狀態</small><h3 id="shop-checkout-title">${title}</h3><p>${copy}</p></div></div>
      <div class="shop-total"><small>App Store 本地價格</small><b>${offer.priceLabel}</b></div>
      <ul class="shop-receipt">
        <li><span>商品</span><b>${offer.name}</b></li>
        <li><span>內容</span><b>${offerContents(offer)}</b></li>
        <li><span>支付方式</span><b>Apple App Store</b></li>
        <li><span>訂單狀態</span><b>${orderId ? "已建立" : "確認後建立"}</b></li>
      </ul>
      <p class="shop-disclaimer">${SHOP_PAYMENT_COPY}</p>
      <div class="shop-checkout-actions">${actions}</div>
    </article>
  </div>`;
  }
  function cardPayButton(id) {
    return "";
  }
  function grantOffer(snapshot, offer) {
    if (!snapshot?.inventory || !SHOP_PACKS.includes(offer)) throw new Error("商品或遠征存檔無效");
    const next = structuredClone(snapshot);
    for (const id of offer.cards) next.inventory[id] = Math.min(99, (next.inventory[id] || 0) + offer.copies);
    return next;
  }

  // prototypes/emberwild/merchant-ui.mjs
  var priceText = (p) => [p.wood ? `木材 ${p.wood}` : "", p.bone ? `獸骨 ${p.bone}` : "", p.amber ? `琥珀 ${p.amber}` : ""].filter(Boolean).join(" · ");
  var shopArt = (offer) => spriteIcon(offer.art, "shop-pack-art") || `<div class="shop-pack-fallback" aria-hidden="true">${offer.cards.map((id) => icon(id, "shop-mini")).join("")}</div>`;
  function marketContent(g, tab, message = "", transactions = []) {
    const training = UPGRADES.filter((u) => !u.weapon && g.upgradeFitsLoadout(u)), forge = UPGRADES.filter((u) => u.weapon && g.upgradeFitsLoadout(u));
    const catalog = tab === "hire" ? HIRES : g.loadout?.legacy ? BUILD_CARDS : CARDS;
    const upgrades = tab === "forge" ? forge : training;
    const goods = ["training", "forge"].includes(tab) ? upgrades.map((u) => ({ ...u, id: `skill-${u.id}`, description: u.desc })) : Object.entries(catalog).filter(([id]) => g.carriesCard(id)).map(([id, c]) => ({ id, ...c }));
    const tabs = [["build", "建造卡"], ["hire", "雇佣卡"], ["forge", "武器鍛造"], ["training", "技能成長"], ["shop", "App Store"]];
    const skillPaths = tab === "training" ? `<section class="skill-paths" aria-label="主動技能成長路線">${Object.entries(ACTIVE_SKILLS).filter(([id]) => g.carriesSkill(id)).map(([id, skill]) => {
      const learned = UPGRADES.filter((u) => u.branch === id && g.selectedUpgrades.includes(u.id)).length, level = 1 + learned, next = UPGRADES.find((u) => u.branch === id && !g.selectedUpgrades.includes(u.id));
      return `<div class="skill-path ${id}"><span>${id === "volley" ? "➶" : "✹"}</span><div><small>本次攜帶 · Lv.${level} / 3</small><b>${skill.name}</b><p>${next ? `下一階：${next.name}` : "成長路線已完成"}</p></div></div>`;
    }).join("")}</section>` : "";
    const forgedWeapon = g.loadout?.weapons[0] || g.hero.weapon, weapon = WEAPONS[forgedWeapon];
    const forgePath = tab === "forge" && weapon ? `<section class="forge-path" aria-label="攜帶武器鍛造"><div class="forge-weapon-art">${spriteIcon(forgedWeapon, "forge-weapon-icon") || `<span>${weapon.symbol}</span>`}</div><div><small>本次攜帶 · ${weapon.short}</small><b>${weapon.name}</b><p>${weapon.description}</p></div><em>${g.selectedUpgrades.includes(forgedWeapon) ? "鍛造完成" : "可改造攻擊方式"}</em></section>` : "";
    const shop = tab === "shop" ? shopCatalogHTML(shopArt, transactions) : "";
    const payStrip = tab === "shop" ? "" : `<button type="button" class="shop-launch" data-market-tab="shop">${spriteIcon("shop-amber-ingot", "shop-launch-ingot")}<div><small>APP STORE</small><b>五款遠征補給</b><p>含新手一次與每週限購禮包；實際金額以系統為準。</p></div><em>打開商店</em></button>`;
    const grid = tab === "shop" ? "" : `<div class="market-grid">${goods.map((d) => {
      const plan = g.purchasePlan(d.id), upgrade = ["training", "forge"].includes(tab), learned = upgrade && g.selectedUpgrades.includes(d.id.slice(6)), prerequisite = upgrade && d.requires && !g.selectedUpgrades.includes(d.requires), growth = tab === "training" && d.branch, pay = upgrade ? "" : cardPayButton(d.id);
      return `<article class="market-card${growth ? ` skill-growth ${d.branch}` : ""}${tab === "forge" ? " weapon-forge-card" : ""}"><div class="market-card-art">${d.symbol ? `<span>${d.symbol}</span>` : icon(d.id)}</div><div class="market-card-copy"><small>${tab === "forge" ? `${WEAPONS[d.weapon].name} · 攻擊方式改造` : growth ? `${ACTIVE_SKILLS[d.branch].name} · 成長 ${d.rank} / ${d.maxRank}` : tab === "training" ? "本局一次性強化" : tab === "hire" ? "雇佣契約 · 部署後跟隨" : "建造藍圖 · 同類可升級"}</small><h3>${d.name}</h3><p>${d.description}</p><b class="market-price">${priceText(g.price(d.id))}</b><span class="market-owned">${upgrade ? learned ? "本次遠征已完成" : prerequisite ? "需先完成前一階" : tab === "forge" ? "鍛造後立即改變普通攻擊" : growth ? "購買後主動技能立即成長" : "購買後立即生效" : `背包持有 ${g.inventory[d.id]} 張`}</span></div><div class="market-card-actions"><button data-buy="${d.id}" class="primary" ${plan.ok ? "" : "disabled"}>${learned ? tab === "forge" ? "已鍛造" : "已學會" : prerequisite ? "先購買前一階" : plan.ok ? tab === "forge" ? "鍛造招式" : growth ? "購買技能成長" : "購買" : g.inventory?.[d.id] >= 99 ? "庫存已滿" : "材料不足"}</button>${pay}</div></article>`;
    }).join("")}</div>`;
    return `<div class="merchant-banner${tab === "shop" ? " shop-banner" : ""}"><div class="merchant-portrait" aria-hidden="true">${tab === "shop" ? spriteIcon("shop-amber-ingot", "merchant-art") : spriteIcon("merchant", "merchant-art")}<i>${tab === "shop" ? "App Store" : "荒境行商"}</i></div><div><b>${tab === "shop" ? "五款固定內容的遠征補給。" : "材料換好牌，搭配由你決定。"}</b><p>${tab === "shop" ? "新手禮包一次、每週禮包每週一次；支付成功且伺服器驗證後才會發放。" : "固定貨架，不抽卡、不刷新。買幾張，就能部署幾次。也可以改用 App Store 購買補給包。"}</p></div></div>
  ${tab === "shop" ? "" : `<div class="material-wallet"><span>▰ 木材 <b>${g.materials.wood}</b></span><span>✧ 獸骨 <b>${g.materials.bone}</b></span><span>◆ 琥珀 <b>${g.amber}</b></span></div>`}
  ${payStrip}
  <div class="market-tabs" role="group" aria-label="商品分類">${tabs.map(([id, label]) => `<button data-market-tab="${id}" class="${id === "shop" ? "pay-tab" : ""}" aria-pressed="${id === tab}">${label}</button>`).join("")}</div>
  <p id="market-message" class="market-message" role="status">${message || (tab === "shop" ? "選擇禮包後使用 App Store 付款；未經伺服器驗證不會發放。" : "開局含旅行補給；材料與卡牌保存在這次遠征。結算後營火石留在永久營地。")}</p>
  ${skillPaths}${forgePath}${shop}${grid}
  <p class="market-footnote">${tab === "shop" ? "付款期間請勿重複點擊；取消或待確認交易都不會提前發卡。限定禮包由伺服器再次校驗。" : "行商只供應本次出征配置中的卡牌、武器與主動技能成長；部分貨架由永久營地設施等級解鎖。建造、升級與部署只消耗卡牌；固定貨架不抽取，也沒有戰後隨機三選一。"}</p>`;
  }

  // prototypes/emberwild/storekit-shop.mjs
  var resultObject = (value) => {
    if (value && typeof value === "object") return value;
    try {
      return JSON.parse(String(value || ""));
    } catch {
      return {};
    }
  };
  var requestId = (host) => {
    if (typeof host.crypto?.randomUUID === "function") return host.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (typeof host.crypto?.getRandomValues === "function") host.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = bytes[6] & 15 | 64;
    bytes[8] = bytes[8] & 63 | 128;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  var StoreKitShopError = class extends Error {
    constructor(code, message) {
      super(message);
      this.name = "StoreKitShopError";
      this.code = code;
    }
  };
  var NativeStoreKitShop = class {
    constructor(host = globalThis) {
      this.host = host;
      this.pending = null;
      const previous = typeof host.javaCallBack === "function" ? host.javaCallBack : null;
      host.javaCallBack = (value) => {
        try {
          previous?.(value);
        } finally {
          this.handle(value);
        }
      };
    }
    available() {
      return typeof this.host.android?.miniPurchase === "function";
    }
    purchase(offer) {
      if (this.pending) throw new StoreKitShopError("PAYMENT_IN_PROGRESS", "已有一筆付款正在處理，請勿重複點擊");
      if (!offer?.id || !offer?.productId || !Number.isInteger(offer.goodsId)) throw new StoreKitShopError("INVALID_OFFER", "商品設定不完整");
      if (!this.available()) throw new StoreKitShopError("IOS_APP_REQUIRED", "請在 iOS App 內使用 App Store 付款");
      const clientRequestId = requestId(this.host);
      return new Promise((resolve, reject) => {
        this.pending = { clientRequestId, offerId: offer.id, resolve, reject };
        try {
          this.host.android.miniPurchase(JSON.stringify({ offerId: offer.id, clientRequestId }));
        } catch (error) {
          this.pending = null;
          reject(new StoreKitShopError("NATIVE_BRIDGE_FAILED", error?.message || "無法連接 App Store"));
        }
      });
    }
    handle(value) {
      const payload = resultObject(value), pending = this.pending;
      if (!pending || payload.clientRequestId !== pending.clientRequestId) return false;
      const finish = () => {
        this.pending = null;
      };
      if (payload.func === "onPayResult" && String(payload.code) === "0" && /^\d{1,40}$/.test(String(payload.transactionId || "")) && payload.orderId) {
        finish();
        pending.resolve({ offerId: pending.offerId, clientRequestId: pending.clientRequestId, orderId: String(payload.orderId), transactionId: String(payload.transactionId) });
        return true;
      }
      if (["onPayFail", "onPayCancel", "onPayPending"].includes(payload.func)) {
        finish();
        pending.reject(new StoreKitShopError(String(payload.code || "PAYMENT_NOT_COMPLETED"), String(payload.message || "付款未完成")));
        return true;
      }
      return false;
    }
  };

  // prototypes/emberwild/camp.mjs
  var CAMP_PRODUCTION = Object.freeze({
    tent: Object.freeze({ resource: "wood", name: "木材", icon: "▰", per: "每完成 2 關" }),
    forge: Object.freeze({ resource: "bone", name: "獸骨", icon: "✧", per: "每完成 3 關" }),
    cache: Object.freeze({ resource: "amber", name: "琥珀", icon: "◆", per: "每完成 4 關" }),
    nursery: Object.freeze({ resource: "warmth", name: "孵化熱度", icon: "♨", per: "每完成 3 關" })
  });
  var CAMP_TASKS = Object.freeze({
    porter: Object.freeze({ name: "搬運工阿拓", title: "營地整備", detail: "建造或升級 1 次永久設施。", reward: Object.freeze({ wood: 3, amber: 1, stones: 1 }) }),
    hunter: Object.freeze({ name: "巡林獵人瑟雅", title: "獸群懸賞", detail: "在遠征中累計擊敗指定數量的敵人。", reward: Object.freeze({ bone: 4, amber: 2, stones: 1 }) })
  });
  var HATCH_REQUIREMENTS = Object.freeze({
    emberclaw: Object.freeze({ nursery: 0, warmth: 0, label: "初始聖獸卵" }),
    tideroot: Object.freeze({ nursery: 1, warmth: 3, label: "需要 1 級獸卵溫室" }),
    stoneback: Object.freeze({ nursery: 2, warmth: 5, label: "需要 2 級獸卵溫室" })
  });
  var lockedGoods = Object.freeze({ bow: ["forge", 1], blades: ["forge", 2], hammer: ["forge", 3], armor: ["tent", 1], heart: ["tent", 2], dash: ["tent", 3], builder: ["cache", 1], loot: ["cache", 2], repair: ["cache", 3] });
  var facilityLevel = (camp, type) => camp.buildings.find((building) => building.type === type)?.level || 0;
  function ensureCampProgress(camp) {
    if (!camp.stockpile) camp.stockpile = { wood: 0, bone: 0, amber: 0, warmth: 0 };
    if (!camp.production) camp.production = { tent: 0, forge: 0, cache: 0, nursery: 0 };
    if (!camp.tasks) camp.tasks = { porter: { progress: 0, goal: 1, ready: false, cycles: 0 }, hunter: { progress: 0, goal: 20, ready: false, cycles: 0 } };
    return camp;
  }
  function campWeaponUnlocked(camp, weapon) {
    if (["spear", "axe"].includes(weapon)) return true;
    return facilityLevel(camp, "forge") >= ({ bow: 1, blades: 2, hammer: 3 }[weapon] || 99);
  }
  function campMerchantUnlocks(camp) {
    return UPGRADES.filter((upgrade) => {
      const lock = lockedGoods[upgrade.id];
      return !lock || facilityLevel(camp, lock[0]) >= lock[1];
    }).map((upgrade) => upgrade.id);
  }
  function hatchPlan(state, type) {
    ensureCampProgress(state.camp);
    const requirement = HATCH_REQUIREMENTS[type];
    if (!requirement) return { ok: false, reason: "找不到這枚聖獸卵" };
    const nursery = facilityLevel(state.camp, "nursery"), warmth = state.camp.stockpile.warmth;
    if (nursery < requirement.nursery) return { ok: false, reason: `${requirement.label}才能孵化` };
    if (warmth < requirement.warmth) return { ok: false, reason: `還需要 ${requirement.warmth - warmth} 點孵化熱度` };
    return { ok: true, cost: requirement.warmth, nursery };
  }
  function collectCampProduction(state, type) {
    const camp = ensureCampProgress(state.camp), building = camp.buildings.find((entry) => entry.type === type), def = CAMP_PRODUCTION[type], amount = camp.production[type] || 0;
    if (!building || !def) return { ok: false, reason: "這座生產設施尚未建造" };
    if (amount <= 0) return { ok: false, reason: "完成遠征關卡後才會產出" };
    const claimed = Math.min(amount, 999 - camp.stockpile[def.resource]);
    if (claimed <= 0) return { ok: false, reason: `${def.name}倉儲已滿，先帶入遠征再領取` };
    camp.production[type] -= claimed;
    camp.stockpile[def.resource] += claimed;
    return { ok: true, amount: claimed, remaining: camp.production[type], resource: def.resource, name: def.name };
  }
  function claimCampTask(state, npc) {
    const camp = ensureCampProgress(state.camp), task = camp.tasks[npc], def = CAMP_TASKS[npc];
    if (!task || !def) return { ok: false, reason: "找不到這項營地委託" };
    if (!task.ready) return { ok: false, reason: "委託尚未完成" };
    for (const resource of ["wood", "bone", "amber"]) camp.stockpile[resource] = Math.min(999, camp.stockpile[resource] + (def.reward[resource] || 0));
    camp.stones = Math.min(1e8, camp.stones + (def.reward.stones || 0));
    task.cycles++;
    task.progress = 0;
    task.goal = npc === "hunter" ? Math.min(50, 20 + task.cycles * 5) : 1;
    task.ready = false;
    return { ok: true, reward: def.reward, nextGoal: task.goal };
  }
  function recordCampExpedition(state, snapshot) {
    const camp = ensureCampProgress(state.camp), waves = Math.max(0, Math.min(MAX_WAVES, snapshot.stats.waves || 0));
    if (waves > 0) {
      const intervals = { tent: 2, forge: 3, cache: 4, nursery: 3 };
      for (const [type, interval] of Object.entries(intervals)) {
        const level = facilityLevel(camp, type);
        if (level) camp.production[type] = Math.min(99, camp.production[type] + Math.floor(waves / interval) * level);
      }
    }
    const hunter = camp.tasks.hunter;
    if (!hunter.ready) {
      hunter.progress = Math.min(hunter.goal, hunter.progress + (snapshot.stats.kills || 0));
      hunter.ready = hunter.progress >= hunter.goal;
    }
    return camp;
  }
  var FACILITIES = Object.freeze({
    tent: { name: "獵人帳篷", costs: [3, 5, 8], tag: "體魄", desc: "提高出征生命並生產木材；等級依次解鎖護甲、巨獸之心與踏風步。", benefit: (l) => `生命 +${l * 10} · 木材 ×${l}` },
    forge: { name: "骨器工坊", costs: [4, 6, 9], tag: "武技", desc: "強化所有主武器並生產獸骨；一至三級依次解鎖獵骨弓、裂牙雙刃和震骨重錘。", benefit: (l) => `武器 +${l * 5}% · 獸骨 ×${l}` },
    cache: { name: "補給倉庫", costs: [3, 5, 8], tag: "籌備", desc: "增加出征琥珀並持續生產琥珀；等級解鎖工匠、拾荒和守巢商品。", benefit: (l) => `出征琥珀 +${l * 2} · 產出 ×${l}` },
    nursery: { name: "獸卵溫室", costs: [3, 5, 8], tag: "守護", desc: "提高聖獸卵耐久並生產孵化熱度；升級後可以孵化更多伙伴。", benefit: (l) => `獸卵 +${l * 15} · 熱度 ×${l}` }
  });
  function campPlan(state, type, slot) {
    if (!Object.hasOwn(FACILITIES, type) || !Number.isInteger(slot) || slot < 0 || slot >= 6) return { ok: false, reason: "請選擇營地中的建築地塊" };
    const here = state.camp.buildings.find((b) => b.slot === slot), existing = state.camp.buildings.find((b) => b.type === type), def = FACILITIES[type];
    if (here && here.type !== type) return { ok: false, reason: "地塊已被其他建築使用" };
    if (existing && existing !== here) return { ok: false, reason: "同類建築只能一座；拖到原建築可升級" };
    const level = here?.level || 0;
    if (level >= 3) return { ok: false, reason: "已達最高三級" };
    const cost = def.costs[level];
    if (state.camp.stones < cost) return { ok: false, reason: `需要 ${cost} 營火石，完成遠征波次後結算取得` };
    return { ok: true, type, slot, cost, level: level + 1, upgrade: !!here };
  }
  function buildCamp(state, type, slot) {
    const p = campPlan(state, type, slot);
    if (!p.ok) throw new Error(p.reason);
    state.camp.stones -= p.cost;
    const b = state.camp.buildings.find((b2) => b2.slot === slot);
    if (b) b.level = p.level;
    else state.camp.buildings.push({ type, slot, level: 1 });
    const task = ensureCampProgress(state.camp).tasks.porter;
    if (!task.ready) {
      task.progress = Math.min(task.goal, task.progress + 1);
      task.ready = task.progress >= task.goal;
    }
    return p;
  }
  function moveCamp(state, from, to) {
    if (!Number.isInteger(to) || to < 0 || to >= 6) throw new Error("請移到營地內的空地塊");
    const b = state.camp.buildings.find((b2) => b2.slot === from);
    if (!b) throw new Error("找不到這座建築");
    if (from === to) return false;
    if (state.camp.buildings.some((b2) => b2.slot === to)) throw new Error("目標地塊已被使用");
    b.slot = to;
    return true;
  }
  function createExpedition(state, seed, runId) {
    const campProgress = ensureCampProgress(state.camp);
    const g = new Expedition(seed, runId);
    if (state.profile.tutorialDone === false || state.profile.tutorialDone === void 0 && state.profile.runs === 0) g.enableTutorial({ mandatory: true });
    g.applyLoadout(normalizeLoadout(state.camp.loadout));
    g.campUnlocks = campMerchantUnlocks(state.camp);
    for (const b of state.camp.buildings) {
      if (b.type === "tent") {
        g.hero.maxHp += 10 * b.level;
        g.hero.hp = g.hero.maxHp;
      }
      if (b.type === "forge") for (const id of Object.keys(WEAPONS)) g.mods[id] += 0.05 * b.level;
      if (b.type === "cache") g.amber += 2 * b.level;
      if (b.type === "nursery") {
        g.base.maxHp += 15 * b.level;
        g.base.hp = g.base.maxHp;
      }
    }
    g.campSupplyBonus = { wood: Math.min(campProgress.stockpile.wood, 999 - g.materials.wood), bone: Math.min(campProgress.stockpile.bone, 999 - g.materials.bone), amber: Math.min(campProgress.stockpile.amber, 99 - g.amber) };
    g.materials.wood += g.campSupplyBonus.wood;
    g.materials.bone += g.campSupplyBonus.bone;
    g.amber += g.campSupplyBonus.amber;
    const companions = state.profile.companions, selected = companions?.selected, companionProgress = selected && companions.roster?.[selected];
    if (companionProgress?.unlocked) g.setCompanion(selected, companionProgress);
    return g;
  }
  function rewardFor(snapshot) {
    if (!["win", "lose"].includes(snapshot.phase)) throw new Error("遠征尚未結束，不能結算");
    return Math.max(0, Math.min(MAX_WAVES, snapshot.stats.waves)) * 2 + (snapshot.phase === "win" ? 8 : 0);
  }

  // prototypes/emberwild/save.mjs
  var SAVE_KEY = "emberwild_save_v2";
  var BACKUP_KEY = "emberwild_save_v2_backup";
  var LEGACY_KEY = "emberwild_prototype_v1";
  var PROGRESS_KEYS = Object.freeze([SAVE_KEY, BACKUP_KEY, LEGACY_KEY]);
  var clone = (value) => JSON.parse(JSON.stringify(value));
  var num = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  var need = (ok) => {
    if (!ok) throw new Error("營地存檔格式損壞或版本不相容");
  };
  function freshCompanionState() {
    return { selected: null, roster: Object.fromEntries(Object.keys(COMPANIONS).map((type) => [type, { unlocked: false, level: 1, xp: 0 }])) };
  }
  function ensureCompanionState(profile) {
    if (profile.companions === void 0) profile.companions = freshCompanionState();
    return profile.companions;
  }
  function ensureLoadoutState(camp) {
    if (camp.loadout === void 0) camp.loadout = normalizeLoadout(DEFAULT_LOADOUT);
    return camp.loadout;
  }
  function offerWeekKey2(time = Date.now()) {
    const date = new Date(time), utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
    const year = utc.getUTCFullYear(), start = new Date(Date.UTC(year, 0, 1));
    return `${year}-W${String(Math.ceil(((utc - start) / 864e5 + 1) / 7)).padStart(2, "0")}`;
  }
  function ensureOfferPromptState(profile, migrateCompleted = false) {
    if (profile.offerPrompts === void 0) {
      const seen = migrateCompleted && profile.tutorialDone === true;
      profile.offerPrompts = { starterShown: seen, weeklyShownWeek: seen ? offerWeekKey2() : "" };
    }
    return profile.offerPrompts;
  }
  function syncCompanionProgress(state, snapshot) {
    if (["done", "skipped"].includes(snapshot.tutorial?.status)) state.profile.tutorialDone = true;
    const p = snapshot.companion;
    if (!p) return;
    const companions = ensureCompanionState(state.profile), saved = companions.roster[p.type];
    if (!saved) return;
    saved.unlocked = true;
    saved.level = p.level;
    saved.xp = p.xp;
    companions.selected = p.type;
  }
  function freshState(legacy = {}) {
    if (!legacy || typeof legacy !== "object") legacy = {};
    const number = (v, max) => Math.floor(clamp(Number(v) || 0, 0, max));
    const legacyComplete = number(legacy.runs, 1e6) > 0;
    const state = { profile: { runs: number(legacy.runs, 1e6), best: number(legacy.best, MAX_WAVES), victories: number(legacy.victories, 1e6), companions: freshCompanionState(), tutorialDone: legacyComplete, purchaseTransactions: [], offerPrompts: { starterShown: legacyComplete, weeklyShownWeek: legacyComplete ? offerWeekKey2() : "" } }, camp: { stones: 8, buildings: [], position: { x: 980, y: 960, angle: 0 }, loadout: normalizeLoadout(DEFAULT_LOADOUT) }, run: null, lastResult: null };
    ensureCampProgress(state.camp);
    return state;
  }
  function validateState(state) {
    need(state && typeof state === "object" && state.profile && state.camp);
    if (state.profile.tutorialDone !== void 0) need(typeof state.profile.tutorialDone === "boolean");
    for (const k of ["runs", "victories"]) need(num(state.profile[k], 0, 1e6));
    need(num(state.profile.best, 0, MAX_WAVES));
    if (state.profile.companions !== void 0) {
      const companions = state.profile.companions, types2 = Object.keys(COMPANIONS);
      need(companions && typeof companions === "object" && companions.roster && typeof companions.roster === "object");
      need(companions.selected === null || types2.includes(companions.selected));
      for (const type of types2) {
        const p = companions.roster[type];
        need(p && typeof p.unlocked === "boolean" && num(p.level, 1, COMPANION_MAX_LEVEL) && num(p.xp, 0, 1e8));
      }
      if (companions.selected !== null) need(companions.roster[companions.selected].unlocked);
    }
    if (state.profile.purchaseTransactions !== void 0) {
      need(Array.isArray(state.profile.purchaseTransactions) && state.profile.purchaseTransactions.length <= 200);
      const ids = /* @__PURE__ */ new Set();
      for (const item of state.profile.purchaseTransactions) {
        need(item && /^\d{1,40}$/.test(item.transactionId) && /^[a-z0-9-]{1,40}$/.test(item.offerId) && num(item.deliveredAt, 0, Number.MAX_SAFE_INTEGER) && !ids.has(item.transactionId));
        ids.add(item.transactionId);
      }
    }
    if (state.profile.offerPrompts !== void 0) {
      const prompts = state.profile.offerPrompts;
      need(prompts && typeof prompts.starterShown === "boolean" && typeof prompts.weeklyShownWeek === "string" && (prompts.weeklyShownWeek === "" || /^\d{4}-W\d{2}$/.test(prompts.weeklyShownWeek)));
    }
    need(num(state.camp.stones, 0, 1e8));
    need(Array.isArray(state.camp.buildings) && state.camp.buildings.length <= 4);
    if (state.camp.stockpile !== void 0) {
      for (const resource of ["wood", "bone", "amber", "warmth"]) need(num(state.camp.stockpile?.[resource], 0, 999));
    }
    if (state.camp.production !== void 0) {
      for (const type of Object.keys(FACILITIES)) need(num(state.camp.production?.[type], 0, 99));
    }
    if (state.camp.tasks !== void 0) {
      for (const npc of Object.keys(CAMP_TASKS)) {
        const task = state.camp.tasks?.[npc];
        need(task && num(task.progress, 0, 1e6) && num(task.goal, 1, 1e6) && num(task.cycles, 0, 1e6) && typeof task.ready === "boolean");
        need(task.progress <= task.goal);
      }
    }
    if (state.camp.loadout !== void 0) need(isValidLoadout(state.camp.loadout));
    if (state.camp.position !== void 0) {
      const p = state.camp.position;
      need(p && Number.isFinite(p.x) && p.x >= 80 && p.x <= 1920 && Number.isFinite(p.y) && p.y >= 80 && p.y <= 1620 && Number.isFinite(p.angle) && Math.abs(p.angle) <= Math.PI * 2);
    }
    const slots = /* @__PURE__ */ new Set(), types = /* @__PURE__ */ new Set();
    for (const b of state.camp.buildings) {
      need(b && Object.hasOwn(FACILITIES, b.type) && num(b.slot, 0, 5) && num(b.level, 1, 3) && !slots.has(b.slot) && !types.has(b.type));
      slots.add(b.slot);
      types.add(b.type);
    }
    need(state.run === null || typeof state.run === "object");
    if (state.run !== null) validateSnapshot(state.run);
    if (state.lastResult !== null) {
      const r = state.lastResult;
      need(r && typeof r.id === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(r.id));
      need(typeof r.won === "boolean" && num(r.waves, 0, MAX_WAVES) && num(r.stones, 0, MAX_WAVES * 2 + 8) && num(r.kills, 0, 1e4) && num(r.combos, 0, 1e7) && num(r.completedAt, 0, Number.MAX_SAFE_INTEGER));
      if (r.loot !== void 0) {
        need(r.loot && num(r.loot.wood, 0, 999) && num(r.loot.bone, 0, 999) && num(r.loot.amber, 0, 99) && num(r.loot.harvested, 0, 30));
      }
    }
    return true;
  }
  function digest(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
  function encode(state, revision = 1, updatedAt = Date.now()) {
    validateState(state);
    const payload = { version: 10, revision, updatedAt, state };
    return JSON.stringify({ ...payload, checksum: digest(JSON.stringify(payload)) });
  }
  function decode(raw) {
    if (typeof raw !== "string" || raw.length > 5e5) throw new Error("存檔為空或超過大小限制");
    const e = JSON.parse(raw);
    if (![2, 3, 4, 5, 6, 7, 8, 9, 10].includes(e?.version)) throw new Error("存檔版本不相容，請保留備份");
    need(num(e.revision, 0, Number.MAX_SAFE_INTEGER) && num(e.updatedAt, 0, Number.MAX_SAFE_INTEGER));
    need(e.checksum === digest(JSON.stringify({ version: e.version, revision: e.revision, updatedAt: e.updatedAt, state: e.state })));
    validateState(e.state);
    return e;
  }
  var SaveStore = class {
    constructor(storage2, locks = null) {
      this.storage = storage2;
      this.locks = locks;
      this.queue = Promise.resolve();
      this.reload();
    }
    reload() {
      this.warning = "";
      this.blocked = false;
      this.revision = 0;
      this.savedAt = 0;
      this.validRaw = null;
      this.raw = null;
      this.state = freshState();
      try {
        this.raw = this.storage.getItem(SAVE_KEY);
        const backup = this.storage.getItem(BACKUP_KEY);
        if (this.raw) {
          try {
            const e = decode(this.raw);
            this.accept(e, this.raw);
            return;
          } catch {
          }
        }
        let future = false;
        try {
          future = JSON.parse(this.raw)?.version > 10;
        } catch {
        }
        if (future) {
          this.blocked = true;
          this.warning = "這份存檔來自較新版本，已停止寫入。請先匯出備份。";
          return;
        }
        if (backup) {
          try {
            const e = decode(backup);
            this.accept(e, backup);
            this.warning = "主存檔異常，已恢復上一份備份。";
            return;
          } catch {
          }
        }
        if (this.raw || backup) {
          this.blocked = true;
          this.warning = "存檔無法讀取，已保留原資料並停止寫入。可先匯出備份。";
          return;
        }
        let legacy = {};
        try {
          legacy = JSON.parse(this.storage.getItem(LEGACY_KEY) || "{}");
        } catch {
        }
        this.state = freshState(legacy);
      } catch {
        this.blocked = true;
        this.warning = "瀏覽器不允許本機儲存；請允許儲存後再開始遠征。";
      }
    }
    accept(e, raw) {
      this.state = clone(e.state);
      ensureCompanionState(this.state.profile);
      ensureOfferPromptState(this.state.profile, true);
      ensureLoadoutState(this.state.camp);
      ensureCampProgress(this.state.camp);
      this.revision = e.revision;
      this.savedAt = e.updatedAt;
      this.validRaw = raw;
    }
    commit(fn) {
      if (this.blocked) throw new Error(this.warning || "存檔暫不可寫入");
      if (this.storage.getItem(SAVE_KEY) !== this.raw) {
        const e = new Error("另一個頁面已更新存檔，請載入最新進度");
        e.code = "CONFLICT";
        throw e;
      }
      const next = clone(this.state);
      const result = fn(next);
      ensureCompanionState(next.profile);
      ensureOfferPromptState(next.profile, true);
      ensureLoadoutState(next.camp);
      ensureCampProgress(next.camp);
      validateState(next);
      const raw = encode(next, this.revision + 1);
      if (this.validRaw) {
        try {
          this.storage.setItem(BACKUP_KEY, this.validRaw);
        } catch {
        }
      }
      try {
        this.storage.setItem(SAVE_KEY, raw);
      } catch {
        throw new Error("存檔失敗：儲存空間不足或被禁止，進度尚未寫入");
      }
      this.raw = raw;
      this.accept(decode(raw), raw);
      this.warning = "";
      return result;
    }
    async mutate(fn) {
      const task = async () => {
        const transaction = () => this.commit(fn);
        return this.locks ? this.locks.request("emberwild-save-v2", transaction) : transaction();
      };
      const p = this.queue.then(task, task);
      this.queue = p.catch(() => {
      });
      return p;
    }
    putRun(state, source) {
      const snapshot = typeof source === "function" ? source() : source;
      validateSnapshot(snapshot);
      if (state.run?.runId !== snapshot.runId) throw new Error("遠征存檔已變更，請重新載入");
      state.run = clone(snapshot);
      syncCompanionProgress(state, snapshot);
    }
    saveRun(source) {
      return this.mutate((s) => this.putRun(s, source));
    }
    flushRun(snapshot) {
      return this.commit((s) => this.putRun(s, snapshot));
    }
    begin(snapshot, replace = false) {
      validateSnapshot(snapshot);
      return this.mutate((s) => {
        if (s.run?.tutorial?.mandatory && s.run.tutorial.status === "active") throw new Error("請先完成新手訓練，不可替換教學遠征");
        if (s.run && !replace) throw new Error("已有未完成遠征，請先繼續或確認放棄");
        const camp = ensureCampProgress(s.camp), bonus = snapshot.campSupplyBonus || { wood: 0, bone: 0, amber: 0 };
        for (const resource of ["wood", "bone", "amber"]) {
          if (camp.stockpile[resource] < bonus[resource]) throw new Error("營地補給已被另一個頁面使用，請重新載入");
          camp.stockpile[resource] -= bonus[resource];
        }
        s.profile.runs = Math.min(1e6, s.profile.runs + 1);
        s.run = clone(snapshot);
        syncCompanionProgress(s, snapshot);
      });
    }
    complete(snapshot) {
      validateSnapshot(snapshot);
      return this.mutate((s) => {
        if (s.lastResult?.id === snapshot.runId) return s.lastResult;
        if (s.run?.runId !== snapshot.runId) throw new Error("這場遠征已結算或不是目前存檔");
        const stones = rewardFor(snapshot), won = snapshot.phase === "win";
        syncCompanionProgress(s, snapshot);
        recordCampExpedition(s, snapshot);
        s.camp.stones = Math.min(1e8, s.camp.stones + stones);
        s.profile.best = Math.max(s.profile.best, snapshot.stats.waves);
        if (won) s.profile.victories = Math.min(1e6, s.profile.victories + 1);
        const result = {
          id: snapshot.runId,
          won,
          waves: snapshot.stats.waves,
          stones,
          kills: snapshot.stats.kills,
          combos: snapshot.stats.combos,
          loot: { wood: snapshot.materials?.wood || 0, bone: snapshot.materials?.bone || 0, amber: snapshot.amber, harvested: snapshot.stats.harvested },
          completedAt: Date.now()
        };
        s.lastResult = result;
        s.run = null;
        return result;
      });
    }
    recordStoreKitDelivery(snapshot, { transactionId, offerId, deliveredAt = Date.now() }) {
      validateSnapshot(snapshot);
      if (!/^\d{1,40}$/.test(String(transactionId || "")) || !/^[a-z0-9-]{1,40}$/.test(String(offerId || ""))) throw new Error("付款回傳資料不完整");
      return this.mutate((s) => {
        const ledger = s.profile.purchaseTransactions || (s.profile.purchaseTransactions = []);
        if (ledger.some((item) => item.transactionId === String(transactionId))) return false;
        if (s.run?.runId !== snapshot.runId) throw new Error("付款已驗證，但目前遠征已變更；請勿重複購買");
        s.run = clone(snapshot);
        ledger.push({ transactionId: String(transactionId), offerId: String(offerId), deliveredAt });
        if (ledger.length > 200) ledger.splice(0, ledger.length - 200);
        return true;
      });
    }
    markOfferPrompt(kind, week = offerWeekKey2()) {
      return this.markOfferPrompts([kind], week);
    }
    markOfferPrompts(kinds, week = offerWeekKey2()) {
      return this.mutate((s) => {
        const prompts = ensureOfferPromptState(s.profile);
        for (const kind of kinds) {
          if (kind === "starter") prompts.starterShown = true;
          else if (kind === "weekly") prompts.weeklyShownWeek = week;
          else throw new Error("禮包提示類型無效");
        }
      });
    }
    abandon() {
      return this.mutate((s) => {
        if (s.run?.tutorial?.mandatory && s.run.tutorial.status === "active") throw new Error("請先完成新手訓練，不可放棄教學");
        s.run = null;
      });
    }
    clearProgress() {
      const task = async () => {
        const transaction = () => {
          if (this.storage.getItem(SAVE_KEY) !== this.raw) {
            const e = new Error("另一個頁面已更新存檔，請重新載入後再刪除");
            e.code = "CONFLICT";
            throw e;
          }
          for (const key of [BACKUP_KEY, LEGACY_KEY, SAVE_KEY]) this.storage.removeItem(key);
          if (PROGRESS_KEYS.some((key) => this.storage.getItem(key) !== null)) throw new Error("存檔刪除未完成，請關閉其他遊戲頁後重試。");
          this.reload();
          return true;
        };
        return this.locks ? this.locks.request("emberwild-save-v2", transaction) : transaction();
      };
      const p = this.queue.then(task, task);
      this.queue = p.catch(() => {
      });
      return p;
    }
    export() {
      return this.blocked ? JSON.stringify({ recovery: true, primary: this.raw, backup: this.storage.getItem(BACKUP_KEY) }, null, 2) : encode(this.state, this.revision);
    }
    async import(raw) {
      const e = decode(raw), blocked = this.blocked;
      this.blocked = false;
      try {
        return await this.mutate((s) => {
          for (const key of ["profile", "camp", "run", "lastResult"]) s[key] = clone(e.state[key]);
        });
      } catch (error) {
        this.blocked = blocked;
        throw error;
      }
    }
  };

  // prototypes/emberwild/camp-world.mjs
  var CAMP_WORLD = Object.freeze({ width: 2e3, height: 1700, start: { x: 980, y: 960 }, speed: 185, sprint: 280, reach: 135, radius: 18 });
  var CAMP_SITES = Object.freeze([
    { id: "plot-0", kind: "plot", slot: 0, x: 630, y: 690, label: "西林地塊" },
    { id: "plot-1", kind: "plot", slot: 1, x: 630, y: 1160, label: "溪畔地塊" },
    { id: "fire", kind: "fire", x: 960, y: 800, label: "營火" },
    { id: "merchant", kind: "merchant", x: 1260, y: 760, label: "荒境行商" },
    { id: "plot-2", kind: "plot", slot: 2, x: 1530, y: 760, label: "東林地塊" },
    { id: "plot-3", kind: "plot", slot: 3, x: 1490, y: 1200, label: "石階地塊" },
    { id: "plot-4", kind: "plot", slot: 4, x: 1030, y: 1370, label: "南林地塊" },
    { id: "plot-5", kind: "plot", slot: 5, x: 390, y: 940, label: "蕨叢地塊" },
    { id: "gate", kind: "gate", x: 1730, y: 400, label: "遠征山口" }
  ]);
  var dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function campObstacles(state) {
    return CAMP_SITES.flatMap((s) => s.kind === "merchant" ? [{ x: s.x, y: s.y, r: 65 }] : s.kind === "fire" ? [{ x: s.x, y: s.y, r: 35 }] : s.kind === "plot" && state.camp.buildings.some((b) => b.slot === s.slot) ? [{ x: s.x, y: s.y, r: 65 }] : []);
  }
  var CampWalk = class {
    constructor(position) {
      this.x = CAMP_WORLD.start.x;
      this.y = CAMP_WORLD.start.y;
      this.angle = 0;
      this.path = [];
      this.moving = false;
      this.time = 0;
      this.restore(position);
    }
    restore(p) {
      this.x = CAMP_WORLD.start.x;
      this.y = CAMP_WORLD.start.y;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        this.x = Math.max(80, Math.min(1920, p.x));
        this.y = Math.max(80, Math.min(1620, p.y));
      }
      this.angle = Number.isFinite(p?.angle) ? p.angle : 0;
      this.stop();
    }
    snapshot() {
      return { x: Math.round(this.x), y: Math.round(this.y), angle: this.angle };
    }
    stop() {
      this.path = [];
      this.moving = false;
    }
    nearest() {
      return CAMP_SITES.filter((s) => dist(s, this) <= CAMP_WORLD.reach).sort((a, b) => dist(a, this) - dist(b, this))[0] || null;
    }
    canInteract(id) {
      const site = CAMP_SITES.find((s) => s.id === id);
      return !!site && dist(site, this) <= CAMP_WORLD.reach;
    }
    free(p, obstacles) {
      return p.x >= 80 && p.x <= 1920 && p.y >= 80 && p.y <= 1620 && !obstacles.some((o) => dist(p, o) < o.r + CAMP_WORLD.radius);
    }
    goTo(x, y, obstacles = []) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      const goal = { x: Math.max(80, Math.min(1920, x)), y: Math.max(80, Math.min(1620, y)) };
      if (!this.free(goal, obstacles)) {
        this.stop();
        return false;
      }
      const clear = (a, b) => {
        const n = Math.ceil(dist(a, b) / 14);
        for (let i = 1; i <= n; i++) if (!this.free({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }, obstacles)) return false;
        return true;
      };
      if (clear(this, goal)) {
        this.path = [goal];
        return true;
      }
      const grid = 40, key = (x2, y2) => `${x2},${y2}`;
      const anchors = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const p = { x: Math.round(this.x / grid) * grid + dx * grid, y: Math.round(this.y / grid) * grid + dy * grid };
        if (this.free(p, obstacles) && clear(this, p)) anchors.push(p);
      }
      anchors.sort((a, b) => dist(this, a) - dist(this, b));
      if (!anchors.length) {
        this.stop();
        return false;
      }
      const start = { ...anchors[0], g: dist(this, anchors[0]), parent: null };
      const open = [start], best = /* @__PURE__ */ new Map([[key(start.x, start.y), 0]]), closed = /* @__PURE__ */ new Set();
      let found = null;
      for (let i = 0; open.length && i < 3e3; i++) {
        open.sort((a, b) => a.g + dist(a, goal) - (b.g + dist(b, goal)));
        const n = open.shift(), k = key(n.x, n.y);
        if (closed.has(k)) continue;
        closed.add(k);
        if (dist(n, goal) < 60 && clear(n, goal)) {
          found = n;
          break;
        }
        for (const dx of [-grid, 0, grid]) for (const dy of [-grid, 0, grid]) {
          if (!dx && !dy) continue;
          const p = { x: n.x + dx, y: n.y + dy, g: n.g + Math.hypot(dx, dy), parent: n }, pk = key(p.x, p.y);
          if (closed.has(pk) || !this.free(p, obstacles) || !clear(n, p) || p.g >= (best.get(pk) ?? Infinity)) continue;
          best.set(pk, p.g);
          open.push(p);
        }
      }
      if (!found) {
        this.stop();
        return false;
      }
      const path = [goal];
      for (let n = found; n; n = n.parent) path.unshift({ x: n.x, y: n.y });
      this.path = path;
      return true;
    }
    tick(dt, { x = 0, y = 0, sprint = false, paused = false } = {}, obstacles = []) {
      if (paused || !Number.isFinite(dt) || dt <= 0) {
        this.moving = false;
        return;
      }
      dt = Math.min(dt, 0.05);
      this.time += dt;
      let len = Math.hypot(x, y);
      if (len > 0.05) {
        this.path = [];
        x /= Math.max(1, len);
        y /= Math.max(1, len);
      } else if (this.path.length) {
        let p = this.path[0];
        if (dist(this, p) < 4) {
          this.path.shift();
          p = this.path[0];
        }
        if (p) {
          len = dist(this, p);
          x = (p.x - this.x) / len;
          y = (p.y - this.y) / len;
        } else {
          x = 0;
          y = 0;
        }
      } else {
        x = 0;
        y = 0;
      }
      let step = (sprint ? CAMP_WORLD.sprint : CAMP_WORLD.speed) * dt;
      if (this.path.length) step = Math.min(step, dist(this, this.path[0]));
      const old = { x: this.x, y: this.y };
      if (this.free({ x: this.x + x * step, y: this.y }, obstacles)) this.x += x * step;
      if (this.free({ x: this.x, y: this.y + y * step }, obstacles)) this.y += y * step;
      this.moving = dist(old, this) > 0.01;
      if (this.moving) this.angle = Math.atan2(this.y - old.y, this.x - old.x);
    }
  };

  // prototypes/emberwild/camp-residents.mjs
  var distance2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  var routes = {
    porter: [{ x: 780, y: 1030, wait: 3.1 }, { x: 1380, y: 1050, wait: 4.2 }, { x: 1350, y: 890, wait: 3.3 }, { x: 750, y: 810, wait: 2.8 }],
    hunter: [{ x: 1460, y: 590, wait: 3.8 }, { x: 1100, y: 680, wait: 3 }, { x: 1110, y: 1050, wait: 4.4 }, { x: 1630, y: 650, wait: 3.2 }]
  };
  var CampResidents = class {
    constructor() {
      this.time = 0;
      this.key = null;
      this.actors = Object.entries(routes).map(([type, route], i) => ({ type, route, index: 0, wait: route[0].wait + i * 1.3, walk: new CampWalk(route[0]), speed: 0, maxSpeed: type === "porter" ? 65 : 78, blocked: 0, status: "rest" }));
    }
    tick(dt, state, hero, { paused = false } = {}) {
      if (paused || dt <= 0) return;
      dt = Math.min(dt, 0.05);
      this.time += dt;
      const obstacles = campObstacles(state), key = JSON.stringify(obstacles);
      if (key !== this.key) {
        if (this.key !== null) for (const a of this.actors) {
          a.walk.stop();
          a.wait = Math.min(a.wait, 0.3);
          a.blocked = 0;
        }
        this.key = key;
      }
      for (const a of this.actors) {
        const w = a.walk;
        w.moving = false;
        if (!w.free(w, obstacles)) {
          const o = obstacles.find((o2) => distance2(w, o2) < o2.r + CAMP_WORLD.radius);
          if (o) {
            const angle = Math.atan2(w.y - o.y, w.x - o.x);
            w.x = o.x + Math.cos(angle) * (o.r + CAMP_WORLD.radius + 8);
            w.y = o.y + Math.sin(angle) * (o.r + CAMP_WORLD.radius + 8);
          }
          w.stop();
          a.wait = 0.3;
          a.speed = 0;
        }
        if (a.wait > 0) {
          a.wait = Math.max(0, a.wait - dt);
          a.speed = 0;
          a.status = "rest";
          continue;
        }
        if (!w.path.length) {
          a.index = (a.index + 1) % a.route.length;
          const target = a.route[a.index];
          if (!w.goTo(target.x, target.y, obstacles)) {
            a.wait = 1;
            continue;
          }
          a.status = "walk";
        }
        const p = w.path[0], d = distance2(w, p), dir = { x: (p.x - w.x) / (d || 1), y: (p.y - w.y) / (d || 1) };
        const blockers = [hero, ...this.actors.filter((b) => b !== a).map((b) => b.walk)].filter(Boolean);
        const blocked = blockers.some((b) => {
          const gap = distance2(w, b);
          return gap < 58 && (b.x - w.x) * dir.x + (b.y - w.y) * dir.y > 0;
        });
        if (blocked) {
          a.speed = 0;
          a.blocked += dt;
          a.status = "yield";
          if (a.blocked > 1.2) {
            const goal = a.route[a.index];
            w.goTo(goal.x, goal.y, [...obstacles, ...blockers.filter((b) => distance2(w, b) < 100).map((b) => ({ x: b.x, y: b.y, r: 29 }))]);
            a.blocked = 0;
          }
          continue;
        }
        a.blocked = 0;
        a.status = "walk";
        const targetSpeed = w.path.length > 1 ? a.maxSpeed : Math.min(a.maxSpeed, Math.max(20, d * 3.5));
        a.speed += (targetSpeed - a.speed) * (1 - Math.exp(-dt * 6));
        w.tick(dt * a.speed / CAMP_WORLD.speed, {}, obstacles);
        if (!w.path.length) {
          a.wait = a.route[a.index].wait;
          a.speed = 0;
          a.status = "rest";
        }
      }
    }
    snapshot() {
      return this.actors.map((a) => ({ type: a.type, x: a.walk.x, y: a.walk.y, angle: a.walk.angle, moving: a.walk.moving, status: a.status }));
    }
  };

  // prototypes/emberwild/camp-renderer.mjs
  var oval = (c, x, y, rx, ry, color) => {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
  };
  var poly = (c, p, color, edge) => {
    c.beginPath();
    p.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.closePath();
    c.fillStyle = color;
    c.fill();
    if (edge) {
      c.strokeStyle = edge;
      c.lineWidth = 2;
      c.stroke();
    }
  };
  var line2 = (c, p, color, w = 2) => {
    c.beginPath();
    p.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.strokeStyle = color;
    c.lineWidth = w;
    c.lineCap = "round";
    c.stroke();
  };
  var text2 = (c, s, x, y, size = 13, color = "#f2e1b6") => {
    c.fillStyle = color;
    c.font = `600 ${size}px -apple-system,"PingFang TC",sans-serif`;
    c.textAlign = "center";
    c.fillText(s, x, y);
  };
  var CampRenderer = class extends Painter {
    constructor(canvas) {
      super(canvas);
      this.camera = { x: 0, y: 0 };
      this.snap = true;
      this.residents = new CampResidents();
      this.residentTime = 0;
    }
    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.w = r.width || 1e3;
      this.h = r.height || 700;
      this.dpr = experience.renderScale();
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
      this.scale = this.w < 760 ? Math.max(0.68, Math.min(0.88, this.w / 500)) : Math.max(0.72, Math.min(1.25, this.h / 760));
      this.visible = { w: this.w / this.scale, h: this.h / this.scale };
      this.snap = true;
    }
    point(x, y) {
      const r = this.canvas.getBoundingClientRect();
      return { x: (x - r.left) / this.scale + this.camera.x, y: (y - r.top) / this.scale + this.camera.y };
    }
    screen(x, y) {
      const r = this.canvas.getBoundingClientRect();
      return { x: r.left + (x - this.camera.x) * this.scale, y: r.top + (y - this.camera.y) * this.scale };
    }
    residentSnapshot() {
      return this.residents.snapshot();
    }
    nearestResident(walk, reach = CAMP_WORLD.reach) {
      return this.residentSnapshot().map((actor2) => ({ ...actor2, distance: Math.hypot(actor2.x - walk.x, actor2.y - walk.y) })).filter((actor2) => actor2.distance <= reach).sort((a, b) => a.distance - b.distance)[0] || null;
    }
    draw(walk, state, dt) {
      this.reduced = experience.reducedEffects();
      const c = this.c, t = this.reduced ? 0 : walk.time, want = { x: Math.max(0, Math.min(CAMP_WORLD.width - this.visible.w, walk.x - this.visible.w * 0.5)), y: Math.max(0, Math.min(CAMP_WORLD.height - this.visible.h, walk.y - this.visible.h * 0.57)) };
      const residentDt = Math.max(0, Math.min(0.05, walk.time - this.residentTime));
      this.residentTime = walk.time;
      this.residents.tick(residentDt, state, walk, { paused: this.reduced });
      for (const k of ["x", "y"]) this.camera[k] = this.snap ? want[k] : this.camera[k] + (want[k] - this.camera[k]) * (1 - Math.exp(-dt * 8));
      this.snap = false;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.fillStyle = "#1c382d";
      c.fillRect(0, 0, this.w, this.h);
      c.scale(this.scale, this.scale);
      c.translate(-this.camera.x, -this.camera.y);
      if (this.bg.complete && this.bg.naturalWidth) c.drawImage(this.bg, 0, 0, 2e3, 1700);
      else {
        c.fillStyle = "#6d8048";
        c.fillRect(0, 0, 2e3, 1700);
      }
      c.fillStyle = "#12352a3d";
      c.fillRect(0, 0, 2e3, 1700);
      for (const site of CAMP_SITES) {
        line2(c, [[960, 960], [(site.x + 960) / 2, 960], [site.x, site.y + 110]], "#ada47334", 73);
        line2(c, [[960, 960], [(site.x + 960) / 2, 960], [site.x, site.y + 110]], "#cab68726", 48);
      }
      for (let i = 0; i < (this.reduced ? 35 : 100); i++) {
        const x = 180 + i * 173 % 1620, y = 200 + i * 97 % 1350;
        oval(c, x, y, 3 + i % 4, 1.7, "#d5c38a33");
      }
      for (let i = 0; i < 34; i++) {
        const x = 170 + i * 283 % 1660, y = 180 + i * 397 % 1350;
        if (CAMP_SITES.some((s) => Math.hypot(s.x - x, s.y - y) < 165) || Math.hypot(x - 960, y - 960) < 220) continue;
        drawSprite(c, i % 4 ? "ferns" : "rocks", x, y, { height: i % 4 ? 32 + i % 3 * 6 : 55, width: 90, flip: !!(i % 2) });
      }
      const pond = { x: 420, y: 400 };
      oval(c, pond.x, pond.y, 132, 83, "#57745d");
      oval(c, pond.x, pond.y - 6, 118, 71, "#4a8a83");
      oval(c, pond.x - 12, pond.y - 9, 85, 50, "#72a59166");
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.ellipse(pond.x, pond.y, 25 + i * 16 + Math.sin(t + i) * 3, 10 + i * 10, 0, 0, Math.PI * 2);
        c.strokeStyle = "#b7d6b247";
        c.stroke();
      }
      const objects = CAMP_SITES.map((s) => ({ y: s.y, draw: () => this.site(s, state, t) }));
      for (const actor2 of this.residents.snapshot()) objects.push({ y: actor2.y, draw: () => this.residentActor(actor2, t, state.camp.tasks?.[actor2.type]) });
      const forge = state.camp.buildings.find((b) => b.type === "forge"), workSite = forge ? CAMP_SITES.find((s) => s.slot === forge.slot) : { x: 720, y: 790 };
      const smith = { x: workSite.x + 100, y: workSite.y + 85 };
      objects.push({ y: smith.y, draw: () => this.resident(smith.x, smith.y, t, 1) });
      const companions = state.profile.companions, selected = companions?.selected, progress = selected && companions.roster?.[selected];
      if (progress?.unlocked) {
        const angle = walk.angle || 0, partner = { type: selected, level: progress.level, x: walk.x - Math.cos(angle) * 46 + Math.sin(angle) * 30, y: walk.y - Math.sin(angle) * 34 + Math.cos(angle) * 27, angle, hp: 1, maxHp: 1 };
        objects.push({ y: partner.y, draw: () => this.companion(partner, t, true) });
      } else objects.push({ y: 1060, draw: () => {
        oval(c, 860, 1068, 45, 16, "#173a2b55");
        drawSprite(c, "sacred-egg", 860, 1080, { height: 118 });
        text2(c, "等待孵化的聖獸卵", 860, 1098, 12);
      } });
      for (let i = 0; i < 10; i++) {
        const x = 250 + i * 283 % 1500, y = 250 + i * 397 % 1250;
        if (CAMP_SITES.some((s) => Math.hypot(s.x - x, s.y - y) < 180) || Math.hypot(x - 960, y - 960) < 180) continue;
        objects.push({ y, draw: () => this.tree(x, y, i) });
      }
      objects.push({ y: walk.y, draw: () => {
        this.hero({ x: walk.x, y: walk.y, angle: walk.angle, moving: walk.moving, weapon: "spear", invulnerable: 0, swing: 0, dashTime: 0 }, walk.time);
      } });
      objects.sort((a, b) => a.y - b.y).forEach((o) => o.draw());
      const near = walk.nearest();
      if (near) {
        c.beginPath();
        c.ellipse(near.x, near.y + 12, 85, 35, 0, 0, Math.PI * 2);
        c.strokeStyle = "#f9dfa280";
        c.lineWidth = 2;
        c.setLineDash([5, 8]);
        c.stroke();
        c.setLineDash([]);
      }
      for (let i = 0; i < (this.reduced ? 6 : 22); i++) oval(c, 720 + i * 71 % 720 + Math.sin(t * 0.3 + i) * 25, 560 + i * 89 % 660 + Math.cos(t * 0.5 + i) * 14, 1.4, 1.4, "#f4df9977");
      if (walk.path.length) {
        const p = walk.path[walk.path.length - 1];
        c.beginPath();
        c.ellipse(p.x, p.y, 15, 7, 0, 0, Math.PI * 2);
        c.strokeStyle = "#ffe7ac";
        c.stroke();
      }
    }
    tree(x, y, i) {
      const c = this.c;
      oval(c, x, y + 12, 65, 24, "#1b3c2d49");
      if (drawSprite(c, i % 2 ? "fern-tree" : "broadleaf", x, y + 20, { height: 230 + i % 3 * 20, width: 240, flip: !!(i % 2) })) return;
      line2(c, [[x, y], [x - 8, y - 126]], "#64714b", 17);
      for (let k = 0; k < 4; k++) poly(c, [[x - 89 + k * 28, y - 80 - k % 2 * 35], [x - 61 + k * 30, y - 137 - k % 2 * 25], [x - 21 + k * 29, y - 115], [x + 1 + k * 26, y - 69]], ["#385d3c", "#4c713e", "#618247", "#537547"][k]);
    }
    residentActor(actor2, t, task) {
      const c = this.c, pose = this.actorPose("camp-" + actor2.type, actor2, t, actor2.type === "porter" ? 65 : 76);
      oval(c, actor2.x, actor2.y + 15, 18, 6, "#213f2d55");
      const painted = drawCharacter(c, actor2.type, actor2.x, actor2.y + 15, pose);
      if (!painted) this.resident(actor2.x, actor2.y, t, actor2.type === "porter" ? 0 : 2);
      if (task) {
        oval(c, actor2.x, actor2.y - 67, 15, 15, task.ready ? "#efc76e" : "#355d49");
        text2(c, task.ready ? "!" : "?", actor2.x, actor2.y - 62, 17, task.ready ? "#263526" : "#dce5bf");
      }
    }
    resident(x, y, t, i) {
      const c = this.c;
      oval(c, x, y + 15, 18, 6, "#213f2d55");
      if (drawSprite(c, ["porter", "smith", "hunter", "merchant"][i % 4], x, y + 17, { height: 79 })) return;
      c.save();
      c.translate(x, y);
      line2(c, [[-5, 6], [-7, 16]], "#615538", 6);
      line2(c, [[5, 6], [7, 16]], "#615538", 6);
      poly(c, [[-10, -19], [10, -19], [14, 8], [-13, 8]], i % 2 ? "#a79967" : "#567c73", "#365641");
      oval(c, 0, -27, 10, 12, "#cea477");
      poly(c, [[-13, -28], [0, -44], [14, -27]], "#69734e");
      if (i % 2) poly(c, [[8, -13], [22, -8], [21, 10], [7, 7]], "#b79761");
      c.restore();
    }
    site(s, state, t) {
      const c = this.c;
      c.save();
      c.translate(s.x, s.y);
      oval(c, 0, 15, 93, 35, "#1e432c35");
      if (s.kind === "plot") {
        const b = state.camp.buildings.find((b2) => b2.slot === s.slot);
        if (b) {
          this.facility(b, t);
          const ready = state.camp.production?.[b.type] || 0;
          if (ready > 0) {
            oval(c, 68, -184, 20, 20, "#e6c271");
            text2(c, String(ready), 68, -178, 14, "#213a2b");
          }
        } else {
          c.setLineDash([8, 10]);
          c.strokeStyle = "#e1dca782";
          c.lineWidth = 2;
          c.strokeRect(-69, -35, 138, 83);
          c.setLineDash([]);
          for (const [x, y] of [[-72, -33], [72, -33], [-72, 49], [72, 49]]) {
            line2(c, [[x, y], [x, y - 19]], "#967c50", 5);
            poly(c, [[x, y - 19], [x + 17, y - 14], [x, y - 6]], "#c6cc91");
          }
          text2(c, "＋", 0, 15, 29, "#ecdfab");
        }
        text2(c, b ? `${FACILITIES[b.type].name} ${"◆".repeat(b.level)}` : s.label, 0, b ? -208 : -65, 13);
      } else if (s.kind === "fire") {
        if (drawSprite(c, "campfire", 0, 24, { height: 128, width: 137 })) {
          const glow2 = c.createRadialGradient(0, -14, 2, 0, -14, 76);
          glow2.addColorStop(0, `rgba(255,180,66,${0.12 + Math.sin(t * 6) * 0.025})`);
          glow2.addColorStop(1, "#ffa64000");
          c.fillStyle = glow2;
          c.fillRect(-80, -94, 160, 160);
          for (let i = 0; i < 5; i++) oval(c, Math.sin(t * 2 + i) * 17, -27 - (t * 27 + i * 13) % 56, 1.5, 2, "#ffe4a4b3");
          text2(c, "營火 · 休整", 0, 63, 14);
          c.restore();
          return;
        }
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          oval(c, Math.cos(a) * 38, Math.sin(a) * 21, 11, 8, "#9aab81");
        }
        line2(c, [[-26, 8], [22, -9]], "#917047", 9);
        line2(c, [[-23, -9], [24, 9]], "#917047", 9);
        const glow = c.createRadialGradient(0, -15, 10, 0, -15, 140);
        glow.addColorStop(0, "#f9bb5836");
        glow.addColorStop(1, "#f9bb5800");
        c.fillStyle = glow;
        c.fillRect(-140, -155, 280, 280);
        poly(c, [[-21, 0], [-28, -27], [-12, -48], [-6, -30], [3, -72 - Math.sin(t * 8) * 6], [25, -29], [17, 4]], "#f1aa52");
        poly(c, [[-9, 0], [0, -32], [11, -11], [6, 3]], "#fff0b4");
        text2(c, "營火 · 休整", 0, 63, 14);
      } else if (s.kind === "merchant") {
        if (drawSprite(c, "merchant-stall", 0, 40, { height: 205, width: 229 })) {
          drawSprite(c, "merchant", 65, 56, { height: 77 });
          text2(c, "荒境行商", 0, -190, 18);
          text2(c, "建造 · 雇佣 · 武技", 0, 83, 12);
          c.restore();
          return;
        }
        for (const x of [-77, 77]) line2(c, [[x, 22], [x, -117]], "#8b7950", 7);
        poly(c, [[-95, -86], [-51, -142], [54, -142], [99, -86]], "#7a9970", "#cfca91");
        for (let i = 0; i < 5; i++) poly(c, [[-94 + i * 39, -86], [-51 + i * 21, -140], [-30 + i * 21, -140], [-75 + i * 39, -86]], i % 2 ? "#729772" : "#d1bd83");
        for (let i = 0; i < 7; i++) poly(c, [[-94 + i * 28, -86], [-80 + i * 28, -69], [-66 + i * 28, -86]], "#a9b481");
        this.resident(0, -4, 0, 3);
        poly(c, [[-70, -8], [71, -8], [71, 39], [-70, 39]], "#ad8f58", "#dac087");
        line2(c, [[-68, 7], [68, 7]], "#d2b577", 3);
        for (let i = 0; i < 4; i++) poly(c, [[-56 + i * 28, -10], [-51 + i * 28, -35], [-33 + i * 28, -32], [-31 + i * 28, -10]], ["#d6c292", "#8bae97", "#d1d8a9", "#9f9564"][i]);
        poly(c, [[87, 0], [119, -7], [119, 30], [87, 38]], "#b19460", "#d1bb84");
        text2(c, "荒境行商", 0, -170, 18);
        text2(c, "建造 · 雇佣 · 武技", 0, 72, 12);
      } else if (s.kind === "gate") {
        if (drawSprite(c, "gate", 0, 35, { height: 220, width: 221 })) {
          text2(c, "遠征山口", 0, -208, 18);
          text2(c, state.run ? "繼續已保存的遠征" : "出發 · 蕨谷", 0, 69, 13);
          c.restore();
          return;
        }
        for (const x of [-70, 70]) poly(c, [[x - 12, 30], [x - 14, -97], [x + 4, -125], [x + 19, -94], [x + 18, 30]], "#7a896c", "#c0c5a0");
        line2(c, [[-80, -101], [90, -111]], "#c2b48b", 12);
        poly(c, [[-34, -105], [42, -109], [39, -58], [5, -44], [-35, -63]], "#538b7c", "#a0c4a3");
        text2(c, "↗", 3, -72, 30);
        text2(c, "遠征山口", 0, -150, 18);
        text2(c, state.run ? "繼續已保存的遠征" : "出發 · 蕨谷", 0, 65, 13);
      }
      c.restore();
    }
    facility(b, t) {
      const c = this.c;
      if (drawSprite(c, b.type, 0, 28, { height: 210, width: 229 })) {
        for (let i = 0; i < b.level; i++) oval(c, (i - (b.level - 1) / 2) * 13, 47, 3, 3, "#f4d898");
        if (b.type === "forge") for (let i = 0; i < 3; i++) oval(c, -13 + Math.sin(t + i) * 6, -177 - i * 16 - t * 12 % 16, 8 + i * 3, 7 + i * 3, "#d5d9c129");
        if (b.level >= 2) drawSprite(c, "fence", -96, 32, { height: 43, width: 64 });
        return;
      }
      if (b.type === "tent") {
        poly(c, [[-84, 21], [-14, -111], [19, -116], [89, 20]], "#cfbd8a", "#6b7451");
        poly(c, [[-14, -111], [19, -116], [89, 20], [26, 21]], "#6b9177");
        poly(c, [[-19, -69], [-44, 21], [11, 21]], "#284b39");
        line2(c, [[-87, 23], [-15, -117], [92, 23]], "#e3d3a4", 4);
      }
      if (b.type === "forge") {
        poly(c, [[-67, 26], [-67, -53], [-43, -90], [48, -90], [77, -51], [77, 27]], "#909a7c", "#56694e");
        poly(c, [[38, -80], [38, -155], [63, -155], [63, -65]], "#6b8067");
        poly(c, [[-89, -62], [-47, -117], [56, -111], [92, -62]], "#628d76", "#b3c49a");
        poly(c, [[-34, 27], [-34, -24], [-13, -44], [20, -25], [20, 27]], "#243d2c");
        poly(c, [[-25, 18], [-21, -8], [-8, -29], [4, -2], [8, 20]], "#eeb966");
        for (let i = 0; i < 3; i++) oval(c, 49 + Math.sin(t + i) * 5, -174 - i * 21 - t * 12 % 20, 13 + i * 4, 9 + i * 3, "#ccd3ba35");
      }
      if (b.type === "cache") {
        poly(c, [[-77, 22], [-77, -61], [77, -61], [77, 22]], "#a28b5c", "#5e6946");
        for (let i = 0; i < 5; i++) line2(c, [[-72, 12 - i * 15], [74, 12 - i * 15]], "#c8ad74", 3);
        poly(c, [[-96, -59], [0, -125], [95, -58]], "#638867", "#c5caa0");
        poly(c, [[-19, 22], [-19, -42], [27, -42], [27, 22]], "#625836");
      }
      if (b.type === "nursery") {
        poly(c, [[-80, 20], [-80, -58], [0, -120], [80, -58], [80, 20]], "#bdd8ae86", "#ddd6a6");
        line2(c, [[-80, -58], [80, -58]], "#d7c997", 5);
        for (const x of [-40, 0, 40]) line2(c, [[x, 20], [x, -117 + Math.abs(x) * 0.7]], "#d7c997", 4);
        oval(c, 0, 11, 65, 17, "#8d8150");
        for (const [x, y] of [[-30, -4], [3, -16], [37, 0]]) {
          oval(c, x, y, 16, 24, "#e7e8b8");
          oval(c, x + 5, y + 3, 4, 8, "#a6bd87");
        }
      }
      for (let i = 0; i < b.level; i++) oval(c, -12 + i * 12, 47, 3, 3, "#f4d898");
      if (b.level >= 2) this.building({ x: -99, y: 28, type: "torch", r: 24 }, t, true);
    }
  };

  // prototypes/emberwild/camp-ui.mjs
  var $ = (id) => document.getElementById(id);
  var pictures = {
    tent: '<path d="M10 76L53 18l42 58z" fill="#467c69" stroke="#203f32" stroke-width="3"/><path d="M53 18l14 58H10z" fill="#c3ae79"/><path d="M53 40l-14 36h28z" fill="#293d29"/><path d="M49 14l48 65M54 14L8 80" stroke="#dec790" stroke-width="4"/><path d="M27 72l13-21" stroke="#ead9aa" stroke-width="2"/>',
    forge: '<path d="M17 79V47l23-23h37l17 25v30z" fill="#857e66"/><path d="M23 38h62l-14-22H43z" fill="#596d54"/><path d="M37 78V57a18 18 0 0136 0v21" fill="#29382b"/><path d="M51 75c-16-9-2-18 3-29 7 15 18 20 4 29" fill="#f5b968"/><path d="M56 71c-6-7-2-9 1-16 9 11 5 15-1 16" fill="#ffe5a3"/><path d="M79 17V3h12v31" fill="#74826b"/>',
    cache: '<path d="M13 80V39h77v41z" fill="#a78351"/><path d="M7 38l45-26 46 26z" fill="#52836a"/><path d="M20 46h63M20 57h63M20 69h63" stroke="#c6a76d" stroke-width="3"/><path d="M27 37v43m43-43v43" stroke="#5e553c" stroke-width="5"/><path d="M42 77V53h23v24" fill="#684e33"/><path d="M49 61h9v8h-9z" fill="#f0d58e"/>',
    nursery: '<path d="M10 79V47l43-29 41 29v32z" fill="#b9d8b170" stroke="#b0c698" stroke-width="3"/><path d="M9 47l44-29 41 29M53 18v61M12 49h80" stroke="#d8c99a" stroke-width="4"/><ellipse cx="54" cy="74" rx="28" ry="11" fill="#8a7448"/><ellipse cx="42" cy="61" rx="12" ry="17" fill="#e5e7bd"/><ellipse cx="64" cy="64" rx="10" ry="14" fill="#c7dba8"/><path d="M38 53l8 7m15-2l5 6" stroke="#99b881" stroke-width="4"/>'
  };
  var facilityIcon = (type) => spriteIcon(type, "facility-icon") || `<svg viewBox="0 0 106 96" class="facility-icon" aria-hidden="true"><ellipse cx="53" cy="83" rx="44" ry="9" fill="#10281c40"/>${pictures[type] || ""}</svg>`;
  var CampUI = class {
    constructor(store, { onError, onInteract, isPaused }) {
      this.store = store;
      this.onError = onError;
      this.onInteract = onInteract;
      this.isPaused = isPaused;
      this.walk = new CampWalk(store.state.camp.position);
      this.painter = new CampRenderer($("camp-world"));
      this.keys = /* @__PURE__ */ new Set();
      this.stick = { x: 0, y: 0 };
      this.pointer = null;
      this.sprint = false;
      this.busy = false;
      this.saving = null;
      this.lastSave = 0;
      this.lastFrame = 0;
      this.lastPowerFrame = 0;
      this.movingFrom = null;
      window.addEventListener("keydown", (e) => {
        if (!this.active || this.paused || e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", "e", "escape"].includes(k)) {
          e.preventDefault();
          if (k === "e") {
            if (!e.repeat) this.interact();
            return;
          }
          if (k === "escape") {
            this.movingFrom = null;
            this.clear();
            this.message("已取消行走或搬遷。");
            return;
          }
          this.keys.add(k);
        }
      });
      window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
      $("camp-world").addEventListener("pointerdown", (e) => {
        if (!this.active || this.paused || e.button > 0) return;
        e.preventDefault();
        $("camp-world").focus({ preventScroll: true });
        const p = this.painter.point(e.clientX, e.clientY), site = CAMP_SITES.find((s) => Math.hypot(s.x - p.x, s.y - p.y) < 85);
        if (site) this.travel(site.id);
        else if (!this.walk.goTo(p.x, p.y, campObstacles(this.store.state))) this.message("這裡無法通行，請點建築前方的空地。");
      });
      for (const event of ["contextmenu", "selectstart"]) $("camp").addEventListener(event, (e) => e.preventDefault());
      $("camp-waypoints-toggle").addEventListener("click", () => this.setWaypoints(!$("camp-waypoints").classList.contains("open")));
      for (const b of document.querySelectorAll("[data-walk-to]")) b.addEventListener("click", () => {
        this.setWaypoints(false);
        this.travel(b.dataset.walkTo);
      });
      $("camp-interact").addEventListener("click", () => this.interact());
      $("camp-cancel-move").addEventListener("click", () => {
        this.movingFrom = null;
        this.clear();
        this.message("已取消搬遷，原建築保持不變。");
      });
      $("camp-joystick").addEventListener("pointerdown", (e) => {
        if (!this.active || this.paused || this.pointer !== null) return;
        e.preventDefault();
        this.pointer = e.pointerId;
        $("camp-joystick").setPointerCapture(e.pointerId);
        this.moveStick(e);
      });
      $("camp-joystick").addEventListener("pointermove", (e) => this.moveStick(e));
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) $("camp-joystick").addEventListener(event, (e) => {
        if (e.pointerId === this.pointer) {
          this.pointer = null;
          this.stick = { x: 0, y: 0 };
          $("camp-stick").style.transform = "";
        }
      });
      $("camp-sprint").addEventListener("pointerdown", (e) => {
        if (this.paused) return;
        e.preventDefault();
        this.sprint = true;
        $("camp-sprint").setPointerCapture(e.pointerId);
      });
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) $("camp-sprint").addEventListener(event, () => this.sprint = false);
      new ResizeObserver(() => this.painter.resize()).observe($("camp-world"));
    }
    get active() {
      return !$("camp").hidden;
    }
    get paused() {
      return this.busy || this.store.blocked || this.isPaused() || document.hidden;
    }
    enter() {
      this.clear();
      this.setWaypoints(false);
      this.walk.restore(this.store.state.camp.position);
      this.ensureFree();
      this.painter.resize();
      this.render();
      this.lastFrame = performance.now();
      this.lastSave = this.lastFrame;
      this.movingFrom = null;
      this.message(this.store.warning || "自由走動，走近行商購買卡牌；空地可建設，山口可出征。");
    }
    setWaypoints(open) {
      $("camp-waypoints").classList.toggle("open", open);
      $("camp-waypoints-toggle").setAttribute("aria-expanded", String(open));
      $("camp-waypoints-toggle").textContent = open ? "收起" : "路標";
    }
    ensureFree() {
      if (this.walk.free(this.walk, campObstacles(this.store.state))) return;
      const near = CAMP_SITES.find((s) => Math.hypot(s.x - this.walk.x, s.y - this.walk.y) < 100);
      if (near) {
        this.walk.x = near.x;
        this.walk.y = near.y + 110;
      } else this.walk.restore(CAMP_WORLD.start);
    }
    clear() {
      this.keys.clear();
      this.stick = { x: 0, y: 0 };
      this.pointer = null;
      this.sprint = false;
      this.walk.stop();
      $("camp-stick").style.transform = "";
    }
    moveStick(e) {
      if (e.pointerId !== this.pointer) return;
      const r = $("camp-joystick").getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, max = r.width * 0.34, len = Math.max(max, Math.hypot(dx, dy));
      this.stick = { x: dx / len, y: dy / len };
      $("camp-stick").style.transform = `translate(${this.stick.x * max}px,${this.stick.y * max}px)`;
    }
    message(text3) {
      $("camp-message").textContent = text3;
    }
    nearbyResident() {
      return this.painter.nearestResident(this.walk);
    }
    canInteractResident(type) {
      return this.nearbyResident()?.type === type;
    }
    travel(id) {
      if (!this.active || this.paused) return;
      const s = CAMP_SITES.find((s2) => s2.id === id);
      if (!s) return;
      this.clear();
      if (this.walk.goTo(s.x, s.y + 110, campObstacles(this.store.state))) this.message(`正在走向${s.label}，抵達後按「互動」。`);
      else this.message("這條路暫時無法通行，請從另一側靠近。");
    }
    interact() {
      if (!this.active || this.paused) return;
      const resident = this.nearbyResident(), site = this.walk.nearest(), siteDistance = site ? Math.hypot(site.x - this.walk.x, site.y - this.walk.y) : Infinity, s = resident && resident.distance < siteDistance ? { id: `npc-${resident.type}`, kind: "npc", npc: resident.type, label: resident.type === "porter" ? "搬運工阿拓" : "巡林獵人瑟雅" } : site;
      if (!s) {
        this.message("再靠近一點，就能與設施或居民互動。");
        return;
      }
      experience.haptic("selection");
      this.clear();
      this.onInteract(s);
    }
    render() {
      $("camp-stones").textContent = this.store.state.camp.stones;
      $("camp-save-status").textContent = this.store.warning || (this.store.savedAt ? `✓ 本機已存檔 · ${new Date(this.store.savedAt).toLocaleTimeString("zh-TW", { hour12: false })}` : "移動、建設與交易自動存檔");
    }
    frame(t) {
      if (!this.active) {
        this.lastFrame = t;
        return;
      }
      if (experience.settings.effectiveLowPower && t - this.lastPowerFrame < 32) return;
      this.lastPowerFrame = t;
      const dt = Math.min((t - this.lastFrame) / 1e3 || 0, 0.05);
      this.lastFrame = t;
      const has = (k) => this.keys.has(k) ? 1 : 0;
      this.walk.tick(dt, { x: this.stick.x + has("d") + has("arrowright") - has("a") - has("arrowleft"), y: this.stick.y + has("s") + has("arrowdown") - has("w") - has("arrowup"), sprint: this.sprint || !!has("shift"), paused: this.paused }, campObstacles(this.store.state));
      this.painter.draw(this.walk, this.store.state, dt);
      const site = this.walk.nearest(), resident = this.nearbyResident(), siteDistance = site ? Math.hypot(site.x - this.walk.x, site.y - this.walk.y) : Infinity, s = resident && resident.distance < siteDistance ? { kind: "npc", npc: resident.type, label: resident.type === "porter" ? "搬運工阿拓" : "巡林獵人瑟雅" } : site, b = s?.kind === "plot" && this.store.state.camp.buildings.find((b2) => b2.slot === s.slot);
      $("camp-nearby").textContent = s ? b ? FACILITIES[b.type].name : s.label : "走近設施或居民互動";
      $("camp-interact").disabled = !s || this.paused;
      const label = controlLabel(s?.kind === "npc" ? "交談 / 委託" : s?.kind === "merchant" ? "交談 / 購物" : s?.kind === "gate" ? "準備出征" : s?.kind === "plot" ? b ? "查看 / 生產 / 升級" : this.movingFrom !== null ? "搬遷到此處" : "建設地塊" : "互動", "E");
      if ($("camp-interact").textContent !== label) $("camp-interact").textContent = label;
      $("camp-cancel-move").hidden = this.movingFrom === null;
      if (t - this.lastSave > 2500 && !this.paused) {
        this.lastSave = t;
        this.savePosition();
      }
    }
    positionChanged() {
      const p = this.store.state.camp.position, n = this.walk.snapshot();
      return !p || p.x !== n.x || p.y !== n.y || p.angle !== n.angle;
    }
    async savePosition() {
      if (this.saving) return this.saving;
      if (!this.active || this.busy || this.store.blocked || !this.positionChanged()) return;
      this.saving = this.store.mutate((s) => {
        s.camp.position = this.walk.snapshot();
      }).then(() => this.render()).catch((e) => this.onError(e)).finally(() => this.saving = null);
      return this.saving;
    }
    flush() {
      if (!this.active || this.busy || this.store.blocked || !this.positionChanged()) return;
      try {
        this.store.commit((s) => {
          s.camp.position = this.walk.snapshot();
        });
        this.render();
      } catch (e) {
        this.onError(e);
      }
    }
    async change(fn, message) {
      if (this.busy) return false;
      this.busy = true;
      this.clear();
      try {
        await this.store.mutate((s) => {
          fn(s);
          this.ensurePositionFor(s);
          s.camp.position = this.walk.snapshot();
        });
        experience.haptic("success");
        this.message(message);
        return true;
      } catch (e) {
        experience.haptic("warning");
        this.message(e.message);
        if (e.code === "CONFLICT" || /存檔|儲存/.test(e.message)) this.onError(e);
        return false;
      } finally {
        this.busy = false;
        this.render();
      }
    }
    ensurePositionFor(state) {
      if (!this.walk.free(this.walk, campObstacles(state))) {
        const s = this.walk.nearest();
        if (s) {
          this.walk.x = s.x;
          this.walk.y = s.y + 110;
        }
      }
    }
    build(type, slot) {
      if (!this.walk.canInteract("plot-" + slot)) {
        this.message("請走近這塊地，再建設或升級。");
        return false;
      }
      return this.change((s) => buildCamp(s, type, slot), `${FACILITIES[type].name} 已建設完成，並保存到本機。`);
    }
    moveBuilding(from, to) {
      if (!this.walk.canInteract("plot-" + to)) {
        this.message("請走近目的地塊，再放置建築。");
        return false;
      }
      return this.change((s) => moveCamp(s, from, to), "建築已搬遷並保存，沒有消耗營火石。");
    }
  };

  // prototypes/emberwild/background-music.mjs
  var AMBIENT_TRACK = new URL("./assets/audio/warmth-of-a-primeval-dawn.mp3", document.baseURI).href;
  var BATTLE_TRACK = new URL("./assets/audio/hold-the-ridge.mp3", document.baseURI).href;
  var TRACKS = Object.freeze({ ambient: AMBIENT_TRACK, battle: BATTLE_TRACK });
  function ambientScene({ screen, modal = "", phase = "" }) {
    if (["landing", "camp", "route"].includes(screen)) return true;
    return screen === "game" && phase !== "wave" && ["merchant", "end"].includes(modal);
  }
  function musicScene(state) {
    if (ambientScene(state)) return "ambient";
    if (state.screen === "game" && ["prep", "wave", "rest"].includes(state.phase) && !state.paused && !state.modal) return "battle";
    return null;
  }
  var BackgroundMusic = class {
    constructor({
      document: doc = globalThis.document,
      window: win = globalThis.window,
      createAudio = (src) => new Audio(src)
    } = {}) {
      this.document = doc;
      this.createAudio = createAudio;
      this.media = null;
      this.players = /* @__PURE__ */ new Map();
      this.track = null;
      this.volume = 0;
      this.unlocked = false;
      this.focused = true;
      this.pageActive = true;
      this.shellActive = true;
      this.blocked = false;
      this.pending = false;
      this.generation = 0;
      this.disposed = false;
      this.cleanups = [];
      const listen = (target, name, callback, options) => {
        target.addEventListener(name, callback, options);
        this.cleanups.push(() => target.removeEventListener(name, callback, options));
      };
      const unlock = () => {
        this.unlocked = true;
        this.focused = true;
        this.blocked = false;
        this.sync();
      };
      for (const name of ["pointerdown", "touchend", "click", "keydown"]) {
        listen(doc, name, unlock, { capture: true, passive: true });
      }
      listen(doc, "visibilitychange", () => this.sync());
      listen(win, "blur", () => {
        this.focused = false;
        this.sync();
      });
      listen(win, "focus", () => {
        this.focused = true;
        this.sync();
      });
      listen(win, "pagehide", () => {
        this.pageActive = false;
        this.sync();
      });
      listen(win, "pageshow", () => {
        this.pageActive = true;
        this.sync();
      });
      listen(win, "emberwild-shell-active", (event) => {
        this.shellActive = Boolean(event.detail?.active);
        this.sync();
      });
    }
    setState({ track, volume }) {
      const nextVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
      const nextTrack = track === "ambient" || track === "battle" ? track : null;
      if (this.track === nextTrack && this.volume === nextVolume) return;
      if (this.track !== nextTrack) {
        this.pause();
        this.track = nextTrack;
        this.blocked = false;
        if (nextTrack) this.media = this.players.get(nextTrack) || null;
      }
      this.volume = nextVolume;
      this.sync();
    }
    get shouldPlay() {
      return !this.disposed && this.unlocked && this.track !== null && this.volume > 0 && !this.document.hidden && this.focused && this.pageActive && this.shellActive;
    }
    pause() {
      if (!this.media || this.media.paused && !this.pending) return;
      ++this.generation;
      this.pending = false;
      this.media.pause();
    }
    sync() {
      if (this.disposed) return;
      for (const media of this.players.values()) {
        media.volume = this.volume * 0.55;
        media.muted = this.volume === 0;
      }
      if (!this.shouldPlay) {
        this.pause();
        return;
      }
      if (this.blocked || this.pending || this.media && !this.media.paused) return;
      const generation = ++this.generation;
      try {
        if (!this.media) {
          this.media = this.createAudio(TRACKS[this.track]);
          this.players.set(this.track, this.media);
          this.media.loop = true;
          this.media.preload = "auto";
          this.media.volume = this.volume * 0.55;
          const media = this.media;
          const onError = () => {
            if (this.media !== media) return;
            this.blocked = true;
            this.pause();
          };
          media.addEventListener("error", onError);
          this.cleanups.push(() => media.removeEventListener("error", onError));
        }
        this.pending = true;
        Promise.resolve(this.media.play()).then(() => {
          if (generation !== this.generation || this.disposed) return;
          this.pending = false;
          if (!this.shouldPlay) this.pause();
        }).catch(() => {
          if (generation !== this.generation || this.disposed) return;
          this.blocked = true;
          this.pause();
        });
      } catch {
        this.pending = false;
        this.blocked = true;
        this.pause();
      }
    }
    dispose() {
      this.disposed = true;
      this.pause();
      this.cleanups.splice(0).forEach((cleanup) => cleanup());
    }
  };

  // prototypes/emberwild/tutorial-ui.mjs
  var $2 = (id) => document.getElementById(id);
  var names = ["移動", "攻擊", "技能", "建造", "獎勵"];
  var center = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  var TutorialUI = class {
    constructor() {
      this.panel = $2("tutorial");
      this.last = "";
      this.lastHoles = "";
      this.lastPath = "";
      this.g = null;
      this.visible = false;
      this.layer = document.createElement("div");
      this.layer.id = "tutorial-layer";
      this.layer.hidden = true;
      this.layer.setAttribute("aria-hidden", "true");
      this.layer.innerHTML = '<svg class="tutorial-veil"><defs><mask id="tutorial-cutouts" maskUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="white"/><path id="tutorial-holes" fill="black"/></mask></defs><rect width="100%" height="100%" fill="#031b18" fill-opacity=".76" mask="url(#tutorial-cutouts)"/><path id="tutorial-path" fill="none" stroke="#ffe4a3" stroke-width="3" stroke-dasharray="7 7"/></svg><div id="tutorial-marker"><span></span></div><div id="tutorial-finger"><svg viewBox="0 0 48 60"><path d="M15 31V8c0-6 8-6 8 0v15c2-4 7-3 8 1 4-2 8 0 8 4 5 0 7 4 6 9l-3 15c-1 4-4 6-8 6H23c-4 0-6-2-8-5L4 37c-4-6 2-11 6-7l5 5" fill="#fff3d0" stroke="#5b4220" stroke-width="2.5"/></svg></div>';
      document.body.append(this.layer);
      for (const type of ["pointerdown", "click", "keydown"]) document.addEventListener(type, (e) => this.guard(e), true);
    }
    guard(e) {
      const g = this.g;
      if (!this.visible || !g || g.tutorial.version !== 2 || $2("game").hidden || !tutorialProtected(g) && !g.tutorial.reward && !mandatoryTutorial(g)) return;
      if (e.target.closest("#modal")) return;
      if (e.target.closest(mandatoryTutorial(g) ? "#tutorial-next,#tutorial-claim,#pause,#save-game" : "#tutorial,#pause,#return-camp,#save-game") && (e.type !== "keydown" || ["Enter", " "].includes(e.key))) return;
      if (e.type === "keydown" && ["Escape", "Tab"].includes(e.key)) return;
      const t = g.tutorial, waiting = tutorialWaiting(g) || !!t.reward;
      if (!waiting) {
        if (e.type === "keydown") {
          if (t.step === "move" && (mandatoryTutorial(g) ? ["d", "arrowright"] : ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]).includes(e.key.toLowerCase())) return;
          if (t.step === "skill" && e.key.toLowerCase() === (g.loadout.skills[0] === "shock" ? "k" : "j")) return;
          if (t.step === "build" && e.key === String(t.slot + 1)) return;
          if (["Enter", " "].includes(e.key) && this.allowedTarget(e.target, t, g)) return;
        } else if (this.allowedTarget(e.target, t, g)) return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      this.panel.classList.remove("tutorial-nudge");
      void this.panel.offsetWidth;
      this.panel.classList.add("tutorial-nudge");
    }
    allowedTarget(target, t, g) {
      const selector = { move: "#joystick", skill: "#skill-" + g.loadout.skills[0], build: '#hand [data-slot="' + t.slot + '"],#world' }[t.step];
      return selector && !!target.closest(selector);
    }
    render(g, blocked = false, painter = null) {
      const active = !!g && tutorialActive(g), visible = active && !blocked && !$2("game").hidden;
      this.g = g;
      this.visible = visible;
      this.panel.hidden = !visible;
      const t = g?.tutorial, step = active ? t.step : "", pending = !!t?.reward, skill = g?.loadout?.skills[0] || "volley";
      const forced = mandatoryTutorial(g), training = visible && (tutorialProtected(g) || pending || forced), waiting = visible && tutorialWaiting(g), intro = visible && (g.wave === 0 || t.version === 2 && !t.started);
      $2("arena").classList.toggle("tutorial-active", visible);
      $2("game").classList.toggle("tutorial-guided", visible);
      $2("game").classList.toggle("tutorial-training", training);
      $2("game").classList.toggle("tutorial-mandatory", forced);
      $2("joystick").inert = forced && (waiting || step !== "move");
      for (const card of $2("hand").querySelectorAll("[data-slot]")) {
        const locked = forced && (waiting || step !== "build" || Number(card.dataset.slot) !== t.slot);
        card.disabled = locked;
        card.classList.toggle("tutorial-locked", locked);
      }
      this.layer.hidden = !training;
      const touch = touchControls(), signature = [visible, step, pending, skill, g?.phase, t?.started, t?.awaiting, forced, touch].join("|");
      if (signature !== this.last) {
        this.last = signature;
        for (const node of document.querySelectorAll(".tutorial-focus")) node.classList.remove("tutorial-focus");
        if (visible) {
          const index = TUTORIAL_STEPS.indexOf(step), success = !!t.awaiting;
          const copy = {
            move: ["走進金色光圈", "按住左下搖桿向右拖動，帶獵人走進光圈。電腦按 D／→。"],
            attack: ["不用點，獵人會自動攻擊", "放開操作，看獵人擊中眼前的練習獸。平時只需移動到武器射程內。"],
            skill: ["點一下發光的技能", skill === "shock" ? "點右下「震擊」（K），擊退身邊的敵人。" : "點右下「齊射」（J），向眼前的敵人射出骨矛。"],
            build: ["按住卡牌，拖到金圈放開", "沿手勢拖動發光卡牌，預覽進入金圈後放開。也可點卡，再點金圈。"],
            reward: pending ? ["守護成功！收下戰利品", "木材 +" + t.reward.wood + "　獸骨 +" + t.reward.bone + "　琥珀 +" + t.reward.amber] : ["實戰：守住聖獸卵", "自由移動、使用技能和建造。擊退剩餘獸群後，回來領取獎勵。"]
          };
          if (t.version !== 2) {
            copy.move = ["先走動看看", "拖動左下搖桿，或用 WASD／方向鍵走一小段。"];
            copy.build = ["把一張卡拖進戰場", "拖下方建造卡到空地放開；也可點卡再點空地。"];
          }
          if (forced) {
            copy.move = ["只向右，走進金色光圈", "按住搖桿向右拖，或按 D／→。這一步只開放向右移動。"];
            if (!pending) copy.reward = ["觀察防線自動作戰", "先不用操作。獵人和剛建的弩台會消滅練習獸，結束後再領取獎勵。"];
          }
          if (touch) {
            copy.move[1] = forced ? "按住左下搖桿向右拖，走進金色光圈。這一步只開放向右移動。" : "按住左下搖桿拖動，帶獵人走進光圈。";
            copy.skill[1] = skill === "shock" ? "點右下「震擊」，擊退身邊的敵人。" : "點右下「齊射」，向眼前的敵人射出骨矛。";
          }
          const done = { move: ["移動完成！", "走位能追擊、採礦，也能避開敵人的攻擊。"], attack: ["看到了嗎？攻擊自動完成", "你只管移動和選位置，普通攻擊不需要一直點。"], skill: ["技能釋放成功！", "技能用完會冷卻；冷卻結束後，就能再次使用。"], build: ["建造成功！", "卡牌已消耗 1 張，建築會自動作戰。接下來守住聖獸卵！"] };
          const practice = g.runId.startsWith("practice-");
          if (forced) done.build = ["建造成功！", "現在觀察防線消滅練習獸。完成最後領獎步驟，才會解鎖自由操作。"];
          const text3 = intro ? ["跟著我，學會守護荒境", forced ? "這是必修訓練。現在只能跟著發光提示操作；完成五步並領獎，才會解鎖營地。" : practice ? "跟著發光的位置完成 5 個練習。試煉不改動原遠征、營地或資源。" : "一次只學一件事。發光的位置就是下一步；完成後點「繼續」。"] : success ? done[step] : copy[step];
          $2("tutorial-count").textContent = intro ? "獵人訓練 · 5 個小練習" : (success ? "✓ 已學會" : "正在練習") + " " + (index + 1) + " / 5";
          $2("tutorial-title").textContent = text3[0];
          $2("tutorial-copy").textContent = text3[1];
          $2("tutorial-progress").innerHTML = names.map((name, i) => '<span class="' + (i < index || i === index && success ? "complete" : i === index ? "current" : "") + '" ' + (i === index ? 'aria-current="step"' : "") + ">" + (i < index || i === index && success ? "✓" : i + 1) + " " + name + "</span>").join("");
          $2("tutorial-protection").textContent = forced ? "必修訓練 · 不可跳過 · 進度自動保存" : training ? "練習保護中 · 不會受傷 · 可隨時暫停" : "教學保護已解除 · 留意獵人與聖獸卵血量";
          $2("tutorial-next").hidden = pending || !(waiting || intro);
          $2("tutorial-next").textContent = intro ? "準備好了，開始移動 →" : step === "build" ? forced ? "繼續，觀察防線作戰 →" : "我準備好了，開始實戰 →" : "記住了，繼續 →";
          $2("tutorial-claim").hidden = !pending;
          $2("tutorial-skip").hidden = pending || forced;
          $2("tutorial-claim").textContent = forced ? "領取獎勵 · 解鎖營地與自由操作 ✓" : practice ? "領取練習獎勵 · 返回營地 ✓" : "領取獎勵 · 完成教學 ✓";
          this.panel.classList.toggle("tutorial-success", success || pending);
          this.panel.classList.toggle("tutorial-combat", step === "reward" && !pending && !forced);
          this.panel.dataset.step = step;
          if (waiting || pending) ($2("tutorial-next").hidden ? $2("tutorial-claim") : $2("tutorial-next")).focus({ preventScroll: true });
        }
      }
      if (!training || !painter) return;
      if (step === "attack" && t.version === 2 && !waiting) {
        const progress = "已命中 " + t.attackHits + " / 2 · 放開操作，看看自動攻擊";
        if ($2("tutorial-protection").textContent !== progress) $2("tutorial-protection").textContent = progress;
      }
      const target = pending ? $2("tutorial-claim") : waiting || intro ? $2("tutorial-next") : { move: $2("joystick"), attack: document.querySelector(".auto-attack-status"), skill: $2("skill-" + skill), build: document.querySelector('#hand [data-slot="' + (t.slot ?? 0) + '"]') }[step];
      target?.classList.add("tutorial-focus");
      const holes = [];
      const rect = (r, p = 7) => holes.push("M" + (r.x - p) + " " + (r.y - p) + "h" + (r.width + 2 * p) + "v" + (r.height + 2 * p) + "h" + (-r.width - 2 * p) + "Z");
      const circle = (p, r) => holes.push("M" + (p.x - r) + " " + p.y + "a" + r + " " + r + " 0 1 0 " + r * 2 + " 0a" + r + " " + r + " 0 1 0 " + -r * 2 + " 0Z");
      rect(this.panel.getBoundingClientRect(), 1);
      for (const id of forced ? ["pause", "save-game"] : ["pause", "return-camp", "save-game"]) rect($2(id).getBoundingClientRect(), 3);
      if (forced && step === "reward" && !pending) rect($2("world").getBoundingClientRect(), 0);
      if (target) rect(target.getBoundingClientRect());
      const hero = painter.screen(g.hero.x, g.hero.y), enemy = g.enemies.find((e) => e.hp > 0);
      if (!waiting && !pending) {
        circle(hero, Math.max(28, painter.scale * 48));
        if (enemy && ["attack", "skill"].includes(step)) circle(painter.screen(enemy.x, enemy.y), Math.max(34, painter.scale * 64));
      }
      const marker = $2("tutorial-marker"), finger = $2("tutorial-finger"), guiding = !waiting && !intro && !pending && !!target;
      marker.hidden = !(guiding && t.version === 2 && ["move", "build"].includes(step));
      finger.hidden = !(guiding && ["move", "skill", "build"].includes(step));
      let gesturePath = "";
      if (guiding) {
        let from = center(target), to = from;
        const world = t.version !== 2 ? null : step === "move" ? t.moveTarget : step === "build" ? t.buildSpot : null;
        if (world) {
          const spot = painter.screen(world.x, world.y), r = step === "build" ? painter.scale * TUTORIAL_BUILD_RADIUS : Math.max(24, painter.scale * 42);
          marker.hidden = false;
          marker.style.left = spot.x + "px";
          marker.style.top = spot.y + "px";
          marker.style.width = marker.style.height = r * 2 + "px";
          marker.firstElementChild.textContent = step === "move" ? "走到這裡" : "預覽放進圈內";
          circle(spot, r + 10);
          if (step === "move") {
            const d = Math.hypot(spot.x - hero.x, spot.y - hero.y) || 1;
            to = { x: from.x + (spot.x - hero.x) / d * 30, y: from.y + (spot.y - hero.y) / d * 30 };
          } else to = { x: spot.x, y: spot.y + (navigator.maxTouchPoints > 0 ? 55 : 0) };
        }
        if (["move", "skill", "build"].includes(step)) {
          finger.hidden = false;
          finger.style.left = from.x + "px";
          finger.style.top = from.y + "px";
          finger.style.setProperty("--gesture-x", to.x - from.x + "px");
          finger.style.setProperty("--gesture-y", to.y - from.y + "px");
          if (step === "build") gesturePath = "M" + from.x + " " + from.y + "L" + to.x + " " + to.y;
        }
      }
      if (gesturePath !== this.lastPath) {
        $2("tutorial-path").setAttribute("d", gesturePath);
        this.lastPath = gesturePath;
      }
      const holePath = holes.join("");
      if (holePath !== this.lastHoles) {
        $2("tutorial-holes").setAttribute("d", holePath);
        this.lastHoles = holePath;
      }
    }
  };

  // prototypes/emberwild/acceptance-reset.mjs
  var ACCEPTANCE_ORIGIN = "http://127.0.0.1:4174";
  var RESET_MARKER = "emberwild_acceptance_reset_v1";
  var PROGRESS_KEYS2 = Object.freeze(["emberwild_save_v2", "emberwild_save_v2_backup", "emberwild_prototype_v1"]);
  var backupKey = (id) => "emberwild_acceptance_backup_" + id;
  function applyAcceptanceReset(storage2, request, origin, now = Date.now()) {
    if (origin !== ACCEPTANCE_ORIGIN || request?.origin !== origin || request.enabled !== true || !/^acceptance-[a-zA-Z0-9-]{1,80}$/.test(request.id || "") || !Number.isFinite(request.expiresAt) || now > request.expiresAt) return false;
    if (storage2.getItem(RESET_MARKER) === request.id) return false;
    const records = Object.fromEntries(PROGRESS_KEYS2.map((key2) => [key2, storage2.getItem(key2)])), key = backupKey(request.id);
    if (!storage2.getItem(key)) {
      const raw = JSON.stringify({ id: request.id, origin, createdAt: now, records });
      storage2.setItem(key, raw);
      if (storage2.getItem(key) !== raw) throw new Error("清檔前備份未能寫入，原進度未清除。");
    } else {
      const old = JSON.parse(storage2.getItem(key));
      if (old.id !== request.id || old.origin !== origin || !old.records || !PROGRESS_KEYS2.every((k) => old.records[k] === null || typeof old.records[k] === "string")) throw new Error("清檔備份無法驗證，已保留現有資料。");
    }
    if (PROGRESS_KEYS2.some((k) => storage2.getItem(k) !== records[k])) throw new Error("另一個頁面剛更新了進度，請關閉其他遊戲頁後重試清檔。");
    for (const k of [...PROGRESS_KEYS2.slice(1), PROGRESS_KEYS2[0]]) storage2.removeItem(k);
    if (PROGRESS_KEYS2.some((k) => storage2.getItem(k) !== null)) throw new Error("清檔尚未完成；清檔前資料仍保存在獨立備份中。");
    storage2.setItem(RESET_MARKER, request.id);
    return true;
  }
  async function resetForLocalAcceptance(storage2, location2, locks) {
    if (location2.origin !== ACCEPTANCE_ORIGIN || new URLSearchParams(location2.search).has("qa")) return false;
    const response = await fetch("./acceptance-reset.json", { cache: "no-store", signal: AbortSignal.timeout(2e3) });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error("無法檢查本地清檔指令，請重新整理。");
    const request = await response.json(), apply2 = () => applyAcceptanceReset(storage2, request, location2.origin);
    return locks ? locks.request("emberwild-save-v2", apply2) : apply2();
  }

  // prototypes/emberwild/legal-links.mjs
  var LEGAL_URLS = Object.freeze({
    terms: "https://d1udhm4c9vjzph.cloudfront.net/ios-legal/terms-of-service.html",
    privacy: "https://d1udhm4c9vjzph.cloudfront.net/ios-legal/privacy-policy.html",
    deletion: "https://d1udhm4c9vjzph.cloudfront.net/ios-legal/account-deletion.html"
  });
  var allowed = new Set(Object.values(LEGAL_URLS));
  function openLegalURL(url, host = globalThis.window) {
    if (!allowed.has(url) || !host) return false;
    const bridge = host.android;
    if (bridge && typeof bridge.sdkToBrowser === "function") bridge.sdkToBrowser(url);
    else if (typeof host.open === "function") host.open(url, "_blank", "noopener,noreferrer");
    else return false;
    return true;
  }
  function installLegalLinks(root = globalThis.document, host = globalThis.window) {
    if (!root?.addEventListener) return () => {
    };
    const onClick = (event) => {
      const link = event.target?.closest?.("[data-legal-url]");
      if (!link || !root.contains(link)) return;
      event.preventDefault();
      openLegalURL(link.dataset.legalUrl, host);
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }

  // prototypes/emberwild/account-session.mjs
  var ACCOUNT_SESSION_KEY = "emberwild_account_session_v1";
  var clean = (value) => String(value || "").normalize("NFKC").replace(/[\u0000-\u001f\u007f<>"'`]/g, "").trim();
  function accountDisplayName({ nickname = "", account = "" } = {}) {
    const accountName = clean(account).split("@")[0];
    return (clean(nickname) || accountName || "荒境獵人").slice(0, 20);
  }
  function parse(raw) {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      if (value?.version !== 2 || typeof value.playerId !== "string" || !value.playerId.trim() || value.playerId.length > 128 || typeof value.label !== "string" || !value.label.trim() || value.label.length > 20 || !Number.isFinite(value.authenticatedAt) || !Number.isFinite(value.accessExpiresAt)) return null;
      return Object.freeze({ version: 2, playerId: value.playerId, label: value.label, authenticatedAt: value.authenticatedAt, accessExpiresAt: value.accessExpiresAt });
    } catch {
      return null;
    }
  }
  var AccountSession = class {
    constructor(storage2) {
      this.storage = storage2;
      this.current = null;
      this.reload();
    }
    reload() {
      try {
        this.current = parse(this.storage?.getItem?.(ACCOUNT_SESSION_KEY));
      } catch {
        this.current = null;
      }
      return this.current;
    }
    accept(value) {
      if (!value?.authenticated) throw new Error("登入狀態無效，請重新登入。");
      const playerId = clean(value.playerId).slice(0, 128), label = accountDisplayName({ nickname: value.displayName });
      const authenticatedAt = Number(value.authenticatedAt) * 1e3, accessExpiresAt = Number(value.accessExpiresAt) * 1e3;
      if (!playerId || !Number.isFinite(authenticatedAt) || !Number.isFinite(accessExpiresAt) || accessExpiresAt <= authenticatedAt) throw new Error("帳號服務回傳的登入狀態不完整。");
      const session = { version: 2, playerId, label, authenticatedAt, accessExpiresAt }, raw = JSON.stringify(session);
      try {
        this.storage?.setItem?.(ACCOUNT_SESSION_KEY, raw);
        if (this.storage?.getItem?.(ACCOUNT_SESSION_KEY) !== raw) throw new Error("登入狀態未能寫入");
      } catch {
        throw new Error("無法保存帳號顯示狀態，請確認裝置儲存空間。");
      }
      this.current = Object.freeze(session);
      return this.current;
    }
    clear() {
      try {
        this.storage?.removeItem?.(ACCOUNT_SESSION_KEY);
        if (this.storage?.getItem?.(ACCOUNT_SESSION_KEY) !== null) throw new Error("登入狀態未能清除");
      } catch {
        throw new Error("無法清除帳號顯示狀態，請稍後再試。");
      }
      this.current = null;
      return true;
    }
  };

  // prototypes/emberwild/native-auth.mjs
  var resultObject2 = (value) => {
    if (value && typeof value === "object") return value;
    try {
      return JSON.parse(String(value || ""));
    } catch {
      return {};
    }
  };
  var requestId2 = (host) => {
    if (typeof host.crypto?.randomUUID === "function") return host.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (typeof host.crypto?.getRandomValues === "function") host.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = bytes[6] & 15 | 64;
    bytes[8] = bytes[8] & 63 | 128;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  var NativeAuthError = class extends Error {
    constructor(code, message) {
      super(message);
      this.name = "NativeAuthError";
      this.code = code;
    }
  };
  var NativeAccountAuth = class {
    constructor(host = globalThis, { requestTimeoutMs = 35e3, statusTimeoutMs = 8e3 } = {}) {
      this.host = host;
      this.pending = null;
      this.requestTimeoutMs = requestTimeoutMs;
      this.statusTimeoutMs = statusTimeoutMs;
      const previous = typeof host.javaCallBack === "function" ? host.javaCallBack : null;
      host.javaCallBack = (value) => {
        try {
          previous?.(value);
        } finally {
          this.handle(value);
        }
      };
    }
    available() {
      return typeof this.host.android?.miniAuth === "function";
    }
    request(action, fields = {}) {
      if (this.pending) throw new NativeAuthError("AUTH_IN_PROGRESS", "另一項帳號操作正在處理，請稍候");
      if (!["status", "login", "register", "recover", "logout", "delete"].includes(action)) throw new NativeAuthError("INVALID_AUTH_ACTION", "不支援的帳號操作");
      if (!this.available()) throw new NativeAuthError("IOS_APP_REQUIRED", "請在 iOS App 內使用真實帳號服務");
      const id = requestId2(this.host), payload = { action, requestId: id, ...fields };
      return new Promise((resolve, reject) => {
        const pending = { requestId: id, action, resolve, reject };
        this.pending = pending;
        pending.timer = setTimeout(() => {
          if (this.pending !== pending) return;
          this.pending = null;
          reject(new NativeAuthError("AUTH_TIMEOUT", action === "register" ? "註冊回應逾時，請稍後先使用此帳號登入，確認是否已建立。" : "帳號服務回應逾時，請稍後重試。"));
        }, action === "status" ? this.statusTimeoutMs : this.requestTimeoutMs);
        try {
          this.host.android.miniAuth(JSON.stringify(payload));
        } catch (error) {
          clearTimeout(pending.timer);
          this.pending = null;
          reject(new NativeAuthError("NATIVE_BRIDGE_FAILED", error?.message || "無法連接帳號服務"));
        }
      });
    }
    status() {
      return this.request("status");
    }
    login(account, password) {
      return this.request("login", { account, password });
    }
    register(account, password, nickname, acceptedTermsVersion) {
      return this.request("register", { account, password, nickname, acceptedTermsVersion });
    }
    recover(account) {
      return this.request("recover", { account });
    }
    logout() {
      return this.request("logout");
    }
    deleteAccount() {
      return this.request("delete");
    }
    handle(value) {
      const payload = resultObject2(value), pending = this.pending;
      if (!pending || payload.requestId !== pending.requestId || payload.action !== pending.action) return false;
      clearTimeout(pending.timer);
      this.pending = null;
      if (payload.func === "onMiniAuthResult" && payload.code === "OK") {
        pending.resolve(payload.data && typeof payload.data === "object" ? payload.data : {});
        return true;
      }
      if (payload.func === "onMiniAuthFail") {
        pending.reject(new NativeAuthError(String(payload.code || "AUTH_FAILED"), String(payload.message || "帳號服務未能完成請求")));
        return true;
      }
      pending.reject(new NativeAuthError("INVALID_AUTH_RESPONSE", "帳號服務回應格式不正確"));
      return true;
    }
  };

  // prototypes/emberwild/sound-effects.mjs
  var asset = (name) => new URL(`./assets/audio/sfx/${name}`, document.baseURI).href;
  var SOUND_ASSETS = Object.freeze({
    attack: { files: ["attack-slice-1.m4a", "attack-slice-2.m4a"], gain: 0.36, interval: 0.11, channels: 2 },
    build: { files: ["build-wood.m4a"], gain: 0.5 },
    dash: { files: ["dash-cloth.m4a"], gain: 0.42 },
    collect: { files: ["collect-coins.m4a"], gain: 0.42 },
    kill: { files: ["kill-impact.m4a"], gain: 0.4, interval: 0.07, channels: 2 },
    hurt: { files: ["hurt-impact.m4a"], gain: 0.48, interval: 0.12 },
    combo: { files: ["reward-confirm.m4a"], gain: 0.5, interval: 0.12 },
    wave: { files: ["wave-horn.m4a"], gain: 0.58 },
    ignite: { files: ["ignite-crystal.m4a"], gain: 0.43, interval: 0.1 },
    skill: { files: ["skill-chop.m4a"], gain: 0.48, interval: 0.1 },
    weapon: { files: ["weapon-draw.m4a"], gain: 0.44 },
    purchase: { files: ["purchase-coins.m4a"], gain: 0.45 },
    objective: { files: ["wave-horn.m4a"], gain: 0.35, interval: 0.2 },
    "objective-complete": { files: ["reward-confirm.m4a"], gain: 0.52 },
    "weakpoint-broken": { files: ["skill-chop.m4a"], gain: 0.55, interval: 0.12 },
    "market-ready": { files: ["reward-confirm.m4a"], gain: 0.38 },
    ui: { files: ["ui-select.m4a"], gain: 0.34, interval: 0.04 },
    error: { files: ["error.m4a"], gain: 0.42, interval: 0.12 }
  });
  var clamp4 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  var clock = () => (globalThis.performance?.now?.() || Date.now()) / 1e3;
  var SoundEffects = class {
    constructor({ createAudio = (source) => new Audio(source), now = clock } = {}) {
      this.createAudio = createAudio;
      this.now = now;
      this.players = /* @__PURE__ */ new Map();
      this.cursor = /* @__PURE__ */ new Map();
      this.lastPlayed = /* @__PURE__ */ new Map();
      for (const [kind, definition] of Object.entries(SOUND_ASSETS)) {
        const channels = Math.max(1, definition.channels || 1), pool = [];
        for (const file of definition.files) for (let channel = 0; channel < channels; channel++) {
          const media = createAudio(asset(file));
          media.preload = "auto";
          media.playsInline = true;
          pool.push(media);
        }
        this.players.set(kind, pool);
      }
    }
    play(kind, volume = 1) {
      const definition = SOUND_ASSETS[kind], pool = this.players.get(kind);
      if (!definition || !pool?.length || volume <= 0) return false;
      const now = this.now(), last = this.lastPlayed.get(kind) ?? -Infinity;
      if (now - last < (definition.interval || 0)) return true;
      this.lastPlayed.set(kind, now);
      const available = pool.find((player2) => player2.paused || player2.ended);
      const index = this.cursor.get(kind) || 0, player = available || pool[index % pool.length];
      this.cursor.set(kind, (pool.indexOf(player) + 1) % pool.length);
      try {
        player.volume = clamp4(volume * definition.gain);
        player.currentTime = 0;
        Promise.resolve(player.play()).catch(() => {
        });
        return true;
      } catch {
        return false;
      }
    }
    dispose() {
      for (const pool of this.players.values()) for (const player of pool) {
        try {
          player.pause();
          player.currentTime = 0;
        } catch {
        }
      }
      this.players.clear();
    }
  };

  // prototypes/emberwild/app.mjs
  async function bootGame() {
    const $3 = (id) => document.getElementById(id);
    const syncControlMode = () => document.documentElement.dataset.touchControls = String(touchControls());
    syncControlMode();
    window.addEventListener("resize", syncControlMode);
    installLegalLinks(document, window);
    const qaMode = ["127.0.0.1", "localhost"].includes(location.hostname) ? new URLSearchParams(location.search).get("qa") : null;
    const STAGES = Object.freeze([
      { name: "蕨谷入口", region: "FERN VALLEY", hint: "守護聖獸卵", rule: "熟悉移動、自動攻擊與卡牌建造", tactic: "迅猛獸從林緣來襲 · 守住聖獸卵" },
      { name: "巨蕨巢道", region: "GIANT FERN HOLLOW", hint: "護送採集師", rule: "靠近採集師才能引導他穿越巢道", tactic: "貼近採集師帶路 · 擋住左右兩翼追兵" },
      { name: "潮汐濕地", region: "TIDAL MARSH", hint: "摧毀三座獸巢", rule: "母獸會召喚巢群；破壞暴露的孵化囊可阻止終末召喚", tactic: "避開毒沼預警 · 集火綠色孵化囊" },
      { name: "古獸石陣", region: "BEAST-STONE RUINS", hint: "50 秒限時採礦", rule: "在倒數結束前擊碎三處標記熔晶", tactic: "移動到金色標記晶礦 · 同時牽制重甲獸" },
      { name: "琥珀山脊", region: "AMBER RIDGE", hint: "營救受困弓手", rule: "清開牢籠周圍並守住救援圈四秒", tactic: "先擊退牢籠附近獸群 · 靠近完成救援" },
      { name: "熔灰林", region: "ASHEN CANOPY", hint: "灼熱伏擊", rule: "衝角獸分階段加速並召喚夾擊；衝鋒後肩甲短暫暴露", tactic: "離開橙色衝鋒線 · 回身擊破裂角肩甲" },
      { name: "月骨峽谷", region: "MOONBONE RAVINE", hint: "守住三處據點", rule: "獸群分路攻擊三座月骨據點", tactic: "巡防三線 · 任一據點被摧毀都會失敗" },
      { name: "泰坦聖所", region: "TITAN SANCTUARY", hint: "最終試煉", rule: "泰坦三階段召喚守衛；聚能時核心暴露，終階震地分內外雙環", tactic: "躲開震地圓環 · 攻擊琥珀核心可打斷蓄力" }
    ]);
    let g = null, painter = null, drag = null, selected = null, lastHand = "", modalKind = "", toastUntil = 0, lastTime = 0;
    let stickPointer = null, stickX = 0, stickY = 0, soundEnabled = experience.settings.volume > 0, fallbackAudio = null, lastSound = 0, lastAudibleVolume = experience.settings.volume || 0.65;
    let settingsResumeGame = false, settingsReturnToPause = false, lastRenderedFrame = 0, lastHUDFrame = 0, lastGuideFrame = 0;
    const HUD_FRAME_MS = 100, GUIDE_FRAME_MS = 50;
    const keys = /* @__PURE__ */ new Set();
    let storage2;
    try {
      storage2 = window.localStorage;
    } catch {
      storage2 = { getItem() {
        throw new Error("Storage unavailable");
      } };
    }
    let acceptanceResetError = null;
    try {
      await resetForLocalAcceptance(storage2, location, navigator.locks);
    } catch (error) {
      acceptanceResetError = error;
    }
    const store = new SaveStore(storage2, navigator.locks || null);
    const accountSession = new AccountSession(storage2);
    const tutorialUI = new TutorialUI();
    let campUI, checkpointPending = null, lastAutoSave = 0, working = false, pendingImport = null, saveFailed = false;
    let marketTab = "build", routeOrigin = "camp", companionResumeGame = false, loadoutDraft = null, shopCheckout = null;
    let currentPromotion = "", promotionTimer = 0, promotionEpoch = 0;
    let tutorialSaving = false, tutorialSaveView = null;
    let routeNoticeTimer = 0;
    let shellContentMode = "mini_only", shellSwitching = false, contentSwitchReturn = "", shellAppActive = true;
    const backgroundMusic = new BackgroundMusic();
    const soundEffects = new SoundEffects();
    const nativeStoreKit = new NativeStoreKitShop(window);
    const nativeAuth = new NativeAccountAuth(window);
    const normalizeContentMode = (value) => {
      const mode = String(value || "").trim().toLowerCase().replaceAll("-", "_");
      return ["mini_only", "online_only", "both"].includes(mode) ? mode : "mini_only";
    };
    function sdkContentMode() {
      try {
        return normalizeContentMode(JSON.parse(window.android?.getSdkStatus?.() || "{}").contentMode);
      } catch {
        return "mini_only";
      }
    }
    function updateContentSwitchUI() {
      const available = shellContentMode === "both";
      for (const button of document.querySelectorAll("[data-open-main-game]")) {
        button.hidden = !available;
        button.disabled = shellSwitching;
        button.setAttribute("aria-busy", String(shellSwitching));
      }
    }
    window.setShellContentMode = (value) => {
      shellContentMode = normalizeContentMode(value);
      updateContentSwitchUI();
      if (modalKind === "settings") renderSettings();
    };
    function syncBackgroundMusic() {
      const screen = !$3("landing").hidden ? "landing" : !$3("camp").hidden ? "camp" : !$3("route-map").hidden ? "route" : "game";
      backgroundMusic.setState({ track: musicScene({ screen, modal: modalKind, phase: g?.phase, paused: g?.paused }), volume: experience.settings.volume });
    }
    const readonlyQADemo = () => Boolean(qaMode && g?.runId?.startsWith("qa-"));
    const practiceRun = () => !!g?.runId?.startsWith("practice-");
    const shoppablePhase = (phase) => ["prep", "wave", "rest"].includes(phase);
    const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    function refreshAccountUI() {
      const session = accountSession.reload(), button = $3("landing-account");
      button.textContent = session ? session.label : "帳號";
      button.href = session ? "#account" : "login-preview.html";
      button.setAttribute("aria-label", session ? `${session.label}，帳號管理` : "帳號登入");
      button.title = session ? `${session.label} · 帳號管理` : "帳號登入";
      button.classList.toggle("signed-in", Boolean(session));
    }
    async function refreshNativeAccount() {
      if (!nativeAuth.available()) return;
      try {
        const status = await nativeAuth.status();
        if (status.authenticated) accountSession.accept(status);
        else accountSession.clear();
        refreshAccountUI();
      } catch (error) {
        if (error?.code === "AUTH_EXPIRED" || error?.code === "HTTP_401") {
          accountSession.clear();
          refreshAccountUI();
        }
      }
    }
    function refreshSaveUI() {
      const onboarding = onboardingRequired(store.state);
      $3("begin").innerHTML = onboarding ? store.state.run ? "繼續新手訓練 <span>→</span>" : "開始新手訓練 <span>→</span>" : "前往營地 <span>↗</span>";
      $3("onboarding-gate").hidden = !onboarding;
      $3("tutorial-replay").hidden = onboarding;
      $3("landing-settings").hidden = onboarding;
      $3("continue-run").hidden = !store.state.run || onboarding;
      $3("continue-run").textContent = store.state.run ? `繼續遠征 · 第 ${store.state.run.wave || 1} 波 ↗` : "繼續遠征 ↗";
      $3("landing-save-note").textContent = store.warning || "本機自動存檔 · 清除網站資料前請先匯出備份";
      refreshAccountUI();
      const qaReadonly = readonlyQADemo() || practiceRun();
      $3("save-game").disabled = qaReadonly;
      $3("save-game").textContent = practiceRun() ? "練" : qaReadonly ? "測" : saveFailed ? "!" : "存";
      $3("save-game").classList.toggle("save-error", saveFailed && !qaReadonly);
      $3("return-camp").setAttribute("aria-label", practiceRun() ? "退出試煉，返回營地" : "儲存並返回營地");
      $3("return-camp").hidden = mandatoryTutorial(g);
      $3("save-game").title = qaReadonly ? "試玩不寫入真實存檔" : saveFailed ? "儲存失敗，請重試" : store.savedAt ? `最後儲存 ${new Date(store.savedAt).toLocaleTimeString()}` : "儲存遠征";
      refreshCampStoreButtons();
      if (!$3("camp").hidden) campUI?.render();
    }
    function refreshCampStoreButtons() {
      const badge = $3("camp-gift-badge");
      if (!badge) return;
      const transactions = store.state.profile.purchaseTransactions;
      const available = ["pack-fortify", "pack-relic"].map(shopOffer).filter((offer) => offerAvailable(offer, transactions)).length;
      badge.textContent = available ? String(available) : "";
      $3("camp-gifts").classList.toggle("sold-out", available === 0);
      $3("camp-gifts").setAttribute("aria-label", available ? `限時禮包，${available} 個可購買` : "限時禮包，目前限定商品已購買");
    }
    function saveFailure(error) {
      saveFailed = true;
      clearInput();
      if (g) g.paused = true;
      refreshSaveUI();
      openModal("save-error", "先保護你的進度", error.message, '<p class="howto">未成功保存的操作不會顯示為「已存檔」。載入其他頁面的最新存檔，會放棄本頁未儲存的變更。</p>', error.code === "CONFLICT" ? '<button class="primary" data-action="reload-save">載入最新存檔</button><button class="secondary" data-action="export-save">匯出本機備份</button>' : '<button class="primary" data-action="retry-save">重試儲存</button><button class="secondary" data-action="export-save">匯出本機備份</button>');
    }
    async function checkpoint(manual = false) {
      if (tutorialSaving) return false;
      const game = g;
      if (!game || ["win", "lose"].includes(game.phase)) return true;
      if (readonlyQADemo() || practiceRun()) {
        if (manual) notify("試玩不會改動真實存檔");
        return true;
      }
      if (checkpointPending) return checkpointPending;
      lastAutoSave = performance.now();
      checkpointPending = store.saveRun(() => game.snapshot()).then(() => {
        saveFailed = false;
        refreshSaveUI();
        if (manual) notify("✓ 遠征已儲存到本機");
        return true;
      }).catch((error) => {
        saveFailure(error);
        return false;
      }).finally(() => {
        checkpointPending = null;
      });
      return checkpointPending;
    }
    function flush() {
      if (tutorialSaving) return;
      if (readonlyQADemo() || practiceRun()) return;
      if (working && modalKind === "merchant") return;
      if (campUI?.active && !saveFailed) {
        campUI.flush();
        if (saveFailed) return;
      }
      if (!g || ["win", "lose"].includes(g.phase) || store.state.run?.runId !== g.runId) return;
      try {
        store.flushRun(g.snapshot());
        saveFailed = false;
        refreshSaveUI();
      } catch (e) {
        saveFailed = true;
        refreshSaveUI();
      }
    }
    function sound(kind) {
      const volume = experience.settings.volume;
      if (!soundEnabled || volume <= 0) return;
      const sampleTime = performance.now() / 1e3;
      if (kind === "attack" && sampleTime - lastSound < 0.11) return;
      lastSound = sampleTime;
      if (soundEffects.play(kind, volume)) return;
      try {
        if (!fallbackAudio) fallbackAudio = new (window.AudioContext || window.webkitAudioContext)();
        if (fallbackAudio.state === "suspended") fallbackAudio.resume().catch(() => {
        });
        const now = fallbackAudio.currentTime;
        const notes = { attack: [180, 0.05, "triangle"], build: [510, 0.13, "sine"], dash: [280, 0.1, "sine"], collect: [860, 0.055, "sine"], kill: [370, 0.055, "triangle"], hurt: [95, 0.14, "triangle"], combo: [660, 0.18, "sine"], wave: [150, 0.3, "triangle"], ignite: [570, 0.05, "sine"] };
        const [freq, length, type] = notes[kind] || [440, 0.05, "sine"];
        const osc = fallbackAudio.createOscillator(), gain = fallbackAudio.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.55, now + length);
        gain.gain.setValueAtTime(0.035 * volume, now);
        gain.gain.exponentialRampToValueAtTime(1e-3, now + length);
        osc.connect(gain);
        gain.connect(fallbackAudio.destination);
        osc.start(now);
        osc.stop(now + length);
      } catch {
        soundEnabled = false;
        updateSoundButton();
      }
    }
    function updateSoundButton() {
      soundEnabled = experience.settings.volume > 0;
      $3("sound").classList.toggle("sound-on", soundEnabled);
      $3("sound").setAttribute("aria-pressed", String(soundEnabled));
      $3("sound").setAttribute("aria-label", soundEnabled ? "關閉聲音" : "開啟聲音");
    }
    function notify(message, duration = 2800) {
      $3("toast").textContent = message;
      $3("toast").classList.add("visible");
      toastUntil = performance.now() + duration;
    }
    function hideWaveLoot() {
      $3("wave-loot").hidden = true;
      $3("arena").classList.remove("showing-loot");
      if ($3("wave-loot").contains(document.activeElement)) $3("next-wave").focus({ preventScroll: true });
    }
    function showWaveLoot(reward) {
      $3("wave-loot-title").textContent = `${STAGES[g.wave - 1].name} · ${reward.objective || "目標完成"}`;
      $3("wave-loot-items").innerHTML = [["wood", "木材", "▰"], ["bone", "獸骨", "✧"], ["amber", "琥珀", "◆"]].map(([key, label, symbol]) => `<div class="wave-loot-item ${key}"><i aria-hidden="true">${key === "amber" ? spriteIcon("amber-crystal", "loot-crystal-art") : symbol}</i><span>${label}<b>+${reward[key]}</b></span></div>`).join("");
      $3("wave-loot-note").textContent = reward.survivors ? `保留 ${reward.survivors} 座建築 · 修復 ${reward.repair}% 耐久` : "防線已清理 · 可重新部署";
      $3("toast").classList.remove("visible");
      toastUntil = 0;
      $3("wave-loot").hidden = false;
      $3("arena").classList.add("showing-loot");
    }
    $3("dismiss-loot").addEventListener("click", hideWaveLoot);
    $3("loot-merchant").addEventListener("click", () => {
      hideWaveLoot();
      showMarket();
    });
    function clearInput() {
      campUI?.clear();
      keys.clear();
      stickX = stickY = 0;
      stickPointer = null;
      $3("stick").style.transform = "";
      cancelDrag();
      selected = null;
    }
    function cancelDrag() {
      if (g) g.building = false;
      drag = null;
      $3("drag-ghost").hidden = true;
      $3("build-indicator").hidden = true;
      document.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
    }
    function mountRun(game) {
      clearInput();
      closeModal();
      hideWaveLoot();
      g = game;
      setBattleDeck(false);
      $3("landing").hidden = true;
      $3("camp").hidden = true;
      $3("route-map").hidden = true;
      $3("game").hidden = false;
      lastHand = "";
      syncBackgroundMusic();
      if (!painter) painter = new Painter($3("world"));
      else painter.resize();
      updateHUD();
      renderHand();
      refreshSaveUI();
      lastTime = performance.now();
      lastAutoSave = lastTime;
    }
    async function start(replace = false) {
      if (working) return;
      working = true;
      try {
        if (campUI?.active) await campUI.savePosition();
        if (saveFailed) return;
        const next = createExpedition(store.state, (Date.now() ^ Math.floor(Math.random() * 4294967295)) >>> 0, crypto.randomUUID());
        await store.begin(next.snapshot(), replace);
        saveFailed = false;
        mountRun(next);
        if (mandatoryTutorial(g)) {
          g.startWave();
          handleEvents();
          updateHUD();
          await checkpoint();
        } else notify("營地加成已套用；拖卡佈防，準備好再召喚獸潮。", 4800);
        refreshSaveUI();
      } catch (error) {
        saveFailure(error);
      } finally {
        working = false;
      }
    }
    function beginOnboarding() {
      if (working) return;
      if (store.state.run) resumeRun();
      else start();
    }
    function showCamp(options = {}) {
      if (onboardingRequired(store.state) && !practiceRun()) {
        beginOnboarding();
        return;
      }
      clearInput();
      closeModal();
      g = null;
      tutorialUI.render(null);
      $3("landing").hidden = true;
      $3("game").hidden = true;
      $3("route-map").hidden = true;
      $3("camp").hidden = false;
      syncBackgroundMusic();
      campUI.enter();
      refreshSaveUI();
      window.scrollTo(0, 0);
      scheduleCampPromotions(Boolean(options?.afterTutorial));
    }
    function startTutorialPractice() {
      if (onboardingRequired(store.state)) {
        beginOnboarding();
        return;
      }
      if (working || checkpointPending || saveFailed) return;
      const game = new Expedition(17, "practice-" + crypto.randomUUID());
      game.enableTutorial();
      game.startWave();
      mountRun(game);
      window.scrollTo(0, 0);
    }
    function companionContent(message = "") {
      const companions = ensureCompanionState(store.state.profile);
      ensureCampProgress(store.state.camp);
      const phase = g?.phase || store.state.run?.phase, battleLocked = phase === "wave";
      const cards = Object.entries(COMPANIONS).map(([type, d]) => {
        const p = companions.roster[type], active = companions.selected === type, plan = hatchPlan(store.state, type), need2 = companionXPNeeded(p.level), percent = p.level >= COMPANION_MAX_LEVEL ? 100 : Math.min(100, p.xp / need2 * 100);
        const disabled = battleLocked || active || !p.unlocked && !plan.ok;
        const action = active ? "跟隨中" : p.unlocked ? "切換伙伴" : plan.ok ? plan.cost ? `孵化 · ♨ ${plan.cost}` : "孵化初始聖獸卵" : plan.reason;
        return `<article class="companion-choice ${active ? "active" : ""} ${p.unlocked ? "unlocked" : "locked"}" style="--companion:${d.color}">${spriteIcon(`companion-${type}`, "companion-portrait")}<header><span>${d.title}</span><b>${d.name}</b><small>${d.short}</small></header><p>${d.ability}</p><div class="companion-progress"><span><b>Lv.${p.level}</b><small>${p.level >= COMPANION_MAX_LEVEL ? "滿級" : `${p.xp} / ${need2} 經驗`}</small></span><i><em style="width:${percent}%"></em></i></div><button class="${active ? "secondary" : "primary"}" data-action="companion-select" data-companion="${type}" ${disabled ? "disabled" : ""}>${battleLocked ? "戰鬥中不可更換" : action}</button></article>`;
      }).join("");
      return `${message ? `<p class="companion-message">${message}</p>` : ""}<div class="camp-stockline"><span>溫室孵化熱度</span><b>♨ ${store.state.camp.stockpile.warmth}</b></div><div class="companion-grid">${cards}</div><p class="companion-note">焰脊迅龍來自初始聖獸卵；建造並升級獸卵溫室、完成遠征後領取孵化熱度，可孵化潮汐角龍與岩甲幼龍。伙伴經驗永久保留。</p>`;
    }
    function showCompanions(message = "") {
      if (mandatoryTutorial(g)) return;
      if (modalKind !== "companion") {
        companionResumeGame = Boolean(g && !$3("game").hidden && !g.paused);
        if (companionResumeGame) g.paused = true;
      }
      clearInput();
      openModal("companion", "聖獸孵化與伙伴", "選擇你的常駐伙伴。每隻聖獸都有獨立等級、戰鬥定位與專屬能力。", companionContent(message), '<button class="secondary" data-action="companion-close">返回</button>');
    }
    function closeCompanions() {
      closeModal();
      if (companionResumeGame && g) {
        g.paused = false;
        lastTime = performance.now();
        checkpoint();
      }
      companionResumeGame = false;
    }
    function loadoutContent(message = "") {
      const draft = loadoutDraft, buildCount = draft.cards.filter((id) => CARDS[id]).length, hireCount = draft.cards.filter((id) => HIRES[id]).length;
      const cardOption = (id, d, kind) => `<button class="loadout-option card-option ${draft.cards.includes(id) ? "selected" : ""}" data-loadout-card="${id}" aria-pressed="${draft.cards.includes(id)}">${icon(id)}<span><small>${kind}</small><b>${d.name}</b><em>${d.short}</em></span><i>${draft.cards.includes(id) ? "已攜帶" : "選擇"}</i></button>`;
      const choice = (kind, id, name, symbol, selected2, locked = false, lockText = "") => `<button class="loadout-option compact-option ${selected2 ? "selected" : ""} ${locked ? "locked" : ""}" data-loadout-${kind}="${id}" aria-pressed="${selected2}" ${locked ? "disabled" : ""}><span class="loadout-symbol">${symbol}</span><span><b>${name}</b><em>${selected2 ? "本次出征攜帶" : locked ? lockText : "點擊替換"}</em></span><i>${selected2 ? "✓" : locked ? "鎖" : ""}</i></button>`;
      const valid = isValidLoadout(draft);
      return `${message ? `<p class="loadout-message" role="status">${message}</p>` : ""}<div class="loadout-limits"><span class="${buildCount === LOADOUT_RULES.buildCards ? "ready" : ""}">建造卡 <b>${buildCount} / ${LOADOUT_RULES.buildCards}</b></span><span class="${hireCount === LOADOUT_RULES.hireCards ? "ready" : ""}">佣兵卡 <b>${hireCount} / ${LOADOUT_RULES.hireCards}</b></span><span class="ready">武器 <b>1 / 1</b></span><span class="ready">技能 <b>1 / 1</b></span></div>
  <section class="loadout-section"><header><span>BUILD DECK</span><h3>選擇三張建造卡</h3></header><div class="loadout-grid cards">${Object.entries(CARDS).map(([id, d]) => cardOption(id, d, "建造卡")).join("")}</div></section>
  <section class="loadout-section"><header><span>MERCENARY</span><h3>選擇一張佣兵卡</h3></header><div class="loadout-grid hires">${Object.entries(HIRES).map(([id, d]) => cardOption(id, d, "佣兵卡")).join("")}</div></section>
  <div class="loadout-pair"><section class="loadout-section"><header><span>WEAPON</span><h3>主武器</h3></header><div class="loadout-grid compact weapons">${Object.entries(WEAPONS).map(([id, weapon]) => {
        const selected2 = draft.weapons.includes(id), locked = !selected2 && !campWeaponUnlocked(store.state.camp, id), level = { bow: 1, blades: 2, hammer: 3 }[id];
        return choice("weapon", id, weapon.name, weapon.symbol, selected2, locked, level ? `骨器工坊 ${level} 級解鎖` : "");
      }).join("")}</div></section>
  <section class="loadout-section"><header><span>ACTIVE SKILL</span><h3>主動技能</h3></header><div class="loadout-grid compact">${choice("skill", "volley", ACTIVE_SKILLS.volley.name, "➶", draft.skills.includes("volley"))}${choice("skill", "shock", ACTIVE_SKILLS.shock.name, "✹", draft.skills.includes("shock"))}</div></section></div>
  <p class="loadout-note">配置保存於營地，只會在建立下一次遠征時固化；已在進行中的遠征不會被中途改寫。</p><span data-loadout-valid="${valid}"></span>`;
    }
    function renderLoadout(message = "") {
      const valid = isValidLoadout(loadoutDraft);
      openModal("loadout", "卡組與出征配置", "限制攜帶數量，先在營地決定本次遠征的建造、佣兵、武器與主動技能。", loadoutContent(message), `<button class="primary" data-action="loadout-save" ${valid ? "" : "disabled"}>保存配置</button><button class="secondary" data-action="loadout-close">取消</button>`);
    }
    function showLoadout() {
      if (onboardingRequired(store.state)) return;
      loadoutDraft = normalizeLoadout(ensureLoadoutState(store.state.camp));
      renderLoadout(store.state.run ? "已保存的遠征沿用原配置；本次修改將在重新出發時生效。" : "");
    }
    async function saveLoadout() {
      if (working || !isValidLoadout(loadoutDraft)) return;
      working = true;
      try {
        const next = normalizeLoadout(loadoutDraft);
        await store.mutate((state) => {
          state.camp.loadout = next;
        });
        saveFailed = false;
        refreshSaveUI();
        closeModal();
        campUI.message(`出征配置已保存 · ${next.cards.map((id) => DEPLOY_CARDS[id].name).join("、")} · ${WEAPONS[next.weapons[0]].name} · ${ACTIVE_SKILLS[next.skills[0]].name}`);
      } catch (error) {
        saveFailure(error);
      } finally {
        working = false;
      }
    }
    async function chooseCompanion(type) {
      if (working || !Object.hasOwn(COMPANIONS, type)) return;
      const phase = g?.phase || store.state.run?.phase;
      if (phase === "wave") {
        showCompanions("獸潮尚未結束，伙伴會堅守到本關結束後再更換。");
        return;
      }
      working = true;
      try {
        if (checkpointPending) await checkpointPending;
        if (g && store.state.run?.runId === g.runId) await store.saveRun(() => g.snapshot());
        let hatched = false;
        await store.mutate((s) => {
          const companions = ensureCompanionState(s.profile), p = companions.roster[type];
          if (!p.unlocked) {
            const plan = hatchPlan(s, type);
            if (!plan.ok) throw new Error(plan.reason);
            s.camp.stockpile.warmth -= plan.cost;
            p.unlocked = true;
            hatched = true;
          }
          companions.selected = type;
          if (s.run?.phase === "prep") {
            const run = Expedition.restore(s.run);
            run.setCompanion(type, p);
            s.run = run.snapshot();
          }
        });
        const progress = store.state.profile.companions.roster[type];
        if (g?.phase === "prep") g.setCompanion(type, progress);
        saveFailed = false;
        refreshSaveUI();
        experience.haptic(hatched ? "success" : "selection");
        sound(hatched ? "combo" : "build");
        working = false;
        showCompanions(hatched ? `${COMPANIONS[type].name}破殼而出，已加入你的永久伙伴隊伍。` : `已讓${COMPANIONS[type].name}跟隨本次遠征。`);
      } catch (error) {
        working = false;
        saveFailure(error);
      }
    }
    async function returnCamp() {
      if (mandatoryTutorial(g)) {
        notify("完成新手訓練並領取獎勵後，才會開放營地");
        return;
      }
      if (working || !g) return;
      working = true;
      $3("return-camp").disabled = true;
      clearInput();
      g.paused = true;
      try {
        if (await checkpoint()) showCamp();
      } finally {
        working = false;
        $3("return-camp").disabled = false;
      }
    }
    async function showHome() {
      if (campUI.active) await campUI.savePosition();
      if (saveFailed) return;
      clearInput();
      closeModal();
      g = null;
      $3("game").hidden = true;
      $3("camp").hidden = true;
      $3("route-map").hidden = true;
      $3("landing").hidden = false;
      syncBackgroundMusic();
      refreshSaveUI();
      $3("begin").focus();
    }
    function routeRun() {
      return g && (qaMode || store.state.run?.runId === g.runId) ? g : store.state.run;
    }
    function renderRoute() {
      const run = routeRun(), completed = Math.min(MAX_WAVES, run?.stats?.waves || 0), phase = run?.phase || "prep";
      const current = run ? phase === "wave" ? run.wave : Math.min(MAX_WAVES, run.wave + 1) : 1;
      $3("route-progress").textContent = `${completed} / ${MAX_WAVES}`;
      $3("route-status").textContent = phase === "wave" ? `${STAGES[current - 1].name}戰鬥尚未結束，點擊返回戰場。` : completed ? `已完成 ${completed} 關；下一站是${STAGES[current - 1].name}。` : "選擇蕨谷入口，開始這次遠征。";
      for (const node of document.querySelectorAll(".route-node")) {
        const stage = Number(node.dataset.stage), done = stage <= completed, active = phase === "wave" && stage === current, available = phase !== "wave" && stage === current, locked = !done && !active && !available;
        const mapEvent = run?.eventPlan?.find((event) => event.stage === stage);
        let badge = node.querySelector(".route-event-badge");
        if (mapEvent) {
          if (!badge) {
            badge = document.createElement("span");
            node.append(badge);
          }
          badge.className = `route-event-badge ${mapEvent.status}`;
          badge.textContent = mapEvent.status === "completed" ? "✓" : mapEvent.status === "missed" ? "×" : MAP_EVENT_DEFS[mapEvent.type].icon;
          badge.title = `地圖事件：${MAP_EVENT_DEFS[mapEvent.type].name}`;
        } else badge?.remove();
        node.classList.toggle("completed", done);
        node.classList.toggle("active", active);
        node.classList.toggle("available", available);
        node.classList.toggle("locked", locked);
        node.disabled = done || locked;
        node.querySelector(".route-marker").textContent = done ? "✓" : active ? "↗" : locked ? "◇" : String(stage);
        node.setAttribute("aria-label", `${STAGES[stage - 1].name}，${done ? "已完成" : active ? "戰鬥中，返回戰場" : available ? "可挑戰" : "尚未解鎖"}${mapEvent ? `，地圖事件：${MAP_EVENT_DEFS[mapEvent.type].name}` : ""}`);
      }
    }
    function focusCurrentRouteNode() {
      const viewport = $3("route-chapter-scroll"), target = document.querySelector(".route-node.active,.route-node.available") || $3("route-current-chapter");
      if (!viewport || !target) return;
      viewport.scrollTop = viewport.scrollHeight;
      const frame2 = viewport.getBoundingClientRect(), point2 = target.getBoundingClientRect();
      viewport.scrollTop = Math.max(0, viewport.scrollTop + point2.top - frame2.top - frame2.height * 0.56);
    }
    function showRouteComingSoon(label) {
      const notice = $3("route-coming-toast");
      clearTimeout(routeNoticeTimer);
      $3("route-status").textContent = `${label}正在製作中，敬請期待。`;
      notice.textContent = `${label} · 新篇章正在製作中，敬請期待`;
      notice.hidden = false;
      sound("ui");
      experience.haptic("selection");
      routeNoticeTimer = setTimeout(() => {
        notice.hidden = true;
        renderRoute();
      }, 2600);
    }
    async function showRoute(origin = "camp") {
      if (onboardingRequired(store.state) && !readonlyQADemo()) {
        beginOnboarding();
        return;
      }
      if (working || saveFailed) return;
      if (g?.tutorial?.reward) {
        notify("先領取第一關獎勵，再選擇下一關");
        return;
      }
      if (campUI.active) await campUI.savePosition();
      if (saveFailed) return;
      if (g && origin === "game") {
        if (!await checkpoint()) return;
        g.paused = true;
      }
      routeOrigin = origin;
      clearInput();
      closeModal();
      $3("landing").hidden = true;
      $3("camp").hidden = true;
      $3("game").hidden = true;
      $3("route-map").hidden = false;
      syncBackgroundMusic();
      renderRoute();
      window.scrollTo(0, 0);
      requestAnimationFrame(focusCurrentRouteNode);
      $3("route-back").focus();
    }
    function leaveRoute() {
      if (routeOrigin === "game" && g) {
        $3("route-map").hidden = true;
        $3("game").hidden = false;
        syncBackgroundMusic();
        g.paused = false;
        lastTime = performance.now();
        return;
      }
      if (routeOrigin === "home") {
        showHome();
        return;
      }
      showCamp();
    }
    async function chooseStage(stage) {
      if (working || saveFailed) return;
      const saved = routeRun();
      if (!saved) {
        if (stage !== 1) return;
        await start();
        if (!g) return;
      } else if (!g) {
        try {
          mountRun(Expedition.restore(store.state.run));
        } catch (error) {
          saveFailure(error);
          return;
        }
      } else mountRun(g);
      g.paused = false;
      lastTime = performance.now();
      if (g.phase === "wave" && stage === g.wave) {
        updateHUD();
        return;
      }
      if (g.phase !== "prep" || stage !== g.wave + 1) return;
      if (g.startWave()) {
        updateHUD();
        notify(`${STAGES[stage - 1].name} · 第 ${stage} 關開始`, 3200);
        await checkpoint();
      }
    }
    function renderShopSheet() {
      $3("shop-sheet")?.remove();
      $3("modal").classList.toggle("shop-open", ["merchant", "promotion"].includes(modalKind) && !!shopCheckout);
      if (!["merchant", "promotion"].includes(modalKind) || !shopCheckout) return;
      $3("modal").insertAdjacentHTML("beforeend", shopCheckoutHTML(shopCheckout.offer, shopCheckout.phase, shopCheckout.orderId, spriteIcon("shop-amber-ingot", "shop-ingot-art") || spriteIcon(shopCheckout.offer.art, "shop-pack-art"), shopCheckout.detail));
      $3("shop-sheet")?.querySelector("button")?.focus();
    }
    function openShopCheckout(id) {
      const offer = shopOffer(id);
      if (!offer || !["merchant", "promotion"].includes(modalKind)) return;
      if (!offerAvailable(offer, store.state.profile.purchaseTransactions)) {
        notify(offer.limit === "weekly" ? "本週禮包已購買" : "新手禮包已購買");
        return;
      }
      shopCheckout = { offer, phase: "confirm", orderId: "", detail: "" };
      renderShopSheet();
    }
    function closeShopCheckout() {
      if (shopCheckout?.phase === "pending") return;
      shopCheckout = null;
      renderShopSheet();
      if (modalKind === "merchant") $3("modal").querySelector('[data-market-tab][aria-pressed="true"]')?.focus();
      else if (modalKind === "promotion") {
        if (currentPromotion === "gift-center") {
          $3("modal-content").innerHTML = giftCenterContent();
          refreshCampStoreButtons();
        }
        $3("modal").querySelector("[data-shop-offer]:not([disabled])")?.focus();
      }
    }
    function giftCenterContent() {
      const transactions = store.state.profile.purchaseTransactions;
      return `<div class="gift-center-grid">${["pack-fortify", "pack-relic"].map(shopOffer).map((offer) => {
        const available = offerAvailable(offer, transactions), art = spriteIcon(offer.art, "promotion-pack-art") || spriteIcon("shop-amber-ingot", "promotion-pack-art");
        return `<article class="gift-center-card ${available ? "" : "sold"}"><div class="promotion-art">${art}<span>${offer.limit === "weekly" ? "每週限購" : "新手限購"}</span></div><small>APP STORE · ${offer.productId}</small><h3>${offer.name}</h3><p>${offer.description}</p><span class="shop-contents">${offerContents(offer)}</span><button type="button" class="shop-pay-btn" data-shop-offer="${offer.id}" ${available ? "" : "disabled"}><i>${available ? "查看商品" : "已購買"}</i><b>${available ? "使用 App Store 付款" : offer.limit === "weekly" ? "本週已購買" : "已購買"}</b></button></article>`;
      }).join("")}</div>`;
    }
    function showGiftCenter(automatic = false) {
      if (!store.state.run || !shoppablePhase(store.state.run.phase) || saveFailed) return;
      currentPromotion = "gift-center";
      openModal("promotion", automatic ? "營地補給" : "限時禮包", "禮包為自選付費商品，不購買也能完整遊玩。稍後可從營地「禮包」再次開啟；價格以 App Store 付款頁為準。", giftCenterContent(), `<button class="secondary" data-action="promotion-close">${automatic ? "先去營地 · 不購買" : "返回營地"}</button>`);
    }
    function cancelCampPromotions() {
      clearTimeout(promotionTimer);
      promotionTimer = 0;
      promotionEpoch++;
    }
    async function showCampPromotions(epoch, kinds, week) {
      if (epoch !== promotionEpoch || $3("camp").hidden || modalKind || working || saveFailed || !store.state.run) return;
      try {
        await store.markOfferPrompts(kinds, week);
        if (epoch !== promotionEpoch || $3("camp").hidden || modalKind || working || saveFailed) return;
        showGiftCenter(true);
      } catch (error) {
        if (epoch === promotionEpoch && !$3("camp").hidden) saveFailure(error);
      }
    }
    function scheduleCampPromotions() {
      cancelCampPromotions();
      currentPromotion = "";
      if (!store.state.profile.tutorialDone || !store.state.run || saveFailed) return;
      const prompts = ensureOfferPromptState(store.state.profile), week = offerWeekKey2(), transactions = store.state.profile.purchaseTransactions;
      const kinds = [];
      if (!prompts.starterShown && offerAvailable(shopOffer("pack-fortify"), transactions)) kinds.push("starter");
      if (prompts.weeklyShownWeek !== week && offerAvailable(shopOffer("pack-relic"), transactions)) kinds.push("weekly");
      const epoch = promotionEpoch;
      if (kinds.length) promotionTimer = setTimeout(() => showCampPromotions(epoch, kinds, week), 0);
    }
    function closePromotion() {
      if (shopCheckout?.phase === "pending") return;
      shopCheckout = null;
      currentPromotion = "";
      closeModal();
    }
    async function beginShopCheckout() {
      if (!shopCheckout || shopCheckout.phase !== "confirm") return;
      const checkout = shopCheckout, runId = g?.runId || store.state.run?.runId, phase = g?.phase || store.state.run?.phase;
      if (!offerAvailable(checkout.offer, store.state.profile.purchaseTransactions)) {
        shopCheckout = { ...checkout, phase: "error", detail: "此限定禮包已購買，沒有再次發起付款。" };
        renderShopSheet();
        return;
      }
      if (!runId || !shoppablePhase(phase)) {
        shopCheckout = { ...checkout, phase: "error", detail: "目前遠征無法接收商品，未發起付款。" };
        renderShopSheet();
        return;
      }
      shopCheckout = { ...checkout, phase: "pending", detail: "正在建立專屬訂單，請勿重複點擊。" };
      renderShopSheet();
      try {
        const authStatus = await nativeAuth.status();
        if (!authStatus.authenticated) throw Object.assign(new Error("請先登入正式帳號再購買。"), { code: "LOGIN_REQUIRED" });
        accountSession.accept(authStatus);
        refreshAccountUI();
        const result = await nativeStoreKit.purchase(checkout.offer);
        const source = g?.runId === runId ? g.snapshot() : store.state.run;
        if (!source || source.runId !== runId || !shoppablePhase(source.phase)) throw new Error("付款已驗證，但遠征狀態已變更；請勿重複購買");
        const delivered = grantOffer(source, checkout.offer);
        const fresh = await store.recordStoreKitDelivery(delivered, { transactionId: result.transactionId, offerId: checkout.offer.id });
        if (fresh && g?.runId === runId) g.inventory = { ...delivered.inventory };
        shopCheckout = { ...checkout, phase: "done", orderId: result.orderId, detail: fresh ? "付款已驗證，卡牌已發放並存檔。" : "這筆交易已發放過，沒有重複增加卡牌。" };
        saveFailed = false;
        refreshSaveUI();
        if (g) {
          updateHUD();
          renderHand();
        }
        const note = $3("market-message");
        if (note) note.textContent = shopCheckout.detail;
      } catch (error) {
        const pending = ["PENDING", "PURCHASE_RECOVERY_REQUIRED"].includes(error?.code);
        shopCheckout = { ...checkout, phase: "error", orderId: "", detail: pending ? "付款結果仍待伺服器確認，請勿重複購買。" : error?.message || "付款未完成，沒有發放卡牌。" };
        renderShopSheet();
      }
    }
    function showMarket(tab = marketTab, message = "") {
      if (mandatoryTutorial(g)) return;
      if (!g || !shoppablePhase(g.phase) || working) return;
      if (g.tutorial?.reward) {
        notify("先領取第一關獎勵，再找商人整備");
        return;
      }
      if (tab !== "shop") closeShopCheckout();
      marketTab = tab;
      g.paused = true;
      clearInput();
      openModal("merchant", tab === "shop" ? "荒境補給站" : "荒境行商", tab === "shop" ? "遠征卡牌補給 · 使用 App Store 安全付款" : g.wave ? `第 ${g.wave} 波已完成，先補貨，再出發。` : "本次遠征備貨：建造防線，雇佣伙伴，選擇武技。", marketContent(g, tab, message, store.state.profile.purchaseTransactions), campUI.active ? '<button class="primary" data-action="market-close">收好卡牌，繼續逛營地</button>' : '<button class="primary" data-action="market-close">返回戰場 · 部署卡牌</button><button class="secondary" data-action="save-camp">儲存並回營地</button>');
      renderShopSheet();
      if (tab === "shop") {
        const panel = $3("modal").querySelector(".modal-panel"), grid = $3("modal").querySelector(".shop-grid");
        if (panel) panel.scrollTop = 0;
        if (grid) grid.scrollLeft = 0;
      }
    }
    function closeMarket() {
      closeShopCheckout();
      closeModal();
      if (campUI.active) {
        g = null;
        campUI.render();
      } else if (g) {
        g.paused = false;
        lastTime = performance.now();
        checkpoint();
      }
    }
    async function openCampStore(kind = "recharge") {
      if (working || saveFailed || !campUI.active) return;
      working = true;
      let ready = false;
      try {
        if (!store.state.run) {
          const next = createExpedition(store.state, (Date.now() ^ Math.floor(Math.random() * 4294967295)) >>> 0, crypto.randomUUID());
          await store.begin(next.snapshot());
        }
        saveFailed = false;
        ready = true;
      } catch (error) {
        saveFailure(error);
      } finally {
        working = false;
      }
      if (!ready) return;
      refreshSaveUI();
      if (kind === "gifts") {
        cancelCampPromotions();
        g = null;
        showGiftCenter();
      } else {
        g = Expedition.restore(store.state.run);
        showMarket("shop", "直接選擇需要的遠征補給；實際金額與幣別以 App Store 系統付款頁為準。");
      }
    }
    async function visitMerchant() {
      if (working || !campUI.walk.canInteract("merchant")) return;
      working = true;
      clearInput();
      try {
        if (!store.state.run) {
          const next = createExpedition(store.state, (Date.now() ^ Math.floor(Math.random() * 4294967295)) >>> 0, crypto.randomUUID());
          await store.begin(next.snapshot());
        }
        g = Expedition.restore(store.state.run);
        saveFailed = false;
        working = false;
        showMarket("build", "備貨已建立本次遠征存檔，營地加成已套用。購買後可繼續逛營地，再走到山口出發。");
        refreshSaveUI();
      } catch (error) {
        saveFailure(error);
      } finally {
        working = false;
      }
    }
    function campSite(site) {
      if (site.kind === "npc" ? !campUI.canInteractResident(site.npc) : !campUI.walk.canInteract(site.id)) return;
      const state = store.state;
      ensureCampProgress(state.camp);
      const back = '<button class="secondary" data-action="close-camp-site">繼續逛營地</button>';
      if (site.kind === "npc") {
        const task = state.camp.tasks[site.npc], def = CAMP_TASKS[site.npc], reward = [def.reward.wood ? `木材 ${def.reward.wood}` : "", def.reward.bone ? `獸骨 ${def.reward.bone}` : "", def.reward.amber ? `琥珀 ${def.reward.amber}` : "", def.reward.stones ? `營火石 ${def.reward.stones}` : ""].filter(Boolean).join(" · ");
        openModal("camp-site", `${def.name} · ${def.title}`, task.ready ? "委託已完成，和居民交談領取報酬。" : def.detail, `<div class="camp-task-card ${task.ready ? "ready" : ""}"><span>${task.ready ? "!" : "?"}</span><div><small>可重複營地委託</small><b>${task.ready ? "等待交付" : `${task.progress} / ${task.goal}`}</b><i><em style="width:${Math.min(100, task.progress / task.goal * 100)}%"></em></i><p>報酬：${reward}</p></div></div>`, `${task.ready ? `<button class="primary" data-action="camp-task-claim" data-npc="${site.npc}">交付委託 · 領取報酬</button>` : ""}${back}`);
        return;
      }
      if (site.kind === "merchant") {
        visitMerchant();
        return;
      }
      if (site.kind === "gate") {
        openModal("camp-site", "遠征山口", state.run ? "你的遠征進度與卡牌仍在，從地圖返回目前關卡。" : "穿過山口，選擇第一站開始遠征。", `<p id="camp-run-summary" class="howto">${state.run ? `已保存：完成 ${state.run.stats?.waves || 0} / ${MAX_WAVES} 關 · ${Math.ceil(state.run.hero.hp)} 生命` : `${MAX_WAVES} 個地區 · 戰勝獲得材料 · 自由購買卡牌`}</p>`, `<button id="camp-start" class="primary" data-action="camp-depart">查看遠征地圖 ↗</button>${state.run ? '<button id="camp-new" class="secondary" data-action="camp-new">放棄這次遠征，重新出發</button>' : ""}${back}`);
        return;
      }
      if (site.kind === "fire") {
        const stock = state.camp.stockpile;
        openModal("camp-site", "火種仍在，歡迎回家", "永久設施按完成關卡生產，走近建築領取；木材、獸骨與琥珀會裝入下一次新遠征。", `<div class="camp-stockline"><span>營地倉儲</span><b>▰ ${stock.wood}　✧ ${stock.bone}　◆ ${stock.amber}　♨ ${stock.warmth}</b></div><div class="camp-bonus-list">${Object.entries(FACILITIES).map(([type, d]) => {
          const b2 = state.camp.buildings.find((b3) => b3.type === type), ready = state.camp.production[type];
          return `<div><span>${d.name}</span><b>${b2 ? `${d.benefit(b2.level)}${ready ? ` · 待領 ${ready}` : ""}` : "尚未建造"}</b></div>`;
        }).join("")}</div><p class="howto">遠征 ${state.profile.runs} 次 · 最佳 ${state.profile.best}/${MAX_WAVES} · 通關 ${state.profile.victories} 次<br>${state.lastResult ? `上次帶回 ${state.lastResult.stones} 營火石。` : ""}</p>`, back);
        return;
      }
      const b = state.camp.buildings.find((b2) => b2.slot === site.slot);
      if (!b && campUI.movingFrom !== null) {
        openModal("camp-site", "把建築安置在這裡？", "免費搬遷，不改變建築等級或營地加成。", "", `<button class="primary" data-action="camp-place-building" data-slot="${site.slot}">確認搬遷</button>${back}`);
        return;
      }
      if (b) {
        const d = FACILITIES[b.type], production = CAMP_PRODUCTION[b.type], ready = state.camp.production[b.type];
        openModal("camp-site", `${d.name} · ${b.level} 級`, d.desc, `${facilityIcon(b.type)}<div class="facility-output ${ready ? "ready" : ""}"><span>${production.icon}</span><div><small>${production.per}，產量乘設施等級</small><b>${ready ? `${production.name} ×${ready} 等待領取` : `${production.name}尚在生產`}</b></div></div><p class="howto">目前效果：${d.benefit(b.level)}。<br>選擇搬遷後，走到另一塊空地安置。點「取消搬遷」即可取消。</p>`, `${ready ? `<button class="primary" data-action="facility-collect" data-facility="${b.type}">領取 ${production.icon} ×${ready}</button>` : ""}${b.level < 3 ? `<button class="primary" data-action="facility-upgrade" data-slot="${b.slot}" ${state.camp.stones < d.costs[b.level] ? "disabled" : ""}>升級 · ✦ ${d.costs[b.level]}</button>` : ""}<button class="secondary" data-action="camp-move-building" data-slot="${b.slot}">搬遷建築</button>${back}`);
        return;
      }
      openModal("camp-site", site.label + " · 建設", "選擇一張永久建築藍圖。每種一座，最高三級；營火石不足時可先遠征。", `<div class="camp-blueprint-options">${Object.entries(FACILITIES).map(([type, d]) => {
        const owned = state.camp.buildings.some((b2) => b2.type === type), disabled = owned || state.camp.stones < d.costs[0];
        return `<button data-action="camp-build" data-facility="${type}" data-slot="${site.slot}" ${disabled ? "disabled" : ""}>${facilityIcon(type)}<b>${d.name}</b><small>${d.benefit(1)}</small><small>${owned ? "已建造，走近原建築升級" : `建造 · ✦ ${d.costs[0]}`}</small></button>`;
      }).join("")}</div>`, back);
    }
    async function purchase(id) {
      if (working || modalKind !== "merchant" || !g) return;
      working = true;
      $3("modal").setAttribute("aria-busy", "true");
      $3("modal").querySelectorAll("button").forEach((button) => button.disabled = true);
      if (checkpointPending) await checkpointPending;
      if (saveFailed) {
        working = false;
        return;
      }
      const before = g.snapshot(), result = g.buy(id);
      if (!result.ok) {
        working = false;
        showMarket(marketTab, result.reason);
        return;
      }
      try {
        await store.saveRun(() => g.snapshot());
        saveFailed = false;
        refreshSaveUI();
        working = false;
        showMarket(marketTab, `已購買 ${DEPLOY_CARDS[id]?.name || UPGRADES.find((u) => u.id === id.slice(6)).name}，材料與卡牌已存檔。`);
        document.querySelector(`[data-buy="${id}"]`)?.focus();
      } catch (error) {
        g = Expedition.restore(before);
        working = false;
        saveFailure(error);
      }
    }
    function showResult(result) {
      const waveStones = result.waves * 2, clearStones = Math.max(0, result.stones - waveStones), state = result.won ? "win" : "loss";
      const rank = result.won ? result.combos >= 8 || result.kills >= 45 ? "S" : "A" : result.waves >= 4 ? "B" : "C";
      const route = STAGES.map((stage, i) => `<div class="result-stage ${i < result.waves ? "cleared" : i === result.waves ? "stopped" : ""}" style="--i:${i}"><i>${i < result.waves ? "✓" : i + 1}</i><span>${stage.name}</span></div>`).join("");
      const loot = result.loot || { wood: 0, bone: 0, amber: 0, harvested: 0 };
      const lootItems = [
        { kind: "stones", icon: "✦", name: "營火石", quantity: `+${result.stones}`, note: "永久營地" },
        { kind: "wood", icon: "▰", name: "木材", quantity: `×${loot.wood}`, note: "本局結算" },
        { kind: "bone", icon: "✧", name: "獸骨", quantity: `×${loot.bone}`, note: "本局結算" },
        { kind: "amber", icon: spriteIcon("amber-crystal", "loot-crystal-art"), name: "琥珀", quantity: `×${loot.amber}`, note: loot.harvested ? `採集 ${loot.harvested} 處晶礦` : "本局結算" }
      ].map((item) => `<div class="loot-item ${item.kind}"><span class="loot-icon">${item.icon}</span><div><small>${item.name}</small><b>${item.quantity}</b></div><em>${item.note}</em></div>`).join("");
      const content = `<div class="result-screen ${state}"><div class="result-ribbon"><span>${result.won ? "EXPEDITION CLEARED" : "EXPEDITION ENDED"}</span><b>RANK <em>${rank}</em></b></div><div class="result-route" aria-label="遠征關卡進度">${route}</div><div class="result-hero"><div class="result-emblem-wrap"><img class="result-emblem" src="assets/painted-v1/victory-reward-v1.png" alt="${result.won ? "聖獸卵、骨矛、骨斧與營火石組成的通關徽記" : "本次遠征帶回的營火石"}"></div><div class="reward-total"><small>${result.won ? "守護成功 · 戰利品入庫" : "本次遠征收穫"}</small><div class="reward-payout"><span>◆</span><strong>+${result.stones}</strong><b>營火石</b></div><p>${result.won ? "聖獸卵安然無恙，這片土地的火種得以延續。" : "完成波次的營火石已安全帶回；整備營地後可以再次出發。"}</p><div class="reward-breakdown"><div><span>波次收集</span><b>+${waveStones}</b><small>${result.waves} 關 × 2</small></div><div class="${clearStones ? "bonus" : "locked"}"><span>最終守護</span><b>${clearStones ? `+${clearStones}` : "—"}</b><small>${clearStones ? "擊退琥珀泰坦" : `通過第 ${MAX_WAVES} 關解鎖`}</small></div></div></div></div><section class="loot-section" aria-label="本次獲得物品"><header><h3>本次獲得</h3><span>4 種戰利品</span></header><div class="loot-grid">${lootItems}</div><p>營火石已存入永久營地；木材、獸骨與琥珀顯示遠征結束時的持有量。</p></section><div class="result-stats"><div><i>▰</i><b>${result.waves}/${MAX_WAVES}</b><span>抵達關卡</span></div><div><i>爪</i><b>${result.kills}</b><span>擊敗獸群</span></div><div><i>✦</i><b>${result.combos}</b><span>建築共鳴</span></div></div><p class="reward-note"><span>✓</span> 營火石獎勵已安全寫入永久營地。</p></div>`;
      openModal("end", result.won ? "遠征結算" : "遠征結算", result.won ? "八處荒境全部平定，獎勵已安全結算。" : `抵達第 ${Math.max(1, result.waves)} 關，已保留本次可結算獎勵。`, content, `<button class="primary" data-action="camp">${result.won ? "收下獎勵 · 返回營地" : "帶回收穫 · 返回營地"} ↗</button><button class="secondary" data-action="restart">再次遠征</button>`);
    }
    async function settle() {
      if (practiceRun()) {
        showCamp();
        return;
      }
      if (working) return;
      working = true;
      const game = g;
      try {
        const result = await store.complete(game.snapshot());
        saveFailed = false;
        refreshSaveUI();
        showResult(result);
      } catch (error) {
        saveFailure(error);
      } finally {
        working = false;
      }
    }
    function resumeRun() {
      if (working || !store.state.run) return;
      try {
        mountRun(Expedition.restore(store.state.run));
        if (mandatoryTutorial(g)) {
          openModal("restored", "繼續新手訓練", "已保存你完成的步驟。完成五步訓練並領獎後，才會開放營地與自由遠征。", "", '<button class="primary" data-action="resume">繼續目前教學 →</button>');
          return;
        }
        if (["win", "lose"].includes(g.phase)) settle();
        else openModal("restored", "歡迎回到營地", `已還原第 ${g.wave || 1} 波、建築、佣兵、材料與卡牌庫存。離線期間沒有推進戰鬥。`, '<p class="howto">目前保持暫停，準備好再繼續。休整時可以找商人自由補貨。</p>', '<button class="primary" data-action="resume">繼續戰鬥</button><button class="secondary" data-action="save-camp">回到營地</button>');
      } catch (error) {
        saveFailure(error);
      }
    }
    function cardHTML(type, slot, ghost = false) {
      if (!type) return `<button class="build-card" disabled aria-label="空位"><span class="card-icon"></span><b class="card-name">旅伴席位</b><small class="card-desc">隊伍最多 4 名佣兵</small></button>`;
      const c = DEPLOY_CARDS[type], count = g.inventory[type], poor = !count;
      const role = { watchtower: "速射", catapult: "範圍", wall: "防禦", spring: "支援", hunter: "遠程", guard: "護衛", torch: "共鳴", nest: "召喚" }[type] || "建造";
      return `<button class="build-card${poor ? " unaffordable" : ""}${selected === slot ? " selected" : ""}" data-slot="${slot}" data-kind="${type}" type="button" aria-label="${c.name}，持有 ${count} 張，${c.description}"${ghost ? ' tabindex="-1"' : ""}><span class="card-hotkey">${slot + 1}</span><span class="card-role">${role}</span><span class="card-cost">× ${count}</span>${icon(type)}<b class="card-name">${c.name}</b><small class="card-desc">${poor ? "待補貨" : c.short}</small><i class="card-glow"></i></button>`;
    }
    function renderHand() {
      if (!g || drag) return;
      const signature = `${g.hand.join(",")}|${JSON.stringify(g.inventory)}|${selected}`;
      if (signature === lastHand) return;
      lastHand = signature;
      $3("hand").innerHTML = g.hand.map((type, i) => cardHTML(type, i)).join("");
    }
    function updateHUD() {
      if (!g) return;
      const stage = STAGES[Math.max(0, Math.min(MAX_WAVES - 1, g.phase === "prep" && !g.tutorial?.reward ? g.wave : g.wave - 1))];
      $3("hp").textContent = Math.ceil(g.hero.hp);
      $3("hp").nextElementSibling.textContent = `/${g.hero.maxHp}`;
      $3("nest-hp").textContent = Math.ceil(g.base.hp);
      $3("amber").textContent = g.amber;
      $3("nest-label").textContent = g.companion ? "聖獸靈巢" : "聖獸卵";
      const companion = g.companion, companionButton = $3("companion-button");
      companionButton.classList.toggle("empty", !companion);
      companionButton.classList.toggle("down", Boolean(companion && companion.hp <= 0));
      if (companion) {
        const d = COMPANIONS[companion.type], need2 = companionXPNeeded(companion.level);
        $3("companion-icon").innerHTML = spriteIcon(`companion-${companion.type}`, "companion-mini-art");
        $3("companion-name").textContent = d.name;
        $3("companion-level").textContent = companion.hp <= 0 ? "本關休息中" : companion.level >= COMPANION_MAX_LEVEL ? `Lv.${companion.level} · 滿級` : `Lv.${companion.level} · ${companion.xp}/${need2}`;
        companionButton.style.setProperty("--companion", d.color);
        companionButton.setAttribute("aria-label", `查看伙伴${d.name}，等級 ${companion.level}`);
      } else {
        $3("companion-icon").textContent = "卵";
        $3("companion-name").textContent = "待孵化";
        $3("companion-level").textContent = "點此選擇";
        companionButton.style.removeProperty("--companion");
        companionButton.setAttribute("aria-label", "孵化並選擇聖獸伙伴");
      }
      $3("hp-fill").style.setProperty("--value", `${Math.max(0, g.hero.hp / g.hero.maxHp) * 100}%`);
      $3("nest-fill").style.setProperty("--value", `${Math.max(0, g.base.hp / g.base.maxHp) * 100}%`);
      $3("wood").textContent = g.materials.wood;
      $3("bone").textContent = g.materials.bone;
      $3("merchant").disabled = !!g.tutorial?.reward;
      $3("merchant").textContent = g.tutorial?.reward ? "先領取獎勵" : "找商人 ↗";
      $3("shop-pay").disabled = !!g.tutorial?.reward;
      $3("shop-pay").hidden = !!g.tutorial?.reward;
      $3("region").textContent = stage.region;
      $3("wave-title").textContent = g.tutorial?.reward ? `${stage.name} · 教學獎勵待領取` : g.phase === "prep" ? `${stage.name} · ${g.wave ? "休整營地" : "營地準備"}` : `${stage.name} · 第 ${g.wave} / ${MAX_WAVES} 關`;
      $3("stage-rule").textContent = stage.rule;
      const objective = g.phase === "wave" ? g.objectiveStatus() : null, nextObjective = STAGE_OBJECTIVES[Math.min(g.wave, MAX_WAVES - 1)];
      $3("phase-label").textContent = g.phase === "prep" ? `下一站 · ${stage.name}` : objective ? `${objective.icon} ${objective.title}` : `${stage.name} · 遠征結束`;
      $3("phase-hint").textContent = g.phase === "prep" ? `${nextObjective.short} · 拖卡建造並找商人整備` : objective ? `${objective.text} · 尚餘 ${g.enemies.length + g.spawnQueue.length} 隻` : "本次遠征已停止結算";
      $3("objective-panel").hidden = g.phase !== "wave";
      if (objective) {
        $3("objective-panel").className = `objective-panel ${objective.type}${objective.complete ? " complete" : ""}`;
        $3("objective-icon").textContent = objective.icon;
        $3("objective-title").textContent = objective.title;
        $3("objective-status").textContent = objective.text;
        $3("objective-progress").style.width = `${Math.max(0, Math.min(100, objective.progress * 100))}%`;
      }
      const stageNumber = Math.min(MAX_WAVES, g.phase === "prep" ? g.wave + 1 : g.wave), threat = g.enemies.length + g.spawnQueue.length;
      $3("stage-progress-label").textContent = `第 ${stageNumber} 關 / 共 ${MAX_WAVES} 關`;
      [...$3("stage-pips").children].forEach((pip, i) => {
        pip.classList.toggle("cleared", i < g.wave - (g.phase === "wave" ? 1 : 0));
        pip.classList.toggle("active", i === stageNumber - 1);
      });
      $3("enemy-count").textContent = threat;
      $3("threat-label").textContent = g.phase === "prep" ? "整備防線" : g.wave === MAX_WAVES ? "泰坦威脅" : "獸群威脅";
      $3("threat-pill").classList.toggle("active", g.phase === "wave");
      $3("wave-banner").classList.toggle("subtle", g.phase === "wave");
      $3("wave-banner").classList.toggle("receded", g.phase === "wave" && g.waveTime > 3.5);
      $3("arena").classList.toggle("in-combat", g.phase === "wave");
      if ($3("game").dataset.phase !== g.phase) {
        $3("game").dataset.phase = g.phase;
        if (g.phase === "wave") setBattleDeck(false);
      }
      $3("arena").classList.toggle("low-health", g.phase === "wave" && g.hero.hp / g.hero.maxHp <= 0.3);
      $3("nest-hp").closest(".nest-stat").classList.toggle("in-danger", g.base.hp / g.base.maxHp <= 0.3);
      $3("next-wave").hidden = g.phase !== "prep";
      $3("next-wave").disabled = !!g.tutorial?.reward;
      $3("next-wave").textContent = g.wave ? "選擇下一關 ↗" : "查看遠征地圖 ↗";
      $3("run-info").textContent = `第 ${store.state.profile.runs} 次遠征 · 擊敗 ${g.stats.kills} · 共鳴 ${g.stats.combos}`;
      $3("dash-label").textContent = g.hero.dashCD > 0 ? `${g.hero.dashCD.toFixed(1)}s` : "衝刺";
      $3("dash").classList.toggle("cooling", g.hero.dashCD > 0);
      $3("dash").style.setProperty("--dash-remaining", Math.min(100, g.hero.dashCD / (3.1 * g.mods.dash) * 100).toFixed(1));
      $3("dash").setAttribute("aria-disabled", String(g.hero.dashCD > 0));
      for (const [id, key, label] of [["volley", "volleyCD", "齊射 · J"], ["shock", "shockCD", "震擊 · K"]]) {
        const button = $3(`skill-${id}`), remaining = g.hero[key] || 0, carried = g.carriesSkill(id), ready = carried && g.phase === "wave" && remaining <= 0;
        const level = 1 + UPGRADES.filter((u) => u.branch === id && g.selectedUpgrades.includes(u.id)).length;
        const tutorialLocked = mandatoryTutorial(g) ? g.tutorial.step !== "skill" || !g.tutorial.started || g.tutorial.awaiting || g.tutorial.skillCast : tutorialProtected(g) && !["skill", "build"].includes(g.tutorial.step);
        button.classList.toggle("cooling", carried && !ready);
        button.classList.toggle("not-carried", !carried);
        button.disabled = !carried || tutorialLocked;
        button.setAttribute("aria-disabled", String(!ready || tutorialLocked));
        button.style.setProperty("--dash-remaining", Math.min(100, remaining / ACTIVE_SKILLS[id].cooldown * 100).toFixed(1));
        $3(`${id}-label`).textContent = !carried ? "未攜帶" : remaining > 0 ? `${remaining.toFixed(1)}s` : controlLabel(`${label.split(" · ")[0]}${touchControls() ? "" : ` L${level}`}`, id === "volley" ? "J" : "K");
      }
      const fixedWeapon = g.loadout?.weapons.length === 1;
      $3("weapon").disabled = fixedWeapon;
      if ($3("weapon").dataset.weapon !== `${g.hero.weapon}-${fixedWeapon}`) {
        $3("weapon").dataset.weapon = `${g.hero.weapon}-${fixedWeapon}`;
        const weapon = WEAPONS[g.hero.weapon], weapons = g.loadout?.weapons || [], next = weapons[(weapons.indexOf(g.hero.weapon) + 1) % weapons.length];
        $3("weapon").innerHTML = spriteIcon(g.hero.weapon, "equipped-weapon-art") + `<span>${weapon.name}${fixedWeapon ? " · 已攜帶" : ` ⇄ 切${WEAPONS[next]?.name || ""}`}</span>`;
      }
      const carriedBuilds = g.loadout?.cards.filter((id) => CARDS[id]).length || 4, carriedHires = g.loadout?.cards.filter((id) => HIRES[id]).length || 2;
      $3("deck-build").textContent = `建造卡 · ${carriedBuilds}`;
      $3("deck-hire").textContent = `雇佣卡 · ${carriedHires}`;
      $3("deck-hint").textContent = selected !== null ? touchControls() ? "點空地使用 · 再點卡牌取消" : "已選卡：點空地使用，Esc 取消" : g.loadout?.legacy ? "拖卡使用 · 顯示持有張數" : "只顯示本次出征攜帶卡";
      $3("deck-build").setAttribute("aria-pressed", String(!HIRES[g.hand[0]]));
      $3("deck-hire").setAttribute("aria-pressed", String(!!HIRES[g.hand[0]]));
      $3("build-indicator").hidden = !(g.building && g.phase === "wave");
      const mapEvent = g.phase === "wave" ? g.nearbyMapEvent() : null, eventButton = $3("event-interact");
      eventButton.hidden = !mapEvent;
      if (mapEvent) {
        const def = MAP_EVENT_DEFS[mapEvent.type];
        $3("event-interact-icon").textContent = def.icon;
        $3("event-interact-name").textContent = def.name;
        $3("event-interact-action").textContent = controlLabel(g.mapEventPrompt(mapEvent), "E");
        eventButton.setAttribute("aria-label", `${def.name}，${g.mapEventPrompt(mapEvent)}`);
      }
      tutorialUI.render(tutorialSaveView || g, !!modalKind, painter);
    }
    async function finishTutorial(skip = false) {
      if (working || modalKind || !g || !tutorialActive(g)) return;
      if (skip && mandatoryTutorial(g)) return;
      working = true;
      clearInput();
      g.paused = true;
      try {
        if (checkpointPending) await checkpointPending;
        if (saveFailed) return;
        const before = g.snapshot();
        tutorialSaving = true;
        tutorialSaveView = before;
        const wasMandatory = mandatoryTutorial(g), applied = skip ? g.skipTutorial() : g.claimTutorialReward();
        if (!applied) {
          g.paused = false;
          return;
        }
        try {
          if (!practiceRun()) await store.saveRun(() => g.snapshot());
        } catch (error) {
          g = Expedition.restore(before);
          throw error;
        }
        g.paused = false;
        saveFailed = false;
        refreshSaveUI();
        updateHUD();
        if (wasMandatory) {
          showCamp({ afterTutorial: true });
          campUI.message("第一關獎勵已保存！先找行商，用木材與獸骨購買建造卡，再從山口繼續遠征。不需要購買付費禮包。");
          return;
        }
        if (practiceRun()) {
          showCamp();
          campUI.message(skip ? "已退出新手試煉；原遠征與資源未改動。" : "新手試煉完成！練習獎勵不入正式存檔，原遠征與資源已保留。");
          return;
        }
        notify(skip ? "已跳過引導，隨時可從暫停選單查看操作。" : "獎勵已入包！找商人補給，或選擇下一關。", 4200);
        experience.haptic("success");
      } catch (error) {
        saveFailure(error);
      } finally {
        tutorialSaving = false;
        tutorialSaveView = null;
        working = false;
        lastTime = performance.now();
      }
    }
    $3("tutorial-skip").addEventListener("click", () => finishTutorial(true));
    $3("tutorial-claim").addEventListener("click", () => finishTutorial(false));
    $3("tutorial-next").addEventListener("click", () => {
      if (working || modalKind || !g) return;
      clearInput();
      if (g.wave === 0 && g.phase === "prep") g.startWave();
      if (g.confirmTutorial() || g.phase === "wave") {
        handleEvents();
        renderHand();
        updateHUD();
      }
    });
    $3("tutorial-replay").addEventListener("click", startTutorialPractice);
    let priorFocus = null;
    function openModal(kind, title, copy, content, actions) {
      cancelCampPromotions();
      const opening = $3("modal").hidden;
      if (opening) priorFocus = document.activeElement;
      modalKind = kind;
      clearInput();
      $3("modal").setAttribute("aria-busy", "false");
      $3("modal").classList.toggle("merchant-modal", kind === "merchant");
      $3("modal").classList.toggle("shop-open", false);
      $3("modal").classList.toggle("end-modal", kind === "end");
      $3("modal").classList.toggle("companion-modal", kind === "companion");
      $3("modal").classList.toggle("loadout-modal", kind === "loadout");
      $3("modal").classList.toggle("settings-modal", kind === "settings");
      $3("modal").classList.toggle("promotion-modal", kind === "promotion");
      $3("promotion-dismiss").hidden = kind !== "promotion";
      $3("modal").classList.toggle("danger-modal", ["clear-save", "logout", "delete-account"].includes(kind));
      $3("modal-title").textContent = title;
      $3("modal-copy").textContent = copy;
      $3("modal-eyebrow").textContent = kind === "merchant" ? marketTab === "shop" ? "PAYMENT · APP STORE" : "SUPPLIES · CONTRACTS · CRAFT" : kind === "promotion" ? "LIMITED PACKS · APP STORE" : kind === "end" ? "EXPEDITION COMPLETE" : kind === "companion" ? "SACRED BEAST PARTNERS" : kind === "loadout" ? "EXPEDITION LOADOUT" : kind === "account" ? "SECURE ACCOUNT" : ["clear-save", "logout", "delete-account"].includes(kind) ? "CONFIRM ACTION" : "TAKE A BREATH";
      $3("modal-content").innerHTML = content;
      $3("modal-actions").innerHTML = actions;
      $3("modal").hidden = false;
      syncBackgroundMusic();
      if (opening) $3("modal").querySelector(".modal-panel").scrollTop = 0;
      $3("modal").querySelector("button")?.focus();
    }
    async function collectProduction(type) {
      const def = CAMP_PRODUCTION[type];
      closeModal();
      if (!def) return;
      await campUI.change((state) => {
        const result = collectCampProduction(state, type);
        if (!result.ok) throw new Error(result.reason);
      }, `${FACILITIES[type].name}已收成 · ${def.name}存入營地倉儲，下次新遠征自動裝載。`);
    }
    async function collectTask(npc) {
      const def = CAMP_TASKS[npc];
      closeModal();
      if (!def) return;
      await campUI.change((state) => {
        const result = claimCampTask(state, npc);
        if (!result.ok) throw new Error(result.reason);
      }, `${def.name}的委託已交付 · 報酬存入永久營地。`);
    }
    function closeModal() {
      if (shopCheckout?.phase === "pending") return;
      cancelCampPromotions();
      $3("shop-sheet")?.remove();
      if (modalKind !== "merchant") shopCheckout = null;
      $3("modal").classList.remove("shop-open");
      $3("modal").hidden = true;
      modalKind = "";
      if (priorFocus?.isConnected) priorFocus.focus();
      priorFocus = null;
    }
    function requestMainGameSwitch() {
      if (shellContentMode !== "both") {
        notify("目前版本暫未開放主世界");
        return;
      }
      if (shellSwitching || working) return;
      if (nativeStoreKit.pending || shopCheckout?.phase === "pending") {
        notify("請先完成目前的付款操作，再切換遊戲", 4200);
        return;
      }
      if (typeof window.android?.openMainGame !== "function") {
        notify("請在 iOS App 內切換主世界", 4200);
        return;
      }
      if (modalKind === "settings") contentSwitchReturn = "settings";
      else if (!["content-switch", "content-switch-error"].includes(modalKind)) contentSwitchReturn = "";
      const runCopy = g && !$3("game").hidden ? "目前遠征會先安全保存並保持暫停。" : "營地與遊戲進度會先保存在本機。";
      openModal("content-switch", "前往主世界？", `${runCopy} 返回時可從冒險大廳繼續。`, '<div class="delete-boundary"><b>切換前會完成</b><span>等待正在進行的存檔</span><span>保留營地與遠征進度</span><span>不會建立付款訂單</span><span>不會清除目前帳號</span></div>', '<button class="primary" data-action="content-switch-confirm">保存並進入主世界</button><button class="secondary" data-action="content-switch-cancel">留在目前遊戲</button>');
    }
    function cancelMainGameSwitch() {
      if (contentSwitchReturn === "settings") {
        contentSwitchReturn = "";
        renderSettings();
        return;
      }
      contentSwitchReturn = "";
      closeModal();
    }
    async function beginMainGameSwitch() {
      if (shellSwitching || working || shellContentMode !== "both") return;
      if (nativeStoreKit.pending || shopCheckout?.phase === "pending") {
        notify("請先完成目前的付款操作，再切換遊戲", 4200);
        return;
      }
      shellSwitching = true;
      working = true;
      updateContentSwitchUI();
      $3("modal").setAttribute("aria-busy", "true");
      const confirm = $3("modal").querySelector('[data-action="content-switch-confirm"]');
      if (confirm) {
        confirm.disabled = true;
        confirm.textContent = "正在保存…";
      }
      try {
        if (checkpointPending) await checkpointPending;
        if (g && !["win", "lose"].includes(g.phase)) {
          const saved = await checkpoint();
          if (!saved || saveFailed) throw new Error("目前進度尚未成功保存，請先重試存檔。");
        } else {
          flush();
          if (saveFailed) throw new Error("目前進度尚未成功保存，請先重試存檔。");
        }
        if (confirm) confirm.textContent = "正在進入主世界…";
        window.android.openMainGame();
        setTimeout(() => {
          if (document.hidden) return;
          shellSwitching = false;
          working = false;
          updateContentSwitchUI();
          if (modalKind === "content-switch") {
            $3("modal").setAttribute("aria-busy", "false");
            $3("modal-copy").textContent = "尚未完成切換，請確認網路正常後再試。你的進度已安全保存。";
            if (confirm) {
              confirm.disabled = false;
              confirm.textContent = "重新進入主世界";
            }
          }
        }, 8e3);
      } catch (error) {
        shellSwitching = false;
        working = false;
        updateContentSwitchUI();
        if (modalKind === "save-error") return;
        openModal("content-switch-error", "暫時無法切換", error?.message || "請稍後再試。", "", '<button class="primary" data-action="content-switch-retry">重試</button><button class="secondary" data-action="content-switch-cancel">返回</button>');
      }
    }
    function settingsContent() {
      const s = experience.settings, session = accountSession.reload(), option = (setting, value, label) => `<button data-setting="${setting}" data-setting-value="${value}" aria-pressed="${s[setting] === value}">${label}</button>`;
      const switchRow = shellContentMode === "both" ? '<div class="settings-data-row content-switch"><span><b>主世界</b><small>保存目前進度後，前往線上冒險；遊戲內可返回聖獸營地。</small></span><button data-action="content-switch">進入主世界</button></div>' : "";
      const data = `<section class="settings-data" aria-label="帳號與存檔"><div class="settings-data-row"><span><b>${session ? `已登入 · ${escapeHTML(session.label)}` : "尚未登入帳號"}</b><small>${session ? "正式玩家 ID 已由安全帳號服務綁定；退出不會刪除遊戲存檔。" : "訪客可試玩；登入後才可發起真實付款。密碼不會保存在遊戲中。"}</small></span><button data-action="${session ? "logout-confirm" : "account-login"}">${session ? "退出帳號" : "帳號登入"}</button></div>${switchRow}<div class="settings-data-row danger"><span><b>本機遊戲存檔</b><small>刪除教程、營地、伙伴和遠征進度；帳號登入與聲音、畫質設定保留。</small></span><button data-action="clear-save-confirm">刪除存檔</button></div></section>`;
      return `${data}<div class="settings-panel">
    <div class="setting-row"><span><b>觸覺回饋</b><small>建造、技能、受擊與通關使用 iPhone 原生震動</small></span><button class="setting-switch" data-setting="haptics" aria-label="切換觸覺回饋" aria-pressed="${s.haptics}"></button></div>
    <label class="setting-row"><span><b>聲音音量</b><small>調整背景音樂與音效；設為 0 即靜音</small></span><span class="setting-volume"><input data-setting="volume" type="range" min="0" max="100" step="5" value="${Math.round(s.volume * 100)}"><output>${Math.round(s.volume * 100)}%</output></span></label>
    <div class="setting-row"><span><b>低電量模式</b><small>降至 30 FPS，減少粒子並降低渲染解析度</small></span><button class="setting-switch" data-setting="powerSaver" aria-label="切換低電量模式" aria-pressed="${s.powerSaver}"></button></div>
    <div class="setting-row"><span><b>字體大小</b><small>同步放大主要介面與說明文字</small></span><span class="setting-options">${option("fontSize", "small", "小")}${option("fontSize", "normal", "標準")}${option("fontSize", "large", "大")}</span></div>
    <div class="setting-row"><span><b>畫質</b><small>自動會依裝置與系統低電量狀態調整</small></span><span class="setting-options">${option("quality", "auto", "自動")}${option("quality", "high", "高")}${option("quality", "balanced", "平衡")}${option("quality", "low", "省電")}</span></div>
  </div><nav class="settings-legal" aria-label="法律文件與帳號管理"><a href="https://d1udhm4c9vjzph.cloudfront.net/ios-legal/terms-of-service.html" data-legal-url="https://d1udhm4c9vjzph.cloudfront.net/ios-legal/terms-of-service.html" target="_blank" rel="noopener noreferrer">用戶協議</a><a href="https://d1udhm4c9vjzph.cloudfront.net/ios-legal/privacy-policy.html" data-legal-url="https://d1udhm4c9vjzph.cloudfront.net/ios-legal/privacy-policy.html" target="_blank" rel="noopener noreferrer">隱私政策</a><a href="https://d1udhm4c9vjzph.cloudfront.net/ios-legal/account-deletion.html" data-legal-url="https://d1udhm4c9vjzph.cloudfront.net/ios-legal/account-deletion.html" target="_blank" rel="noopener noreferrer">刪除帳號</a></nav><p class="settings-system-note">${s.nativeLowPower ? "iPhone 系統低電量模式已開啟，遊戲目前自動採用省電渲染。" : "偏好會保存在本機；iPhone 開啟系統低電量模式時會自動降載。"}</p>`;
    }
    function showAccount() {
      const session = accountSession.reload();
      if (!session) {
        location.href = "login-preview.html";
        return;
      }
      openModal("account", "帳號管理", `${session.label}，正式帳號已安全登入。`, `<div class="account-summary"><span aria-hidden="true">◇</span><div><small>目前登入</small><b>${escapeHTML(session.label)}</b><p>玩家 ID 已用於綁定新訂單；令牌保存在 iOS Keychain。退出不會刪除營地、伙伴或遠征存檔。</p></div></div>`, `<button class="primary" data-action="account-close">繼續遊玩</button><button class="secondary" data-action="logout-confirm" data-return="account">退出帳號</button><button class="secondary danger-action" data-action="delete-account-confirm">刪除正式帳號</button>`);
    }
    function syncSettingsControls() {
      const s = experience.settings;
      for (const control of $3("modal").querySelectorAll("[data-setting]")) {
        const key = control.dataset.setting, value = control.dataset.settingValue;
        if (control.type === "range") {
          control.value = String(Math.round(s.volume * 100));
          control.parentElement.querySelector("output").textContent = `${control.value}%`;
        } else control.setAttribute("aria-pressed", String(value !== void 0 ? s[key] === value : Boolean(s[key])));
      }
      const note = $3("modal-content").querySelector(".settings-system-note");
      if (note) note.textContent = s.nativeLowPower ? "iPhone 系統低電量模式已開啟，遊戲目前自動採用省電渲染。" : "偏好會保存在本機；iPhone 開啟系統低電量模式時會自動降載。";
    }
    function renderSettings() {
      openModal("settings", "遊戲設定", "依你的裝置與遊玩習慣調整；帳號與存檔操作彼此獨立。", settingsContent(), '<button class="primary" data-action="settings-close">完成</button>');
    }
    function showSettings() {
      settingsReturnToPause = modalKind === "pause";
      settingsResumeGame = Boolean(g && !$3("game").hidden && !g.paused);
      if (settingsResumeGame) g.paused = true;
      renderSettings();
      checkpoint();
    }
    function closeSettings() {
      closeModal();
      if (settingsReturnToPause) {
        settingsReturnToPause = false;
        pause("manual");
        return;
      }
      if (settingsResumeGame && g) {
        g.paused = false;
        lastTime = performance.now();
      }
      settingsResumeGame = false;
    }
    function pause(reason = "manual") {
      if (!g || !["prep", "wave"].includes(g.phase)) return;
      g.paused = true;
      if (mandatoryTutorial(g)) {
        openModal("pause", "訓練已暫停", "進度會自動保存；關閉頁面後再回來，仍從目前步驟繼續。", '<p class="howto">完成五步教學並領取獎勵，才會開放營地與自由遠征。教學不可跳過或放棄。</p>', '<button class="primary" data-action="resume">繼續目前教學 →</button>');
        checkpoint();
        return;
      }
      const background = reason === "background";
      openModal("pause", background ? "已為你暫停" : "荒野稍歇", background ? "遊戲進入背景時已自動暫停；回來後由你決定何時繼續。" : "暫停期間不會受傷，也不會消耗資源。", `<div class="pause-resources">◆ 琥珀 ${g.amber}　▰ 木材 ${g.materials.wood}　✧ 獸骨 ${g.materials.bone}<br>伙伴：${g.companion ? COMPANIONS[g.companion.type]?.name || "已出戰" : "尚未孵化"} · 擊敗 ${g.stats.kills} · 共鳴 ${g.stats.combos}</div><div class="howto">${touchControls() ? "展開底部「建造」，" : ""}拖卡到空地：建造；拖到同類建築：升級。<br>普通攻擊自動鎖定；點右下「齊射」或「震擊」釋放技能。<br>弩台負責速射，投獸器壓制獸群；衝刺穿過骨牆可引爆骨片。<br>每 2.5 秒與關鍵操作自動儲存；回營地後可以繼續。</div>`, '<button class="primary" data-action="resume">繼續遠征</button><button class="secondary" data-action="settings">音量與遊戲設定</button><button class="secondary" data-action="pause-save">儲存進度</button><button class="secondary" data-action="save-camp">儲存並回營地</button><button class="secondary" data-action="exit-confirm">放棄本局</button>');
      checkpoint();
    }
    function handleEvents() {
      for (const ev of g.consumeEvents()) {
        if (ev.type === "tutorial-step" || ev.type === "tutorial-reward" || ev.type === "tutorial-success") {
          clearInput();
          renderHand();
          checkpoint();
          if (ev.type === "tutorial-success") experience.haptic("success");
        } else if (ev.type === "notice") notify(ev.message);
        else if (ev.type === "skill") {
          notify(ev.name);
          sound("skill");
          experience.haptic("medium");
          painter.shake = 2;
        } else if (ev.type === "companion-ready") {
          notify(`${ev.name} · Lv.${ev.level} 已加入遠征`);
          sound("build");
        } else if (ev.type === "companion-level") {
          notify(`${ev.name}升至 Lv.${ev.level}！`);
          sound("combo");
          experience.haptic("success");
          checkpoint();
        } else if (ev.type === "companion-skill") {
          sound("ignite");
        } else if (ev.type === "map-event") {
          notify(ev.message, 4800);
          sound("collect");
          experience.haptic("success");
          painter.shake = 2;
          checkpoint();
        } else if (ev.type === "combo") {
          notify(ev.message);
          sound("combo");
          experience.haptic("success");
          painter.shake = 3;
        } else if (ev.type === "market-ready") {
          clearInput();
          showWaveLoot(ev);
          sound("combo");
          experience.haptic("success");
          checkpoint();
        } else if (ev.type === "end") {
          experience.haptic(ev.won ? "success" : "warning");
          settle();
        } else {
          sound(ev.type);
          if (ev.type === "build") experience.haptic("medium");
          if (ev.type === "collect") experience.haptic("light");
          if (ev.type === "hurt") {
            experience.haptic("warning");
            painter.shake = 4;
          }
          if (ev.type === "wave") {
            experience.haptic("heavy");
            hideWaveLoot();
            $3("toast").classList.remove("visible");
            toastUntil = 0;
            const arena = $3("arena");
            arena.classList.remove("wave-starting");
            void arena.offsetWidth;
            arena.classList.add("wave-starting");
            setTimeout(() => arena.classList.remove("wave-starting"), 1100);
          }
          if (["build", "wave", "weapon"].includes(ev.type)) checkpoint();
        }
      }
    }
    function input() {
      return { x: stickX + (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0), y: stickY + (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0) };
    }
    function frame(t) {
      requestAnimationFrame(frame);
      if (!shellAppActive) {
        lastTime = t;
        return;
      }
      campUI?.frame(t);
      syncBackgroundMusic();
      if (experience.settings.effectiveLowPower && t - lastRenderedFrame < 32) return;
      lastRenderedFrame = t;
      if (!g || $3("game").hidden) {
        lastTime = t;
        return;
      }
      const dt = Math.min((t - lastTime) / 1e3 || 0, 0.05);
      lastTime = t;
      g.tick(dt, input());
      handleEvents();
      if (!g || $3("game").hidden) return;
      painter.render(g, drag?.moved ? { slot: drag.slot, ...drag.world } : null);
      if (t - lastHUDFrame >= HUD_FRAME_MS) {
        lastHUDFrame = t;
        lastGuideFrame = t;
        renderHand();
        updateHUD();
      } else if (t - lastGuideFrame >= GUIDE_FRAME_MS && tutorialActive(g)) {
        lastGuideFrame = t;
        tutorialUI.render(tutorialSaveView || g, !!modalKind, painter);
      }
      if (toastUntil && t > toastUntil) {
        $3("toast").classList.remove("visible");
        toastUntil = 0;
      }
      if (!saveFailed && !g.paused && t - lastAutoSave >= 2500 && !["win", "lose"].includes(g.phase)) checkpoint();
    }
    function selectCard(slot) {
      if (!g?.canBuild || !g.hand[slot]) return;
      if (tutorialProtected(g) && g.tutorial.step !== "build") {
        notify("先完成上方引導，再練習拖卡建造");
        return;
      }
      if (!g.inventory[g.hand[slot]]) {
        notify("這張卡用完了，休整時找商人購買");
        return;
      }
      selected = selected === slot ? null : slot;
      g.building = selected !== null;
      if (selected !== null) notify(`${DEPLOY_CARDS[g.hand[slot]].name}：點空地使用卡牌`);
      renderHand();
    }
    function setBattleDeck(open) {
      if (!open) {
        cancelDrag();
        selected = null;
      }
      $3("game").classList.toggle("deck-open", open);
      $3("toggle-deck").setAttribute("aria-expanded", String(open));
      $3("toggle-deck").textContent = open ? "收起 ▾" : "建造 ▴";
    }
    $3("toggle-deck").addEventListener("click", () => {
      if (modalKind || !g) return;
      setBattleDeck(!$3("game").classList.contains("deck-open"));
      renderHand();
    });
    $3("battle-view").addEventListener("click", () => {
      if (modalKind || !painter) return;
      cancelDrag();
      selected = null;
      painter.overview = !painter.overview;
      painter.resize();
      renderHand();
      $3("battle-view").setAttribute("aria-pressed", String(painter.overview));
      $3("battle-view").textContent = painter.overview ? "近景" : "全景";
    });
    $3("hand").addEventListener("pointerdown", (e) => {
      const card = e.target.closest("[data-slot]");
      if (!card || !g?.canBuild || modalKind || e.button > 0) return;
      if (tutorialProtected(g) && g.tutorial.step !== "build") {
        notify("先完成上方引導，再練習拖卡建造");
        return;
      }
      const slot = Number(card.dataset.slot);
      if (!g.hand[slot]) return;
      if (!g.inventory[g.hand[slot]]) {
        notify("這張卡用完了，休整時找商人購買");
        return;
      }
      e.preventDefault();
      const wasSelected = selected === slot;
      selected = null;
      g.building = true;
      drag = { id: e.pointerId, slot, wasSelected, x: e.clientX, y: e.clientY, moved: false, touch: e.pointerType === "touch", world: painter.point(e.clientX, e.clientY) };
      $3("hand").setPointerCapture(e.pointerId);
      card.classList.add("dragging");
      $3("drag-ghost").innerHTML = cardHTML(g.hand[slot], slot, true);
    });
    $3("hand").addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      e.preventDefault();
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 7) drag.moved = true;
      const lift = drag.touch ? 55 : 0;
      drag.world = painter.point(e.clientX, e.clientY - lift);
      $3("drag-ghost").hidden = !drag.moved;
      $3("drag-ghost").style.left = `${e.clientX}px`;
      $3("drag-ghost").style.top = `${e.clientY - lift}px`;
    });
    $3("hand").addEventListener("pointerup", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      e.preventDefault();
      const d = drag;
      cancelDrag();
      if (d.moved) {
        const p = painter.point(e.clientX, e.clientY - (d.touch ? 55 : 0));
        g.placeCard(d.slot, p.x, p.y);
      } else if (!d.wasSelected) selectCard(d.slot);
      renderHand();
    });
    $3("hand").addEventListener("pointercancel", cancelDrag);
    $3("hand").addEventListener("lostpointercapture", () => {
      if (drag) cancelDrag();
    });
    $3("hand").addEventListener("click", (e) => {
      if (e.detail === 0) {
        const b = e.target.closest("[data-slot]");
        if (b) selectCard(Number(b.dataset.slot));
      }
    });
    $3("world").addEventListener("pointerdown", (e) => {
      if (!g?.canBuild || modalKind || e.button > 0) return;
      e.preventDefault();
      const p = painter.point(e.clientX, e.clientY);
      if (selected !== null) {
        const slot = selected;
        selected = null;
        g.building = false;
        g.placeCard(slot, p.x, p.y);
        renderHand();
      }
    });
    $3("world").addEventListener("contextmenu", (e) => e.preventDefault());
    for (const event of ["contextmenu", "selectstart"]) $3("game").addEventListener(event, (e) => e.preventDefault());
    $3("joystick").addEventListener("pointerdown", (e) => {
      if (!g?.canBuild || modalKind || stickPointer !== null) return;
      e.preventDefault();
      stickPointer = e.pointerId;
      $3("joystick").setPointerCapture(e.pointerId);
      moveStick(e);
    });
    function moveStick(e) {
      if (e.pointerId !== stickPointer) return;
      const r = $3("joystick").getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2, len = Math.hypot(x, y), max = r.width * 0.34;
      stickX = x / Math.max(max, len);
      stickY = y / Math.max(max, len);
      $3("stick").style.transform = `translate(${stickX * max}px,${stickY * max}px)`;
    }
    $3("joystick").addEventListener("pointermove", moveStick);
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) $3("joystick").addEventListener(name, (e) => {
      if (e.pointerId === stickPointer) {
        stickPointer = null;
        stickX = stickY = 0;
        $3("stick").style.transform = "";
      }
    });
    $3("skill-volley").addEventListener("click", () => {
      if (!modalKind) g?.castSkill("volley");
    });
    $3("skill-shock").addEventListener("click", () => {
      if (!modalKind) g?.castSkill("shock");
    });
    $3("dash").addEventListener("click", () => {
      if (!modalKind) g?.dash(input());
    });
    $3("event-interact").addEventListener("click", () => {
      if (!modalKind && g) {
        g.interactMapEvent();
        handleEvents();
        updateHUD();
      }
    });
    $3("weapon").addEventListener("click", () => {
      if (!modalKind) g?.switchWeapon();
    });
    $3("merchant").addEventListener("click", () => showMarket());
    $3("shop-pay").addEventListener("click", () => showMarket("shop"));
    for (const [id, kind] of [["deck-build", "build"], ["deck-hire", "hire"]]) $3(id).addEventListener("click", () => {
      if (!modalKind && g) {
        clearInput();
        g.setDeck(kind);
        renderHand();
        checkpoint();
      }
    });
    $3("next-wave").addEventListener("click", () => showRoute("game"));
    $3("route-back").addEventListener("click", leaveRoute);
    $3("route-map").addEventListener("click", (e) => {
      const future = e.target.closest("[data-coming-soon]");
      if (future) {
        showRouteComingSoon(future.dataset.comingSoon);
        return;
      }
      const node = e.target.closest(".route-node:not([disabled])");
      if (node) chooseStage(Number(node.dataset.stage));
    });
    $3("landing-account").addEventListener("click", (event) => {
      if (accountSession.reload()) {
        event.preventDefault();
        showAccount();
      }
    });
    $3("begin").addEventListener("click", (event) => {
      if (accountSession.reload()) {
        event.preventDefault();
        showCamp();
      }
    });
    $3("landing-main-game").addEventListener("click", requestMainGameSwitch);
    $3("continue-run").addEventListener("click", resumeRun);
    $3("camp-loadout").addEventListener("click", showLoadout);
    $3("camp-companion").addEventListener("click", () => showCompanions());
    $3("camp-gifts").addEventListener("click", () => openCampStore("gifts"));
    $3("camp-recharge").addEventListener("click", () => openCampStore("recharge"));
    $3("companion-button").addEventListener("click", () => showCompanions());
    $3("camp-home").addEventListener("click", showHome);
    $3("return-camp").addEventListener("click", returnCamp);
    $3("save-game").addEventListener("click", () => checkpoint(true));
    $3("pause").addEventListener("click", pause);
    $3("sound").addEventListener("click", () => {
      const next = experience.settings.volume > 0 ? 0 : lastAudibleVolume;
      experience.update({ volume: next });
      if (next > 0) sound("build");
    });
    for (const id of ["landing-settings", "camp-settings", "route-settings", "game-settings"]) $3(id).addEventListener("click", showSettings);
    $3("modal").addEventListener("input", (e) => {
      const control = e.target.closest('input[data-setting="volume"]');
      if (!control) return;
      const volume = Number(control.value) / 100;
      if (volume > 0) lastAudibleVolume = volume;
      experience.update({ volume });
      control.parentElement.querySelector("output").textContent = `${control.value}%`;
    });
    $3("modal").addEventListener("click", async (e) => {
      const setting = e.target.closest("button[data-setting]");
      if (setting) {
        const key = setting.dataset.setting, value = setting.dataset.settingValue;
        experience.update({ [key]: value !== void 0 ? value : !experience.settings[key] });
        experience.haptic("selection");
        syncSettingsControls();
        return;
      }
      const tab = e.target.closest("[data-market-tab]")?.dataset.marketTab;
      if (tab) {
        showMarket(tab);
        return;
      }
      const offer = e.target.closest("[data-shop-offer]")?.dataset.shopOffer;
      if (offer) {
        openShopCheckout(offer);
        return;
      }
      const buy = e.target.closest("[data-buy]")?.dataset.buy;
      if (buy) {
        if (shopCheckout) return;
        purchase(buy);
        return;
      }
      const loadoutCard = e.target.closest("[data-loadout-card]")?.dataset.loadoutCard;
      if (modalKind === "loadout" && loadoutCard && Object.hasOwn(DEPLOY_CARDS, loadoutCard)) {
        if (HIRES[loadoutCard]) loadoutDraft.cards = [...loadoutDraft.cards.filter((id) => !HIRES[id]), loadoutCard];
        else if (loadoutDraft.cards.includes(loadoutCard)) loadoutDraft.cards = loadoutDraft.cards.filter((id) => id !== loadoutCard);
        else if (loadoutDraft.cards.filter((id) => CARDS[id]).length >= LOADOUT_RULES.buildCards) {
          renderLoadout("建造卡上限為 3 張；先取消一張已選建造卡再更換。");
          return;
        } else loadoutDraft.cards.push(loadoutCard);
        renderLoadout();
        return;
      }
      const loadoutWeapon = e.target.closest("[data-loadout-weapon]")?.dataset.loadoutWeapon;
      if (modalKind === "loadout" && Object.hasOwn(WEAPONS, loadoutWeapon)) {
        if (!campWeaponUnlocked(store.state.camp, loadoutWeapon) && !loadoutDraft.weapons.includes(loadoutWeapon)) {
          renderLoadout("升級骨器工坊後才能攜帶這把武器。");
          return;
        }
        loadoutDraft.weapons = [loadoutWeapon];
        renderLoadout();
        return;
      }
      const loadoutSkill = e.target.closest("[data-loadout-skill]")?.dataset.loadoutSkill;
      if (modalKind === "loadout" && Object.hasOwn(ACTIVE_SKILLS, loadoutSkill)) {
        loadoutDraft.skills = [loadoutSkill];
        renderLoadout();
        return;
      }
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (action === "reload-reset") {
        location.reload();
        return;
      }
      if (action === "content-switch") {
        requestMainGameSwitch();
        return;
      }
      if (action === "content-switch-cancel") {
        cancelMainGameSwitch();
        return;
      }
      if (action === "content-switch-retry") {
        requestMainGameSwitch();
        return;
      }
      if (action === "content-switch-confirm") {
        await beginMainGameSwitch();
        return;
      }
      if (mandatoryTutorial(g) && ["camp", "home", "save-camp", "restart", "replace-run", "exit-confirm", "abandon"].includes(action)) return;
      if (working) return;
      if (action === "account-login") {
        location.href = "login-preview.html";
        return;
      }
      if (action === "account-close") {
        closeModal();
        return;
      }
      if (action === "logout-confirm") {
        const back = e.target.closest("[data-return]")?.dataset.return || "account";
        openModal("logout", "退出目前帳號？", "會清除 iOS Keychain 內的登入令牌；遊戲存檔、營地、伙伴與設定都會保留。", "", `<button class="primary" data-action="cancel-account-action" data-return="${back}">保留登入</button><button class="secondary danger-action" data-action="logout-account">確認退出帳號</button>`);
        return;
      }
      if (action === "clear-save-confirm") {
        openModal("clear-save", "刪除全部本機存檔？", "教程、營地建築、伙伴、材料與遠征進度都會永久清除，並從新手訓練重新開始。", '<div class="delete-boundary"><b>仍會保留</b><span>目前帳號登入</span><span>聲音、畫質與操作設定</span><span>用戶協議及隱私設定入口</span></div>', '<button class="primary" data-action="cancel-account-action" data-return="settings">取消，保留存檔</button><button class="secondary danger-action" data-action="clear-save">確認刪除存檔</button>');
        return;
      }
      if (action === "delete-account-confirm") {
        openModal("delete-account", "永久刪除正式帳號？", "這會要求伺服器刪除你的遊戲帳號與相關玩家資料，並清除此裝置上的遊戲存檔。此操作無法恢復；單純想換帳號請使用「退出帳號」。", '<div class="delete-boundary"><b>不會冒充成功</b><span>只有伺服器確認刪除後才會清除登入狀態</span><span>付款法規要求保留的匿名交易記錄可能依法保留</span></div>', '<button class="primary" data-action="cancel-account-action" data-return="account">取消，保留帳號</button><button class="secondary danger-action" data-action="delete-account">確認永久刪除</button>');
        return;
      }
      if (action === "cancel-account-action") {
        if (e.target.closest("[data-return]")?.dataset.return === "settings") renderSettings();
        else showAccount();
        return;
      }
      if (action === "logout-account") {
        working = true;
        try {
          if (checkpointPending) await checkpointPending;
          if (saveFailed) throw new Error("目前進度尚未成功保存，請先處理存檔錯誤再退出帳號。");
          await nativeAuth.logout();
          accountSession.clear();
          location.href = "login-preview.html?status=signed-out";
        } catch (error) {
          openModal("account-error", "暫時無法退出帳號", error.message, "", '<button class="primary" data-action="account-close">返回</button>');
        } finally {
          working = false;
        }
        return;
      }
      if (action === "delete-account") {
        working = true;
        try {
          await nativeAuth.deleteAccount();
          accountSession.clear();
          try {
            campUI?.clear();
            await store.clearProgress();
          } catch {
          }
          location.href = "login-preview.html?status=account-deleted";
        } catch (error) {
          openModal("account-error", "帳號尚未刪除", error.message || "伺服器未確認刪除，請稍後再試。", "", '<button class="primary" data-action="account-close">返回</button>');
        } finally {
          working = false;
        }
        return;
      }
      if (action === "clear-save") {
        working = true;
        try {
          if (checkpointPending) await checkpointPending;
          campUI?.clear();
          await store.clearProgress();
          g = null;
          saveFailed = false;
          settingsResumeGame = false;
          settingsReturnToPause = false;
          tutorialSaveView = null;
          closeModal();
          $3("game").hidden = true;
          $3("camp").hidden = true;
          $3("route-map").hidden = true;
          $3("landing").hidden = false;
          tutorialUI.render(null);
          syncBackgroundMusic();
          refreshSaveUI();
          window.scrollTo(0, 0);
          $3("begin").focus();
        } catch (error) {
          saveFailure(error);
        } finally {
          working = false;
        }
        return;
      }
      if (action === "settings") showSettings();
      if (action === "pause-save") {
        if (await checkpoint(true)) $3("modal-copy").textContent = readonlyQADemo() || practiceRun() ? "試玩不會改動真實存檔。" : "目前進度已儲存。遊戲仍保持暫停，準備好再繼續。";
      }
      if (action === "settings-close") closeSettings();
      if (action === "companion-close") closeCompanions();
      if (action === "loadout-close") closeModal();
      if (action === "loadout-save") await saveLoadout();
      if (action === "companion-select") await chooseCompanion(e.target.closest("[data-companion]")?.dataset.companion);
      if (action === "market-close") closeMarket();
      if (action === "promotion-close") closePromotion();
      if (action === "shop-cancel" || action === "shop-done") closeShopCheckout();
      if (action === "shop-confirm") beginShopCheckout();
      if (action === "close-camp-site") closeModal();
      if (action === "camp-depart") {
        if (!campUI.walk.canInteract("gate")) return;
        closeModal();
        await showRoute("camp");
      }
      if (action === "camp-new") openModal("replace", "放棄已保存的遠征？", "這會刪除本次戰鬥進度與本次購買的卡牌，不發放營火石；永久營地與已結算資源保留。", "", '<button class="primary" data-action="cancel-camp">保留存檔</button><button class="secondary" data-action="replace-run">確認，重新出發</button>');
      if (action === "camp-build") {
        const b = e.target.closest("[data-facility]");
        closeModal();
        await campUI.build(b.dataset.facility, Number(b.dataset.slot));
      }
      if (action === "facility-collect") await collectProduction(e.target.closest("[data-facility]")?.dataset.facility);
      if (action === "camp-task-claim") await collectTask(e.target.closest("[data-npc]")?.dataset.npc);
      if (action === "camp-move-building") {
        campUI.movingFrom = Number(e.target.closest("[data-slot]").dataset.slot);
        closeModal();
        campUI.message("走到另一塊空地按「互動」安置。建築暫時保留原位；點「取消搬遷」可返回。");
      }
      if (action === "camp-place-building") {
        const to = Number(e.target.closest("[data-slot]").dataset.slot), from = campUI.movingFrom;
        closeModal();
        if (from !== null && await campUI.moveBuilding(from, to)) campUI.movingFrom = null;
      }
      if (action === "resume") {
        closeModal();
        g.paused = false;
        lastTime = performance.now();
      }
      if (action === "restart") start();
      if (action === "exit-confirm") openModal("exit", practiceRun() ? "結束新手試煉？" : "放棄這次遠征？", practiceRun() ? "只結束本次練習；原遠征、營地與資源完整保留。" : "將清除本次戰鬥存檔，不發放營火石。永久營地與已結算資源保留。", "", '<button class="primary" data-action="resume">繼續遊玩</button><button class="secondary" data-action="abandon">確認退出</button>');
      if (action === "save-camp") returnCamp();
      if (action === "camp") showCamp();
      if (action === "cancel-camp") closeModal();
      if (action === "home") showHome();
      if (action === "replace-run") start(true);
      if (action === "abandon" && !working) {
        working = true;
        try {
          if (!practiceRun()) await store.abandon();
          showCamp();
        } catch (error) {
          saveFailure(error);
        } finally {
          working = false;
        }
      }
      if (action === "reload-save") {
        store.reload();
        saveFailed = false;
        showCamp();
      }
      if (action === "retry-save") {
        if (g && ["win", "lose"].includes(g.phase)) settle();
        else if (g) {
          if (await checkpoint(true)) {
            if (campUI.active) {
              closeModal();
              g = null;
              campUI.message("已恢復存檔。剛才未完成的購買沒有扣除材料，可再找行商選購。");
            } else pause();
          }
        } else {
          store.reload();
          saveFailed = false;
          showCamp();
        }
      }
      if (action === "export-save") exportSave();
      if (action === "import-confirm" && pendingImport && !working) {
        working = true;
        try {
          await store.import(pendingImport);
          pendingImport = null;
          saveFailed = false;
          showCamp();
          campUI.message("存檔已匯入；可以查看營地或繼續遠征。");
        } catch (error) {
          saveFailure(error);
        } finally {
          working = false;
        }
      }
      if (action === "facility-upgrade") {
        const slot = Number(e.target.closest("[data-slot]")?.dataset.slot), b = store.state.camp.buildings.find((b2) => b2.slot === slot);
        closeModal();
        if (b) await campUI.build(b.type, slot);
      }
    });
    window.addEventListener("keydown", (e) => {
      if (modalKind) {
        if (working) return;
        if (e.key === "Escape" && modalKind === "merchant") {
          if (shopCheckout) {
            closeShopCheckout();
            return;
          }
          closeMarket();
          return;
        }
        if (e.key === "Escape" && ["pause", "exit", "restored"].includes(modalKind)) {
          closeModal();
          if (g) g.paused = false;
        }
        if (e.key === "Escape" && ["camp-site", "facility", "replace", "import"].includes(modalKind)) closeModal();
        if (e.key === "Escape" && modalKind === "companion") closeCompanions();
        if (e.key === "Escape" && modalKind === "loadout") closeModal();
        if (e.key === "Escape" && modalKind === "settings") closeSettings();
        if (e.key === "Tab") {
          const items = [...$3("modal").querySelectorAll("button:not([disabled])")];
          if (items.length) {
            const i = items.indexOf(document.activeElement);
            const next = (i + (e.shiftKey ? -1 : 1) + items.length) % items.length;
            e.preventDefault();
            items[next].focus();
          }
        }
        return;
      }
      if (!$3("route-map").hidden && e.key === "Escape") {
        leaveRoute();
        return;
      }
      if (!g || $3("game").hidden) return;
      const key = e.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) e.preventDefault();
      if (key === "escape") {
        if (drag || selected !== null) {
          clearInput();
          renderHand();
        } else pause();
        return;
      }
      if (!e.repeat && key === " ") g.dash(input());
      if (!e.repeat && key === "q") g.switchWeapon();
      if (!e.repeat && key === "j") g.castSkill("volley");
      if (!e.repeat && key === "k") g.castSkill("shock");
      if (!e.repeat && key === "e") {
        g.interactMapEvent();
        handleEvents();
        updateHUD();
      }
      if (!e.repeat && ["1", "2", "3", "4"].includes(key)) selectCard(Number(key) - 1);
      keys.add(key);
    });
    window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => {
      clearInput();
      if (g && !$3("game").hidden && !modalKind) pause("background");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        clearInput();
        if (g && !$3("game").hidden && !modalKind) pause("background");
        flush();
      }
      lastTime = performance.now();
    });
    window.addEventListener("emberwild-shell-active", (event) => {
      shellAppActive = Boolean(event.detail?.active);
      clearInput();
      campUI?.clear();
      if (!shellAppActive) {
        if (g && !$3("game").hidden && !modalKind) pause("background");
        flush();
      }
      lastTime = performance.now();
    });
    window.addEventListener("pagehide", flush);
    window.addEventListener("storage", (event) => {
      if (!qaMode && event.key === SAVE_KEY && event.newValue !== store.raw) {
        const error = new Error("另一個頁面已更新存檔。為避免互相覆蓋，本頁已暫停。");
        error.code = "CONFLICT";
        saveFailure(error);
      }
    });
    window.addEventListener("resize", () => {
      cancelDrag();
      selected = null;
      painter?.resize();
      campUI?.painter.resize();
    });
    new ResizeObserver(() => painter?.resize()).observe($3("arena"));
    requestAnimationFrame(frame);
    function exportSave() {
      if (campUI.active && !saveFailed) campUI.flush();
      try {
        const raw = !store.blocked && g && store.state.run?.runId === g.runId ? encode({ ...store.state, run: g.snapshot() }, store.revision) : store.export();
        const blob = new Blob([raw], { type: "application/json" }), url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url;
        a.download = `emberwild-save-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1e3);
      } catch (error) {
        saveFailure(error);
      }
    }
    $3("camp-export").addEventListener("click", exportSave);
    $3("camp-import").addEventListener("click", () => $3("save-file").click());
    $3("save-file").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        if (file.size > 5e5) throw new Error("檔案太大，請選擇本遊戲匯出的 JSON 存檔");
        const raw = await file.text(), saved = decode(raw);
        pendingImport = raw;
        openModal("import", "匯入並替換本機存檔？", `檔案包含 ${saved.state.camp.buildings.length} 座營地建築、${saved.state.camp.stones} 營火石${saved.state.run ? "與未完成遠征" : ""}。這會替換目前進度，建議先匯出備份。`, "", '<button class="primary" data-action="cancel-camp">取消，保留目前進度</button><button class="secondary" data-action="import-confirm">確認替換</button>');
      } catch (error) {
        campUI.message(`匯入失敗，原存檔未改動：${error.message}`);
      }
    });
    campUI = new CampUI(store, { onError: saveFailure, onInteract: campSite, isPaused: () => !shellAppActive || !!modalKind || working || saveFailed });
    experience.subscribe(() => {
      updateSoundButton();
      syncBackgroundMusic();
      painter?.resize();
      campUI?.painter.resize();
      if (modalKind === "settings") syncSettingsControls();
    });
    updateSoundButton();
    syncBackgroundMusic();
    refreshSaveUI();
    window.setShellContentMode(sdkContentMode());
    window.emberwildBoot?.ready();
    const entryIntent = new URLSearchParams(location.search).get("enter");
    if (entryIntent === "camp") refreshNativeAccount().then(() => {
      if (entryIntent !== "camp") return;
      if (accountSession.reload()) showCamp();
      else location.replace("login-preview.html?return=camp");
    });
    if (acceptanceResetError) {
      saveFailed = true;
      openModal("reset-error", "本地清檔暫未完成", acceptanceResetError.message, '<p class="howto">未驗證備份前不會清除資料。請關閉其他遊戲頁並確認瀏覽器允許儲存後重試。</p>', '<button class="primary" data-action="reload-reset">重新檢查並清檔</button>');
    }
    if (qaMode) {
      window.emberwildQA = { get game() {
        return g;
      }, get painter() {
        return painter;
      }, get dragging() {
        return !!drag;
      }, get shopCheckout() {
        return shopCheckout;
      }, store, accountSession, campUI, experience, backgroundMusic, start, input, checkpoint, showCamp, showRoute, resumeRun, showResult, showSettings, showCompanions, chooseCompanion, render: () => {
        if (g) {
          handleEvents();
          updateHUD();
          renderHand();
          painter?.render(g);
        } else campUI.render();
      } };
      if (qaMode === "route") queueMicrotask(() => showRoute("home"));
      if (qaMode === "reward") queueMicrotask(() => showResult({ won: true, waves: MAX_WAVES, stones: 24, kills: 67, combos: 15, loot: { wood: 76, bone: 45, amber: 62, harvested: 8 } }));
      if (qaMode === "enemies") queueMicrotask(() => {
        const demo = new Expedition(11, "qa-enemies");
        demo.wave = 8;
        demo.phase = "wave";
        demo.spawnQueue = [];
        demo.setupObjective();
        for (const [type, x, y] of [["matriarch", 150, 255], ["charger", 545, 255], ["boss", 355, 610]]) {
          const enemy = demo.spawnEnemy(type, { x, y });
          enemy.hp *= 0.31;
          enemy.angle = 0;
          enemy.bossPhase = 2;
          enemy.attackKind = type === "matriarch" ? "brood-pool" : type === "charger" ? "bone-charge" : "titan-double";
          enemy.windup = type === "boss" ? 1.3 : type === "charger" ? 0.72 : 1.25;
          enemy.lockX = 360;
          enemy.lockY = 430;
          enemy.weakpoint.open = true;
          enemy.weakpoint.openTime = 99;
          demo.syncBossWeakpoint(enemy);
        }
        demo.effects = [];
        demo.paused = true;
        mountRun(demo);
        updateHUD();
        painter.render(demo);
      });
      if (qaMode === "events") queueMicrotask(() => {
        const demo = new Expedition(4242, "qa-events");
        demo.wave = 1;
        demo.phase = "wave";
        demo.spawnQueue = ["raptor"];
        demo.spawnTimer = 999;
        demo.setupObjective();
        const positions = { merchant: [120, 205], ruin: [360, 180], hunter: [590, 235], chest: [150, 620], elite: [525, 610] };
        for (const mapEvent of demo.eventPlan) {
          mapEvent.stage = 1;
          mapEvent.status = "active";
          [mapEvent.x, mapEvent.y] = positions[mapEvent.type];
          if (mapEvent.type === "elite") {
            mapEvent.eliteIds = ["raptor", "spitter", "brute"].map((type, index) => {
              const enemy = demo.spawnEnemy(type, { x: mapEvent.x + (index - 1) * 55, y: mapEvent.y - 55 });
              enemy.elite = true;
              enemy.eliteEventId = mapEvent.id;
              enemy.maxHp *= 1.42;
              enemy.hp = enemy.maxHp;
              return enemy.id;
            });
          }
        }
        const chest = demo.eventPlan.find((event) => event.type === "chest");
        demo.hero.x = chest.x;
        demo.hero.y = chest.y + 55;
        demo.effects = [];
        demo.consumeEvents();
        demo.paused = true;
        mountRun(demo);
        updateHUD();
        painter.render(demo);
      });
      const stageMatch = /^stage([1-8])$/.exec(qaMode);
      if (stageMatch) queueMicrotask(() => {
        const stage = Number(stageMatch[1]), demo = new Expedition(100 + stage, `qa-stage-${stage}`);
        demo.wave = stage - 1;
        demo.stats.waves = stage - 1;
        demo.paused = false;
        mountRun(demo);
        demo.paused = false;
        demo.startWave();
        demo.spawnQueue = [];
        demo.spawnTimer = 999;
        const samples = { 1: [["raptor", 210, 235], ["raptor", 505, 255]], 2: [["raptor", 165, 250], ["brute", 535, 255]], 3: [["matriarch", 355, 230], ["spitter", 540, 560]], 4: [["brute", 180, 240], ["spitter", 520, 250]], 5: [["brute", 170, 240], ["spitter", 520, 235], ["raptor", 355, 190]], 6: [["charger", 355, 245], ["brute", 535, 560]], 7: [["brute", 160, 250], ["spitter", 545, 250], ["raptor", 355, 620]], 8: [["boss", 355, 250], ["brute", 545, 580]] }[stage];
        for (const [type, x, y] of samples) demo.spawnEnemy(type, { x, y });
        demo.effects = [];
        demo.consumeEvents();
        demo.paused = true;
        updateHUD();
        painter.render(demo);
      });
    }
  }
  bootGame().catch(() => window.emberwildBoot?.failed());
})();
