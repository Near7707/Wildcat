// 작품 목록 화면 (1단계용): 작품 등록, 목록, 원본 보기, 관찰 결과, 제목 바꾸기, 삭제.

import { listWorks, getWork, workImageUrl, addWork, removeWork, renameWork, checkFile, reload, MAX_FILE_MB } from './works.js';
import { StorageConflictError } from './storage.js';
import { pushLayer, setStatus } from './shop.js';
import { attachZoom } from './zoom.js';
import { observeWork, isObserving, onVisionChange, SECTIONS, errorLabel } from './vision.js';
import { getSettings } from './settings.js';

let root = null;
let busy = false;
let unsubscribe = null;
// 관찰이 끝나면 열려 있는 화면도 다시 그린다
const refreshers = new Set();

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function mountGallery(el) {
    root = el;
    unsubscribe?.();
    unsubscribe = onVisionChange(() => {
        render();
        for (const fn of refreshers) fn();
    });
    render();
}

function observeLabel(w) {
    if (isObserving(w.id)) return '관찰 중...';
    if (w.observation?.status === 'ok') return w.observationError ? '관찰 완료 (재관찰 실패)' : '관찰 완료';
    if (w.observation?.status === 'failed') return `관찰 실패 · ${errorLabel(w.observation.errorKind)}`;
    return '관찰 전';
}

function startObserve(id, { quiet = false } = {}) {
    if (!getSettings().visionProfile) {
        toastr.warning('확장 메뉴에서 비전 AI 프로필을 먼저 골라 주세요. 그다음 작품의 "관찰"에서 다시 할 수 있어요.', 'Wildcat');
        return;
    }
    observeWork(id).then((o) => {
        if (!o) return;
        const title = getWork(id)?.title ?? '';
        if (o.status === 'ok') {
            if (!quiet) toastr.success(`"${title}" 관찰을 마쳤어요.`, 'Wildcat');
        } else {
            toastr.warning(`"${title}" 관찰 실패: ${o.error}`, 'Wildcat');
        }
    }).catch((e) => {
        toastr.error(`관찰 결과를 저장하지 못했어요: ${e?.message ?? e}`, 'Wildcat');
    });
}

function render() {
    if (!root) return;
    const works = listWorks();
    root.innerHTML = `
        <div class="wildcat_bar">
            <span>작품 ${works.length}점</span>
            <button type="button" class="wildcat_btn wildcat_primary" data-act="add">작품 등록</button>
        </div>
        <div class="wildcat_grid">
            ${works.length === 0 ? '<p class="wildcat_empty">아직 등록한 작품이 없어요.</p>' : works.map(card).join('')}
        </div>`;
    root.querySelector('[data-act="add"]').addEventListener('click', openAddSheet);
    root.querySelectorAll('.wildcat_card').forEach(c => {
        c.addEventListener('click', () => openViewer(c.dataset.id));
    });
}

function card(w) {
    return `
        <button type="button" class="wildcat_card" data-id="${esc(w.id)}">
            <span class="wildcat_thumb"><img src="${esc(workImageUrl(w))}" alt="" loading="lazy" decoding="async"></span>
            <span class="wildcat_card_title">${esc(w.title)}</span>
            <span class="wildcat_card_meta">${esc(observeLabel(w))}</span>
        </button>`;
}

async function guarded(job) {
    if (busy) return false;
    busy = true;
    try {
        await job();
        return true;
    } catch (e) {
        if (e instanceof StorageConflictError) {
            toastr.warning('다른 기기에서 가게가 바뀌었어요. 최신 기록으로 다시 불러올게요.');
            await reload().catch(() => {});
            render();
        } else {
            toastr.error(e?.message ?? String(e), 'Wildcat');
        }
        return false;
    } finally {
        busy = false;
    }
}

// ---------- 작품 등록 창 ----------

