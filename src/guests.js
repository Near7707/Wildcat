// 손님 만들기 (1-5).
// 1) 게임이 조합표에서 성격·취향·외형을 무작위로 뽑는다.
// 2) 반응 AI가 그 조합을 보고 이름과 짧은 소개만 짓는다. 조합은 바꾸지 못한다.
// 손님은 매번 새로 만들고, 장기 기억은 두지 않는다. 방문 중인 손님만 가게 상태에 둔다.

import * as T from './guestTables.js';
import { askReaction, findProfile, AiError } from './ai.js';
import { getSettings } from './settings.js';
import { getState, saveState, newId, loadState } from './store.js';
import { StorageConflictError } from './storage.js';

// 1단계 시험용: 동시에 머무를 수 있는 손님 수
export const MAX_GUESTS = 12;

// ---------- 무작위 ----------

function pick(list) {
    let total = 0;
    for (const x of list) total += x.w ?? 1;
    let r = Math.random() * total;
    for (const x of list) {
        r -= x.w ?? 1;
        if (r < 0) return x;
    }
    return list.at(-1);
}

function pickPlain(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function pickMany(list, count, exclude = []) {
    const out = [];
    let pool = list.filter(x => !exclude.includes(x.key));
    while (out.length < count && pool.length) {
        const x = pick(pool);
        out.push(x.key);
        pool = pool.filter(y => y.key !== x.key);
    }
    return out;
}

const chance = (p) => Math.random() < p;

// ---------- 조합 뽑기 ----------

export function rollTraits() {
    const world = pickPlain(T.WORLDS);
    const commonJob = chance(T.COMMON_JOB_CHANCE);
    const job = commonJob ? pickPlain(T.COMMON_JOBS) : pickPlain(world.jobs);

    const likes = pickMany(T.TASTES, chance(0.5) ? 1 : 2);
    const dislikes = chance(T.DISLIKE_CHANCE) ? pickMany(T.TASTES, 1, likes) : [];

    return {
        world: world.key,
        job,
        commonJob,
        personality: pickMany(T.PERSONALITIES, 2),
        candor: pick(T.CANDOR).key,
        talk: pick(T.TALK).key,
        viewing: pick(T.VIEWING).key,
        likes,
        dislikes,
        decision: pick(T.DECISION).key,
        purpose: pick(T.PURPOSE).key,
        budget: pick(T.BUDGET).key,
    };
}

export function rollLook(worldKey) {
    const world = T.WORLDS.find(w => w.key === worldKey) ?? T.WORLDS[0];
    const species = pick(T.SPECIES.map(s => ({ ...s, w: s.w + (world.lean.includes(s.key) ? T.SPECIES_LEAN : 0) }))).key;

    let kind = null;
    let body;
    if (species === 'beast') {
        kind = pick(T.BEAST_KINDS).key;
        body = pick(T.FURS).key;
    } else if (species === 'odd') {
        kind = pick(T.ODD_KINDS).key;
        body = pick(T.ODD_BODIES).key;
    } else {
        body = pick(T.SKINS).key;
    }

    // 기본은 자기 세계 복장, 가끔 다른 세계 복장
    let outfitWorld = world;
    if (chance(T.OTHER_OUTFIT_CHANCE)) {
        outfitWorld = pickPlain(T.WORLDS.filter(w => w.key !== world.key));
    }

    const [main, accent] = pickMany(T.CLOTH_COLORS, 2);

    return {
        species,
        kind,
        height: pick(T.HEIGHTS).key,
        body,
        hairStyle: pick(T.HAIR_STYLES).key,
        hairColor: pick(T.HAIR_COLORS).key,
        outfitWorld: outfitWorld.key,
        outfit: pickPlain(outfitWorld.outfits),
        outfitColor: main,
        outfitAccent: accent,
        accessory: chance(T.ACCESSORY_CHANCE) ? pick(T.ACCESSORIES).key : null,
    };
}

// ---------- 글로 바꾸기 ----------

const label = (list, key) => list.find(x => x.key === key)?.label ?? key ?? '';
const labels = (list, keys) => (keys ?? []).map(k => label(list, k));

export function worldLabel(key) {
    return label(T.WORLDS, key);
}

/** 손님 조합을 화면·AI에 보여 줄 줄 목록으로 */
export function traitLines(traits) {
    const t = traits;
    return [
        ['출신 세계', worldLabel(t.world)],
        ['직업', t.job],
        ['성격', labels(T.PERSONALITIES, t.personality).join(', ')],
        ['속내 드러내기', label(T.CANDOR, t.candor)],
        ['말수', label(T.TALK, t.talk)],
        ['감상 태도', label(T.VIEWING, t.viewing)],
        ['좋아하는 그림', labels(T.TASTES, t.likes).join(', ')],
        ['싫어하는 그림', t.dislikes?.length ? labels(T.TASTES, t.dislikes).join(', ') : '딱히 없음'],
        ['구매 결정 방식', label(T.DECISION, t.decision)],
        ['방문 목적', label(T.PURPOSE, t.purpose)],
        ['예산', label(T.BUDGET, t.budget)],
    ];
}

export function lookLines(look) {
    const l = look;
    let species = label(T.SPECIES, l.species);
    if (l.species === 'beast') species = `${label(T.BEAST_KINDS, l.kind)} 수인`;
    if (l.species === 'odd') species = `기묘한 존재 (${label(T.ODD_KINDS, l.kind)})`;
    const bodyList = l.species === 'beast' ? T.FURS : l.species === 'odd' ? T.ODD_BODIES : T.SKINS;
    const outfitNote = l.outfitWorld ? ` (${worldLabel(l.outfitWorld)}풍)` : '';
    return [
        ['종족', species],
        ['키', label(T.HEIGHTS, l.height)],
        ['몸', label(bodyList, l.body)],
        ['머리', `${label(T.HAIR_COLORS, l.hairColor)} ${label(T.HAIR_STYLES, l.hairStyle)}`],
        ['복장', `${l.outfit}${outfitNote}`],
        ['복장 색', `${label(T.CLOTH_COLORS, l.outfitColor)}, 보조 ${label(T.CLOTH_COLORS, l.outfitAccent)}`],
        ['소품', l.accessory ? label(T.ACCESSORIES, l.accessory) : '없음'],
    ];
}

// ---------- 이름·소개 (반응 AI) ----------

function buildPrompt(traits, look, avoidNames) {
    const lines = (rows) => rows.map(([k, v]) => `- ${k}: ${v}`).join('\n');
    return `당신은 여러 세계의 손님이 드나드는 그림 상점 "The Honest Wildcat"의 손님을 한 사람으로 그려 내는 작가입니다.
아래는 게임이 무작위로 정한 손님 조합입니다. 조합은 이미 정해졌으니 바꾸거나 빼지 말고, 이 사람에게 이름과 짧은 소개를 지어 주세요.

[손님 조합]
${lines(traitLines(traits))}

[외형]
${lines(lookLines(look))}

규칙:
- 이름은 출신 세계에 어울리게 짓고 한글로 씁니다. 성과 이름, 별명, 호칭 중 자연스러운 것으로 합니다.
${avoidNames.length ? `- 지금 가게에 있는 손님과 겹치지 않게, 이 이름들은 쓰지 않습니다: ${avoidNames.join(', ')}\n` : ''}- 소개는 2~3문장입니다. 어디서 온 누구인지, 어떻게 생겼는지, 왜 가게에 왔는지가 자연스럽게 드러나게 씁니다.
- 외형은 위 [외형]과 어긋나게 쓰지 않습니다. 작은 디테일은 덧붙여도 됩니다.
- 출신 세계나 직업 때문에 성격이 정해진 것처럼 쓰지 않습니다. 성격은 주어진 그대로입니다.
- 예산 금액, 성격 이름표, "속내 드러내기" 같은 항목 이름은 소개에 그대로 쓰지 않습니다.
- 아직 그림을 보기 전이므로 그림에 대한 감상은 쓰지 않습니다.
- 한국어로 씁니다.

아래 형식을 그대로 지키고 다른 말은 덧붙이지 않습니다.

[이름]
...
[소개]
...`;
}

export function parseIntro(raw) {
    const text = String(raw ?? '').replace(/\r/g, '');
    const out = {};
    const re = /^\s*(?:\*\*|#+\s*)?\[\s*(이름|소개)\s*\](?:\*\*)?\s*:?\s*(.*)$/;
    let current = null;
    for (const line of text.split('\n')) {
        const m = line.match(re);
        if (m) {
            current = m[1] === '이름' ? 'name' : 'intro';
            out[current] = m[2].trim();
            continue;
        }
        if (current) out[current] = `${out[current]}\n${line}`.trim();
    }
    const name = (out.name ?? '').split('\n')[0].replace(/[*"「」『』]/g, '').trim().slice(0, 30);
    const intro = (out.intro ?? '').replace(/^\.\.\.$/, '').trim().slice(0, 600);
    return { name, intro };
}

const sameName = (a, b) => a.replace(/\s/g, '') === b.replace(/\s/g, '');

async function nameGuest(traits, look) {
    const avoid = listGuests().map(g => g.name);
    for (let attempt = 0; attempt < 2; attempt++) {
        const raw = await askReaction([
            { role: 'user', content: buildPrompt(traits, look, avoid) },
        ], { maxTokens: 3000 });
        const { name, intro } = parseIntro(raw);
        if (!name || !intro) {
            if (attempt === 0) continue;
            throw new AiError('bad', '이름과 소개를 알아볼 수 없는 응답이었어요.');
        }
        if (avoid.some(n => sameName(n, name))) {
            avoid.push(name);
            if (attempt === 0) continue;
            throw new AiError('bad', `이미 있는 손님과 이름이 겹쳤어요 (${name}).`);
        }
        return { name, intro };
    }
    throw new AiError('bad', '이름을 짓지 못했어요.');
}

// ---------- 목록·저장 ----------

export function listGuests() {
    return (getState().guests ?? []).slice();
}

export function getGuest(id) {
    return (getState().guests ?? []).find(g => g.id === id) ?? null;
}

async function saveWith(mutate) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const state = getState();
        const before = state.guests.slice();
        mutate(state);
        try {
            await saveState();
            return;
        } catch (e) {
            state.guests = before;
            if (e instanceof StorageConflictError && attempt === 0) {
                await loadState();
                continue;
            }
            throw e;
        }
    }
}

let creating = 0;
export function isCreating() {
    return creating > 0;
}

/**
 * 손님 한 명을 새로 만들어 가게에 들인다.
 * AI가 실패하면 손님은 들어오지 않고 AiError가 난다.
 */
export async function createGuest() {
    if (listGuests().length >= MAX_GUESTS) {
        throw new Error(`가게에 손님이 너무 많아요 (최대 ${MAX_GUESTS}명). 몇 명을 보내 주세요.`);
    }
    creating++;
    try {
        const traits = rollTraits();
        const look = rollLook(traits.world);
        const { name, intro } = await nameGuest(traits, look);
        let guest;
        await saveWith((state) => {
            guest = {
                id: newId('g'),
                name,
                intro,
                traits,
                look,
                status: 'visiting',
                arrivedGameTime: state.gameTime,
                createdAt: new Date().toISOString(),
                profile: findProfile(getSettings().reactionProfile)?.name ?? '',
            };
            state.guests.push(guest);
        });
        return guest;
    } finally {
        creating--;
    }
}

/** 손님 보내기. 퇴장한 손님은 기억을 남기지 않는다. */
export async function removeGuest(id) {
    await saveWith((state) => {
        state.guests = state.guests.filter(g => g.id !== id);
    });
}

export async function removeAllGuests() {
    await saveWith((state) => {
        state.guests = [];
    });
}
