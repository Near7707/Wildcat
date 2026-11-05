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

export async function askProfile(profileId, messages, { maxTokens = 600, includePreset = true } = {}) {
    if (!profileId) throw new Error('연결 프로필이 골라져 있지 않아요.');
    if (!findProfile(profileId)) throw new Error('골라 둔 연결 프로필이 없어졌어요. 다시 골라 주세요.');
    const service = ctx().ConnectionManagerRequestService;
    if (!service) throw new Error('이 SillyTavern에는 연결 프로필 요청 기능이 없어요. 업데이트가 필요해요.');

    const res = await service.sendRequest(profileId, messages, maxTokens, {
        stream: false,
        extractData: true,
        includePreset,
    });
    const text = typeof res === 'string' ? res : (res?.content ?? '');
    return String(text).trim();
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
