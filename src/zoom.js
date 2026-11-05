// 원본 보기용 그림 확대·이동.
// 폰: 두 손가락으로 벌리기·좁히기, 한 손가락으로 끌기, 두 번 톡 = 확대/원래대로
// PC: 마우스 휠로 확대, 끌어서 이동, 더블클릭 = 확대/원래대로
// 사파리의 페이지 전체 확대는 쓰지 않는다 (가게 창이 흔들려서).

const MAX_SCALE = 8;
const TAP_ZOOM = 2.5;

/**
 * @param {HTMLElement} box 그림을 담는 칸 (overflow: hidden, position: relative)
 * @param {HTMLImageElement} img
 * @returns {() => void} 정리 함수
 */
export function attachZoom(box, img) {
    let s = 1;
    let tx = 0;
    let ty = 0;
    let base = { ox: 0, oy: 0, w: 0, h: 0 };

    const pts = new Map();
    let pinch = null;
    let pan = null;
    let tapStart = null;
    let lastTap = null;

    function layout() {
        const bw = box.clientWidth;
        const bh = box.clientHeight;
        const nw = img.naturalWidth || 1;
        const nh = img.naturalHeight || 1;
        // 화면에 맞추되, 작은 그림은 억지로 키우지 않는다
        const fit = Math.min(bw / nw, bh / nh, 1);
        const w = nw * fit;
        const h = nh * fit;
        base = { ox: (bw - w) / 2, oy: (bh - h) / 2, w, h };
        img.style.left = `${base.ox}px`;
        img.style.top = `${base.oy}px`;
        img.style.width = `${w}px`;
        img.style.height = `${h}px`;
        clamp();
        apply();
    }

    function apply() {
        img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    }

    function clamp() {
        const bw = box.clientWidth;
        const bh = box.clientHeight;
        const sw = base.w * s;
        const sh = base.h * s;
        if (sw <= bw) tx = bw / 2 - base.ox - sw / 2;
        else tx = Math.min(-base.ox, Math.max(bw - base.ox - sw, tx));
        if (sh <= bh) ty = bh / 2 - base.oy - sh / 2;
        else ty = Math.min(-base.oy, Math.max(bh - base.oy - sh, ty));
    }

    // 화면의 점 (px, py)가 가리키는 그림 위치를 그대로 두고 배율만 바꾼다
    function zoomAt(px, py, next, from = { s, tx, ty }) {
        const ns = Math.min(MAX_SCALE, Math.max(1, next));
        const u = (px - base.ox - from.tx) / from.s;
        const v = (py - base.oy - from.ty) / from.s;
        s = ns;
        tx = px - base.ox - u * ns;
        ty = py - base.oy - v * ns;
        clamp();
        apply();
    }

    function reset() {
        s = 1;
        tx = 0;
        ty = 0;
        clamp();
        apply();
    }

    function local(e) {
        const r = box.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function twoPoints() {
        const [a, b] = [...pts.values()];
        return {
            dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
            mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        };
    }

    function startPinch() {
        const { dist, mid } = twoPoints();
        pinch = { dist, mid, s, tx, ty };
        pan = null;
    }

    function startPan(p) {
        pan = { x: p.x, y: p.y, tx, ty };
    }

    function onDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        box.setPointerCapture?.(e.pointerId);
        const p = local(e);
        pts.set(e.pointerId, p);
        if (pts.size === 2) {
            startPinch();
            tapStart = null;
        } else if (pts.size === 1) {
            startPan(p);
            tapStart = { x: p.x, y: p.y, t: performance.now() };
        }
    }

    function onMove(e) {
        if (!pts.has(e.pointerId)) return;
        e.preventDefault();
        const p = local(e);
        pts.set(e.pointerId, p);
        if (pts.size >= 2 && pinch) {
            const { dist, mid } = twoPoints();
            const next = pinch.s * (dist / pinch.dist);
            // 손가락 가운데가 움직이면 그림도 같이 끌려간다
            const from = { s: pinch.s, tx: pinch.tx + (mid.x - pinch.mid.x), ty: pinch.ty + (mid.y - pinch.mid.y) };
            zoomAt(mid.x, mid.y, next, from);
        } else if (pts.size === 1 && pan) {
            tx = pan.tx + (p.x - pan.x);
            ty = pan.ty + (p.y - pan.y);
            clamp();
            apply();
        }
        if (tapStart && Math.hypot(p.x - tapStart.x, p.y - tapStart.y) > 10) tapStart = null;
    }

    function onUp(e) {
        if (!pts.has(e.pointerId)) return;
        const p = local(e);
        pts.delete(e.pointerId);
        if (pts.size === 1) {
            pinch = null;
            startPan([...pts.values()][0]);
        } else if (pts.size === 0) {
            pinch = null;
            pan = null;
            if (e.type === 'pointerup' && tapStart && performance.now() - tapStart.t < 300) {
                const now = performance.now();
                if (lastTap && now - lastTap.t < 350 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
                    if (s > 1.05) reset();
                    else zoomAt(p.x, p.y, TAP_ZOOM);
                    lastTap = null;
                } else {
                    lastTap = { x: p.x, y: p.y, t: now };
                }
            }
            tapStart = null;
        }
    }

    function onWheel(e) {
        e.preventDefault();
        const p = local(e);
        zoomAt(p.x, p.y, s * Math.exp(-e.deltaY * 0.0015));
    }

    // 사파리 전용 확대 동작 막기
    const stopGesture = (e) => e.preventDefault();

    box.addEventListener('pointerdown', onDown);
    box.addEventListener('pointermove', onMove);
    box.addEventListener('pointerup', onUp);
    box.addEventListener('pointercancel', onUp);
    box.addEventListener('wheel', onWheel, { passive: false });
    box.addEventListener('gesturestart', stopGesture);
    box.addEventListener('gesturechange', stopGesture);

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(layout) : null;
    ro?.observe(box);
    if (img.complete && img.naturalWidth) layout();
    else img.addEventListener('load', layout, { once: true });

    return () => {
        ro?.disconnect();
        box.removeEventListener('pointerdown', onDown);
        box.removeEventListener('pointermove', onMove);
        box.removeEventListener('pointerup', onUp);
        box.removeEventListener('pointercancel', onUp);
        box.removeEventListener('wheel', onWheel);
        box.removeEventListener('gesturestart', stopGesture);
        box.removeEventListener('gesturechange', stopGesture);
    };
}
