# AI 美术素材 · painted-v1

生成日期：2026-09-17。使用内置 image_gen（非 CLI/API 回退）。素材用于独立 Emberwild 原型，未接入正式 iOS 工程。

- ranger.png：六帧前/后视角游侠，待机与两步行走。
- weapons.png：独立骨矛、骨斧装备图层。
- settlement-v2.png：帐篷、工坊、仓库、兽卵温室、行商摊位、山口。布局收紧后的选用版；settlement.png 保留初稿。
- residents.png：行商、搬运工、铁匠、弓手、盾卫、幼兽。
- scenery.png：营火、阔叶树、蕨树、岩石、草丛、骨栅栏。
- cards-v1.png：六张部署卡插画，依次为燧火炬、裂骨墙、幼兽巢、潮汐泉、游猎弓手、骨盾卫士。
- enemies-v1.png：四种战斗敌人，依次为蕨羽迅猛兽、骨背蛮兽、毒液吐息兽、琥珀泰坦。
- victory-reward-v1.png：通关奖励徽记，用于远征结算界面。

源 PNG 保留生成透明通道，使用 Canvas 的源矩形读取精灵，没有将透明背景替换成纯色。下面记录完整生成提示词。

## cards

```text
Use case: stylized-concept
Asset type: production CARD ART SPRITE ATLAS for the existing Emberwild mobile game, used as six small card illustrations.
Input images: settlement-v2.png and residents.png are STYLE REFERENCES only. Match their polished hand-painted 2.5D prehistoric wilderness RPG art direction, teal cloth, ivory bone, warm amber light, dark clean outlines, and elevated three-quarter camera.
Primary request: create exactly six isolated card-art subjects in a precise THREE-COLUMN by TWO-ROW atlas, canvas approximately 1536x1024. Each subject must be centered in its own equal 512x512 cell, fill roughly 68% of that cell, and have generous genuinely transparent gutters. No subject may cross a cell boundary.
Top row: a flame totem; a curved bone wall; a beast nest containing a pale-jade horned hatchling and two speckled eggs.
Bottom row: a turquoise tidal spring; a teal-hooded wilderness archer; a fur-collared bone shield guard.
Style/medium: premium hand-painted game illustration, cohesive mobile RPG asset atlas, bold readable silhouettes at card size, warm upper-left lighting, natural timber/leather/bone/fern texture.
Background: truly transparent alpha everywhere outside each subject. No colored backdrop, ground tile, card frame or labels.
Constraints: exactly six subjects in stated order, no visible grid, no captions, no text, no numbers, no logos, no watermark. Keep every silhouette inside its own cell.
```

## building cards v2

The four deployment buildings were regenerated as independent 1254 × 1254 transparent PNG masters. Their `*-game-v2.png` 768 × 768 derivatives replace only the first four `cards-v1.png` cells at runtime; the original atlas remains available for rollback and still supplies both hire cards.

Shared direction for `card-torch-v2.png`, `card-wall-v2.png`, `card-nest-v2.png`, and `card-spring-v2.png`:

```text
Use case: stylized-concept
Asset type: production mobile game building-card illustration, isolated transparent PNG
Style reference: cards-v1.png. Match its polished hand-painted 2.5D prehistoric wilderness RPG art direction, warm upper-left light, dark timber, ivory bone, teal cloth and amber accents, with a readable silhouette at small card size. Create a new design rather than copying the old cell.
Composition: square centered three-quarter view, complete structure visible, roughly 76–78% canvas coverage with generous clear padding.
Background: genuinely transparent alpha outside the object.
Constraints: one placeable building only; no card frame, ground tile, UI, text, logo or watermark; no cropped parts.
```

Individual subjects:

- `card-torch-v2.png`: 燧火炬 — tripod brazier, bright orange flame, four curved beast fangs, teal bindings and one amber charm; unmistakably a support building rather than a handheld torch.
- `card-wall-v2.png`: 裂骨墙 — curved timber palisade reinforced by giant ribs, fossil spikes, teal rope and bronze plates; selected cracks communicate its shattering-bone attack.
- `card-nest-v2.png`: 幼兽巢 — rib-and-hide shelter with ferns, exactly one pale-jade horned hatchling and two speckled eggs; protective creature-summoning building.
- `card-spring-v2.png`: 潮汐泉 — circular ancient-stone basin, turquoise water, central aqua crystal, small waterfall, four fang markers and amber charm; restorative support building.

