// 확장 설정(작은 값만). 큰 데이터는 서버 파일에 저장한다(1-2에서).

export const MODULE = 'wildcat';

const DEFAULTS = Object.freeze({
    visionProfile: '',
    reactionProfile: '',
    reactionMode: 'notes', // 'notes' 관찰 결과 사용 / 'direct' 그림 직접 보기(시험)
});

export const ctx = () => SillyTavern.getContext();

export function getSettings() {
    const all = ctx().extensionSettings;
    if (!all[MODULE] || typeof all[MODULE] !== 'object') {
        all[MODULE] = {};
    }
    const s = all[MODULE];
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (s[key] === undefined) s[key] = value;
    }
    return s;
}

export function setSetting(key, value) {
    getSettings()[key] = value;
    ctx().saveSettingsDebounced();
}
