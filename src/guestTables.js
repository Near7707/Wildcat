// 손님 조합표 (1-5).
// 저장은 key로, 화면과 AI에게는 label로 보낸다. label은 바꿔도 되지만 key는 바꾸지 않는다.
// w: 뽑힐 무게 (없으면 1)

// ---------- 출신 세계 ----------
// jobs: 그 세계 직업 / outfits: 그 세계 기본 복장 / lean: 조금 더 자주 나오는 종족

export const WORLDS = [
    {
        key: 'modern', label: '현대 도시', lean: ['human'],
        jobs: ['회사원', '대학생', '카페 사장', '편의점 알바생', '프리랜서 디자이너', '택시 기사'],
        outfits: ['후드티와 청바지', '정장', '트렌치코트', '운동복'],
    },
    {
        key: 'kingdom', label: '검과 마법의 왕국', lean: ['elf'],
        jobs: ['떠돌이 검객', '약초상', '성 경비병', '음유시인', '대장장이'],
        outfits: ['가죽 갑옷', '여행자 망토', '천 튜닉'],
    },
    {
        key: 'academy', label: '마법 학원', lean: ['elf'],
        jobs: ['학원생', '마법 교수', '도서관 사서', '연금술 조교'],
        outfits: ['학원 교복과 로브', '긴 마법사 로브', '연구용 가운'],
    },
    {
        key: 'noble', label: '귀족 사회', lean: [],
        jobs: ['몰락한 귀족', '집사', '사교계 신인', '궁정 화가', '상단 후계자'],
        outfits: ['프릴 달린 예복', '드레스', '연미복'],
    },
    {
        key: 'beastvillage', label: '수인 마을', lean: ['beast'],
        jobs: ['빵집 주인', '우편배달부', '사냥꾼', '마을 촌장 손주', '찻집 점원'],
        outfits: ['멜빵바지', '앞치마 차림', '털 조끼'],
    },
    {
        key: 'cyberpunk', label: '사이버펑크 도시', lean: ['cyborg'],
        jobs: ['배달 라이더', '해커', '의체 정비공', '기업 보안 요원', '길거리 음악가'],
        outfits: ['네온 점퍼', '전술복', '방수 롱코트'],
    },
    {
        key: 'harbor', label: '바닷가 항구 마을', lean: [],
        jobs: ['어부', '선원', '등대지기', '생선 경매인', '조선공'],
        outfits: ['줄무늬 선원복', '방수 작업복', '헐렁한 셔츠'],
    },
    {
        key: 'caravan', label: '사막 상인 행렬', lean: [],
        jobs: ['낙타 몰이꾼', '향신료 상인', '길잡이', '천막 무희', '물 감별사'],
        outfits: ['두건과 긴 겉옷', '가벼운 여행복', '장신구 많은 옷'],
    },
    {
        key: 'wuxia', label: '무협 강호', lean: ['human'],
        jobs: ['표국 호위무사', '객잔 주인', '떠돌이 의원', '문파 막내 제자'],
        outfits: ['도포', '무복', '죽립과 장삼'],
    },
    {
        key: 'hunter', label: '헌터 세계', lean: [],
        jobs: ['신입 헌터', '협회 직원', '던전 부산물 상인', '은퇴한 헌터'],
        outfits: ['헌터 전투복', '협회 제복', '기능성 점퍼'],
    },
    {
        key: 'occult', label: '퇴마·오컬트', lean: ['odd'],
        jobs: ['무당', '퇴마사 견습', '골동품 수집상', '괴담 기자'],
        outfits: ['개량 한복', '검은 코트', '부적 달린 작업복'],
    },
    {
        key: 'crime', label: '범죄 도시', lean: ['human'],
        jobs: ['사립 탐정', '바 주인', '정보상', '잠복 중인 형사'],
        outfits: ['낡은 바바리코트', '가죽 재킷', '조끼 정장'],
    },
];

