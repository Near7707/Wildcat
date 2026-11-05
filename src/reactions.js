// 손님의 작품 감상 (1-6).
// 반응 AI가 겉말·속마음·관심·사고 싶음을 하나의 반응으로 만든다.
// 그림은 보내지 않고 비전 AI의 관찰 결과만 보낸다.
// 결과는 손님의 "감상 초안"(guest.drafts[작품ID])으로만 둔다. 방명록 확정은 1-7.
// 사고 싶음=예는 구매 신청·확정이 아니다. 거래는 게임이 나중에 처리한다.

import { askReaction, findProfile, AiError } from './ai.js';
import { getSettings } from './settings.js';
import { getGuest, updateGuest, traitLines, lookLines } from './guests.js';
import { getWork } from './works.js';
import { observationText } from './vision.js';

export const INTEREST = [
    { key: 'none', label: '없음' },
    { key: 'some', label: '조금' },
    { key: 'big', label: '큼' },
];

export function interestLabel(key) {
    return INTEREST.find(x => x.key === key)?.label ?? '?';
}

// ---------- 이번 반응의 길이·말하기 힌트 ----------
// 모든 손님이 비슷한 길이로 말하지 않게, 게임이 매번 조금씩 다른 힌트를 준다.

function pickWeighted(pairs) {
    const total = pairs.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [v, w] of pairs) {
        r -= w;
        if (r < 0) return v;
    }
    return pairs.at(-1)[0];
}

const SPEAK_HINTS = {
    silent: '이번에는 겉으로 아무 말도 하지 않습니다. 겉말은 "(없음)"으로 씁니다.',
    exclaim: '이번 겉말은 짧은 감탄이나 혼잣말 정도입니다. 그래도 작품에서 본 것이 살짝 묻어나야 합니다.',
    short: '이번 겉말은 짧은 한 문장입니다.',
    two: '이번 겉말은 한두 문장입니다.',
};

const INNER_HINTS = {
    short: '속마음은 이번에 짧게, 2~3문장입니다.',
    normal: '속마음은 3~6문장 정도입니다.',
    long: '속마음은 이번에 생각이 많아 5~8문장까지 써도 됩니다.',
};

export function rollHints(talk) {
    const speak = {
        quiet: [['silent', 4], ['exclaim', 4], ['short', 2], ['two', 0.5]],
        normal: [['silent', 1], ['exclaim', 2], ['short', 4], ['two', 3]],
        much: [['silent', 0.3], ['exclaim', 1], ['short', 3], ['two', 5]],
    }[talk] ?? [['short', 1]];
    const inner = [['short', 2], ['normal', 5], ['long', 2]];
    return { speak: pickWeighted(speak), inner: pickWeighted(inner) };
}

// ---------- 프롬프트 ----------

const CANDOR_GUIDE = {
    open: '이 손님은 느낀 대로 말하는 편입니다. 겉말과 속마음이 대체로 같습니다.',
    sometimes: '이 손님은 가끔 속내를 감춥니다. 이번에 감출지 말지는 성격과 상황을 보고 정하세요.',
    often: '이 손님은 속내를 자주 돌려 말합니다. 침묵, 농담, 말 돌리기, 감정 줄여 말하기 등으로 표현하고, 반대로 말하는 건 아주 가끔만 합니다.',
};

