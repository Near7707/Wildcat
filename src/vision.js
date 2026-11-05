// 비전 AI 관찰: 그림을 줄여서 한 번 보내고, 관찰 결과 글을 작품에 저장한다.
// 반응 AI(손님)는 나중에 이 관찰 결과만 보고 감상한다.

import { askVision, findProfile, AiError } from './ai.js';
import { getSettings } from './settings.js';
import { workImageUrl, getWork, updateWork } from './works.js';

export const VISION_MAX_SIDE = 1216;

// 관찰 칸. key는 저장용, label은 AI에게 보내고 화면에 보이는 이름.
export const SECTIONS = [
    { key: 'summary', label: '요약' },
    { key: 'subjects', label: '인물·사물' },
    { key: 'color', label: '색감·구도' },
    { key: 'pose', label: '표정·자세' },
    { key: 'mood', label: '배경·분위기' },
    { key: 'notable', label: '눈에 띄는 점' },
    { key: 'open', label: '해석의 여지' },
    { key: 'text', label: '그림 속 글자' },
];

const PROMPT = `당신은 그림 상점에 들어온 작품을 꼼꼼히 기록하는 관찰자입니다.
이 기록은 나중에 그림을 직접 보지 못하는 사람들이 작품을 상상하고 감상하는 데 쓰입니다.

규칙:
- 잘 그렸다, 아름답다 같은 평가나 칭찬은 쓰지 않습니다. 하지만 그림이 주는 인상, 장면의 상황, 연출(무엇을 강조했는지, 시선이 어디로 가는지)은 평가가 아니므로 씁니다.
- 그림 속 존재가 어떤 존재로 보이는지는 보이는 대로 자연스럽게 씁니다. 예: 고양이 수인, 엘프, 로봇, 유령, 용. "고양이 귀와 꼬리가 달린 사람"처럼 부분으로 쪼개지 말고 "고양이 수인"처럼 한 번에 씁니다. 정말 애매할 때만 "~로 보인다"를 붙입니다.
- 단정하지 않는 것은 이름, 어느 작품·세계관의 캐릭터인지, 인물들의 관계뿐입니다. 이런 건 필요하면 "~처럼 보인다"까지만 씁니다.
- 잘 안 보이거나 애매한 부분은 애매하다고 씁니다.
- 그림 속에 글자가 있으면 보이는 그대로 옮겨 적습니다. 없으면 "없음"이라고 씁니다.
- 한국어로 씁니다.

칸별 안내:
- [요약]: 어떤 종류의 그림인지(인물 일러스트, 풍경, 장면 일러스트, 정물, 귀여운 캐릭터 그림 등), 무엇을 그린 그림인지, 전체적으로 어떤 인상을 주는지를 먼저 씁니다.
- [색감·구도]: 색과 배치뿐 아니라 눈이 어디로 먼저 가는지, 무엇을 강조했는지도 씁니다.
- [해석의 여지]: "웃고 있다", "먼 곳을 본다"처럼 보이는 동작을 다시 적지 말고, 그 모습이 어떤 상황이나 순간으로 보이는지 씁니다. 예: "비를 맞고 막 집에 돌아온 순간 같다", "장난치다 들킨 직후 같다". 여러 해석이 가능하면 두어 가지를 씁니다.

아래 형식을 그대로 지켜서, 각 칸에 1~4문장으로 씁니다. 다른 말은 덧붙이지 않습니다.

${SECTIONS.map(s => `[${s.label}]\n...`).join('\n')}`;

// ---------- 그림 줄이기 ----------

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('저장된 그림을 불러오지 못했어요.'));
        img.src = `${url}?t=${Date.now()}`;
    });
}

/** 긴 변을 VISION_MAX_SIDE 이하로 줄인 JPEG data URL */
export async function makeVisionImage(work) {
    const img = await loadImage(workImageUrl(work));
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    const scale = Math.min(1, VISION_MAX_SIDE / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffffff'; // 투명한 부분은 흰 바탕으로
    g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.9), width: w, height: h };
}

// ---------- 응답 읽기 ----------

