# 主角疾行动作 · motion-v3

2026-09-17，使用内置 imagegen（非 CLI）生成。`ranger-run.png` 是首轮输出，`ranger-run-clean.png` 是保持动作不变、重新整理透明间距后的实际接入图集；旧版 `motion-v2` 未覆盖。

目标是彻底去掉“老头像拄拐杖”的感觉：人物与武器分层，动作图中双手为空；主角保持年轻、挺拔、脚落在髋部下方，武器平时由代码斜背，攻击时才取到手中。

## 首轮生成提示词

```text
Use case: identity-preserve
Asset type: production-ready 2D game character locomotion sprite atlas with transparent alpha
Input images: Image 1 is the identity, costume, proportions, palette, painterly rendering, and camera-angle reference only. Preserve the same young male prehistoric ranger: dark tousled hair, teal cloak, fur collar, brown leather armor and boots, bone shoulder ornament. Do not preserve the awkward old walk poses.
Primary request: Create a completely new athletic LIGHT JOG / BRISK TRAVERSAL LOOP for this same hero. The motion must read as a capable young ARPG ranger, energetic and balanced, never as an elderly person using a cane.
Canvas/layout: one wide transparent atlas, 6 equal columns by 2 equal rows. Top row faces southeast/front three-quarter; bottom row faces northeast/back three-quarter.
Animation anatomy: upright athletic posture, chest open, neck vertical, head level, shoulders calm, pelvis level, feet landing under the hips. Small natural vertical bounce only. Moderate short stride, heel-to-toe contact, back heel lifts naturally. Elbows bent about 90 degrees with restrained opposite arm swing. Hands relaxed and EMPTY. Cloak follows with subtle delayed secondary motion.
Consistency: same face, outfit, colors, body scale, head size, shoulder width, pelvis position, camera angle, light direction and rendering quality. Center the pelvis consistently, keep head-height variation under 3%, and use a shared ground baseline.
Style/medium: polished painterly fantasy mobile-game sprite, crisp silhouette at small size, same style as the reference.
Scene/backdrop: genuine transparent background with alpha; no floor and no shadows.
Constraints: full body visible with generous padding; no text, labels, dividers, frames, logos, watermark, ground shadow, UI, scenery, weapons, spear, staff, axe, cane, shield, or new accessories.
Avoid: hunched back, stooped neck, cane posture, limping, marching, goose-step, exaggerated high knees, giant strides, crossed legs, feet sliding sideways, frozen torso, arms hanging straight down, identical duplicate frames, weapon in hands, character touching the ground with any object.
```

工具返回五帧双方向循环，因此代码按素材的真实五列接入，没有拉伸或伪造第六帧。

## 间距整理提示词

```text
Use case: precise-object-edit
Asset type: production 2D game sprite atlas cleanup
Input images: Image 1 is the edit target and contains exactly 10 finished running sprites in a 5-column by 2-row atlas.
Primary request: Keep the character artwork, identity, costume, anatomy, motion poses, viewing directions, paint style, and chronological frame order unchanged. Change ONLY the atlas spacing and placement so the sprites are safe to slice in code.
Layout: EXACTLY 5 equal-width columns and EXACTLY 2 equal-height rows. Put one complete full-body sprite in each cell with transparent gutter. Align all ground-contact boots in a row to the same invisible baseline. Keep body scale identical.
Constraints: preserve the ten existing poses; no redesign, extra or removed frame, duplicate pose, cropping, weapon, text, labels, grid lines, floor, shadow, or watermark.
```

## 骨矛攻击

参考：`ranger-run-clean.png`（人物身份与画风）、`../painted-v1/weapons.png`（骨矛设计）。首轮输出保存为 `ranger-spear-attack.png`，实际接入经过间距整理的 `ranger-spear-attack-clean.png`。

```text
Use case: identity-preserve
Asset type: production-ready 2D game character SPEAR ATTACK animation sprite atlas with genuine transparent alpha
Primary request: Create a fast, readable five-frame spear attack for the same young athletic teal-cloaked ranger. The spear is held with both hands.
Layout: exactly five equal columns and two equal rows. Top row faces southeast/front three-quarter; bottom row faces northeast/back three-quarter. One full sprite per cell, centered pelvis and shared baseline.
Frames: combat-ready; compact wind-up; explosive forward step; full-extension impact thrust; controlled recovery.
Consistency: preserve the exact character, costume, body scale, camera and bone spear design.
Constraints: full body and entire spear visible; transparent background; no crop, extra limbs, extra weapons, scenery, text, grid, shadow or watermark.
Avoid: spear crossing the body, disconnected hands, bent shaft, floating feet, cane pose, hunched posture or unreadable motion blur.
```

## 骨斧攻击

参考相同。首轮输出保存为 `ranger-axe-attack.png`，实际接入经过间距整理的 `ranger-axe-attack-clean.png`。

```text
Use case: identity-preserve
Asset type: production-ready 2D game character BONE AXE ATTACK animation sprite atlas with genuine transparent alpha
Primary request: Create a forceful, readable five-frame bone-axe attack for the same young athletic teal-cloaked ranger. The axe is held with both hands.
Layout: exactly five equal columns and two equal rows. Top row faces southeast/front three-quarter; bottom row faces northeast/back three-quarter. One full sprite per cell, centered pelvis and shared baseline.
Frames: combat-ready; overhead/shoulder wind-up; hip rotation into diagonal chop; impact follow-through above ground; controlled recovery.
Consistency: preserve the exact character, costume, body scale, camera and bone axe design.
Constraints: full body and entire axe visible; transparent background; no crop, extra limbs, extra weapons, scenery, text, grid, shadow or watermark.
Avoid: axe crossing the body, disconnected hands, bent haft, floating feet, cane pose, axe touching the ground or unreadable motion blur.
```

两套攻击图集均用 precise-object-edit 再次整理：保持十个动作不变，统一缩小约 18%，重新留透明边距。代码按每帧的独立安全矩形裁切，避免武器伸入相邻帧产生残影。