## enemies

```text
Use case: stylized-concept
Asset type: production ENEMY SPRITE ATLAS for the existing Emberwild top-down mobile action RPG.
Style references: cards-v1.png and residents.png. Match their polished hand-painted 2.5D prehistoric wilderness art direction.
Primary request: exactly four isolated enemies in a precise two-column by two-row square atlas: a jade-and-ochre feathered fern raptor; a heavy horned boneback brute; a turquoise-and-violet venom spitter; and a huge dark forest-green amber crystal titan boss.
Composition: elevated three-quarter top-down game camera, full silhouettes, regular cells, transparent gutters.
Background: genuine transparent alpha. No scenery, ground tile, labels, text, logo or watermark.
```

## victory reward

```text
Use case: stylized-concept
Asset type: transparent victory reward emblem for the Emberwild completion screen.
Primary request: a sacred speckled beast egg in a stone-and-bone nest, crossed bone spear and axe, fern wreath, warm flame halo, and glowing amber camp stones spilling from a small open coffer.
Style: polished hand-painted 2.5D mobile RPG interface artwork matching the existing teal, ivory and amber art direction.
Background: genuine transparent alpha. No labels, text, numbers, buttons, logo or watermark.
```

## hero

```text
Use case: stylized-concept
Asset type: production 2D GAME SPRITE SHEET, not a concept poster.
Primary request: one coherent animated character sheet for an original top-down wilderness action RPG, hand-painted premium game art.
Composition: landscape 1536x1024, exactly THREE EQUAL COLUMNS and TWO EQUAL ROWS, six equally-sized rectangular cells, NO visible grid lines. Each cell contains the SAME full-body young adult wilderness ranger, identical scale, centered horizontally, feet aligned at 84% of the cell height, ample 12% empty gutter on every side. Absolutely no sprite overlaps across cells.
Character: dark windswept hair, teal-green short cloak, fur-trimmed leather tunic, bone shoulder guard, amber clasp, leather boots and belt pouch. Hands clearly formed. Three-and-a-half heads tall, appealing stylized adult, readable face and silhouette. Empty right hand loosely curled at hip, NO held weapons (weapons are equipped as a separate game layer).
Top row: character facing southeast toward viewer at slight three-quarter angle: column1 relaxed idle pose, column2 walking left foot forward, column3 walking right foot forward.
Bottom row: the exact same character seen from behind facing northeast away from viewer: column1 idle, column2 walking left foot forward, column3 walking right foot forward.
Style: polished painterly 2.5D game sprite, controlled dark warm outlines, detailed material shading, softly rendered volume, strong readable silhouette at small game scale, subtle warm light from upper left. Elevated orthographic top-down 45-degree game camera, NOT a side-view platformer.
Background: genuinely transparent alpha everywhere outside each character, including between legs and between cells. No ground, no shadow disc, no scenery. No white/gray/checkerboard background baked into image.
Constraints: exactly six sprites of same character and clothes; entire head, cloak, hands and boots visible; no weapons; no borders, captions, letters, logos or watermark. Keep crop coordinates regular for use as an animated sprite atlas.
```

## weapons

```text
Use case: stylized-concept
Asset type: production equipment sprite atlas for a top-down hand-painted wilderness action RPG.
Composition: square 1024x1024 image divided into TWO EQUAL COLUMNS, exactly one isolated full weapon centered in each column, all of each weapon visible with generous margins, empty space between them, no visible grid.
LEFT: an elegant primitive bone-tipped SPEAR: tall straight dark wooden shaft, long ivory flint/bone spearhead pointing straight UP, leather and teal cloth wrapping, one small amber charm. Strong clean silhouette. Whole object fits inside left 50% of canvas with 12% padding.
RIGHT: a rugged one-handed BONE AXE: straight wooden handle pointing down and a broad sculpted ivory bone blade at top toward the RIGHT, leather grip, teal binding and amber rivet. Whole object inside right 50% with 12% padding.
Style: polished painted 2.5D game equipment, natural leather/wood/bone detail, premium mobile RPG readable sprite, crisp dark contour and warm upper-left light. Same art direction as a teal-cloaked leather-and-fur wilderness ranger. Large shapes, no excessive fine filigree.
Background: genuine transparent alpha, NO background color, NO shadow disc, NO tile or card frame, NO text, NO watermark. Render both upright as equipment attachments for animation, not angled crossed weapons, not carried by any person.
```

