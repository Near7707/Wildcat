// 작품 등록·목록·삭제.
// 그림은 원본 1개만 서버에 저장한다. 비전 AI용 축소본은 보낼 때만 만든다(1-4).

import { FILES, saveImage, deleteFile, deleteJson, fileUrl } from './storage.js';
import { getState, saveState, newId, loadState } from './store.js';

export const MAX_FILE_MB = 20;

const MIME_EXT = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
};

export function listWorks() {
    return getState().works.slice();
}

export function getWork(id) {
    return getState().works.find(w => w.id === id) ?? null;
}

export function workImageUrl(work) {
    return fileUrl(work.image);
}

function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error ?? new Error('파일을 읽지 못했어요.'));
        r.readAsDataURL(file);
    });
}

function imageSize(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error('그림을 열 수 없어요. 다른 파일로 해 주세요.'));
        img.src = dataUrl;
    });
}

/** 등록 전에 파일이 쓸 만한지 확인한다. 문제가 없으면 null, 있으면 이유. */
export function checkFile(file) {
    if (!file) return '그림 파일을 골라 주세요.';
    if (!MIME_EXT[file.type]) return 'PNG, JPG, WEBP, GIF 그림만 등록할 수 있어요.';
    if (file.size > MAX_FILE_MB * 1024 * 1024) return `그림 파일이 너무 커요. ${MAX_FILE_MB}MB 이하로 해 주세요.`;
    return null;
}

export function cleanTitle(title) {
    const t = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return t || '무제';
}

/**
 * 작품 등록: 그림 저장 → 가게 상태에 추가 → 저장.
 * 상태 저장이 실패하면 올린 그림을 지워서 주인 없는 파일이 남지 않게 한다.
 */
export async function addWork(file, title) {
    const problem = checkFile(file);
    if (problem) throw new Error(problem);

    const dataUrl = await readAsDataUrl(file);
    const { width, height } = await imageSize(dataUrl);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);

    const state = getState();
    const id = newId('w');
    const ext = MIME_EXT[file.type];
    const image = FILES.image(id, ext);

    await saveImage(image, base64);

    const work = {
        id,
        title: cleanTitle(title),
        image,
        mime: file.type,
        width,
        height,
        sizeKb: Math.round(file.size / 1024),
        status: 'ready',          // 등록됨 (전시·판매 상태는 2·3단계에서)
        registeredAt: new Date().toISOString(),
        registeredGameTime: state.gameTime,
        observation: null,        // 비전 AI 관찰 결과 (1-4)
        grade: null,              // 랜덤 등급 (3단계)
        price: null,              // 판매 가격 (3단계)
    };

    state.works.push(work);
    try {
        await saveState();
    } catch (e) {
        state.works = state.works.filter(w => w.id !== id);
        await deleteFile(image).catch(() => {});
        throw e;
    }
    return work;
}

export async function renameWork(id, title) {
    const work = getWork(id);
    if (!work) throw new Error('작품을 찾을 수 없어요.');
    const prev = work.title;
    work.title = cleanTitle(title);
    try {
        await saveState();
    } catch (e) {
        work.title = prev;
        throw e;
    }
    return work;
}

/**
 * 작품 삭제 (1단계 시험용. 팔린 작품·전시 규칙은 나중에 정함).
 * 상태에서 먼저 빼고 저장한 다음, 그림과 방명록 파일을 지운다.
 */
export async function removeWork(id) {
    const state = getState();
    const work = getWork(id);
    if (!work) return;
    const before = state.works;
    state.works = before.filter(w => w.id !== id);
    try {
        await saveState();
    } catch (e) {
        state.works = before;
        throw e;
    }
    await deleteFile(work.image).catch(err => console.warn('[Wildcat] 그림 파일 삭제 실패', err));
    await deleteJson(FILES.book(id)).catch(() => {});
}

/** 다른 기기와 어긋났을 때 서버 기준으로 다시 불러오기 */
export async function reload() {
    return loadState();
}
