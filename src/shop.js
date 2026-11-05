// 전체화면 가게 창.
// 아이폰 키보드 대응: 보이는 영역(visualViewport)의 위치·높이를 따라간다 (0-4 검증 방식).
// 지금(1단계)은 가게 그림 대신 작품 목록 화면을 보여 준다.

import { loadState } from './store.js';
import { mountGallery } from './gallery.js';

let overlay = null;
let cleanup = null;

// 창 위에 겹쳐 뜨는 화면(등록 창, 원본 보기 등). Esc·닫기는 맨 위부터 닫는다.
const layers = [];

export function isShopOpen() {
    return overlay !== null;
}

export function getOverlay() {
    return overlay;
}

/** 겹쳐 뜨는 화면 열기. 돌려받은 함수로 닫는다. */
export function pushLayer(el, onClose) {
    if (!overlay) return () => {};
    overlay.append(el);
    const layer = { el, onClose };
    layers.push(layer);
    return () => closeLayer(layer);
}

function closeLayer(layer) {
    const i = layers.indexOf(layer);
    if (i < 0) return;
    layers.splice(i, 1);
    layer.el.remove();
    layer.onClose?.();
}

export function openShop() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.id = 'wildcat_overlay';
    overlay.innerHTML = `
        <div class="wildcat_top">
            <span class="wildcat_title">Wildcat</span>
            <button type="button" class="wildcat_btn" id="wildcat_close">닫기</button>
        </div>
        <div class="wildcat_body" id="wildcat_body">
            <p class="wildcat_status" id="wildcat_status">가게 기록 불러오는 중...</p>
            <div id="wildcat_gallery"></div>
        </div>`;
    document.body.append(overlay);

    // 페이지(html)의 overflow는 건드리지 않는다. 건드리면 아이폰 주소창 줄 색이 바뀐 채로 남는다.
    // 대신 열기 전 스크롤 위치를 기억했다가 닫을 때 되돌린다.
    const prevScroll = { x: window.scrollX, y: window.scrollY };

    const vv = window.visualViewport;
    const fit = () => {
        if (!overlay) return;
        // 페이지가 확대된 상태면 따라가지 않는다 (따라가면 창이 흔들림)
        if (vv && vv.scale > 1.01) return;
        if (vv) {
            overlay.style.transform = `translate(${vv.offsetLeft}px, ${vv.offsetTop}px)`;
            overlay.style.width = `${vv.width}px`;
            overlay.style.height = `${vv.height}px`;
        } else {
            overlay.style.transform = '';
            overlay.style.width = `${window.innerWidth}px`;
            overlay.style.height = `${window.innerHeight}px`;
        }
    };
    const onKey = (e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        const top = layers.at(-1);
        if (top) closeLayer(top);
        else closeShop();
    };

    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    window.addEventListener('resize', fit);
    document.addEventListener('keydown', onKey, true);
    // 사파리의 페이지 확대(두 손가락) 막기. 그림 확대는 원본 보기에서 따로 한다.
    const stopGesture = (e) => e.preventDefault();
    overlay.addEventListener('gesturestart', stopGesture);
    overlay.addEventListener('gesturechange', stopGesture);
    overlay.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    overlay.querySelector('#wildcat_close').addEventListener('click', closeShop);
    fit();
    load();

    cleanup = () => {
        vv?.removeEventListener('resize', fit);
        vv?.removeEventListener('scroll', fit);
        window.removeEventListener('resize', fit);
        document.removeEventListener('keydown', onKey, true);
        window.scrollTo(prevScroll.x, prevScroll.y);
    };
}

export function setStatus(text, warn = false) {
    const p = overlay?.querySelector('#wildcat_status');
    if (!p) return;
    p.textContent = text;
    p.classList.toggle('wildcat_warn', warn);
}

async function load() {
    try {
        const { from } = await loadState();
        if (!overlay) return;
        if (from === 'backup') setStatus('가게 기록이 깨져서 직전 백업으로 열었어요.', true);
        else setStatus('');
        mountGallery(overlay.querySelector('#wildcat_gallery'));
    } catch (e) {
        if (!overlay) return;
        setStatus(`가게 기록을 못 불러왔어요: ${e?.message ?? e}`, true);
    }
}

export function closeShop() {
    if (!overlay) return;
    while (layers.length) closeLayer(layers.at(-1));
    cleanup?.();
    cleanup = null;
    overlay.remove();
    overlay = null;
    refreshBrowserBars();
}

// 아이폰 사파리는 화면 가장자리 색을 보고 주소창 줄 색을 정한다.
// 가게 창을 닫은 뒤 색을 다시 읽게 한 번 바꿨다가 되돌린다.
function refreshBrowserBars() {
    const meta = document.querySelector('meta[name="theme-color"]');
    const color = meta?.getAttribute('content') ?? null;
    if (meta) meta.setAttribute('content', '#000001');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (meta && color !== null) meta.setAttribute('content', color);
        });
    });
}