## camp

```text
Use case: stylized-concept
Asset type: production settlement-building sprite atlas for an original wilderness RPG, six separate placeable structures.
Composition: landscape 1536x1024, precisely THREE EQUAL COLUMNS x TWO EQUAL ROWS, exactly ONE isolated building per cell. Clear fully transparent gutters between every cell. Each structure centered in its own cell, complete silhouette, overall building fits within 82% of cell width and 80% of cell height. All ground contact points aligned at 86% of each cell height. No overlap, no connecting roads, no grid lines.
Top row left: ranger's substantial A-frame canvas TENT with teal hide roof, bone supports, rolled skins and leather packs at entrance.
Top row middle: primitive BLACKSMITH WORKSHOP with stone forge and small chimney, wood-and-teal-hide roof, glowing orange furnace, bone tools and anvil.
Top row right: wooden SUPPLY STOREHOUSE with teal thatch roof, stacked crates, tied sacks, ivory bone fasteners.
Bottom row left: BEAST EGG NURSERY with organic wooden arches, translucent pale green canopy, three cream speckled eggs nestled in straw.
Bottom row middle: wandering MERCHANT STALL with striped cream-and-teal canvas awning, rugged timber counter, small crates, rolled charts, card-sized goods. NO merchant person, the NPC will be a separate layer.
Bottom row right: wilderness GATEWAY with two weathered stone-and-bone pillars, carved lintel, teal banner with a simple non-letter amber diamond. Clear open arch to walk toward.
Style: beautiful richly painted 2.5D game environment sprites, cozy prehistoric wilderness fantasy, believable timber, stone, fur, woven fabric, bone detail. Strong legible silhouettes, polished volumetric lighting from upper left, restrained dark painted outlines, teal moss and warm ochre accents. Elevated orthographic 45-degree top-down RPG camera, fronts toward lower edge. NOT a side-view game, NOT icons in frames, NOT a mockup.
Background: genuinely transparent alpha outside structures and in open archways, no ground tile, no floor/platform, no large cast shadows, no landscape. Absolutely no painted checkerboard or white backdrop.
Constraints: exactly six structures in stated order, no text, no labels, no logos, no people, no watermarks.
```

## support

```text
Use case: stylized-concept
Asset type: production supporting character sprite atlas for original top-down wilderness RPG.
Composition: landscape 1536x1024, exact THREE EQUAL COLUMNS x TWO EQUAL ROWS, six separate equally-spaced sprites, one per cell. Every whole character centered in its cell with feet aligned at 84% of cell height and 12% transparent margins. No touching cells or overlaps.
Top row left: friendly older traveling MERCHANT, warm brown leather coat, cream scarf, green hood pushed back, gray beard, amber brooch, small supply satchel, friendly expressive face.
Top row middle: camp PORTER, short dark hair, ochre tunic and teal scarf, sturdy leather boots, holding a small wooden supply crate.
Top row right: camp BLACKSMITH, adult woman, tied-back dark hair, leather apron, teal trousers, bone hammer carried at her waist.
Bottom row left: ARCHER hire, teal hood and leather tunic, carrying curved bone bow and small quiver.
Bottom row middle: SHIELD GUARD hire, leather armor and fur collar, rounded bone-and-wood shield with teal inset, compact bone spear.
Bottom row right: charming small pale jade-green horned dinosaur COMPANION, cream belly, rounded expressive snout, tiny ivory horns, feet and tail fully visible.
Style: premium hand-painted 2.5D game art, strong clean dark contours, natural fabric and leather texture, warm upper-left light, clear readable faces and silhouettes at small sizes, stylized adult humans about three-and-a-half heads tall. All characters seen from elevated 45-degree orthographic top-down view, three-quarter facing southeast toward viewer. Matches a teal-cloaked prehistoric wilderness ranger. NOT a side scrolling game.
Background: genuinely transparent alpha around each sprite, between legs and between atlas cells. No scenery, no ground/platform/shadow discs, no baked white or checkerboard background.
Constraints: exactly six characters in stated order; no captions, grid, card frames, logos, text or watermark. These are real game sprites, not marketing illustrations.
```

