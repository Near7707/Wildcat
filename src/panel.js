// 확장 메뉴 안의 설정 패널: 프로필 두 개 고르기, 연결 시험, 가게 열기.

import { getSettings, setSetting } from './settings.js';
import { listProfiles, findProfile, isChatCompletion, hasRequestService, askProfile, errorText } from './ai.js';
import { openShop } from './shop.js';
import { runStorageSelfTest } from './selftest.js';

const PANEL_HTML = `
<div id="wildcat_settings" class="wildcat_settings">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Wildcat</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="wildcat_block">
                <label for="wildcat_vision_profile">비전 AI (그림 보는 AI)</label>
                <div class="wildcat_row">
                    <select id="wildcat_vision_profile" class="text_pole"></select>
                    <div class="menu_button" id="wildcat_test_vision">연결 시험</div>
                </div>
                <small id="wildcat_vision_note" class="wildcat_note"></small>
            </div>

            <div class="wildcat_block">
                <label for="wildcat_reaction_profile">반응 AI (손님 말하는 AI)</label>
                <div class="wildcat_row">
                    <select id="wildcat_reaction_profile" class="text_pole"></select>
                    <div class="menu_button" id="wildcat_test_reaction">연결 시험</div>
                </div>
                <small id="wildcat_reaction_note" class="wildcat_note"></small>
            </div>

            <small class="wildcat_note">두 칸에 같은 프로필을 골라도 돼요. 비전 AI는 그림을 볼 수 있는 모델이어야 해요. Vertex로 연결한 프로필은 쓸 수 없어요.</small>

            <div class="wildcat_row wildcat_open_row">
                <div class="menu_button" id="wildcat_open">가게 열기</div>
                <div class="menu_button" id="wildcat_selftest">저장 점검</div>
            </div>
            <pre id="wildcat_selftest_out" class="wildcat_out" hidden></pre>
        </div>
    </div>
</div>`;

const ROLES = {
    vision: { select: '#wildcat_vision_profile', note: '#wildcat_vision_note', key: 'visionProfile', test: '#wildcat_test_vision' },
    reaction: { select: '#wildcat_reaction_profile', note: '#wildcat_reaction_note', key: 'reactionProfile', test: '#wildcat_test_reaction' },
};

export function mountPanel() {
    if (document.getElementById('wildcat_settings')) return;
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host) return;
    host.insertAdjacentHTML('beforeend', PANEL_HTML);

    for (const [role, r] of Object.entries(ROLES)) {
        const select = document.querySelector(r.select);
        // 다른 곳에서 프로필을 추가·삭제했을 수 있으니 열 때마다 새로 채운다.
        select.addEventListener('focus', () => fillSelect(role));
        select.addEventListener('pointerdown', () => fillSelect(role));
        select.addEventListener('change', () => {
            setSetting(r.key, select.value);
            updateNote(role);
        });
        document.querySelector(r.test).addEventListener('click', () => testProfile(role));
        fillSelect(role);
    }

    document.getElementById('wildcat_open').addEventListener('click', openShop);
    document.getElementById('wildcat_selftest').addEventListener('click', selfTest);
}

let selfTesting = false;

async function selfTest() {
    if (selfTesting) return;
    selfTesting = true;
    const out = document.getElementById('wildcat_selftest_out');
    out.hidden = false;
    out.textContent = '점검 중...';
    try {
        await runStorageSelfTest((text) => { out.textContent = text; });
    } finally {
        selfTesting = false;
    }
}

function fillSelect(role) {
    const r = ROLES[role];
    const select = document.querySelector(r.select);
    if (!select) return;
    const saved = getSettings()[r.key];
    const profiles = listProfiles();

    select.innerHTML = '';
    select.append(new Option('— 고르기 —', ''));
    for (const p of profiles) {
        const label = role === 'vision' && !isChatCompletion(p) ? `${p.name} (그림 못 보냄)` : p.name;
        select.append(new Option(label, p.id));
    }
    if (saved && !findProfile(saved)) {
        select.append(new Option('(없어진 프로필)', saved));
    }
    select.value = saved || '';
    updateNote(role);
}

function updateNote(role) {
    const r = ROLES[role];
    const note = document.querySelector(r.note);
    if (!note) return;
    const id = getSettings()[r.key];
    note.classList.remove('wildcat_warn');

    if (!hasRequestService()) {
        note.textContent = '이 SillyTavern에는 연결 프로필 요청 기능이 없어요. 업데이트가 필요해요.';
        note.classList.add('wildcat_warn');
        return;
    }
    if (listProfiles().length === 0) {
        note.textContent = '연결 프로필이 하나도 없어요. 먼저 API 연결 화면에서 프로필을 만들어 주세요.';
        note.classList.add('wildcat_warn');
        return;
    }
    if (!id) {
        note.textContent = '아직 안 골랐어요.';
        return;
    }
    const p = findProfile(id);
    if (!p) {
        note.textContent = '골라 둔 프로필이 없어졌어요. 다시 골라 주세요.';
        note.classList.add('wildcat_warn');
        return;
    }
    if (role === 'vision' && !isChatCompletion(p)) {
        note.textContent = '이 프로필은 Chat Completion 방식이 아니라서 그림을 보낼 수 없어요.';
        note.classList.add('wildcat_warn');
        return;
    }
    note.textContent = '';
}

let testing = false;

async function testProfile(role) {
    if (testing) return;
    const r = ROLES[role];
    const id = getSettings()[r.key];
    const note = document.querySelector(r.note);
    if (!id) {
        toastr.warning('먼저 프로필을 골라 주세요.');
        return;
    }
    testing = true;
    const word = `CAT${Math.floor(1000 + Math.random() * 9000)}`;
    note.classList.remove('wildcat_warn');
    note.textContent = '시험 중...';
    try {
        const reply = await askProfile(id, [
            { role: 'user', content: `연결 시험입니다. 다른 말 없이 이 단어만 그대로 답하세요: ${word}` },
        ], { maxTokens: 1500 });
        if (reply.includes(word)) {
            note.textContent = '연결 성공.';
        } else {
            note.textContent = `응답은 왔지만 시험 단어가 없어요: "${reply.slice(0, 60)}"`;
            note.classList.add('wildcat_warn');
        }
    } catch (e) {
        note.textContent = `실패: ${errorText(e)}`;
        note.classList.add('wildcat_warn');
    } finally {
        testing = false;
    }
}
