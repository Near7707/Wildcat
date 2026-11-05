// 손님 화면 (1단계 시험용): 손님 부르기, 목록, 자세히 보기, 보내기.
// 시험 화면이라 원래는 숨길 성격·예산도 다 보여 준다.

import { listGuests, getGuest, createGuest, removeGuest, removeAllGuests, isCreating, traitLines, lookLines, worldLabel, MAX_GUESTS } from './guests.js';
import { AiError } from './ai.js';
import { StorageConflictError } from './storage.js';
import { getSettings } from './settings.js';
import { pushLayer, isShopOpen } from './shop.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ERROR_TEXT = {
    setup: '설정 문제',
    timeout: '시간 초과',
    request: '연결 오류',
    empty: '빈 응답',
    bad: '알아볼 수 없는 응답',
};

const redraws = new Set();
function redrawAll() {
    for (const fn of redraws) fn();
}

let progress = '';

async function callGuests(count) {
    if (!getSettings().reactionProfile) {
        toastr.warning('확장 메뉴에서 반응 AI 프로필을 먼저 골라 주세요.', 'Wildcat');
        return;
    }
    if (isCreating()) return;
    let made = 0;
    let failed = 0;
    for (let i = 0; i < count; i++) {
        if (!isShopOpen()) break; // 가게를 닫으면 멈춘다
        progress = count > 1 ? `손님 맞이하는 중... (${i + 1}/${count})` : '손님 맞이하는 중...';
        redrawAll();
        try {
            await createGuest();
            made++;
        } catch (e) {
            failed++;
            const why = e instanceof AiError ? `${ERROR_TEXT[e.kind] ?? '실패'}: ${e.message}` : (e?.message ?? String(e));
            toastr.warning(`손님을 만들지 못했어요. ${why}`, 'Wildcat');
            // 설정 문제나 자리가 없으면 더 해도 똑같이 실패한다
            if (e instanceof AiError && e.kind === 'setup') break;
            if (listGuests().length >= MAX_GUESTS) break;
            if (e instanceof StorageConflictError) break;
        }
        redrawAll();
    }
    progress = '';
    redrawAll();
    if (made > 0 && count > 1) toastr.success(`손님 ${made}명이 들어왔어요.${failed ? ` (${failed}명 실패)` : ''}`, 'Wildcat');
}

// ---------- 손님 목록 ----------

export function openGuests() {
    const sheet = document.createElement('div');
    sheet.className = 'wildcat_layer wildcat_sheet_wrap';
    sheet.innerHTML = `<div class="wildcat_sheet wildcat_guests"></div>`;
    const inner = sheet.querySelector('.wildcat_guests');

    const draw = () => {
        const guests = listGuests();
        const busy = isCreating();
        const full = guests.length >= MAX_GUESTS;
        inner.innerHTML = `
            <div class="wildcat_sheet_head">
                <b>손님 ${guests.length}명</b>
                <button type="button" class="wildcat_btn" data-act="close">닫기</button>
            </div>
            <small>시험 화면이에요. 손님마다 반응 AI를 한 번 불러서 이름과 소개를 지어요.</small>
            <div class="wildcat_row_btns">
                <button type="button" class="wildcat_btn wildcat_primary" data-act="one" ${busy || full ? 'disabled' : ''}>1명 부르기</button>
                <button type="button" class="wildcat_btn" data-act="five" ${busy || full ? 'disabled' : ''}>5명 부르기</button>
                <button type="button" class="wildcat_btn wildcat_danger" data-act="clear" ${busy || !guests.length ? 'disabled' : ''}>모두 보내기</button>
            </div>
            ${progress ? `<p class="wildcat_obs_msg">${esc(progress)}</p>` : ''}
            <div class="wildcat_guest_list">
                ${guests.length ? guests.map(guestCard).join('') : '<p class="wildcat_obs_msg">아직 손님이 없어요.</p>'}
            </div>`;
        inner.querySelector('[data-act="close"]').addEventListener('click', close);
        inner.querySelector('[data-act="one"]').addEventListener('click', () => callGuests(1));
        inner.querySelector('[data-act="five"]').addEventListener('click', () => callGuests(Math.min(5, MAX_GUESTS - listGuests().length)));
        inner.querySelector('[data-act="clear"]').addEventListener('click', async () => {
            if (!window.confirm('손님을 모두 보낼까요? 떠난 손님은 기억이 남지 않아요.')) return;
            try {
                await removeAllGuests();
            } catch (e) {
                toastr.error(e?.message ?? String(e), 'Wildcat');
            }
            redrawAll();
        });
        inner.querySelectorAll('.wildcat_guest').forEach(el => {
            el.addEventListener('click', () => openGuest(el.dataset.id));
        });
    };

    const close = pushLayer(sheet, () => redraws.delete(draw));
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    redraws.add(draw);
    draw();
}

function guestCard(g) {
    const sub = `${worldLabel(g.traits.world)} · ${g.traits.job}`;
    return `
        <button type="button" class="wildcat_guest" data-id="${esc(g.id)}">
            <b>${esc(g.name)}</b>
            <small>${esc(sub)}</small>
            <span class="wildcat_guest_intro">${esc(g.intro)}</span>
        </button>`;
}

// ---------- 손님 자세히 ----------

function rowsHtml(rows) {
    return rows.map(([k, v]) => `<div class="wildcat_kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('');
}

function openGuest(id) {
    const g = getGuest(id);
    if (!g) return;
    const sheet = document.createElement('div');
    sheet.className = 'wildcat_layer wildcat_sheet_wrap';
    sheet.innerHTML = `
        <div class="wildcat_sheet wildcat_guest_detail">
            <div class="wildcat_sheet_head">
                <b>${esc(g.name)}</b>
                <button type="button" class="wildcat_btn" data-act="close">닫기</button>
            </div>
            <p class="wildcat_obs_msg">${esc(g.intro)}</p>
            <div class="wildcat_obs_row"><b>성격과 취향 (시험용으로 보여 줌)</b>${rowsHtml(traitLines(g.traits))}</div>
            <div class="wildcat_obs_row"><b>외형</b>${rowsHtml(lookLines(g.look))}</div>
            <small>${g.traits.commonJob ? '공통 직업에서 뽑힘 · ' : ''}${esc(g.profile || '')}</small>
            <button type="button" class="wildcat_btn wildcat_danger" data-act="leave">보내기</button>
        </div>`;
    const close = pushLayer(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.querySelector('[data-act="close"]').addEventListener('click', close);
    sheet.querySelector('[data-act="leave"]').addEventListener('click', async () => {
        try {
            await removeGuest(id);
            close();
            redrawAll();
        } catch (e) {
            toastr.error(e?.message ?? String(e), 'Wildcat');
        }
    });
}