## settlement layout edit

```text
Use case: precise-object-edit
Input image is the EDIT TARGET: keep these exact six building designs, their materials, colors, perspective and hand-painted style. This is a GAME SPRITE ATLAS, not a poster.
Change only the layout and scale: shrink EACH of the six isolated structures about 20% within its existing 512x512 cell. Canvas stays 1536x1024, 3 columns x 2 rows. Every building must have at least 40px fully transparent padding on its left/right and at least 35px on top/bottom of its OWN cell. No building extends across x=512, x=1024 or y=512. All complete building silhouettes must fit; no clipping. Do NOT add more items, do NOT redraw designs, do NOT change order.
Keep a GENUINELY TRANSPARENT ALPHA background, including all gutters and gateway opening. No white, gray, checkerboard, gradient, scenery, ground or colored backdrop baked in. No text, labels, grid, shadows, watermarks. Preserve the same exact six structures: tent, forge, storehouse; nursery, merchant stall, gateway.
```

## scenery

```text
Use case: stylized-concept
Asset type: six independent environment prop sprites in a 3-column 2-row 1536x1024 GAME ATLAS. Each complete prop centered inside its own 512x512 cell with at least 55px TRANSPARENT padding on ALL sides. No touching, no overlaps, no cropping, no grid.
Art direction: richly hand-painted 2.5D prehistoric wilderness RPG, natural bone timber leaves stones, teal-green foliage, warm ivory and ochre accents, crisp soft-dark contours, overhead warm upper-left light, elevated orthographic 45-degree top-down camera (not platformer side-view).
Top left: campfire of split logs inside rugged stone ring, small readable orange flame, ivory bone cooking frame, no big smoke plume.
Top middle: ONE leafy ancient jungle tree, gnarled short trunk with roots, beautiful layered broad green canopy, NO ground tile.
Top right: ONE prehistoric giant fern tree, textured curved trunk with sweeping green fronds, NO ground tile.
Bottom left: small mossy boulder cluster with a few tiny ferns.
Bottom middle: low leafy fern and tall-grass clump with a small cream wildflower.
Bottom right: a short rustic bone-and-wood fence segment bound in leather.
Exactly six props, no people, no buildings, no labels, no text, no logo, no watermark. Genuinely transparent alpha outside each prop, no background color, no checkerboard. Production sprites, no concept-art sheet backdrop.
```

## expedition route

```text
Use case: stylized-concept.
Create a portrait 1024x1536 premium hand-painted 2.5D prehistoric jungle OVERWORLD LEVEL-SELECTION MAP for a mobile action RPG. Elevated isometric/orthographic fantasy map view, lush fern cliffs, turquoise rivers, mist, waterfalls, carved bone-and-stone ruins, teal cloth accents, warm ochre trail, amber crystal glow. Match the supplied game's painterly teal, ivory, ochre and amber art direction.

The map must contain EXACTLY SIX clear landmark arenas connected in one readable continuous S-shaped ochre path, progressing from bottom to top: (1) bottom-center wilderness camp gateway with teal tents and a small fire; (2) lower-left giant fern hollow with a bone bridge; (3) middle-right tidal marsh with stepping stones and shallow turquoise water; (4) middle-left ancient beast-stone ruins; (5) upper-right volcanic amber crystal ridge; (6) top-center monumental titan sanctuary entrance framed by tusks. Leave visually clear circular ground space at every landmark so UI level buttons can be overlaid later. The path must visibly connect 1→2→3→4→5→6 without branches.

Environment only: no characters, enemies, UI, text, numbers, labels, pins, logos, borders or watermark. Opaque full-bleed illustration; do not draw a phone frame.
```

## battle stages 2–5