const REFUSAL_RE = /(I can(?:'|no)t|I'm (?:not able|unable)|I am unable|cannot (?:help|assist|describe)|unable to (?:help|assist|describe)|죄송하지만|도와드릴 수 없|설명(?:해 ?드릴|할) 수 없|제공할 수 없|응답할 수 없|분석할 수 없)/i;

/** 응답 글을 칸별로 나눈다. */
export function parseObservation(raw) {
    const text = String(raw ?? '').replace(/\r/g, '');
    const sections = {};
    const labelToKey = new Map(SECTIONS.map(s => [s.label.replace(/\s/g, ''), s.key]));
    const re = /^\s*(?:\*\*|#+\s*)?\[\s*([^\]\n]{1,20})\s*\](?:\*\*)?\s*:?\s*(.*)$/;
    let current = null;
    for (const line of text.split('\n')) {
        const m = line.match(re);
        const key = m ? labelToKey.get(m[1].replace(/\s/g, '')) : null;
        if (key) {
            current = key;
            sections[key] = m[2] ? m[2].trim() : '';
            continue;
        }
        if (current) sections[current] = `${sections[current]}\n${line}`.trim();
    }
    for (const k of Object.keys(sections)) {
        sections[k] = sections[k].replace(/^\.\.\.$/, '').trim();
        if (!sections[k]) delete sections[k];
    }
    const found = Object.keys(sections).length;
    let status;
    if (found >= 3) status = 'ok';
    else if (text.length < 400 && REFUSAL_RE.test(text)) status = 'refused';
    else if (text.length >= 200) status = 'loose'; // 형식은 안 지켰지만 내용은 있음
    else status = 'bad';
    return { status, sections };
}

// ---------- 관찰하기 ----------

const running = new Set();

export function isObserving(workId) {
    return running.has(workId);
}

const listeners = new Set();
export function onVisionChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
function emit(workId) {
    for (const fn of listeners) {
        try { fn(workId); } catch (e) { console.error(e); }
    }
}

const ERROR_TEXT = {
    setup: '설정 문제',
    timeout: '시간 초과',
    request: '연결 오류',
    empty: '빈 응답',
    refused: '모델이 거부함',
    bad: '알아볼 수 없는 응답',
    image: '그림 준비 실패',
};

export function errorLabel(kind) {
    return ERROR_TEXT[kind] ?? '실패';
}

/**
 * 작품 하나를 관찰해서 저장한다. 이미 관찰 중이면 아무것도 안 한다.
 * @returns {Promise<object|null>} 저장된 observation
 */
export async function observeWork(workId) {
    if (running.has(workId)) return null;
    const work = getWork(workId);
    if (!work) return null;
    running.add(workId);
    emit(workId);

    const profileId = getSettings().visionProfile;
    const profileName = findProfile(profileId)?.name ?? '';
    let observation;
    try {
        let image;
        try {
            image = await makeVisionImage(work);
        } catch (e) {
            throw Object.assign(new Error(e?.message ?? String(e)), { kind: 'image' });
        }
        const raw = await askVision([
            {
                role: 'user',
                content: [
                    { type: 'text', text: PROMPT },
                    { type: 'image_url', image_url: { url: image.dataUrl } },
                ],
            },
        ], { maxTokens: 4000, timeoutMs: 180000 });

        const parsed = parseObservation(raw);
        if (parsed.status === 'refused' || parsed.status === 'bad') {
            observation = {
                status: 'failed',
                errorKind: parsed.status,
                error: parsed.status === 'refused' ? '모델이 이 그림의 관찰을 거부했어요.' : '응답을 알아볼 수 없었어요.',
                raw: raw.slice(0, 2000),
            };
        } else {
            observation = {
                status: 'ok',
                sections: parsed.sections,
                raw: raw.slice(0, 8000),
                loose: parsed.status === 'loose',
            };
        }
    } catch (e) {
        const kind = e instanceof AiError ? e.kind : (e?.kind ?? 'request');
        observation = { status: 'failed', errorKind: kind, error: e?.message ?? String(e) };
    }

    observation.at = new Date().toISOString();
    observation.profile = profileName;
    observation.sentSide = VISION_MAX_SIDE;

    try {
        // 관찰 결과가 이미 있는데 이번에 실패했으면, 예전 결과는 지우지 않고 실패 기록만 남긴다.
        await updateWork(workId, (w) => {
            if (observation.status === 'failed' && w.observation?.status === 'ok') {
                w.observationError = observation;
            } else {
                w.observation = observation;
                delete w.observationError;
            }
        });
    } finally {
        running.delete(workId);
        emit(workId);
    }
    return observation;
}

/** 관찰 결과를 손님(반응 AI)에게 줄 글로 만든다. (1-6에서 사용) */
export function observationText(work) {
    const o = work?.observation;
    if (!o || o.status !== 'ok') return '';
    if (o.loose && Object.keys(o.sections ?? {}).length === 0) return o.raw;
    return SECTIONS.filter(s => o.sections?.[s.key]).map(s => `[${s.label}] ${o.sections[s.key]}`).join('\n');
}