// 어느 세계에나 있을 법한 직업 (가끔 나옴)
export const COMMON_JOBS = ['상인', '여행자', '학생', '요리사', '화가', '은퇴한 노인', '음악가', '우체부'];
export const COMMON_JOB_CHANCE = 0.1;

// 다른 세계 복장을 입을 확률 ("가끔")
export const OTHER_OUTFIT_CHANCE = 0.15;

// ---------- 성격·말 ----------

export const PERSONALITIES = [
    { key: 'frank', label: '솔직함' },
    { key: 'shy', label: '수줍음' },
    { key: 'chatty', label: '수다스러움' },
    { key: 'curt', label: '무뚝뚝함' },
    { key: 'showy', label: '허세' },
    { key: 'careful', label: '꼼꼼함' },
    { key: 'clumsy', label: '덤벙댐' },
    { key: 'sunny', label: '낙천적' },
    { key: 'cynical', label: '냉소적' },
    { key: 'sentimental', label: '감성적' },
    { key: 'curious', label: '호기심 많음' },
    { key: 'competitive', label: '경쟁심' },
    { key: 'polite', label: '예의 바름' },
    { key: 'playful', label: '장난기' },
];

export const CANDOR = [
    { key: 'open', label: '그대로 말함', w: 5 },
    { key: 'sometimes', label: '가끔 숨김', w: 3 },
    { key: 'often', label: '자주 돌려 말함', w: 2 },
];

export const TALK = [
    { key: 'much', label: '말 많음' },
    { key: 'normal', label: '보통' },
    { key: 'quiet', label: '조용함' },
];

export const VIEWING = [
    { key: 'first', label: '첫인상으로 봄', w: 3 },
    { key: 'detail', label: '구석구석 뜯어봄', w: 3 },
    { key: 'memory', label: '자기 추억과 연결함', w: 3 },
    { key: 'others', label: '남들 반응을 살핌', w: 3 },
    { key: 'technique', label: '그리는 법을 따짐', w: 1 },
];

// ---------- 그림 취향 ----------

export const TASTES = [
    { key: 'bright', label: '밝은 색' },
    { key: 'dark', label: '어두운 색' },
    { key: 'people', label: '인물' },
    { key: 'landscape', label: '풍경' },
    { key: 'animal', label: '동물' },
    { key: 'cute', label: '귀여운 것' },
    { key: 'eerie', label: '으스스한 것' },
    { key: 'delicate', label: '섬세한 그림' },
    { key: 'simple', label: '단순한 그림' },
    { key: 'story', label: '이야기가 보이는 장면' },
    { key: 'calm', label: '조용한 분위기' },
    { key: 'intense', label: '강렬한 분위기' },
    { key: 'strange', label: '낯선 것' },
    { key: 'familiar', label: '익숙한 것' },
];
export const DISLIKE_CHANCE = 0.6;

// ---------- 구매·방문 ----------

export const DECISION = [
    { key: 'impulsive', label: '충동형' },
    { key: 'normal', label: '보통', w: 2 },
    { key: 'cautious', label: '신중형' },
];

export const PURPOSE = [
    { key: 'browse', label: '그냥 구경', w: 4 },
    { key: 'passing', label: '지나가다 들름', w: 2 },
    { key: 'home', label: '집에 걸 그림 찾기', w: 2 },
    { key: 'gift', label: '선물 찾는 중', w: 2 },
    { key: 'collector', label: '수집가', w: 1 },
    { key: 'grade', label: '등급 구경', w: 1 },
];

export const BUDGET = [
    { key: 'low', label: '적음', w: 2 },
    { key: 'mid', label: '보통', w: 3 },
    { key: 'high', label: '넉넉함', w: 2 },
    { key: 'rich', label: '많음', w: 1 },
];

// ---------- 외형 ----------