function openAddSheet() {
    const sheet = document.createElement('div');
    sheet.className = 'wildcat_layer wildcat_sheet_wrap';
    sheet.innerHTML = `
        <div class="wildcat_sheet">
            <div class="wildcat_sheet_head">
                <b>작품 등록</b>
                <button type="button" class="wildcat_btn" data-act="close">닫기</button>
            </div>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
            <button type="button" class="wildcat_btn wildcat_pick" data-act="pick">그림 고르기</button>
            <div class="wildcat_preview" hidden><img alt=""></div>
            <small class="wildcat_hint">PNG, JPG, WEBP, GIF · ${MAX_FILE_MB}MB 이하</small>
            <label class="wildcat_label">제목
                <input type="text" class="wildcat_input" maxlength="60" placeholder="비워 두면 '무제'">
            </label>
            <button type="button" class="wildcat_btn wildcat_primary" data-act="save" disabled>등록하기</button>
        </div>`;

    const input = sheet.querySelector('input[type="file"]');
    const preview = sheet.querySelector('.wildcat_preview');
    const previewImg = preview.querySelector('img');
    const hint = sheet.querySelector('.wildcat_hint');
    const title = sheet.querySelector('.wildcat_input');
    const save = sheet.querySelector('[data-act="save"]');
    let file = null;
    let objectUrl = null;

    const close = pushLayer(sheet, () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    });

    sheet.querySelector('[data-act="close"]').addEventListener('click', close);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.querySelector('[data-act="pick"]').addEventListener('click', () => input.click());

    input.addEventListener('change', () => {
        const f = input.files?.[0] ?? null;
        const problem = checkFile(f);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = null;
        if (problem) {
            file = null;
            preview.hidden = true;
            hint.textContent = problem;
            hint.classList.add('wildcat_warn');
            save.disabled = true;
            return;
        }
        file = f;
        objectUrl = URL.createObjectURL(f);
        previewImg.src = objectUrl;
        preview.hidden = false;
        hint.textContent = `${f.name} · ${Math.round(f.size / 1024)}KB`;
        hint.classList.remove('wildcat_warn');
        save.disabled = false;
    });

    save.addEventListener('click', async () => {
        if (!file) return;
        save.disabled = true;
        save.textContent = '저장 중...';
        const ok = await guarded(async () => {
            const work = await addWork(file, title.value);
            setStatus('');
            toastr.success(`"${work.title}" 등록했어요. 비전 AI가 그림을 보는 중이에요.`);
            startObserve(work.id);
        });
        if (ok) {
            close();
            render();
        } else {
            save.disabled = false;
            save.textContent = '등록하기';
        }
    });
}

// ---------- 원본 보기 ----------

function openViewer(id) {
    const work = getWork(id);
    if (!work) return;

    const view = document.createElement('div');
    view.className = 'wildcat_layer wildcat_viewer';
    view.innerHTML = `
        <div class="wildcat_viewer_head">
            <span class="wildcat_viewer_title">${esc(work.title)}</span>
            <button type="button" class="wildcat_btn" data-act="close">닫기</button>
        </div>
        <div class="wildcat_viewer_img">
            <img src="${esc(workImageUrl(work))}" alt="${esc(work.title)}" draggable="false">
        </div>
        <div class="wildcat_viewer_foot">
            <small>${work.width}×${work.height} · ${work.sizeKb}KB · 두 번 누르거나 두 손가락으로 벌리면 커져요</small>
            <div class="wildcat_row_btns">
                <button type="button" class="wildcat_btn wildcat_primary" data-act="observe">관찰</button>
                <button type="button" class="wildcat_btn" data-act="rename">제목 바꾸기</button>
                <button type="button" class="wildcat_btn wildcat_danger" data-act="delete">삭제</button>
            </div>
        </div>`;

    const box = view.querySelector('.wildcat_viewer_img');
    let detachZoom = null;
    const close = pushLayer(view, () => detachZoom?.());
    detachZoom = attachZoom(box, box.querySelector('img'));

    view.querySelector('[data-act="close"]').addEventListener('click', close);
    view.querySelector('[data-act="observe"]').addEventListener('click', () => openObservation(id));

    view.querySelector('[data-act="rename"]').addEventListener('click', async () => {
        const next = window.prompt('새 제목', work.title);
        if (next === null) return;
        const ok = await guarded(() => renameWork(id, next));
        if (ok) {
            view.querySelector('.wildcat_viewer_title').textContent = getWork(id)?.title ?? '';
            render();
        }
    });

    view.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        if (!window.confirm(`"${work.title}"을(를) 지울까요? 그림과 감상 기록이 모두 지워져요.`)) return;
        const ok = await guarded(() => removeWork(id));
        if (ok) {
            close();
            render();
            toastr.info('작품을 지웠어요.');
        }
    });
}

