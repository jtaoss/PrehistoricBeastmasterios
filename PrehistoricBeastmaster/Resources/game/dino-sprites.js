(() => {
    'use strict';

    // Source rectangles follow the inked silhouette, not an assumed uniform AI grid.
    const atlases = window.DinoSpriteData;
    const assetBase = new URL('.', document.currentScript.src);
    const loaded = new Map();
    const pending = new Map();
    const fallback = new Image();
    fallback.src = new URL('runner-hero-v2.png', assetBase).href;

    function load(skin = 'meadow') {
        if (!atlases[skin]) skin = 'meadow';
        if (pending.has(skin)) return pending.get(skin);
        const promise = new Promise((resolve) => {
            const image = new Image();
            image.onload = () => {
                loaded.set(skin, image);
                resolve(true);
            };
            image.onerror = () => {
                pending.delete(skin);
                resolve(false);
            };
            image.src = new URL(atlases[skin].src, assetBase).href;
        });
        pending.set(skin, promise);
        return promise;
    }

    function draw(context, skin, frame, x, baseline, height = 96) {
        const sourceSkin = loaded.has(skin) ? skin : 'meadow';
        const image = loaded.get(sourceSkin);
        if (!image) {
            if (fallback.complete && fallback.naturalWidth) {
                context.drawImage(fallback, x - height * .85, baseline - height, height * 1.5, height);
            }
            return false;
        }
        const atlas = atlases[sourceSkin];
        const [sx, sy, sw, sh] = atlas.frames[Math.max(0, Math.min(11, Math.floor(frame)))];
        const scale = height / atlas.referenceHeight;
        const width = sw * scale;
        const frameHeight = sh * scale;
        // Keep the muzzle and ground contact fixed as the tail/legs change poses.
        context.drawImage(image, sx, sy, sw, sh, x + height * .52 - width, baseline - frameHeight, width, frameHeight);
        return true;
    }

    function runFrame(phase) {
        return Math.floor(phase * 6 / (Math.PI * 2)) % 6;
    }

    window.DinoSprites = Object.freeze({ load, draw, runFrame });
    load();
})();
