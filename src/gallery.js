// 작품 목록 화면 (1단계용): 작품 등록, 목록, 원본 보기, 제목 바꾸기, 삭제.

import { listWorks, getWork, workImageUrl, addWork, removeWork, renameWork, checkFile, reload, MAX_FILE_MB } from './works.js';
import { StorageConflictError } from './storage.js';
import { pushLayer, setStatus } from './shop.js';
import { attachZoom } from './zoom.js';

let root = null;
let busy = false;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function mountGallery(el) {
    root = el;
    render();
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
            <span class="wildcat_card_meta">${w.width}×${w.height} · ${w.observation ? '관찰 완료' : '관찰 전'}</span>
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
            toastr.success(`"${work.title}" 등록했어요.`);
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
                <button type="button" class="wildcat_btn" data-act="rename">제목 바꾸기</button>
                <button type="button" class="wildcat_btn wildcat_danger" data-act="delete">삭제</button>
            </div>
        </div>`;

    const box = view.querySelector('.wildcat_viewer_img');
    let detachZoom = null;
    const close = pushLayer(view, () => detachZoom?.());
    detachZoom = attachZoom(box, box.querySelector('img'));

    view.querySelector('[data-act="close"]').addEventListener('click', close);

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