// ---------- 관찰 결과 ----------

function openObservation(id) {
    const sheet = document.createElement('div');
    sheet.className = 'wildcat_layer wildcat_sheet_wrap';
    sheet.innerHTML = `<div class="wildcat_sheet wildcat_obs"></div>`;
    const inner = sheet.querySelector('.wildcat_obs');

    const draw = () => {
        const w = getWork(id);
        if (!w) { close(); return; }
        const o = w.observation;
        const running = isObserving(id);
        let body = '';
        if (running) {
            body = '<p class="wildcat_obs_msg">비전 AI가 그림을 보는 중이에요. 1~2분 걸릴 수 있어요.</p>';
        } else if (!o) {
            body = '<p class="wildcat_obs_msg">아직 관찰하지 않았어요.</p>';
        } else if (o.status === 'failed') {
            body = `<p class="wildcat_obs_msg wildcat_warn">${esc(errorLabel(o.errorKind))}: ${esc(o.error)}</p>`
                + (o.raw ? `<details><summary>받은 응답 보기</summary><pre class="wildcat_raw">${esc(o.raw)}</pre></details>` : '');
        } else {
            const rows = SECTIONS.filter(s => o.sections?.[s.key]).map(s => `
                <div class="wildcat_obs_row"><b>${esc(s.label)}</b><p>${esc(o.sections[s.key])}</p></div>`).join('');
            body = (rows || `<pre class="wildcat_raw">${esc(o.raw)}</pre>`)
                + (o.loose ? '<p class="wildcat_obs_msg wildcat_warn">AI가 정해진 형식을 다 지키지 않았어요. 받은 내용을 그대로 쓸게요.</p>' : '')
                + `<details><summary>받은 응답 그대로 보기</summary><pre class="wildcat_raw">${esc(o.raw)}</pre></details>`;
        }
        const err = w.observationError;
        const errLine = err && !running
            ? `<p class="wildcat_obs_msg wildcat_warn">마지막 재관찰은 실패했어요 (${esc(errorLabel(err.errorKind))}). 위 결과는 그 전 것이에요.</p>` : '';
        const meta = o?.at ? `<small>${esc(new Date(o.at).toLocaleString())}${o.profile ? ` · ${esc(o.profile)}` : ''}</small>` : '';
        inner.innerHTML = `
            <div class="wildcat_sheet_head">
                <b>관찰 결과</b>
                <button type="button" class="wildcat_btn" data-act="close">닫기</button>
            </div>
            ${meta}
            ${errLine}
            <div class="wildcat_obs_body">${body}</div>
            <button type="button" class="wildcat_btn wildcat_primary" data-act="again" ${running ? 'disabled' : ''}>${o ? '다시 관찰' : '관찰하기'}</button>`;
        inner.querySelector('[data-act="close"]').addEventListener('click', close);
        inner.querySelector('[data-act="again"]').addEventListener('click', () => {
            const cur = getWork(id)?.observation;
            if (cur?.status === 'ok' && !window.confirm('다시 관찰할까요? 성공하면 지금 결과가 새 결과로 바뀌어요.')) return;
            startObserve(id);
        });
    };

    const close = pushLayer(sheet, () => refreshers.delete(draw));
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    refreshers.add(draw);
    draw();
}