function buildPrompt(guest, work, hints) {
    const lines = (rows) => rows.map(([k, v]) => `- ${k}: ${v}`).join('\n');
    return `당신은 여러 세계의 손님이 드나드는 그림 상점 "The Honest Wildcat"에 온 손님 한 사람입니다.
지금 가게에 걸린 작품 하나 앞에 서 있습니다. 이 손님이 되어 작품을 보고 반응하세요.

[손님]
- 이름: ${guest.name}
- 소개: ${guest.intro}
${lines(traitLines(guest.traits))}

[외형]
${lines(lookLines(guest.look))}

[작품]
- 제목: ${work.title}
- 관찰 기록 (그림을 직접 본 사람이 적은 것):
${observationText(work)}

반응 규칙:
- 손님은 관찰 기록에 적힌 것만 보고 있습니다. 기록에 없는 인물의 정체, 이야기, 관계, 세부 묘사를 사실처럼 단정하지 않습니다. 상상이나 해석은 "~ 같다" 정도로만 합니다.
- 이 손님의 성격, 말수, 감상 태도, 취향, 출신과 경험이 자연스럽게 드러나야 합니다. 미술 평론가처럼 말하지 않습니다. (감상 태도가 "그리는 법을 따짐"인 손님만 기법 이야기를 합니다.)
- 무조건 칭찬하지 않습니다. 좋아하지 않을 수도, 시큰둥할 수도, 이상하게 끌릴 수도 있습니다. 취향은 기준일 뿐이고 작품 전체를 보고 느낍니다.
- ${CANDOR_GUIDE[guest.traits.candor] ?? CANDOR_GUIDE.open}
- 속내를 감추는 손님도 늘 거짓말을 하지는 않습니다. 겉말과 속마음은 같은 순간의 한 사람에게서 나온 것이어야 합니다.
- 겉말이 있으면, 겉말에도 작품에서 본 것이 담겨야 합니다.
- 속마음에는 작품에 대한 실제 감상이 반드시 들어갑니다. 감정, 떠오른 기억, 해석, 숨긴 의도 등을 함께 써도 됩니다.
- 아직 판매 가격은 정해지지 않았습니다. 가격을 지어내지 않고, 사겠다고 확정하거나 거래를 하지 않습니다. 예산과 구매 결정 방식은 망설임이나 생각에만 참고합니다.
- 이번 힌트: ${SPEAK_HINTS[hints.speak]} ${INNER_HINTS[hints.inner]}
- 한국어로 씁니다. 따옴표나 이름표 없이 내용만 씁니다.

판단 규칙:
- [관심]은 이 작품이 이 손님의 눈길을 얼마나 끄는지입니다. 없음 / 조금 / 큼 중 하나.
- [사고 싶음]은 가격 같은 현실 조건을 따지기 전에, 이 작품을 갖고 싶은 마음이 있는지입니다. 예 / 아니오 중 하나.
- 둘은 따로 판단합니다. 관심이 커도 갖고 싶지 않을 수 있고, 관심이 조금이어도 선물 등의 이유로 갖고 싶을 수 있습니다.

아래 형식을 그대로 지키고 다른 말은 덧붙이지 않습니다.

[겉말]
...
[속마음]
...
[관심]
...
[사고 싶음]
...`;
}

// ---------- 응답 읽기 ----------

const LABELS = { '겉말': 'outer', '속마음': 'inner', '관심': 'interest', '사고싶음': 'want' };

const NO_SPEECH = /^[\s(（\[]*(없음|말\s*없음|침묵|무언|—|-|…|\.\.\.)?[\s)）\]]*$/;

