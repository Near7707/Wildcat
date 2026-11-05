// 저장 점검: 시험 파일로 저장·읽기·백업·충돌 막기·삭제가 되는지 확인한다.
// 실제 게임 파일(wildcat_state.json 등)은 건드리지 않는다.

import { readJson, writeJson, deleteJson, exists, backupName, forgetKnown, StorageConflictError, saveImage, deleteFile, fileUrl } from './storage.js';

const NAME = 'wildcat_selftest.json';
const IMG = 'wildcat_selftest.png';

function tinyPngBase64() {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 4;
    const g = c.getContext('2d');
    g.fillStyle = '#c0c0c0';
    g.fillRect(0, 0, 4, 4);
    g.fillStyle = '#404040';
    g.fillRect(0, 0, 2, 2);
    return c.toDataURL('image/png').split(',')[1];
}

/** @param {(line: string) => void} say */
export async function runStorageSelfTest(say) {
    const steps = [];
    const ok = (t) => { steps.push(`✔ ${t}`); say(steps.join('\n')); };
    const fail = (t) => { steps.push(`✘ ${t}`); say(steps.join('\n')); };

    try {
        await deleteJson(NAME).catch(() => {});

        const first = await readJson(NAME);
        first.from === 'none' ? ok('빈 상태 확인') : fail(`시험 파일이 남아 있었어요 (${first.from})`);

        const memo = '고양이는 자는 중 — 한글 확인';
        await writeJson(NAME, { memo, n: 1 });
        await writeJson(NAME, { memo, n: 2 });
        const back = await readJson(NAME);
        if (back.data?.memo === memo && back.data?.n === 2 && back.data?.rev === 2) ok('저장·읽기 (한글 포함)');
        else fail(`읽은 내용이 달라요: ${JSON.stringify(back.data)}`);

        (await exists(backupName(NAME))) ? ok('직전 내용 백업') : fail('백업 파일이 없어요');

        forgetKnown(NAME);
        try {
            await writeJson(NAME, { memo, n: 99 });
            fail('다른 기기 덮어쓰기를 못 막았어요');
        } catch (e) {
            e instanceof StorageConflictError ? ok('다른 기기 덮어쓰기 막기') : fail(`예상 못 한 오류: ${e.message}`);
        }

        await saveImage(IMG, tinyPngBase64());
        const imgRes = await fetch(`${fileUrl(IMG)}?t=${Date.now()}`, { cache: 'no-store' });
        imgRes.ok && (imgRes.headers.get('content-type') ?? '').includes('image') ? ok('그림 저장·읽기') : fail('그림을 다시 못 읽었어요');

        await deleteJson(NAME);
        await deleteFile(IMG);
        const gone = !(await exists(NAME)) && !(await exists(backupName(NAME))) && !(await exists(IMG));
        gone ? ok('시험 파일 지우기') : fail('시험 파일이 남아 있어요');
    } catch (e) {
        fail(`오류: ${e?.message ?? e}`);
    }

    const passed = steps.every(s => s.startsWith('✔'));
    say(`${steps.join('\n')}\n\n${passed ? '저장 점검 통과' : '저장 점검 실패 — 이 내용을 그대로 알려 주세요'}`);
    return passed;
}
