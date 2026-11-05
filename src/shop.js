// 전체화면 가게 창. 지금은 빈 틀만 있다.
// 아이폰 키보드 대응: 보이는 영역(visualViewport)의 위치·높이를 따라간다 (0-4 검증 방식).

import { loadState } from './store.js';

let overlay = null;
let cleanup = null;

export function isShopOpen() {
    return overlay !== null;
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
            <p class="wildcat_empty">The Honest Wildcat — 아직 준비 중이에요.</p>
        </div>`;
    document.body.append(overlay);

    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    const vv = window.visualViewport;
    const fit = () => {
        if (!overlay) return;
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
        if (e.key === 'Escape') closeShop();
    };

    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    window.addEventListener('resize', fit);
    document.addEventListener('keydown', onKey);
    overlay.querySelector('#wildcat_close').addEventListener('click', closeShop);
    fit();
    showLoad();

    cleanup = () => {
        vv?.removeEventListener('resize', fit);
        vv?.removeEventListener('scroll', fit);
        window.removeEventListener('resize', fit);
        document.removeEventListener('keydown', onKey);
        document.documentElement.style.overflow = prevOverflow;
    };
}

async function showLoad() {
    const body = overlay?.querySelector('#wildcat_body');
    if (!body) return;
    const p = document.createElement('p');
    p.className = 'wildcat_status';
    p.textContent = '가게 기록 불러오는 중...';
    body.append(p);
    try {
        const { state, from } = await loadState();
        if (!overlay) return;
        const when = state.savedAt ? new Date(state.savedAt).toLocaleString() : '아직 저장한 적 없음';
        const fromText = { main: '', backup: ' (본 파일이 깨져서 백업으로 열었어요)', none: ' (새 가게)' }[from];
        p.textContent = `작품 ${state.works.length}점 · 골드 ${state.gold} · 마지막 저장: ${when}${fromText}`;
        if (from === 'backup') p.classList.add('wildcat_warn');
    } catch (e) {
        if (!overlay) return;
        p.textContent = `가게 기록을 못 불러왔어요: ${e?.message ?? e}`;
        p.classList.add('wildcat_warn');
    }
}

export function closeShop() {
    if (!overlay) return;
    cleanup?.();
    cleanup = null;
    overlay.remove();
    overlay = null;
}
