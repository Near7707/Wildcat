// 연결 프로필 목록과 프로필 지정 요청.
// 현재 채팅 내용을 같이 보내는 생성 함수는 쓰지 않는다.

import { ctx, getSettings } from './settings.js';

export function listProfiles() {
    const profiles = ctx().extensionSettings?.connectionManager?.profiles;
    if (!Array.isArray(profiles)) return [];
    return profiles
        .filter(p => p && p.id)
        .map(p => ({
            id: p.id,
            name: p.name || '(이름 없음)',
            mode: p.mode || '',
            api: p.api || '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export function findProfile(id) {
    return listProfiles().find(p => p.id === id) ?? null;
}

// 비전 AI는 Chat Completion 방식이어야 그림을 보낼 수 있다.
export function isChatCompletion(profile) {
    return profile?.mode === 'cc';
}

export function hasRequestService() {
    return Boolean(ctx().ConnectionManagerRequestService);
}

export class AiError extends Error {
    /** @param {'setup'|'timeout'|'request'|'empty'} kind */
    constructor(kind, message, cause) {
        super(message, cause ? { cause } : undefined);
        this.name = 'AiError';
        this.kind = kind;
    }
}

export async function askProfile(profileId, messages, { maxTokens = 600, includePreset = true, timeoutMs = 120000 } = {}) {
    if (!profileId) throw new AiError('setup', '연결 프로필이 골라져 있지 않아요.');
    if (!findProfile(profileId)) throw new AiError('setup', '골라 둔 연결 프로필이 없어졌어요. 다시 골라 주세요.');
    const service = ctx().ConnectionManagerRequestService;
    if (!service) throw new AiError('setup', '이 SillyTavern에는 연결 프로필 요청 기능이 없어요. 업데이트가 필요해요.');

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    let res;
    try {
        res = await service.sendRequest(profileId, messages, maxTokens, {
            stream: false,
            extractData: true,
            includePreset,
            signal: controller.signal,
        });
    } catch (e) {
        if (timedOut) throw new AiError('timeout', `응답이 ${Math.round(timeoutMs / 1000)}초 안에 오지 않았어요.`, e);
        throw new AiError('request', `요청 실패: ${errorText(e)}`, e);
    } finally {
        clearTimeout(timer);
    }
    const text = String(typeof res === 'string' ? res : (res?.content ?? '')).trim();
    if (!text) throw new AiError('empty', '응답이 비어 있어요. 생각하는 모델이면 답 길이가 모자랐을 수 있어요.');
    return text;
}

export function askVision(messages, options) {
    return askProfile(getSettings().visionProfile, messages, options);
}

export function askReaction(messages, options) {
    return askProfile(getSettings().reactionProfile, messages, options);
}

export function errorText(e) {
    let msg = e?.message ?? String(e);
    let cause = e?.cause;
    let depth = 0;
    while (cause && depth < 5) {
        msg += ` / ${cause.message ?? cause}`;
        cause = cause.cause;
        depth++;
    }
    return msg;
}
