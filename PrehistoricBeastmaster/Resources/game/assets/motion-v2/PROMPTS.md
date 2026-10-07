# 动作素材 · motion-v2

2026-09-17，内置 imagegen（非 CLI）。原始透明 PNG 保存为 ranger.png / porter.png / hunter.png，未覆盖旧素材。

这些图集保留正反两面的人物身份和多个姿势。游戏使用站立帧加四个行走姿势，并统一人物缩放和每帧脚底基线；播放速度由实际位移驱动，不再对腿部做程序拉伸。左右方向使用镜像，手持武器按主角每个姿势的手部锚点跟随。

人物运动控制和 NPC 路线均是本地表现逻辑，不改变支付、后端或存档格式。

## ranger

参考：../painted-v1/ranger.png

```text
Use case: identity-preserve.
Asset type: animation-ready transparent sprite atlas, not concept art.
Build a coherent WALK CYCLE for the referenced character, preserve exact costume, identity, colors and painterly game style. Elevated orthographic top-down game camera at 40 degrees, full body in every cell.
Layout: wide 2560x1024 transparent PNG. EXACTLY FIVE equal columns and TWO equal rows, each cell 512x512. No visible borders. Same body scale throughout. Center pelvis at x=256 within every cell, head at y=68, hip at y=298, shared ground contact baseline y=455. Whole figure inside x=100..412, y=55..462. Leave transparent margins between sprites.
Top row: facing southeast, face visible. Bottom row: facing northeast, back visible. Column1 relaxed neutral IDLE feet under hips. Column2 walk contact LEFT foot forward/right foot back. Column3 passing position: left leg supports under torso, right knee swinging forward. Column4 opposite contact RIGHT foot forward/left foot back. Column5 opposite passing position: right leg supports, left knee swinging forward. Arms counter-swing gently if not carrying something. Boots must alternate visibly and naturally, never cross or tangle. Normal measured grounded walk, not running or marching. Torso/pelvis stay centered and consistent; head no scale or identity changes. Back row matches front gait phase, never reversed direction midrow.
Genuine transparent alpha outside the sprites, no ground or shadows, no gradient backdrop, no text, no labels, no grid, no watermark. Do not add extra characters or props. Production 2D game sprite art.
Character: only the teal-cloaked dark-haired leather/fur ranger shown in image1. Empty hands, no held weapons. Short teal cape and ivory bone shoulder remain identical. The RIGHT hand (viewer right in front row) loosely closed and lowered by belt to attach equipment in engine. Keep arms understated to support a separately attached spear. Preserve original detailed adult proportions.
```

## porter

参考：../painted-v1/residents.png

```text
Use case: identity-preserve.
Asset type: animation-ready transparent sprite atlas, not concept art.
Build a coherent WALK CYCLE for the referenced character, preserve exact costume, identity, colors and painterly game style. Elevated orthographic top-down game camera at 40 degrees, full body in every cell.
Layout: wide 2560x1024 transparent PNG. EXACTLY FIVE equal columns and TWO equal rows, each cell 512x512. No visible borders. Same body scale throughout. Center pelvis at x=256 within every cell, head at y=68, hip at y=298, shared ground contact baseline y=455. Whole figure inside x=100..412, y=55..462. Leave transparent margins between sprites.
Top row: facing southeast, face visible. Bottom row: facing northeast, back visible. Column1 relaxed neutral IDLE feet under hips. Column2 walk contact LEFT foot forward/right foot back. Column3 passing position: left leg supports under torso, right knee swinging forward. Column4 opposite contact RIGHT foot forward/left foot back. Column5 opposite passing position: right leg supports, left knee swinging forward. Arms counter-swing gently if not carrying something. Boots must alternate visibly and naturally, never cross or tangle. Normal measured grounded walk, not running or marching. Torso/pelvis stay centered and consistent; head no scale or identity changes. Back row matches front gait phase, never reversed direction midrow.
Genuine transparent alpha outside the sprites, no ground or shadows, no gradient backdrop, no text, no labels, no grid, no watermark. Do not add extra characters or props. Production 2D game sprite art.
Select ONLY top-middle character of reference: young male PORTER with short dark hair, ochre shirt, teal scarf, green bedroll backpack, carrying the SAME rectangular wooden crate with BOTH hands. Ignore all other people and pet in the reference. Crate and torso remain steady across cycle, only clear alternating legs and subtle shoulder weight shift. Keep original appealing proportions.
```

## hunter

参考：../painted-v1/residents.png

```text
Use case: identity-preserve.
Asset type: animation-ready transparent sprite atlas, not concept art.
Build a coherent WALK CYCLE for the referenced character, preserve exact costume, identity, colors and painterly game style. Elevated orthographic top-down game camera at 40 degrees, full body in every cell.
Layout: wide 2560x1024 transparent PNG. EXACTLY FIVE equal columns and TWO equal rows, each cell 512x512. No visible borders. Same body scale throughout. Center pelvis at x=256 within every cell, head at y=68, hip at y=298, shared ground contact baseline y=455. Whole figure inside x=100..412, y=55..462. Leave transparent margins between sprites.
Top row: facing southeast, face visible. Bottom row: facing northeast, back visible. Column1 relaxed neutral IDLE feet under hips. Column2 walk contact LEFT foot forward/right foot back. Column3 passing position: left leg supports under torso, right knee swinging forward. Column4 opposite contact RIGHT foot forward/left foot back. Column5 opposite passing position: right leg supports, left knee swinging forward. Arms counter-swing gently if not carrying something. Boots must alternate visibly and naturally, never cross or tangle. Normal measured grounded walk, not running or marching. Torso/pelvis stay centered and consistent; head no scale or identity changes. Back row matches front gait phase, never reversed direction midrow.
Genuine transparent alpha outside the sprites, no ground or shadows, no gradient backdrop, no text, no labels, no grid, no watermark. Do not add extra characters or props. Production 2D game sprite art.
Select ONLY lower-left character of reference: hooded ARCHER/SCOUT in teal hood, brown leather, quiver and wooden bow. Ignore other people and pet in reference. Same face and clothes, carry bow low close to body without aiming, natural relaxed patrol gait. In back row show hood and quiver, hide face. Keep original appealing proportions.
```