// 비교적 고르게. 세계의 lean에 들어 있으면 조금(+1) 더 나온다.
export const SPECIES = [
    { key: 'human', label: '인간', w: 3 },
    { key: 'beast', label: '수인', w: 3 },
    { key: 'elf', label: '뾰족귀 종족', w: 3 },
    { key: 'cyborg', label: '의체 인간', w: 3 },
    { key: 'odd', label: '기묘한 존재', w: 2 },
];
export const SPECIES_LEAN = 1;

export const BEAST_KINDS = [
    { key: 'cat', label: '고양이' },
    { key: 'dog', label: '개' },
    { key: 'fox', label: '여우' },
    { key: 'rabbit', label: '토끼' },
    { key: 'bear', label: '곰' },
    { key: 'bird', label: '새' },
];

export const ODD_KINDS = [
    { key: 'ghost', label: '유령' },
    { key: 'doll', label: '살아 있는 인형' },
    { key: 'shadow', label: '그림자' },
    { key: 'spirit', label: '작은 정령' },
];

export const HEIGHTS = [
    { key: 'short', label: '작음' },
    { key: 'mid', label: '보통' },
    { key: 'tall', label: '큼' },
];

export const SKINS = [
    { key: 'pale', label: '아주 밝은 피부' },
    { key: 'light', label: '밝은 피부' },
    { key: 'tan', label: '중간 피부' },
    { key: 'brown', label: '갈색 피부' },
    { key: 'dark', label: '짙은 갈색 피부' },
];

export const FURS = [
    { key: 'white', label: '흰 털' },
    { key: 'black', label: '검은 털' },
    { key: 'gray', label: '회색 털' },
    { key: 'brown', label: '갈색 털' },
    { key: 'orange', label: '주황 털' },
    { key: 'cream', label: '크림색 털' },
    { key: 'patched', label: '얼룩 털' },
];

export const ODD_BODIES = [
    { key: 'translucent', label: '반투명한 흰 몸' },
    { key: 'gray', label: '잿빛 몸' },
    { key: 'lilac', label: '연보랏빛 몸' },
    { key: 'bluish', label: '푸르스름한 몸' },
];

export const HAIR_STYLES = [
    { key: 'short', label: '짧은 머리' },
    { key: 'bob', label: '단발' },
    { key: 'long', label: '긴 머리' },
    { key: 'tied', label: '묶은 머리' },
    { key: 'updo', label: '올린 머리' },
    { key: 'bald', label: '민머리' },
    { key: 'hat', label: '모자에 가려짐' },
];

// 튀는 색도 흔하게: 모두 같은 무게
export const HAIR_COLORS = [
    { key: 'black', label: '검정' },
    { key: 'brown', label: '갈색' },
    { key: 'blonde', label: '금색' },
    { key: 'silver', label: '은백' },
    { key: 'red', label: '빨강' },
    { key: 'blue', label: '파랑' },
    { key: 'green', label: '초록' },
    { key: 'pink', label: '분홍' },
    { key: 'purple', label: '보라' },
];

export const CLOTH_COLORS = [
    { key: 'black', label: '검정' },
    { key: 'white', label: '흰색' },
    { key: 'gray', label: '회색' },
    { key: 'navy', label: '남색' },
    { key: 'red', label: '빨강' },
    { key: 'brown', label: '갈색' },
    { key: 'green', label: '초록' },
    { key: 'yellow', label: '노랑' },
    { key: 'purple', label: '보라' },
    { key: 'sky', label: '하늘색' },
];

export const ACCESSORIES = [
    { key: 'hat', label: '모자' },
    { key: 'glasses', label: '안경' },
    { key: 'sword', label: '칼' },
    { key: 'staff', label: '지팡이' },
    { key: 'bag', label: '가방' },
    { key: 'goggles', label: '고글' },
    { key: 'umbrella', label: '우산' },
    { key: 'book', label: '책' },
    { key: 'instrument', label: '등에 멘 악기' },
];
export const ACCESSORY_CHANCE = 0.6;