```text
Use case: stylized-concept. Four separate production portrait 1024x1536 battle-arena backgrounds matching fern-valley.png's premium hand-painted 2.5D elevated top-down art direction. Every image keeps the central 72% as one broad walkable space and restricts large props to the outer perimeter. Environment only: no characters, enemies, UI, text, numbers, labels, logos or watermark.

Stage 2 — Giant Fern Hollow: enormous spiral fern fronds, tangled roots, ivory tusks, bone-and-log bridges, olive earth.
Stage 3 — Tidal Marsh: turquoise shallow water, mossy stepping stones, reeds, fern islands, driftwood bones, damp teal-ochre mudflat.
Stage 4 — Ancient Beast-Stone Ruins: broken monoliths with abstract non-letter motifs, collapsed ivory ribs, mossy flagstones and teal banners.
Stage 5 — Amber Ridge: black volcanic rock, glowing amber crystals, distant lava fissures, wind-bent ferns, waterfalls and a dark ochre plateau.
```
# 圣兽恐龙蛋（`sacred-beast-egg-v1.png`）

生成日期：2026-09-18  
生成方式：Codex 内置 ImageGen

生成一枚用于俯视动作 RPG 战场目标的圣兽恐龙蛋。大型象牙色椭圆蛋壳带苔绿色斑点和少量浅裂纹，竖立在环形史前孵化巢中；巢由弯曲浅色骨骼、深色雕刻木、编织皮革、干蕨纤维和小块琥珀组成。蛋壳内部与巢石之间有克制的金色琥珀微光，整体珍贵、有生命感但尚未孵化。

采用约 55 度俯视三分之四视角，完整展示蛋和整个圆形巢穴，紧凑方形轮廓，适合缩小到约 100 像素高。高品质手绘史前荒野 ARPG 游戏素材；象牙白、骨米色、风化棕、深青绿和琥珀金配色。必须是真实透明背景，只允许巢正下方有很小的透明接触阴影。禁止人物、幼龙、多个蛋、完全破壳、场景背景、UI、文字、边框、水印、纯白底和扁平几何风格。

# 琥珀晶矿（`amber-crystal-node-v1.png`）

生成日期：2026-09-18  
生成方式：Codex 内置 ImageGen

生成一个用于俯视史前动作 RPG 的可采集琥珀晶簇，替换战场上的黄色几何矿点。晶簇由 5—7 根蜂蜜金色透明晶柱组成：一根高大主晶、两根中型侧晶和若干小晶片，形成清楚的三角轮廓；晶体具有暖色内光、深橙色核心与象牙色高光，内部包含细小气泡和蕨叶剪影。底座使用深色苔石、裸露树根和少量细小蕨叶。

采用约 55 度俯视三分之四视角，完整显示晶簇与小型自然底座，缩小至 50—65 像素高时仍清楚可辨。必须是真实透明背景，只允许矿石正下方有淡出接触阴影。禁止扁平菱形、简单黄色多边形、金币、悬空宝石、多个分离矿堆、蓝色晶体、场景背景、UI、文字、边框与水印。

# 猎脊弩台（`card-watchtower-v1.png`）

生成日期：2026-09-18  
生成方式：Codex 内置 ImageGen

Create a single production-ready transparent-background game asset for a premium 2D mobile action roguelite set in a lush prehistoric frontier. Subject: “Hunter Spine Ballista” — a compact primitive automatic crossbow watchtower built from dark hardwood, lashed rope, ivory dinosaur ribs, sharpened bone bolts, and small amber mechanisms. It must look like a real functional defensive building, not a character and not a UI icon. The top mechanism should clearly read as a rapid-firing heavy bone crossbow, aimed diagonally toward the upper-right. Strong readable silhouette, slightly exaggerated proportions, believable construction, richly painted materials.

Isolated object, top-down three-quarter orthographic game view, centered and fully visible on a square canvas with generous transparent padding. Polished hand-painted fantasy strategy-game asset, detailed but readable at 96–160 px, warm amber highlights, mossy prehistoric accents, dark green/brown/ivory palette, crisp edges and a subtle contact shadow only. Transparent alpha; exactly one building; no people, monsters, text, border, card frame, scenery, terrain tile, flying arrows, UI symbols or watermark.

# 琥珀投兽器（`card-catapult-v1.png`）

生成日期：2026-09-18  
生成方式：Codex 内置 ImageGen

