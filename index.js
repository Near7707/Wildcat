// WILDCAT — The Honest Wildcat
// 1-1: 확장 뼈대 + 연결 프로필 두 개(비전 AI, 반응 AI) 고르기

import { getSettings } from './src/settings.js';
import { mountPanel } from './src/panel.js';

function init() {
    getSettings();
    mountPanel();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
