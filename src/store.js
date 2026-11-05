// 게임 상태(wildcat_state.json) 불러오기·저장.
// 작품 목록, 골드, 게임 시각 등 한 파일에 들어가는 것들.
// 방명록은 작품마다 따로, 장부도 따로 둔다 (FILES 참고).

import { FILES, readJson, writeJson } from './storage.js';

export const SCHEMA = 1;

function emptyState() {
    return {
        schema: SCHEMA,
        rev: 0,
        savedAt: null,
        gold: 0,
        gameTime: 0,   // 게임 속 분 단위 (2단계에서 사용)
        nextId: 1,
        works: [],     // 작품 목록 (1-3에서 채움)
        guests: [],    // 지금 가게에 있는 손님 (1-5). 떠나면 지운다.
    };
}

function normalize(data) {
    const base = emptyState();
    if (!data || typeof data !== 'object') return base;
    const s = { ...base, ...data };
    if (!Array.isArray(s.works)) s.works = [];
    if (!Array.isArray(s.guests)) s.guests = [];
    if (!Number.isFinite(s.gold)) s.gold = 0;
    if (!Number.isFinite(s.gameTime)) s.gameTime = 0;
    if (!Number.isInteger(s.nextId) || s.nextId < 1) s.nextId = 1;
    return s;
}

let state = null;
let loadedFrom = 'none';

export function getState() {
    if (!state) throw new Error('게임 상태를 아직 안 불러왔어요.');
    return state;
}

export function isLoaded() {
    return state !== null;
}

/** @returns {Promise<{state: object, from: 'main'|'backup'|'none'}>} */
export async function loadState() {
    const { data, from } = await readJson(FILES.state);
    state = normalize(data);
    loadedFrom = from;
    if (data && Number(data.schema) > SCHEMA) {
        console.warn('[Wildcat] 더 새 버전에서 저장한 파일이에요.');
    }
    return { state, from };
}

export function getLoadedFrom() {
    return loadedFrom;
}

export async function saveState() {
    return writeJson(FILES.state, getState());
}

/** 새 ID 만들기 (작품·손님 등). 저장은 따로 해야 함. */
export function newId(kind) {
    const s = getState();
    const n = s.nextId++;
    const rand = Math.random().toString(36).slice(2, 6);
    return `${kind}${n}${rand}`;
}
