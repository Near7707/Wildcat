// 손님 화면 (1단계 시험용): 손님 부르기, 목록, 자세히 보기, 보내기.
// 시험 화면이라 원래는 숨길 성격·예산도 다 보여 준다.

import { listGuests, getGuest, createGuest, removeGuest, removeAllGuests, isCreating, traitLines, lookLines, worldLabel, MAX_GUESTS } from './guests.js';
import { AiError } from './ai.js';
import { StorageConflictError } from './storage.js';
import { getSettings } from './settings.js';
import { pushLayer, isShopOpen } from './shop.js';
import { listWorks, getWork } from './works.js';
import { reactToWork, isReacting, isWorkBusy, onReactionChange, canReact, interestLabel, ERROR_TEXT as REACT_ERRORS } from './reactions.js';

onReactionChange(() => redrawAll());

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

/** 감상 초안 하나 (손님 화면·작품 화면 공용) */
function draftHtml(d, heading) {
    const want = d.want ? '갖고 싶음' : '갖고 싶지 않음';
    return `
        <div class="wildcat_draft">
            <div class="wildcat_draft_head">
                <b>${esc(heading)}</b>
                <small>관심 ${esc(interestLabel(d.interest))} · ${want}</small>
            </div>
            <p class="wildcat_draft_outer">${d.outer ? esc(d.outer) : '<i>(말 없이 바라봄)</i>'}</p>
            <p class="wildcat_draft_inner">${esc(d.inner)}</p>
        </div>`;
}

function reactError(e) {
    const kind = e instanceof AiError ? e.kind : null;
    const label = (kind && (REACT_ERRORS[kind] ?? ERROR_TEXT[kind])) ?? '실패';
    return `${label}: ${e?.message ?? e}`;
}

async function runReaction(guestId, workId, { quiet = false } = {}) {
    if (!getSettings().reactionProfile) {
        toastr.warning('확장 메뉴에서 반응 AI 프로필을 먼저 골라 주세요.', 'Wildcat');
        return { stop: true };
    }
    try {
        await reactToWork(guestId, workId);
        return { ok: true };
    } catch (e) {
        const name = getGuest(guestId)?.name ?? '손님';
        toastr.warning(`${name}의 감상을 만들지 못했어요. ${reactError(e)}`, 'Wildcat');
        if (e?.raw && !quiet) console.warn('[Wildcat] 받은 응답:', e.raw);
        const stop = (e instanceof AiError && e.kind === 'setup') || e instanceof StorageConflictError;
        return { ok: false, stop };
    }
}

function openGuest(id) {
    if (!getGuest(id)) return;
    const sheet = document.createElement('div');
    sheet.className = 'wildcat_layer wildcat_sheet_wrap';
    sheet.innerHTML = `<div class="wildcat_sheet wildcat_guest_detail"></div>`;
    const inner = sheet.querySelector('.wildcat_guest_detail');

    const draw = () => {
        const g = getGuest(id);
        if (!g) { close(); return; }
        const drafts = Object.entries(g.drafts ?? {});
        const busy = isReacting(id);
        inner.innerHTML = `
            <div class="wildcat_sheet_head">
                <b>${esc(g.name)}</b>
                <button type="button" class="wildcat_btn" data-act="close">닫기</button>
            </div>
            <p class="wildcat_obs_msg">${esc(g.intro)}</p>
            <div class="wildcat_obs_row">
                <b>감상 초안</b>
                ${drafts.length ? drafts.map(([wid, d]) => draftHtml(d, getWork(wid)?.title ?? d.workTitle)).join('') : '<p class="wildcat_obs_msg">아직 본 그림이 없어요.</p>'}
                ${busy ? '<p class="wildcat_obs_msg">그림 보는 중...</p>' : ''}
            </div>
            <button type="button" class="wildcat_btn wildcat_primary" data-act="look" ${busy ? 'disabled' : ''}>그림 보게 하기</button>
            <details>
                <summary>성격·취향·외형 (시험용으로 보여 줌)</summary>
                <div class="wildcat_obs_row">${rowsHtml(traitLines(g.traits))}</div>
                <div class="wildcat_obs_row"><b>외형</b>${rowsHtml(lookLines(g.look))}</div>
            </details>
            <small>${g.traits.commonJob ? '공통 직업에서 뽑힘 · ' : ''}${esc(g.profile || '')}</small>
            <button type="button" class="wildcat_btn wildcat_danger" data-act="leave" ${busy ? 'disabled' : ''}>보내기</button>`;
        inner.querySelector('[data-act="close"]').addEventListener('click', close);
        inner.querySelector('[data-act="look"]').addEventListener('click', () => pickWork(id));
        inner.querySelector('[data-act="leave"]').addEventListener('click', async () => {
            try {
                await removeGuest(id);
                close();
                redrawAll();
            } catch (e) {
                toastr.error(e?.message ?? String(e), 'Wildcat');
            }
        });
    };

    const close = pushLayer(sheet, () => redraws.delete(draw));
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    redraws.add(draw);
    draw();
}