Create a single production-ready transparent-background game asset for a premium 2D mobile action roguelite set in a lush prehistoric frontier. Subject: “Amber Beast-Thrower” — an original primitive heavy catapult built from bent dinosaur ribs, dark hardwood beams, thick sinew rope, bone joints, and a sling cradle holding one glowing rough amber boulder. It is a squat defensive siege construction and must clearly communicate slow, powerful arcing area attacks. Strong readable silhouette and believable mechanism, distinct from a crossbow or ballista.

Isolated object, top-down three-quarter orthographic game view, aimed diagonally toward the upper-right, centered and fully visible on a square canvas with generous transparent padding. Polished hand-painted fantasy strategy-game asset, readable at 96–160 px, with warm glowing amber, mossy prehistoric accents, dark green/brown/ivory/gold palette, crisp edges and a subtle contact shadow only. Transparent alpha; exactly one siege building; no people, monsters, text, border, card frame, scenery, terrain tile, projectile in flight, UI symbols or watermark.

# 关卡首领图集（`bosses-v1.png`）

生成日期：2026-09-18  
生成方式：Codex 内置 ImageGen

```text
Use case: stylized-concept. Create a production game sprite atlas on a truly transparent background for a premium hand-painted prehistoric mobile ARPG, top-down three-quarter orthographic view. Exactly two isolated boss creatures, fully visible and separated into equal left and right halves with generous transparent padding; no overlap, no scenery, no ground tiles, no UI, no text, no border or watermark.

Left: Swamp Matriarch, a huge low-slung amphibious dinosaur predator with teal-blue scales, broad sail-like fins, hanging marsh moss, pale bone spines and luminous poison throat sacs; readable silhouette for fan-shaped venom attacks and summoning hatchlings.
Right: Boneplate Charger, a massive quadrupedal red-brown dinosaur wrapped in layered ivory skull armor, two long forward horns, stone-like back plates and leather bindings; readable silhouette for a heavy straight-line charge.

Rich painted materials, crisp soft-dark edges, warm upper-left lighting, moss-green/teal/ivory/amber palette, each readable around 180 px tall. No duplicate creatures, no human equipment beyond primitive bindings, no shadows except a faint contact shadow contained under each creature.
```

# 第 6 关：熔灰林（`stage-6-ashen-canopy-v1.png`）

生成日期：2026-09-18  
生成方式：Codex 内置 ImageGen

```text
Portrait 1024x1536 production battle-arena background for a premium hand-painted 2.5D prehistoric mobile ARPG. Elevated top-down orthographic view. Ashen Canopy: a broad scorched jungle clearing, blackened giant ferns, glowing orange root fissures, smoking timber, dark volcanic soil and restrained amber embers. Keep the central 72% open and walkable with large props only around the perimeter. Environment only; no characters, enemies, UI, text, labels, logos or watermark. Full-bleed opaque illustration.
```

# 第 7 关：月骨峡谷（`stage-7-moonbone-ravine-v1.png`）

生成日期：2026-09-18  
生成方式：Codex 内置 ImageGen

```text
Portrait 1024x1536 production battle-arena background for a premium hand-painted 2.5D prehistoric mobile ARPG. Elevated top-down orthographic view. Moonbone Ravine: a cool moonlit canyon clearing edged by colossal ivory ribs and fossils, blue-green ferns, pale stone, shallow turquoise streams and small waterfalls. Keep the central 72% open and walkable with large props only around the perimeter. Environment only; no characters, enemies, UI, text, labels, logos or watermark. Full-bleed opaque illustration.
```

# 第 8 关：泰坦圣所（`stage-8-titan-sanctuary-v1.png`）

生成日期：2026-09-18  
生成方式：Codex 内置 ImageGen

```text
Portrait 1024x1536 production final-boss battle-arena background for a premium hand-painted 2.5D prehistoric mobile ARPG. Elevated top-down orthographic view. Titan Sanctuary: a monumental circular bone-and-stone ritual arena in an ancient jungle, huge carved tusks and rib arches, amber channels, mossy monoliths, waterfalls and a worn central combat floor. Keep the central 72% broad, open and walkable; frame the perimeter with architecture and foliage. Environment only; no characters, enemies, UI, text, letters, numbers, logos or watermark. Full-bleed opaque illustration.
```