export function parseReaction(raw) {
    const text = String(raw ?? '').replace(/\r/g, '');
    const out = {};
    const re = /^\s*(?:\*\*|#+\s*)?\[\s*([^\]\n]{1,10})\s*\](?:\*\*)?\s*:?\s*(.*)$/;
    let current = null;
    for (const line of text.split('\n')) {
        const m = line.match(re);
        const key = m ? LABELS[m[1].replace(/\s/g, '')] : null;
        if (key) {
            current = key;
            out[key] = m[2].trim();
            continue;
        }
        if (current) out[current] = `${out[current]}\n${line}`.trim();
    }
    const clean = (s) => String(s ?? '').replace(/^\.\.\.$/, '').trim();

    const interestRaw = clean(out.interest).replace(/[*.\s]/g, '');
    const interest = /^없음/.test(interestRaw) ? 'none' : /^조금/.test(interestRaw) ? 'some' : /^큼|^크다|^많음/.test(interestRaw) ? 'big' : null;
    const wantRaw = clean(out.want).replace(/[*.\s]/g, '');
    const want = /^예|^네|^있음/.test(wantRaw) ? true : /^아니/.test(wantRaw) ? false : null;

    let outer = clean(out.outer);
    if (NO_SPEECH.test(outer)) outer = '';
    outer = outer.replace(/^["“「『]|["”」』]$/g, '').trim().slice(0, 400);
    const inner = clean(out.inner).slice(0, 2000);

    const ok = Boolean(inner) && interest !== null && want !== null && 'outer' in out;
    return { ok, outer, inner, interest, want };
}

// ---------- 실행 ----------

const running = new Set(); // `${guestId}:${workId}`

export function isReacting(guestId, workId) {
    if (workId) return running.has(`${guestId}:${workId}`);
    for (const k of running) if (k.startsWith(`${guestId}:`)) return true;
    return false;
}

export function isWorkBusy(workId) {
    for (const k of running) if (k.endsWith(`:${workId}`)) return true;
    return false;
}

const listeners = new Set();
export function onReactionChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
function emit() {
    for (const fn of listeners) {
        try { fn(); } catch (e) { console.error(e); }
    }
}

export const ERROR_TEXT = {
    setup: '설정 문제',
    timeout: '시간 초과',
    request: '연결 오류',
    empty: '빈 응답',
    bad: '형식이 맞지 않는 응답',
    noobs: '관찰 결과 없음',
    gone: '손님이나 작품이 없어짐',
};

export function canReact(work) {
    return work?.observation?.status === 'ok';
}

/**
 * 손님 한 명이 작품 하나를 감상한다. 결과는 감상 초안으로 저장된다.
 * 형식이 틀리면 한 번 더 시도하고, 그래도 안 되면 AiError('bad').
 * @returns {Promise<object|null>} 저장된 초안 (이미 진행 중이면 null)
 */
export async function reactToWork(guestId, workId) {
    const key = `${guestId}:${workId}`;
    if (running.has(key)) return null;
    const guest = getGuest(guestId);
    const work = getWork(workId);
    if (!guest || !work) throw new AiError('gone', '손님이나 작품이 없어졌어요.');
    if (!canReact(work)) throw new AiError('noobs', '이 작품은 아직 관찰 결과가 없어서 감상할 수 없어요.');

    running.add(key);
    emit();
    try {
        const hints = rollHints(guest.traits.talk);
        let parsed = null;
        let lastRaw = '';
        for (let attempt = 0; attempt < 2; attempt++) {
            lastRaw = await askReaction([
                { role: 'user', content: buildPrompt(guest, work, hints) },
            ], { maxTokens: 4000 });
            parsed = parseReaction(lastRaw);
            if (parsed.ok) break;
        }
        if (!parsed?.ok) {
            const err = new AiError('bad', '응답 형식이 맞지 않아 두 번 시도했지만 읽지 못했어요.');
            err.raw = lastRaw.slice(0, 2000);
            throw err;
        }

        const draft = {
            outer: parsed.outer,
            inner: parsed.inner,
            interest: parsed.interest,
            want: parsed.want,
            hints,
            workTitle: work.title,
            at: new Date().toISOString(),
            profile: findProfile(getSettings().reactionProfile)?.name ?? '',
        };
        // 그사이 작품이 지워졌으면 저장하지 않는다
        if (!getWork(workId)) throw new AiError('gone', '감상하는 사이 작품이 지워졌어요.');
        const saved = await updateGuest(guestId, (g) => {
            g.drafts = g.drafts ?? {};
            g.drafts[workId] = draft;
        });
        if (!saved) throw new AiError('gone', '감상하는 사이 손님이 떠났어요.');
        return draft;
    } finally {
        running.delete(key);
        emit();
    }
}
