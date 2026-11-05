// 서버 사용자 파일 저장 (/api/files/upload, /user/files/).
// - 파일 이름은 영어·숫자·-·_ 와 확장자만. 폴더는 못 만들어서 "wildcat_" 앞글자로 묶는다.
// - JSON은 저장할 때마다 직전 내용을 _bak 파일로 하나 남긴다.
// - 같은 파일 저장은 차례대로(겹치지 않게) 처리한다.
// - 다른 기기가 더 새로 저장했으면 덮어쓰지 않고 StorageConflictError를 낸다.

import { ctx } from './settings.js';

export const PREFIX = 'wildcat_';

export const FILES = Object.freeze({
    state: `${PREFIX}state.json`,
    ledger: `${PREFIX}ledger.json`,
    book: (workId) => `${PREFIX}book_${safeId(workId)}.json`,
    image: (workId, ext) => `${PREFIX}img_${safeId(workId)}.${safeExt(ext)}`,
});

const NAME_RE = /^wildcat_[A-Za-z0-9_-]+\.[a-z0-9]+$/;

export class StorageConflictError extends Error {
    constructor(name) {
        super('다른 기기에서 더 최근에 저장했어요. 가게를 다시 열어 주세요.');
        this.name = 'StorageConflictError';
        this.file = name;
    }
}

function safeId(id) {
    const s = String(id ?? '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) throw new Error(`잘못된 ID: ${s}`);
    return s;
}

function safeExt(ext) {
    const s = String(ext ?? '').toLowerCase();
    if (!/^[a-z0-9]{1,5}$/.test(s)) throw new Error(`잘못된 확장자: ${s}`);
    return s;
}

function checkName(name) {
    if (!NAME_RE.test(name)) throw new Error(`저장할 수 없는 파일 이름: ${name}`);
    return name;
}

export function backupName(name) {
    checkName(name);
    return name.replace(/\.json$/, '_bak.json');
}

export function fileUrl(name) {
    return `/user/files/${checkName(name)}`;
}

// ---------- 기본 읽기·쓰기 ----------

function toBase64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
}

async function upload(name, base64) {
    checkName(name);
    const res = await fetch('/api/files/upload', {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ name, data: base64 }),
    });
    if (!res.ok) throw new Error(`저장 실패 (${res.status}): ${await res.text().catch(() => '')}`);
    return (await res.json()).path;
}

async function readText(name) {
    const res = await fetch(`${fileUrl(name)}?t=${Date.now()}`, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`읽기 실패 (${res.status}): ${name}`);
    return await res.text();
}

export async function deleteFile(name) {
    checkName(name);
    const res = await fetch('/api/files/delete', {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ path: `user/files/${name}` }),
    });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`삭제 실패 (${res.status}): ${name}`);
    return true;
}

export async function exists(name) {
    const res = await fetch('/api/files/verify', {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ urls: [fileUrl(name)] }),
    });
    if (!res.ok) throw new Error(`확인 실패 (${res.status})`);
    const out = await res.json();
    return Boolean(out[fileUrl(name)]);
}

// ---------- 차례 지키기 ----------

const queues = new Map();

function inQueue(name, job) {
    const prev = queues.get(name) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(job);
    queues.set(name, next);
    next.finally(() => {
        if (queues.get(name) === next) queues.delete(name);
    }).catch(() => {});
    return next;
}

// ---------- JSON ----------

// 마지막으로 읽거나 쓴 내용 (백업용, 충돌 검사용)
const known = new Map(); // name -> { text, rev }

function parse(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('JSON 형식이 아님');
    return data;
}

/**
 * JSON 파일 읽기. 본 파일이 깨졌으면 백업을 읽는다.
 * @returns {Promise<{data: object|null, from: 'main'|'backup'|'none'}>}
 */
export function readJson(name) {
    return inQueue(name, async () => {
        const text = await readText(name);
        if (text !== null) {
            try {
                const data = parse(text);
                known.set(name, { text, rev: Number(data.rev) || 0 });
                return { data, from: 'main' };
            } catch (e) {
                console.warn(`[Wildcat] ${name} 읽기 실패, 백업을 씁니다.`, e);
            }
        }
        const bakText = await readText(backupName(name));
        if (bakText !== null) {
            try {
                const data = parse(bakText);
                // 본 파일이 깨진 상태면 다음 저장 때 깨진 내용을 백업으로 덮지 않게 백업 내용을 기준으로 삼는다.
                known.set(name, { text: bakText, rev: Number(data.rev) || 0, mainBroken: text !== null });
                return { data, from: 'backup' };
            } catch (e) {
                console.warn(`[Wildcat] ${backupName(name)}도 읽기 실패.`, e);
            }
        }
        known.set(name, { text: null, rev: 0 });
        return { data: null, from: 'none' };
    });
}

/**
 * JSON 파일 저장. data.rev를 1 올리고 savedAt을 넣는다.
 * 서버 파일이 내가 아는 것보다 새로우면 덮어쓰지 않는다.
 * @param {string} name
 * @param {object} data 저장할 객체 (rev, savedAt은 여기서 바뀜)
 * @param {{force?: boolean}} [options]
 */
export function writeJson(name, data, { force = false } = {}) {
    return inQueue(name, async () => {
        let base = known.get(name);
        const serverText = await readText(name);
        let serverRev = 0;
        let serverOk = false;
        if (serverText !== null) {
            try {
                serverRev = Number(parse(serverText).rev) || 0;
                serverOk = true;
            } catch {
                serverOk = false;
            }
        }
        if (!base) base = { text: null, rev: 0 };
        if (!force && serverOk && serverRev > base.rev) {
            throw new StorageConflictError(name);
        }

        // 직전 내용 백업: 서버 본 파일이 멀쩡하면 그것을, 아니면 마지막으로 알던 내용을.
        const prevText = serverOk ? serverText : base.text;
        if (prevText) await upload(backupName(name), toBase64Utf8(prevText));

        data.rev = Math.max(base.rev, serverOk ? serverRev : 0) + 1;
        data.savedAt = new Date().toISOString();
        const text = JSON.stringify(data, null, 1);
        await upload(name, toBase64Utf8(text));
        known.set(name, { text, rev: data.rev });
        return data;
    });
}

/** 마지막으로 알던 내용을 잊는다 (점검용: 아무것도 안 읽은 다른 기기처럼 행동). */
export function forgetKnown(name) {
    known.delete(name);
}

export async function deleteJson(name) {
    return inQueue(name, async () => {
        await deleteFile(name);
        await deleteFile(backupName(name));
        known.delete(name);
    });
}

// ---------- 그림 ----------

/** @param {string} base64 data URL의 쉼표 뒤 부분 */
export async function saveImage(name, base64) {
    return inQueue(name, () => upload(name, base64));
}