// 손님에게 보여 줄 작품 고르기
function pickWork(guestId) {
    const works = listWorks();
    const sheet = document.createElement('div');
    sheet.className = 'wildcat_layer wildcat_sheet_wrap';
    sheet.innerHTML = `
        <div class="wildcat_sheet">
            <div class="wildcat_sheet_head">
                <b>어떤 그림을 볼까요?</b>
                <button type="button" class="wildcat_btn" data-act="close">닫기</button>
            </div>
            <div class="wildcat_guest_list">
                ${works.length ? works.map(w => `
                    <button type="button" class="wildcat_guest" data-id="${esc(w.id)}" ${canReact(w) ? '' : 'disabled'}>
                        <b>${esc(w.title)}</b>
                        <small>${canReact(w) ? (getGuest(guestId)?.drafts?.[w.id] ? '이미 봄 · 누르면 다시 감상' : '아직 안 봄') : '관찰 결과가 없어서 볼 수 없어요'}</small>
                    </button>`).join('') : '<p class="wildcat_obs_msg">등록한 작품이 없어요.</p>'}
            </div>
        </div>`;
    const close = pushLayer(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.querySelector('[data-act="close"]').addEventListener('click', close);
    sheet.querySelectorAll('.wildcat_guest').forEach(el => {
        el.addEventListener('click', () => {
            close();
            runReaction(guestId, el.dataset.id);
        });
    });
}

// ---------- 작품별 감상 모아 보기 (1단계 시험: "재밌을까?" 확인용) ----------

let batchWork = null;
let batchText = '';

async function reactAll(workId, { redo = false } = {}) {
    if (batchWork) return;
    const work = getWork(workId);
    if (!canReact(work)) {
        toastr.warning('이 작품은 아직 관찰 결과가 없어서 감상할 수 없어요.', 'Wildcat');
        return;
    }
    const targets = listGuests().filter(g => redo || !g.drafts?.[workId]).map(g => g.id);
    if (!targets.length) {
        toastr.info(listGuests().length ? '모든 손님이 이미 이 그림을 봤어요.' : '가게에 손님이 없어요. 먼저 손님을 불러 주세요.', 'Wildcat');
        return;
    }
    batchWork = workId;
    let made = 0;
    let failed = 0;
    try {
        for (let i = 0; i < targets.length; i++) {
            if (!isShopOpen() || !getWork(workId)) break;
            if (!getGuest(targets[i])) continue;
            batchText = `손님들이 그림을 보는 중... (${i + 1}/${targets.length})`;
            redrawAll();
            const r = await runReaction(targets[i], workId, { quiet: true });
            if (r.ok) made++; else failed++;
            if (r.stop) break;
        }
    } finally {
        batchWork = null;
        batchText = '';
        redrawAll();
    }
    if (made) toastr.success(`손님 ${made}명이 감상을 남겼어요.${failed ? ` (${failed}명 실패)` : ''}`, 'Wildcat');
}

export function openWorkReactions(workId) {
    const sheet = document.createElement('div');
    sheet.className = 'wildcat_layer wildcat_sheet_wrap';
    sheet.innerHTML = `<div class="wildcat_sheet wildcat_guest_detail"></div>`;
    const inner = sheet.querySelector('.wildcat_guest_detail');

    const draw = () => {
        const work = getWork(workId);
        if (!work) { close(); return; }
        const guests = listGuests();
        const seen = guests.filter(g => g.drafts?.[workId]);
        const busy = batchWork !== null || isWorkBusy(workId);
        const ready = canReact(work);
        inner.innerHTML = `
            <div class="wildcat_sheet_head">
                <b>감상 · ${esc(work.title)}</b>
                <button type="button" class="wildcat_btn" data-act="close">닫기</button>
            </div>
            <small>감상 초안이에요. 방명록에는 아직 안 남아요. 지금 손님 ${guests.length}명 중 ${seen.length}명이 봤어요.</small>
            ${ready ? '' : '<p class="wildcat_obs_msg wildcat_warn">관찰 결과가 없어서 손님이 이 그림을 볼 수 없어요.</p>'}
            <div class="wildcat_row_btns">
                <button type="button" class="wildcat_btn wildcat_primary" data-act="all" ${busy || !ready ? 'disabled' : ''}>안 본 손님 전원 감상</button>
                <button type="button" class="wildcat_btn" data-act="redo" ${busy || !ready || !seen.length ? 'disabled' : ''}>전원 다시 감상</button>
            </div>
            ${batchText && batchWork === workId ? `<p class="wildcat_obs_msg">${esc(batchText)}</p>` : ''}
            <div class="wildcat_obs_body">
                ${seen.length ? seen.map(g => draftHtml(g.drafts[workId], g.name)).join('') : '<p class="wildcat_obs_msg">아직 이 그림을 본 손님이 없어요.</p>'}
            </div>`;
        inner.querySelector('[data-act="close"]').addEventListener('click', close);
        inner.querySelector('[data-act="all"]').addEventListener('click', () => reactAll(workId));
        inner.querySelector('[data-act="redo"]').addEventListener('click', () => {
            if (!window.confirm('이미 본 손님도 다시 감상할까요? 지금 초안은 새 감상으로 바뀌어요.')) return;
            reactAll(workId, { redo: true });
        });
    };

    const close = pushLayer(sheet, () => redraws.delete(draw));
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    redraws.add(draw);
    draw();
}
