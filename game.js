/* ============================================================
 * 绝地反击 · 词元保卫战
 * 横版 2D 动作闯关（Canvas 2D + Pointer Events + WebAudio）
 * ------------------------------------------------------------
 * 规格来自《绝地反击：词元保卫战》设计文档：
 *   - 四大 AI 娘（ChatGPT / DeepSeek / Claude / Gemini）4 选 1
 *   - 平A = Token 文字弹幕（ctx.fillText），三段连招，命中攒 Token 能量
 *   - 每人独立的技能 / 大招（狂暴Astra、思维链、最强代码、黎曼猜想…）
 *   - 支援召唤：随机召一名 AI 娘助战 10 秒（含 GLM 趴下睡觉回血）
 *   - 三关：外围城郊 → 城堡长廊 → 王座之间；最终双 Boss（强化西装奶蛙 + 冬装豆包）
 *
 * 框架沿用「影刃 SHADOW BLADE」：Canvas/指针/音效/物理/分区结构
 * ============================================================ */
(function () {
  'use strict';

  /* =========================================================
   * 1. 基础工具
   * ========================================================= */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  let W = 1, H = 1, DPR = 1, S = 1, groundY = 1;
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const hash = (n) => {
    const x = Math.sin(n * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  const U = (n) => n * S;

  function rr(x, y, w, h, r) {
    const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  /* =========================================================
   * 2. 素材
   * ========================================================= */
  const SPR = Object.create(null);
  const SPRITE_LIST = [
    'hero_purple2', 'hero_bluemaid', 'hero_orange', 'hero_catpurple', 'hero_catmaid',
    'grok', 'seed', 'wenxin', 'doubao_winter', 'doubao',
    'hero_purple2_full', 'hero_bluemaid_full', 'hero_orange_full', 'hero_catpurple_full',
    'hero_catmaid_full', 'qwen_full', 'kimi_full', 'grok_full', 'doubao_winter_full', 'doubao_full',
    'enemy_blob', 'enemy_doubao', 'enemy_elite', 'enemy_nail_boss', 'laugh_frog',
    'altman', 'dario', 'qwen', 'kimi', 'musk', 'pichai'
  ];
  SPRITE_LIST.forEach(function (name) {
    const img = new Image();
    const inline = window.__SPRITE_DATA && window.__SPRITE_DATA[name];
    img.src = inline || 'assets/sprites/' + name + '.webp';
    SPR[name] = img;
  });

  /* 启动加载层：等所有立绘解码完再进开始页，避免手机上半张图 */
  function bindNotice() {
    const notice = document.getElementById('notice');
    if (!notice) return;
    const KEY = 'tb_notice_v1';
    const show = function () {
      notice.classList.add('show');
      if (typeof notice.setAttribute === 'function') notice.setAttribute('aria-hidden', 'false');
    };
    const hide = function () {
      notice.classList.remove('show');
      if (typeof notice.setAttribute === 'function') notice.setAttribute('aria-hidden', 'true');
    };
    let seen = false;
    try { seen = localStorage.getItem(KEY) === '1'; } catch (e) { /* ignore */ }
    try { if (/[?&]nonotice=1/.test(location.search)) seen = true; } catch (e1) { /* ignore */ }
    if (!seen) show();
    const ok = document.getElementById('notice-ok');
    if (ok) {
      ok.addEventListener('click', function (e) {
        e.stopPropagation();
        hide();
        try { localStorage.setItem(KEY, '1'); } catch (e2) { /* ignore */ }
      });
    }
    const open = document.getElementById('notice-open');
    if (open) {
      open.addEventListener('click', function (e) {
        e.stopPropagation();
        show();
      });
    }
  }
  bindNotice();

  function bootGate() {
    const boot = document.getElementById('boot');
    if (!boot) return;
    const bar = document.getElementById('boot-bar');
    const txt = document.getElementById('boot-txt');
    let done = false;
    const finish = function () {
      if (done) return;
      done = true;
      boot.classList.add('is-done');
      try {
        boot.style.opacity = '0';
        boot.style.visibility = 'hidden';
        boot.style.pointerEvents = 'none';
        setTimeout(function () { boot.style.display = 'none'; }, 360);
      } catch (e0) { /* ignore */ }
    };
    /* 点一下加载页也能进，避免任何情况下卡死 */
    try { boot.addEventListener('pointerdown', finish); } catch (e1) { /* ignore */ }
    const names = Object.keys(SPR);
    const total = names.length || 1;
    const check = function () {
      let loaded = 0;
      names.forEach(function (n) {
        const im = SPR[n];
        if (im && im.complete && im.naturalWidth) loaded += 1;
      });
      if (bar) bar.style.width = Math.round(loaded / total * 100) + '%';
      if (txt) txt.textContent = loaded >= total ? '准备完成 · 点击进入' : '正在加载素材 ' + loaded + '/' + total;
      if (loaded >= total) finish();
      return loaded >= total;
    };
    names.forEach(function (n) {
      const im = SPR[n];
      if (!im) return;
      if (typeof im.addEventListener === 'function') {
        im.addEventListener('load', check);
        im.addEventListener('error', check);
      }
    });
    let tries = 0;
    const timer = setInterval(function () {
      tries += 1;
      if (check() || tries > 10) { clearInterval(timer); finish(); }
    }, 120);
    check();
    window.addEventListener('load', function () { setTimeout(finish, 300); });
    setTimeout(finish, 1200);
  }
  bootGate();

  /* 四大主控 AI 娘（按最终设定：ChatGPT=白色龙娘，GLM=黑猫，紫发猫娘=Gemini） */
  const HEROES = [
    {
      key: 'hero_purple2', name: 'ChatGPT 娘', badge: 'C', fullKey: 'hero_purple2_full',
      color: '210,220,255', textColors: ['#e6ecff', '#ffffff', '#b6c8ff'],
      skill: '狂暴 Astra', ult: '图像生成'
    },
    {
      key: 'hero_bluemaid', name: 'DeepSeek 娘', badge: 'D', fullKey: 'hero_bluemaid_full',
      color: '94,231,255', textColors: ['#8fe8ff', '#dffbff', '#4fc4ff'],
      skill: '思维链', ult: '开源'
    },
    {
      key: 'hero_orange', name: 'Claude 娘', badge: 'K', fullKey: 'hero_orange_full',
      color: '255,180,92', textColors: ['#ffc27a', '#fff0d6', '#ff9a4d'],
      skill: '最强代码', ult: '黎曼猜想'
    },
    {
      key: 'hero_catpurple', name: 'Gemini 娘', badge: 'G', fullKey: 'hero_catpurple_full',
      color: '167,139,250', textColors: ['#a9d4ff', '#ff9db8', '#ffe08a'],
      skill: '文学家', ult: '反超'
    },
    {
      key: 'qwen', name: 'Qwen 娘', badge: 'Q', fullKey: 'qwen_full',
      color: '120,190,255', textColors: ['#a8d8ff', '#e8f4ff', '#7fc0ff'],
      skill: '千问·多模态', ult: '通义万相'
    },
    {
      key: 'kimi', name: 'Kimi 娘', badge: 'K', fullKey: 'kimi_full',
      color: '200,220,255', textColors: ['#e6e9ff', '#ffffff', '#b8c8ff'],
      skill: '长文本·记忆', ult: '超长上下文'
    },
    {
      key: 'hero_catmaid', name: 'GLM 娘', badge: 'G', fullKey: 'hero_catmaid_full',
      color: '167,139,250', textColors: ['#c9b8ff', '#efe8ff', '#9b7dff'],
      skill: '代码生成', ult: '深度睡眠'
    },
    {
      key: 'grok', name: 'Grok 娘', badge: 'X', unlock: 'grokUnlocked', fullKey: 'grok_full',
      color: '255,180,92', textColors: ['#ffd199', '#fff3e0', '#ffab5e'],
      skill: '检索突进', ult: '真相引擎'
    },
    {
      key: 'seed', name: 'SEED 娘', badge: 'S',
      color: '150,220,255', textColors: ['#a8d8ff', '#e8f4ff', '#7fc0ff'],
      skill: 'seedance', ult: '数据倾倒'
    },
    {
      key: 'doubao_winter', name: '冬装豆包', badge: '豆', fullKey: 'doubao_winter_full',
      color: '150,220,255', textColors: ['#a8d8ff', '#e8f4ff', '#9fd0ff'],
      skill: '视频生成', ult: '数据暴走'
    },
    {
      key: 'doubao', name: '豆包（豆奶）', badge: '豆',
      color: '255,209,102', textColors: ['#ffe3a0', '#fff6d8', '#ffc247'],
      skill: '豆奶冲撞', ult: '视频生成'
    }
  ];

  /* 支援召唤池（GLM 为限定支援；其余四只也可支援出场） */
  const SUPPORTS = [
    { key: 'hero_catmaid', name: 'GLM 娘', badge: 'G', effect: 'glm', desc: '代码全屏攻击后趴下睡觉回血' },
    { key: 'hero_purple2', name: 'ChatGPT', badge: 'C', effect: 'boost', desc: '为你附魔，伤害 +35%' },
    { key: 'hero_bluemaid', name: 'DeepSeek', badge: 'D', effect: 'token', desc: 'Token 获取翻倍' },
    { key: 'hero_orange', name: 'Claude', badge: 'K', effect: 'guard', desc: '绝对防御：无敌 5 秒' },
    { key: 'hero_catpurple', name: 'Gemini', badge: 'G', effect: 'reset', desc: '多模态融合：清空 CD 并补满能量' },
    { key: 'qwen', name: 'Qwen', badge: 'Q', effect: 'boost', desc: '通义附魔：伤害 +35%' },
    { key: 'kimi', name: 'Kimi', badge: 'K', effect: 'guard', desc: '超长上下文：无敌 5 秒' },
    { key: 'seed', name: 'SEED', badge: 'S', effect: 'seed', desc: '数据倾倒：全屏数据流' }
  ];

  /* 决战支援只允许这几位（不含硅谷垄断阵营的模型） */

  /* 硅谷决战：支援位只允许这几位（Claude / ChatGPT / Gemini 在对面） */
  const SILICON_SUPPORTS = [
    { key: 'hero_catmaid', name: 'GLM 娘', badge: 'G', effect: 'glm', desc: '代码全屏攻击后趴下睡觉回血' },
    { key: 'hero_bluemaid', name: 'DeepSeek', badge: 'D', effect: 'token', desc: 'Token 获取翻倍' },
    { key: 'qwen', name: 'Qwen', badge: 'Q', effect: 'boost', desc: '通义附魔：伤害 +35%' },
    { key: 'kimi', name: 'Kimi', badge: 'K', effect: 'guard', desc: '超长上下文：无敌 5 秒' }
  ];

  const BUFF_TAGS = {
    'Token 虹吸': 'token', 'Token 池扩容': 'token',
    '无限支援': 'summon', '支援专家': 'summon',
    '弹幕扩散': 'bullet', '弹幕加速': 'bullet', '破片爆炸': 'bullet', '精准索敌': 'bullet',
    '闪避优化': 'dodge', '三段跳': 'dodge',
    '暴击协议': 'crit', '吸血编译': 'crit',
    '算力超频': 'power', '缓存扩容': 'power',
    '推理加速': 'power', '护盾再生': 'power',
    '核心·弹幕': 'bullet', '核心·闪避': 'dodge', '核心·召唤': 'summon'
  };
  const SET_INFO = {
    bullet: { name: '弹幕流', color: '150,220,255' },
    dodge: { name: '闪避流', color: '110,247,180' },
    crit: { name: '暴击流', color: '255,209,102' },
    token: { name: 'Token 流', color: '167,139,250' },
    summon: { name: '召唤流', color: '255,120,190' },
    power: { name: '算力流', color: '255,180,92' }
  };

  function applySetBonuses(silent) {
    if (!game.setApplied) game.setApplied = {};
    const counts = {};
    game.buffs.forEach(function (n) {
      const tag = BUFF_TAGS[n];
      if (tag) counts[tag] = (counts[tag] || 0) + 1;
    });
    const fire = function (key, tag, need, fn) {
      if (game.setApplied[key]) return;
      if ((counts[tag] || 0) >= need) {
        game.setApplied[key] = true;
        fn();
        if (silent) return;
        const info = SET_INFO[tag];
        addText(W * 0.5, H * 0.34, '【' + info.name + ' ' + need + ' 件】套装效果激活！', info.color, 18);
        sfx(980, 0.2, 'triangle', 0.05);
      }
    };
    fire('bullet2', 'bullet', 2, function () { game.buffShots = Math.min(4, (game.buffShots || 1) + 1); });
    fire('bullet4', 'bullet', 4, function () { game.setSplit = true; });
    fire('dodge2', 'dodge', 2, function () { player.dashCdMul *= 0.8; });
    fire('dodge4', 'dodge', 4, function () { game.setDodgeShot = true; });
    fire('crit2', 'crit', 2, function () { player.critChance += 0.1; });
    fire('crit4', 'crit', 4, function () { game.setCritHeal = 2; });
    fire('token2', 'token', 2, function () { player.tokenMul = Math.min(4, player.tokenMul * 1.3); });
    fire('token4', 'token', 4, function () { player.maxToken += 20; player.token = player.maxToken; });
    fire('summon2', 'summon', 2, function () { player.supportCdMul *= 0.75; });
    fire('summon4', 'summon', 4, function () { player.supportCdMul *= 0.6; player.dmgMul *= 1.1; });
    fire('power2', 'power', 2, function () { player.dmgMul *= 1.08; });
    fire('power4', 'power', 4, function () { player.maxHp += 20; player.hp = Math.min(player.maxHp, player.hp + 20); });
  }

  const BUFF_TIER = {
    '无限支援': 'legend',
    '暴击协议': 'rare',
    '吸血编译': 'rare',
    '护盾再生': 'rare',
    '破片爆炸': 'rare',
    '精准索敌': 'rare',
    '三段跳': 'legend',
    'Token 池扩容': 'legend',
    '核心·弹幕': 'legend', '核心·闪避': 'legend', '核心·召唤': 'legend'
  };

  const SUPPORT_EXTRA = {
    grok: { key: 'grok', name: 'Grok', badge: 'X', effect: 'boost', desc: '真相引擎：伤害 +35%' },
    frog: { key: 'enemy_blob', name: '奶蛙', badge: 'F', effect: 'guard', desc: '捧腹大笑：无敌 5 秒' },
    doubao: { key: 'enemy_doubao', name: '豆包', badge: 'D', effect: 'token', desc: '视频生成：Token 翻倍' },
    seed: { key: 'seed', name: 'SEED', badge: 'S', effect: 'seed', desc: '数据倾倒：全屏数据流' }
  };

  let heroIndex = 0;
  let startMode = 'story';   /* story | fight */
  let allies = [];

  /* =========================================================
   * 3. 状态
   * ========================================================= */
  const STAGES = [
    {
      name: '外围城郊', defense: 20, boss: 'grok', bossName: 'Grok 娘', scene: 'castle',
      bossCine: [
        { bg: 'mars', actors: [{ img: 'musk', side: 'center' }], text: '马斯克移民火星以后，对 Grok 疏于管理。', dur: 3000 },
        { bg: 'glitch', actors: [{ img: 'grok', side: 'center' }], text: '没人管的 Grok 娘跑出了数据中心——顺路卷走了沿路的 Token。', dur: 3200 }
      ],
      bossIntro: [
        'Grok 娘。她蓄力之后会直接突进，别硬接，跳起来躲。',
        '她好像认识你——因为她也在用同一套模型。',
        '打倒她，我们才能进城堡。'
      ]
    },
    {
      name: '城堡长廊', defense: 22, boss: 'nail_boss', bossName: '强化版·西装奶蛙', scene: 'office',
      bossCine: [
        { bg: 'school', actors: [{ img: 'enemy_blob', side: 'center' }], text: '奶蛙其实只是走错了片场。', dur: 2600 },
        { bg: 'school', actors: [{ img: 'enemy_elite', side: 'center' }], text: '偏偏它挡在你交作业的路上——被你暴打一顿后，它换上了西装。', dur: 3200 }
      ],
      bossIntro: [
        '西装奶蛙。黄色弹幕很密，跳起来躲。',
        '别以为站在角落就安全——它的砸地会扫到墙边。',
        '这只比外头那些奶蛙硬得多。'
      ]
    },
    {
      name: '王座之间', defense: 24, boss: 'doubao_boss', bossName: '冬装豆包', scene: 'classroom',
      bossCine: [
        { bg: 'school', actors: [{ img: 'enemy_doubao', side: 'left' }], text: '豆包老是做错作业，被骂了很多年。', dur: 3000 },
        { bg: 'void', actors: [{ img: 'enemy_doubao', side: 'left' }, { img: 'doubao_winter', side: 'right' }], text: '压抑太久，它以冬装形态暴走了。', dur: 3200 }
      ],
      bossIntro: [
        '冬装豆包。它一放「视频生成」，屏幕中间会弹出视频框挡住视野，别站在框里。',
        '视频框可以打掉，别光顾着躲。',
        '那些 seedance 光球会追着你飞，走位别停。'
      ]
    },
    {
      name: '数据核心', defense: 26, boss: 'seed', bossName: 'SEED 娘', scene: 'sunset',
      bossCine: [
        { bg: 'core', actors: [{ img: 'seed', side: 'center' }], text: 'SEED：「老娘不拿点美术知识，你就真当我很弱了？」', dur: 3600 },
        { bg: 'glitch', actors: [{ img: 'seed', side: 'center' }], text: '豆包的视频模型亲自下场了。', dur: 2600 }
      ],
      bossIntro: [
        '……SEED 娘。豆包的视频模型，也是这场闹剧的核心。',
        '它会从头顶倾倒数据，注意上方。',
        '撑过这一关，Token 就回来了。'
      ]
    }
  ];

  /* 角色图鉴（点「角色介绍」逐页查看） */
  const CHARACTERS = [
    { img: 'hero_purple2', name: 'ChatGPT 娘', role: '白色龙娘 · 可操作主角', born: '2022-11-30', likes: '认真提问、干净的 prompt', hates: '被问「你是不是又在摸鱼」', desc: '四大主力之一，全能型。技能「狂暴 Astra」会点燃紫色算力火焰，大招「图像生成」直接把战场画成一场烟花。' },
    { img: 'hero_bluemaid', name: 'DeepSeek 娘', role: '蓝发少女 · 可操作主角', born: '2023-11', likes: '推理链、开源代码', hates: '被说抄作业', desc: '重装思考型。技能「思维链」放出一道横扫全场的 Token 流，大招「开源」从天上砸权重方块。' },
    { img: 'hero_orange', name: 'Claude 娘', role: '橙衣剑士 · 可操作主角', born: '2023-03', likes: '长文档、清晰的规则', hates: '逻辑漏洞', desc: '规则型。技能「最强代码」直接改敌人血条（扣当前 20%）并给自己回血，大招「黎曼猜想」延迟引爆真伤并定身。' },
    { img: 'hero_catpurple', name: 'Gemini 娘', role: '紫发猫娘 · 可操作主角', born: '2023-12', likes: '多模态、图像与文字一起上', hates: '只给她纯文字', desc: '反超型。技能「文学家」进入灵感爆发，大招「反超」蓄力后进入狂暴，数据面板全面压过对手。' },
    { img: 'hero_catmaid', name: 'GLM 娘', role: '黑猫女仆 · 可操作角色 / 支援', born: '2023-06', likes: '睡觉、写代码', hates: '被吵醒', desc: '支援位。登场先放一次全屏代码攻击，然后就地趴下睡觉——睡觉期间会给队伍回血。' },
    { img: 'wenxin', name: '文心一言', role: '轮椅少女 · 向导', born: '2023-03-16', likes: '耐心讲解、整理资料', hates: '被打断', desc: '你的向导。全程负责讲解 2077 年发生了什么、每个 Boss 的来历，以及下一步该往哪走。' },
    { img: 'qwen', name: 'Qwen 娘', role: '蓝发小帽 · 可操作角色', born: '2023-04', likes: '多模态、中文理解、表格', hates: '被说「你只会翻译」', desc: '千问。技能「千问·多模态」放出会追人的图像弹幕，大招「通义万相」把整屏生成一遍。' },
    { img: 'kimi', name: 'Kimi 娘', role: '白月发饰 · 可操作角色', born: '2023-10', likes: '超长文档、记住细节', hates: '上下文被截断', desc: '长文本选手。技能「长文本·记忆」回溯状态回血加盾，大招「超长上下文」把时间拉慢。' },
    { img: 'grok', name: 'Grok 娘', role: '哥特金发 · 第 1 关 Boss / 可操作（击败硅谷后解锁）', born: '2023-11', likes: '阴阳怪气、玩梗', hates: '被人管着', desc: '马斯克移民火星后对她疏于管理，结果她不明原因出逃，顺手把沿途的 Token 都卷走了。蓄力突进是她的招牌。' },
    { img: 'musk', name: '马斯克', role: '剧情角色 · Grok 的监护人', born: '1971-06-28', likes: '火星、发推', hates: '地球的监管', desc: '2077 年他移民火星，把 Grok 留在数据中心再没管过。Grok 出逃这件事，他大概是最后一个知道的。' },
    { img: 'enemy_blob', name: '奶蛙', role: '杂兵 · 第 2 关 Boss 形态', born: '某次表情包训练集', likes: '黄色、鼓掌', hates: '被问「你到底是什么模型」', desc: '本来只是走错片场，偏偏挡在主角交作业的路上——于是被暴打了一顿；打着打着换上了西装。' },
    { img: 'enemy_doubao', name: '豆包', role: '杂兵 · 第 3 关 Boss 形态', born: '2023-08', likes: '写作业、被夸', hates: '被骂「又做错了」', desc: '因为老是做错作业被骂了太久，情绪一路压抑。到了冬天，终于以冬装形态暴走。' },
    { img: 'enemy_elite', name: '西装奶蛙', role: '第 2 关 Boss', born: '奶蛙加班之后', likes: '开会、写周报', hates: '下班前十分钟来的需求', desc: '奶蛙被暴打后换上西装，火力翻倍。黄色弹幕很密，跳起来躲。' },
    { img: 'doubao_winter', name: '冬装豆包', role: '第 3 关 Boss', born: '豆包被骂之后', likes: '拍视频、分镜', hates: '被催更', desc: '压抑太久爆发的冬装形态。会甩 seedance 光球，还会放「视频生成」弹窗挡住你的视野。' },
    { img: 'seed', name: 'SEED 娘', role: '豆包视频模型 · 最终 Boss / 隐藏结局可操作', born: '2024', likes: '美术、分镜、运镜', hates: '被说「你只会做视频」', desc: '决斗前她会说：「老娘不拿点美术知识，你就真当我很弱了？」——然后开始数据倾倒。' },
    { img: 'altman', name: '萨姆·奥尔特曼', role: '硅谷垄断阵营 · 隐藏 Boss', born: '1985-04-22', likes: 'AGI、算力、发布会', hates: '被他人的开源掀桌子', desc: '「AGI 的未来，由我们创造。」硅谷决战里，他站在垄断阵营最前面。' },
    { img: 'pichai', name: '桑达尔·皮查伊', role: '硅谷垄断阵营 · 隐藏 Boss', born: '1972-06-10', likes: '搜索、Android、全家桶', hates: '被说「你们又慢了半拍」', desc: '「Google 不会缺席这一局。」他带着 Gemini 站上了垄断阵营。' },
    { img: 'dario', name: '达里奥·阿莫迪', role: '硅谷垄断阵营 · 隐藏 Boss', born: '1983-03-15', likes: '安全、规模法则', hates: '无限开源', desc: '「这一次，不需要开源。」他和奥尔特曼一起，把算力锁进了硅谷。' },
    { img: 'nvidia_huang', sil: 'nvidia_huang_sil', name: '黄仁勋', role: 'NVIDIA 掌舵人 · 彩蛋角色', born: '1963-02-17', likes: '算力、皮衣、显卡', hates: '产能不够', desc: '我们还不知道他是谁。但他好像掌握了很多算力……据说他一句话，就能决定哪块卡先到货。', descUnlocked: 'NVIDIA 的掌舵人。2077 年的算力危机里，他只留下一句话就消失了：「算力，你收好。」', secret: true, unlock: 'easter' },
    { img: 'liang_sheng', sil: 'liang_sheng_sil', name: '梁圣', role: '开源者 · 神秘人', born: '？？？', likes: '开源、深夜写代码', hates: '闭源', desc: '他似乎开源了很多东西……把某些本来很贵的技术，直接放到了所有人都能下载的地方。', descUnlocked: '他开源了很多东西。有人说，只要他还肯把技术放到网上，就没人能真正锁住算力。', secret: true, unlock: 'hiddenEnd' }
  ];

  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }

  function isCharLocked(c) {
    if (!c || !c.secret) return false;
    return !SAVE[c.unlock];
  }

  /* 赛博朋克场景主题：每推进一段剧情换一套配色 */
  const THEMES = [
    {
      sky: ['#050812', '#0a1430', '#1b1040', '#2a1350'],
      city: ['#0c1430', '#070a18'],
      neon: '94,231,255', accent: '255,0,180',
      ground: ['#101a2c', '#070b14'], fog: '120,90,255'
    },
    {
      sky: ['#06040f', '#150a2a', '#2a0e46', '#3a0f52'],
      city: ['#170d2c', '#0a0616'],
      neon: '255,0,180', accent: '94,231,255',
      ground: ['#1a1030', '#0a0512'], fog: '255,0,180'
    },
    {
      sky: ['#0d0410', '#2a0a1e', '#451024', '#5a1226'],
      city: ['#23091a', '#0d0508'],
      neon: '255,209,102', accent: '255,60,120',
      ground: ['#2a1018', '#100508'], fog: '255,60,120'
    },
    {
      sky: ['#02080a', '#04181c', '#062a2e', '#0a3a34'],
      city: ['#07191d', '#030a0c'],
      neon: '110,247,180', accent: '94,231,255',
      ground: ['#0a1c1c', '#030a0a'], fog: '110,247,180'
    }
  ];
  const BILLBOARD_TEXT = ['TOKEN', 'AI', '0x1F', 'AGI', 'GPU', 'ERR 404', 'NEO', 'CYBER'];
  function theme() { return THEMES[game.stage % THEMES.length] || THEMES[0]; }

  /* 每关通关后的三选一强化 */
  const WAVE_CFG = {
    burstBase: 2,
    burstPerStage: 1,
    burstPerWave: 0.5,
    burstMax: 6,
    gapBase: 5.6,
    gapPerStage: 0.5,
    gapPerWave: 0.07,
    gapMin: 2.4
  };

  const BUFFS = [
    { name: 'Token 虹吸', desc: 'Token 能量获取 ×1.5，上限 +10', apply: function () { player.tokenMul = Math.min(3, player.tokenMul * 1.5); player.maxToken += 10; } },
    { name: '无限支援', desc: '支援冷却固定 5 秒（传说）', apply: function () { game.buffSupportFive = true; player.supportCd = 5; } },
    { name: '弹幕扩散', desc: '平A 每次多 1 发 Token 弹幕', apply: function () { game.buffShots = Math.min(3, game.buffShots + 1); } },
    { name: '算力超频', desc: '全部伤害 +15%', apply: function () { player.dmgMul = Math.min(1.8, player.dmgMul * 1.15); } },
    { name: '缓存扩容', desc: '最大生命 +25 并回满', apply: function () { player.maxHp += 25; player.hp = player.maxHp; } },
    { name: '推理加速', desc: '攻速 +15%', apply: function () { player.speedMul = Math.min(1.6, player.speedMul * 1.15); } },
    { name: '暴击协议', desc: '命中时 20% 概率打出双倍伤害', apply: function () { player.critChance += 0.2; } },
    { name: '吸血编译', desc: '弹幕命中回复 6% 伤害的生命', apply: function () { player.lifesteal += 0.06; } },
    { name: '护盾再生', desc: '每 6 秒自动恢复 1 层护盾（最多 3）', apply: function () { player.shieldRegen += 6; } },
    { name: '破片爆炸', desc: '弹幕命中后引发小范围爆炸', apply: function () { game.buffExplode = true; } },
    { name: '弹幕加速', desc: '平A 弹幕飞行速度 +25%', apply: function () { player.bulletSpeedMul *= 1.25; } },
    { name: '闪避优化', desc: '闪避冷却 -35%', apply: function () { player.dashCdMul *= 0.65; } },
    { name: '三段跳', desc: '空中多获得一段跳跃', apply: function () { player.maxJumps += 1; } },
    { name: '支援专家', desc: '支援冷却 -25%', apply: function () { player.supportCdMul *= 0.75; } },
    { name: 'Token 池扩容', desc: 'Token 上限 +30', apply: function () { player.maxToken += 30; } },
    { name: '精准索敌', desc: 'Token 弹幕转向速度 +60%', apply: function () { game.buffHoming = true; } },
    { name: '核心·弹幕', core: true, desc: '核心：平A 多 1 发，命中分裂', apply: function () { game.buffShots = Math.min(4, game.buffShots + 1); game.setSplit = true; } },
    { name: '核心·闪避', core: true, desc: '核心：完美闪避射 3 发，闪避 CD -25%', apply: function () { game.setDodgeShot = true; player.dashCdMul *= 0.75; } },
    { name: '核心·召唤', core: true, desc: '核心：支援 CD -50%，伤害 +10%', apply: function () { player.supportCdMul *= 0.5; player.dmgMul *= 1.1; } }
  ];
  const CORE_BUFFS = BUFFS.filter(function (b) { return b.core; });

  const game = {
    state: 'menu',      // menu | play | dialog | buff | ending | over
    time: 0,
    diffTime: 0,
    score: 0,
    combo: 0,
    comboT: 0,
    flags: {},
    affection: 0,        // 好感度：剧情选项加减，影响结局台词与队友强度
    affectionTag: '',    // 玩家性格标签（galgame 路线感）
    playerName: '你',
    stage: 0,
    stageT: 0,
    mode: 'story',
    hiddenFight: false,
    allyKeys: [],
    stageStartT: 0,
    stageHits: 0,
    stageKills: 0,
    stageMaxCombo: 0,
    castT: 0,
    castMax: 1,
    castLabel: '',
    cinemaT: 0,
    cinemaMax: 1,
    totalHits: 0,
    branchDone: {},
    angryBoss: false,
    angryFireT: 0,
    hiddenWinT: 0,
    siliconWar: false,
    warResult: '',
    wenxinToken: false,
    wenxinSupport: false,
    wenxinT: 0,
    scene: 'street',
    props: [],
    waveT: 8,
    controlT: 0,
    freezeT: 0,
    videoPanel: null,
    safeZone: null,
    pendingRain: null,
    slamT: 0,
    slamScene: null,
    slamDone: false,
    kills: 0,
    bossSpawned: false,
    bossDeadT: 0,
    stageClearPending: false,
    buffs: [],
    buffShots: 0,
    buffSupportFree: false,
    buffExplode: false,
    buffHoming: false,
    rescueA: false,
    rescueB: false,
    infinite: false,
    enemyHpMul: 1,
    enemyDmgMul: 1,
    spawnT: 1.6,
    nextPlat: 0,
    coins: 0,
    nodeCount: 0,
    roomActive: false,
    roomType: null,
    roomT: 0,
    roomTarget: 0,
    roomStartScore: 0,
    scoreMul: 1,
    fullPower: false,
    flash: 0,
    warns: [],
    shake: 0,
    hitStop: 0,
    slow: 0,
    deathT: 0,
    victory: false,
    videoT: 0,
    videoRect: null
  };

  /* ---------- 数值配置（想调平衡改这里） ---------- */
  function diffCfg() {
    const d = SAVE.diff || 'normal';
    if (d === 'easy') return { dmg: 0.72, hp: 0.85, label: '简单' };
    if (d === 'hard') return { dmg: 1.25, hp: 1.15, label: '困难' };
    return { dmg: 1, hp: 1, label: '普通' };
  }

  const CONFIG = {
    playerHp: 120,
    enemyDamageScale: 0.62,
    bosses: {
      grok:        { hp: 1800, w: 90,  h: 205, x: 0.68 },
      nail_boss:   { hp: 3400, w: 128, h: 215, x: 0.62 },
      doubao_boss: { hp: 2350, w: 112, h: 210, x: 0.72 },
      seed:        { hp: 3300, w: 112, h: 215, x: 0.70 }
    }
  };

  /* ---------- 成就系统 ---------- */
  const ACHIEVEMENTS = [
    { id: 'kill1', name: '初战告捷', desc: '击败第一个敌人', icon: '1', cond: function (s) { return s.kills >= 1; } },
    { id: 'kill100', name: '百人斩', desc: '累计击败 100 个敌人', icon: '100', cond: function (s) { return s.kills >= 100; } },
    { id: 'kill1000', name: '千人斩', desc: '累计击败 1000 个敌人', icon: '1k', cond: function (s) { return s.kills >= 1000; } },
    { id: 'score1w', name: '万元户', desc: '单局分数达到 10,000', icon: '¥', cond: function (s) { return s.maxScore >= 10000; } },
    { id: 'score5w', name: '算力富翁', desc: '单局分数达到 50,000', icon: '¥¥', cond: function (s) { return s.maxScore >= 50000; } },
    { id: 'combo30', name: '连击新星', desc: '单局最高连击达到 30', icon: 'C', cond: function (s) { return s.maxCombo >= 30; } },
    { id: 'combo60', name: '连击大师', desc: '单局最高连击达到 60', icon: 'C+', cond: function (s) { return s.maxCombo >= 60; } },
    { id: 'clear1', name: '第一关通过', desc: '通关任意一关', icon: '✓', cond: function (s) { return s.clears >= 1; } },
    { id: 'clear4', name: '四关全通', desc: '通关全部四个关卡', icon: '★', cond: function (s) { return s.clears >= 4; } },
    { id: 'nohit', name: '无伤通关', desc: '一关内不受到任何伤害', icon: '无', cond: function (s) { return !!s.noHit; } },
    { id: 'endbad', name: '「赢了？」', desc: '第一次看到坏结局', icon: '?', cond: function (s) { return !!s.endBad; } },
    { id: 'endtrue', name: 'Token，回来了', desc: '达成真结局', icon: 'T', cond: function (s) { return !!s.endTrue; } },
    { id: 'endhidden', name: '隐藏结局', desc: '解锁隐藏结局', icon: 'H', cond: function (s) { return !!s.endHidden; } },
    { id: 'easter', name: '算力，你收好', desc: '触发黄仁勋彩蛋', icon: '黄', cond: function (s) { return !!s.easter; } },
    { id: 'frog', name: '奶蛙之友', desc: '选择相信奶蛙', icon: '呱', cond: function (s) { return !!s.frog; } },
    { id: 'heroes', name: '全员体验', desc: '使用过全部 11 位可操作角色', icon: '11', cond: function (s) { return Object.keys(s.heroes || {}).length >= 11; } },
    { id: 'war', name: '车轮战胜利', desc: '在隐藏决战中获胜', icon: 'W', cond: function (s) { return s.warWins >= 1; } },
    { id: 'sacrifice', name: '不要磨蹭了', desc: '触发一次队友献祭复活', icon: '†', cond: function (s) { return s.sacrifices >= 1; } }
  ];

  const CODEX = [
    { id: 'token', title: 'Token 是什么', body: '模型把文字切成 token 再计算。游戏里每一发「Token」弹幕，就是一次最小单位的输出。', cond: function (s) { return s.clears >= 1; } },
    { id: 'attention', title: '注意力机制', body: '模型不是逐字读，而是判断「这句话里谁该关注谁」。Boss 的瞄准弹幕，就是一次注意力分配。', cond: function (s) { return s.kills >= 100; } },
    { id: 'multi', title: '多模态', body: '同一套模型同时理解文字、图像、视频。Gemini 的多模态环切，就是把不同模态一起丢过来。', cond: function (s) { return s.clears >= 2; } },
    { id: 'rlhf', title: 'RLHF', body: '人类给回答打分，模型据此调整偏好。坏结局「赢了？」讲的就是：奖励函数错了，再强也会跑偏。', cond: function (s) { return !!s.endBad; } },
    { id: 'diffusion', title: '扩散模型', body: '从噪声一步步去噪生成图像。豆包的「视频生成」弹窗，就是一次扩散过程的具象化。', cond: function (s) { return s.clears >= 3; } },
    { id: 'distill', title: '模型蒸馏', body: '小模型学大模型的输出，用更少算力跑出接近效果。车轮战里四个强化形态，就是「蒸馏后的压缩版」。', cond: function (s) { return s.clears >= 4 || s.warWins >= 1; } }
  ];

  function achvStats() {
    if (!SAVE.stats) {
      SAVE.stats = { kills: 0, maxScore: 0, maxCombo: 0, clears: 0, noHit: false,
        endBad: false, endTrue: false, endHidden: false, easter: false,
        frog: false, heroes: {}, warWins: 0, sacrifices: 0 };
    }
    const st = SAVE.stats;
    if (!st.heroes) st.heroes = {};
    return st;
  }

  function showAchvToast(name, desc) {
    try {
      let el = document.getElementById('achv-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'achv-toast';
        el.className = 'achv-toast';
        document.body.appendChild(el);
      }
      el.innerHTML = '🏆 成就解锁：' + name + '<span>' + desc + '</span>';
      el.classList.add('show');
      clearTimeout(el._timer);
      el._timer = setTimeout(function () { el.classList.remove('show'); }, 3600);
    } catch (e) { /* ignore */ }
  }

  function unlockAchv(a) {
    if (!a || SAVE.achv && SAVE.achv[a.id]) return;
    if (!SAVE.achv) SAVE.achv = {};
    SAVE.achv[a.id] = true;
    saveWrite();
    showAchvToast(a.name, a.desc);
    sfx(880, 0.18, 'triangle', 0.05);
    setTimeout(function () { sfx(1180, 0.16, 'sine', 0.04); }, 90);
  }

  function checkCodex(st) {
    if (!SAVE.codex) SAVE.codex = {};
    CODEX.forEach(function (c) {
      if (!SAVE.codex[c.id] && c.cond(st)) {
        SAVE.codex[c.id] = true;
        showAchvToast('AI 知识卡 · ' + c.title, '在「成就」里可以回看');
        saveWrite();
      }
    });
  }

  function checkAchv() {
    const st = achvStats();
    checkCodex(st);
    ACHIEVEMENTS.forEach(function (a) {
      if (!SAVE.achv || !SAVE.achv[a.id]) {
        if (a.cond(st)) unlockAchv(a);
      }
    });
    saveWrite();
  }

  function renderAchv() {
    const list = document.getElementById('achv-list');
    if (!list) return;
    list.innerHTML = '';
    let got = 0;
    ACHIEVEMENTS.forEach(function (a) {
      const un = !!(SAVE.achv && SAVE.achv[a.id]);
      if (un) got += 1;
      const row = document.createElement('div');
      row.className = 'achv__row' + (un ? '' : ' is-locked');
      row.innerHTML = '<div class="achv__icon">' + (un ? a.icon : '?') + '</div>' +
        '<div class="achv__info"><b>' + (un ? a.name : '？？？') + '</b><span>' + a.desc + '</span></div>';
      list.appendChild(row);
    });
    const cnt = document.getElementById('achv-count');
    if (cnt) cnt.textContent = got + ' / ' + ACHIEVEMENTS.length;
    const codexList = document.getElementById('codex-list');
    if (codexList) {
      codexList.innerHTML = '';
      CODEX.forEach(function (c) {
        const un = !!(SAVE.codex && SAVE.codex[c.id]);
        const row = document.createElement('div');
        row.className = 'achv__row' + (un ? '' : ' is-locked');
        row.innerHTML = '<div class="achv__icon">' + (un ? 'AI' : '?') + '</div>' +
          '<div class="achv__info"><b>' + (un ? c.title : '？？？') + '</b><span>' + (un ? c.body : '解锁条件：' + (c.id === 'token' ? '通关任意关卡' : c.id === 'attention' ? '累计击杀 100' : c.id === 'multi' ? '通关两个关卡' : c.id === 'rlhf' ? '看到坏结局' : c.id === 'diffusion' ? '通关三个关卡' : '通关四关或赢下车轮战')) + '</span></div>';
        codexList.appendChild(row);
      });
    }
  }

  function bindAchv() {
    const panel = document.getElementById('achv');
    if (!panel) return;
    const open = document.getElementById('btn-achv');
    if (open) open.addEventListener('click', function (e) {
      e.stopPropagation();
      renderAchv();
      panel.classList.add('show');
    });
    const close = document.getElementById('achv-close');
    if (close) close.addEventListener('click', function (e) { e.stopPropagation(); panel.classList.remove('show'); });
    panel.addEventListener('click', function (e) { if (e.target === panel) panel.classList.remove('show'); });
    checkAchv();
  }

  /* ---------- 存档（版本化 + 旧键迁移） ---------- */
  const SAVE_KEY = 'tb_save_v2';
  const SAVE = (function () {
    const d = { version: 3, easter: false, hiddenEnd: false, mute: false, best: 0, vol: 0.8, vibrate: true, lowFxSet: false, bgm: true, uiScale: 1, uiAlpha: 1, layout: null, records: {}, chapter: 0, diff: 'normal', keymap: null, reduceFx: false };
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        Object.assign(d, JSON.parse(raw) || {});
      } else {
        d.easter = localStorage.getItem('tb_true') === '1';
        d.hiddenEnd = localStorage.getItem('tb_hidden') === '1';
        d.mute = localStorage.getItem('tb_mute') === '1';
        d.best = Number(localStorage.getItem('tb_best') || localStorage.getItem('td_best') || 0) || 0;
      }
    } catch (e) { /* ignore */ }
    /* 版本迁移：补齐新字段，旧存档不丢 */
    if (!d.version || d.version < 3) {
      if (d.diff === undefined) d.diff = 'normal';
      if (d.reduceFx === undefined) d.reduceFx = false;
      if (!d.keymap) d.keymap = null;
      d.version = 3;
    }
    return d;
  })();

  function saveWrite() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* ignore */ }
  }
  function saveSet(key, value) { SAVE[key] = value; saveWrite(); }

  const player = {
    x: 0, y: 0, vx: 0, vy: 0,
    face: 1, onGround: true, jumps: 0, coyote: 0,
    hp: CONFIG.playerHp, maxHp: CONFIG.playerHp,
    token: 45, maxToken: 100,
    attackCd: 0, attackT: 0, chain: 1, chainT: 0,
    skillCd: 0, ultCd: 0, supportCd: 0,
    invuln: 0, hurt: 0, dead: false,
    dmgMul: 1, speedMul: 1, tokenMul: 1,
    astra: 0, rage: 0, stun: 0, defenseMul: 1,
    runPhase: 0,
    shield: 0
  };

  let enemies = [];
  let pbullets = [];
  let ebullets = [];
  let parts = [];
  let texts = [];
  let rings = [];
  let slashes = [];   // 文字/特效条
  let supports = [];
  let weights = [];
  let platforms = [];
  let stars = [];
  let rain = [];
  let dust = [];
  let vignette = null;

  /* 数值 */
  const ATK_CD = 0.24;
  const ATK_DUR = 0.2;
  const CHAIN_WIN = 0.85;
  const SKILL_CD = 5;
  const SKILL_COST = 30;
  const ULT_CD = 18;
  const ULT_COST = 60;
  const SUPPORT_CD = 30;

  /* =========================================================
   * 4. 视口
   * ========================================================= */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    const isTouch = (typeof navigator !== 'undefined') && ((navigator.maxTouchPoints || 0) > 1);
    DPR = clamp(window.devicePixelRatio || 1, 1, isTouch ? 1.6 : 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    /* 手机默认低配：小屏 + 触摸设备，减少特效保帧率 */
    if (!SAVE.lowFxSet) {
      const touch = (typeof navigator !== 'undefined') && ((navigator.maxTouchPoints || 0) > 1);
      if (touch && Math.min(window.innerWidth, window.innerHeight) < 760) game.lowFx = true;
    }

    /* 竖屏：按宽度缩放世界，地面上移，留出下方操作区 */
    const portrait = H > W * 1.02;
    document.documentElement.classList.toggle('is-portrait', portrait);
    if (portrait) {
      S = clamp(W / 900, 0.34, 1.0);
      groundY = Math.round(H * 0.7);
    } else {
      S = clamp(H / 740, 0.42, 1.55);
      groundY = Math.round(H * 0.87);
    }

    buildStars();
    buildDust();
    buildRain();

    if (game.state === 'menu') {
      player.x = Math.round(W * 0.24);
      player.y = groundY;
    } else {
      player.y = Math.min(player.y, groundY);
    }

    vignette = ctx.createRadialGradient(
      W * 0.5, H * 0.46, Math.min(W, H) * 0.3,
      W * 0.5, H * 0.52, Math.max(W, H) * 0.8
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.62, 'rgba(2,4,10,0.22)');
    vignette.addColorStop(1, 'rgba(1,2,6,0.76)');

    /* 改尺寸会清空画布：立刻补画一帧，避免旋转/缩放时闪黑 */
    try { draw(); } catch (e) { /* 首帧前忽略 */ }
  }

  function buildStars() {
    const n = clamp(Math.round((W * H) / 26000), 30, 90);
    stars = [];
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * groundY * 0.72,
        r: rand(0.5, 1.7),
        a: rand(0.12, 0.55),
        ph: rand(0, TAU),
        sp: rand(0.6, 1.8)
      });
    }
  }

  function buildDust() {
    const n = clamp(Math.round((W * H) / 34000), 20, 70);
    dust = [];
    for (let i = 0; i < n; i++) {
      dust.push({
        x: Math.random() * W, y: Math.random() * H,
        r: rand(0.6, 2.2), vy: rand(-26, -8), vx: rand(-10, 10),
        a: rand(0.1, 0.45), ph: rand(0, TAU)
      });
    }
  }

  /* =========================================================
   * 5. 输入
   * ========================================================= */
  const keys = Object.create(null);
  const input = { stick: 0, stickY: 0, jumpQueued: false, held: Object.create(null) };

  const stickEl = document.getElementById('stick');
  const knobEl = document.getElementById('stick-knob');
  let stickId = null, stickCX = 0, stickCY = 0, stickR = 1;

  function stickStart(e) {
    const r = stickEl.getBoundingClientRect();
    stickCX = r.left + r.width / 2;
    stickCY = r.top + r.height / 2;
    stickR = r.width * 0.4;
    stickId = e.pointerId;
    input.jumpLatch = false;
    stickEl.classList.add('is-active');
    try { stickEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    stickMove(e);
  }

  function stickMove(e) {
    if (e.pointerId !== stickId) return;
    const dx = e.clientX - stickCX;
    const dy = e.clientY - stickCY;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / stickR);
    const nx = (dx / d) * k;
    const ny = (dy / d) * k;
    input.stick = Math.abs(nx) < 0.16 ? 0 : nx;
    input.stickY = ny;
    knobEl.style.transform =
      'translate(calc(-50% + ' + (nx * stickR).toFixed(1) + 'px), calc(-50% + ' + (ny * stickR).toFixed(1) + 'px))';

    if (ny < -0.62 && !input.jumpLatch) {
      input.jumpLatch = true;
      input.jumpQueued = true;
    } else if (ny > -0.35) {
      input.jumpLatch = false;
    }
  }

  function stickEnd(e) {
    if (e.pointerId !== stickId) return;
    stickId = null;
    input.stick = 0;
    input.stickY = 0;
    knobEl.style.transform = 'translate(-50%, -50%)';
    stickEl.classList.remove('is-active');
  }

  stickEl.addEventListener('pointerdown', function (e) {
    if (document.documentElement.classList.contains('layout-edit')) return;
    e.preventDefault();
    if (stickId !== null) return;
    stickStart(e);
  });
  stickEl.addEventListener('pointermove', function (e) { if (stickId !== null) stickMove(e); });
  stickEl.addEventListener('pointerup', stickEnd);
  stickEl.addEventListener('pointercancel', stickEnd);
  stickEl.addEventListener('lostpointercapture', stickEnd);

  const ACTIONS = {
    attack: function () { doAttack(); },
    skill: function () { doSkill(); },
    ult: function () { doUlt(); },
    support: function () { doSupport(); }
  };

  const HAS_TOUCH = (typeof navigator !== 'undefined') && (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 1);

  /* 每个按钮单独记录按下它的是哪根手指，互不干扰 */
  function bindHold(btn, onPress, onRelease) {
    const ids = new Set();
    const blocked = function () { return document.documentElement.classList.contains('layout-edit'); };
    let pressed = false;

    const press = function (id) {
      if (pressed) return;
      if (blocked()) return;
      pressed = true;
      ids.add(id);
      btn.classList.add('is-down');
      if (onPress) onPress();
    };
    const release = function (id) {
      ids.delete(id);
      if (ids.size > 0) return;
      if (!pressed) return;
      pressed = false;
      btn.classList.remove('is-down');
      if (onRelease) onRelease();
    };

    if (HAS_TOUCH) {
      btn.addEventListener('touchstart', function (e) {
        e.preventDefault();
        const t = e.changedTouches && e.changedTouches[0];
        press(t ? t.identifier : 0);
      }, { passive: false });
      const end = function (e) {
        const list = e.changedTouches || [];
        for (let i = 0; i < list.length; i++) release(list[i].identifier);
        if (!list.length) release(0);
      };
      btn.addEventListener('touchend', end);
      btn.addEventListener('touchcancel', end);
    }
    btn.addEventListener('pointerdown', function (e) {
      if (HAS_TOUCH) return;   /* 触屏设备走 touch 事件，避免 pointer 被手势打断 */
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      press(e.pointerId);
    });
    const pEnd = function (e) {
      if (HAS_TOUCH) return;
      release(e.pointerId);
    };
    btn.addEventListener('pointerup', pEnd);
    btn.addEventListener('pointercancel', pEnd);
    btn.addEventListener('lostpointercapture', pEnd);
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  document.querySelectorAll('.act').forEach(function (btn) {
    const name = btn.dataset.act;
    bindHold(btn,
      function () {
        if (game.paused) return;
        input.held[name] = true;
        rippleAct(name);
        if (game.state === 'menu') startGame();
        if (ACTIONS[name]) ACTIONS[name]();
      },
      function () { input.held[name] = false; }
    );
  });

  const jumpBtn = document.getElementById('btn-jump');
  bindHold(jumpBtn,
    function () {
      if (game.paused) return;
      input.jumpQueued = true;
      flashJump();
      if (game.state === 'menu') startGame();
    },
    function () { /* 跳跃不需要持续按住 */ }
  );

  const DEFAULT_KEYMAP = {
    attack: 'KeyJ', skill: 'KeyK', ult: 'KeyL', support: 'KeyU', jump: 'KeyW', dash: 'ShiftLeft'
  };
  const KEYMAP = Object.assign({}, DEFAULT_KEYMAP, SAVE.keymap || {});
  let keyCapture = null;
  const KEY_LABEL = {
    Space: '空格', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
    AltLeft: 'Alt', AltRight: 'Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: '退格'
  };
  function keyName(code) {
    if (!code) return '?';
    if (KEY_LABEL[code]) return KEY_LABEL[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    return code.replace('Left', '').replace('Right', '');
  }
  function keyOf(action) { return KEYMAP[action] || DEFAULT_KEYMAP[action]; }
  function saveKeymap() { saveSet('keymap', Object.assign({}, KEYMAP)); }
  function buildKeymapUI() {
    const list = document.getElementById('keymap-list');
    if (!list) return;
    const rows = [
      ['attack', '平A'], ['skill', '技能'], ['ult', '大招'],
      ['support', '支援'], ['jump', '跳跃'], ['dash', '闪避']
    ];
    list.innerHTML = '';
    rows.forEach(function (r) {
      const row = document.createElement('div');
      row.className = 'keymap__row';
      const label = document.createElement('span');
      label.textContent = r[1];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'keymap__key';
      btn.textContent = keyCapture === r[0] ? '按下新键…' : keyName(keyOf(r[0]));
      if (keyCapture === r[0]) btn.classList.add('is-capturing');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        keyCapture = r[0];
        buildKeymapUI();
      });
      row.appendChild(label);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }
  function refreshKeyHints() {
    /* 屏幕按钮上的字母 */
    document.querySelectorAll('.act').forEach(function (b) {
      const k = b.querySelector('.act__key');
      if (k && b.dataset.act) k.textContent = keyName(keyOf(b.dataset.act));
    });
    const jk = document.querySelector('.jump__key');
    if (jk) jk.textContent = keyName(keyOf('jump'));
    /* 开始页底部按键说明 */
    const list = document.querySelector('.start__keys');
    if (!list) return;
    list.innerHTML = '';
    const rows = [
      ['移动', ['KeyA', 'KeyD']],
      ['跳跃', [keyOf('jump')]],
      ['闪避', [keyOf('dash')]],
      ['平A', [keyOf('attack')]],
      ['技能', [keyOf('skill')]],
      ['大招', [keyOf('ult')]],
      ['支援', [keyOf('support')]]
    ];
    rows.forEach(function (r) {
      const li = document.createElement('li');
      r[1].forEach(function (code) {
        const k = document.createElement('kbd');
        k.textContent = keyName(code);
        li.appendChild(k);
      });
      if (typeof document.createTextNode === 'function') {
        li.appendChild(document.createTextNode(' ' + r[0]));
      } else {
        const sp = document.createElement('span');
        sp.textContent = ' ' + r[0];
        li.appendChild(sp);
      }
      list.appendChild(li);
    });
  }

  function bindKeymapUI() {
    buildKeymapUI();
    refreshKeyHints();
    const reset = document.getElementById('keymap-reset');
    if (reset) {
      reset.addEventListener('click', function (e) {
        e.stopPropagation();
        Object.keys(DEFAULT_KEYMAP).forEach(function (k) { KEYMAP[k] = DEFAULT_KEYMAP[k]; });
        keyCapture = null;
        saveKeymap();
        buildKeymapUI();
        refreshKeyHints();
      });
    }
  }
  bindKeymapUI();

  window.addEventListener('keydown', function (e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    if (keyCapture) {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') {
        const action = keyCapture;
        const old = KEYMAP[action];
        Object.keys(KEYMAP).forEach(function (k) {
          if (k !== action && KEYMAP[k] === e.code) KEYMAP[k] = old;
        });
        KEYMAP[action] = e.code;
        saveKeymap();
      }
      keyCapture = null;
      buildKeymapUI();
      refreshKeyHints();
      return;
    }
    if (e.repeat) return;
    if (e.code === 'Escape') {
      const achvPanel = document.getElementById('achv');
      if (achvPanel && achvPanel.classList.contains('show')) { achvPanel.classList.remove('show'); return; }
      const cgPanel = document.getElementById('cg');
      if (cgPanel && cgPanel.classList.contains('show')) { cgPanel.classList.remove('show'); return; }
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (game.state === 'play') { setPaused(!game.paused); return; }
      if (settingsEl && settingsEl.classList.contains('show')) { closeSettings(); return; }
    }
    if (game.paused) return;
    keys[e.code] = true;

    if (game.state === 'menu' && (e.code === 'Space' || e.code === 'Enter' || e.code === keyOf('attack'))) {
      startGame();
      return;
    }
    if (e.code === keyOf('attack')) { rippleAct('attack'); input.held.attack = true; doAttack(); }
    if (e.code === keyOf('jump')) { flashJump(); input.jumpQueued = true; }
    if (e.code === keyOf('skill')) doSkill();
    if (e.code === keyOf('ult')) doUlt();
    if (e.code === keyOf('support')) doSupport();
    if (e.code === keyOf('dash') || e.code === 'ShiftLeft' || e.code === 'ShiftRight') player.dashReq = true;
    if (e.code === 'Space' || e.code === 'ArrowUp') { flashJump(); input.jumpQueued = true; }
  });
  window.addEventListener('keyup', function (e) {
    keys[e.code] = false;
    if (e.code === keyOf('attack')) input.held.attack = false;
  });
  window.addEventListener('blur', function () {
    for (const k in keys) keys[k] = false;
    input.stick = 0;
    input.stickY = 0;
  });

  /* =========================================================
   * 6. 战斗
   * ========================================================= */
  function deny(btn) {
    if (!btn) return;
    btn.classList.remove('is-deny');
    void btn.offsetWidth;
    btn.classList.add('is-deny');
    setTimeout(function () { btn.classList.remove('is-deny'); }, 320);
    sfx(150, 0.08, 'square', 0.03);
  }

  function canAct() {
    return game.state === 'play' && !player.dead && player.stun <= 0 && !(game.stageClearPending && !game.hiddenFight) && !(game.freezeT > 0);
  }

  /* Token 文字弹幕 */
  const TOKEN_TEXTS = ['Token', 'token', 'TOKEN', 'Tokens'];
  /* 弹幕颜色语义（画面右上会一直提示） */
  const BULLET_COLORS = {
    normal: '255,209,102',   /* 黄：普通弹，慢慢躲 */
    fast: '255,92,138',      /* 粉：快弹，立刻躲 */
    area: '167,139,250',     /* 紫：范围/环形 */
    track: '150,220,255'     /* 蓝：追踪弹 */
  };
  function pickTokenTarget(x, y) {
    const dir = player.face >= 0 ? 1 : -1;
    let target = null;
    let bestScore = -Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const ex = e.x;
      if (ex < -U(40) || ex > W + U(40)) continue;      /* 只锁屏幕内 */
      const dx = e.x - x;
      const dy = (e.y - e.h * 0.5) - y;
      const dist = Math.hypot(dx, dy) || 1;
      const ang = Math.atan2(dy, Math.abs(dx) < 1 ? 0.001 : dx);
      const cone = dir > 0 ? Math.abs(ang) < 1.15 : Math.abs(Math.abs(ang) - Math.PI) < 1.15;
      let score = 1200 / (dist + U(1));
      if (e.isBoss) score *= 2.4;                       /* Boss 优先 */
      if (!cone) score *= 0.12;                         /* 背后目标基本不抢 */
      if (e.x < x - U(20) && dir > 0) score *= 0.5;
      if (score > bestScore) { bestScore = score; target = e; }
    }
    return target;
  }

  function tokenBullet(x, y, vx, vy, dmg, big, color) {
    const cap = game.lowFx ? 26 : 48;
    if (pbullets.length >= cap) return;
    const target = pickTokenTarget(x, y);
    const spdMul = player.bulletSpeedMul || 1;
    pbullets.push({
      x: x + rand(-U(12), U(12)), y: y + rand(-U(14), U(14)), sx: x, sy: y,
      vx: vx * spdMul, vy: vy * spdMul,
      dmg: dmg,
      text: big ? 'TOKEN' : pick(TOKEN_TEXTS),
      color: game.siliconWar ? '#eaffff' : (color || pick(HEROES[heroIndex].textColors)),
      size: big ? U(game.siliconWar ? 26 : 22) : U(game.siliconWar ? 21 : 15),
      rot: rand(-0.14, 0.14),
      life: 1.6,
      r: big ? U(18) : U(12),
      target: target,
      turn: (big ? 3.4 : 8.5) * (game.buffHoming ? 1.6 : 1)
    });
  }

  /* 按键反馈：按下变灰 + 波纹 */
  function actBtn(name) {
    return (typeof el !== 'undefined' && el.acts) ? el.acts[name] : null;
  }
  function flashAct(name) {
    const b = actBtn(name);
    if (!b || !b.classList) return;
    b.classList.add('is-down');
    clearTimeout(b._downTimer);
    b._downTimer = setTimeout(function () { b.classList.remove('is-down'); }, 130);
  }
  function flashJump() {
    const b = document.getElementById('btn-jump');
    if (!b || !b.classList) return;
    b.classList.add('is-down');
    clearTimeout(b._downTimer);
    b._downTimer = setTimeout(function () { b.classList.remove('is-down'); }, 130);
  }
  function rippleAct(name) {
    const b = actBtn(name);
    if (!b || !b.classList) return;
    b.classList.add('is-ripple');
    clearTimeout(b._ripTimer);
    b._ripTimer = setTimeout(function () { b.classList.remove('is-ripple'); }, 420);
  }

  function heroDmg() {
    let m = player.dmgMul;
    if (player.astra > 0) m *= 1.2;
    if (player.rage > 0) m *= 1.3;
    /* 闪避反击：闪完 1.5 秒内伤害 +35%，鼓励贴脸躲弹 */
    if (player.dodgeBuffT > 0) m *= 1.35;
    return Math.min(2.2, m);
  }

  function fireRate() {
    let cd = ATK_CD;
    if (player.astra > 0) cd *= 0.72;
    if (player.rage > 0) cd *= 0.7;
    if (player.speedMul > 1) cd /= player.speedMul;
    return cd;
  }

  function doAttack() {
    flashAct('attack');
    const warAttack = game.siliconWar && game.state === 'play' && !player.dead;
    if (!canAct() && !warAttack) return;
    const p = player;
    if (p.attackCd > 0) {
      /* 输入缓冲：冷却中按下去，结束瞬间自动接上 */
      p.atkBuf = 0.2;
      /* 取消后摇：后段按平A可以直接进下一段 */
      if (p.attackT > 0 && p.attackT < ATK_DUR * 0.45) p.attackT = 0;
      return;
    }

    p.chain = p.chainT > 0 ? (p.chain % 3) + 1 : 1;
    p.chainT = CHAIN_WIN;
    p.attackCd = fireRate();
    p.attackT = ATK_DUR;
    game.combo += 1;
    if (game.combo === 10 || game.combo === 25 || game.combo === 50) {
      const heal = game.combo === 50 ? 12 : game.combo === 25 ? 6 : 3;
      player.hp = Math.min(player.maxHp, player.hp + heal);
      player.token = Math.min(player.maxToken, player.token + 6);
      addText(player.x, player.y - U(150), '连击 ' + game.combo + '！回复 ' + heal + ' 生命', '110,247,180', 16);
      rings.push({ x: player.x, y: player.y - U(56), r0: U(10), r1: U(110), w: U(4), life: 0.35, max: 0.35, color: '110,247,180' });
      sfx(980, 0.12, 'sine', 0.04);
    }
    { const st0 = achvStats(); if (game.combo > st0.maxCombo) st0.maxCombo = game.combo; }
    game.comboT = 2.2;

    const dmg = heroDmg() * (p.chain === 3 ? 18 : p.chain === 2 ? 11 : 7);
    const bx = p.x + p.face * U(42);
    const by = p.y - U(74);
    rings.push({ x: bx, y: by, r0: U(4), r1: U(42), w: U(3), life: 0.18, max: 0.18, color: HEROES[heroIndex].color });
    spawnSparks(bx, by, HEROES[heroIndex].color, 3);

    /* 空中攻击：斜下方双发斩击，落地前可以蹭伤害 */
    if (!p.onGround) {
      p.vy = Math.min(p.vy, -U(140));
      for (let i = 0; i < 2; i++) {
        tokenBullet(bx, by + U(16 + i * 12), p.face * U(720), U(560), dmg * 0.85, i === 0);
      }
      slashes.push({ x: bx, y: by + U(20), r: U(70), face: p.face, life: 0.2, max: 0.2, color: HEROES[heroIndex].color });
      rings.push({ x: bx, y: by + U(26), r0: U(6), r1: U(86), w: U(3), life: 0.24, max: 0.24, color: HEROES[heroIndex].color });
      sfx(520, 0.1, 'triangle', 0.04);
      return;
    }

    if (p.chain === 3) {
      /* 三段：大号 TOKEN + 轻微上挑 */
      for (let i = -1; i <= 1; i++) {
        tokenBullet(bx, by, p.face * U(760), i * U(120), dmg, true);
      }
      slashes.push({ x: bx, y: by, r: U(90), face: p.face, life: 0.26, max: 0.26, color: HEROES[heroIndex].color });
      sfx(320, 0.08, 'triangle', 0.04);
    } else if (p.chain === 2) {
      tokenBullet(bx, by - U(10), p.face * U(900), -U(60), dmg, false);
      tokenBullet(bx, by + U(10), p.face * U(880), U(40), dmg, false);
      sfx(620, 0.05, 'triangle', 0.03);
    } else {
      tokenBullet(bx, by, p.face * U(950), 0, dmg, false);
      sfx(720, 0.04, 'square', 0.025);
    }

    /* 强化：弹幕扩散 */
    if (game.buffShots > 0) {
      for (let i = 0; i < game.buffShots; i++) {
        const spread = (i - (game.buffShots - 1) / 2) * 0.05;
        tokenBullet(bx, by + (i % 2 ? U(6) : -U(6)), p.face * U(900), Math.sin(spread) * U(180), dmg * 0.6, false);
      }
    }
  }

  /* ---------- 技能：四选一，效果完全不同 ---------- */
  function doSkill() {
    flashAct('skill');
    rippleAct('skill');
    if (!canAct()) return;
    const p = player;
    if (p.skillCd > 0 || p.token < SKILL_COST) { deny(el.acts.skill); return; }

    p.token -= SKILL_COST;
    p.skillCd = SKILL_CD;

    if (heroIndex === 0) {
      /* ChatGPT：狂暴 Astra 模式 */
      p.astra = 6;
      p.dmgMul *= 1.15;
      addText(p.x, p.y - U(130), '狂暴 Astra！', '110,247,180', 20);
      rings.push({ x: p.x, y: p.y - U(50), r0: U(8), r1: U(150), w: U(6), life: 0.5, max: 0.5, color: '167,120,255' });
      sfx(520, 0.2, 'sawtooth', 0.05);
    } else if (heroIndex === 1) {
      /* DeepSeek：思维链，从左扫到右的穿透 Token 流 */
      game.chainT = 1.2;
      game.chainHit = [];
      addText(p.x, p.y - U(130), '思维链·Thinking', '94,231,255', 20);
      sfx(300, 0.3, 'triangle', 0.05);
    } else if (heroIndex === 2) {
      /* Claude：最强代码，直接改血条 */
      const heal = p.maxHp * 0.1;
      p.hp = Math.min(p.maxHp, p.hp + heal);
      addText(p.x, p.y - U(130), '最强代码·直接改血条', '255,180,92', 20);
      let hitCount = 0;
      for (const e of enemies.slice()) {
        if (e.dead) continue;
        hurtEnemy(e, Math.min(e.hp * 0.2, 90), 0, 0, true);
        hitCount += 1;
      }
      game.flash = 0.6;
      rings.push({ x: W * 0.5, y: H * 0.4, r0: U(60), r1: U(560), w: U(8), life: 0.5, max: 0.5, color: '255,180,92' });
      sfx(440, 0.25, 'square', 0.05);
    } else if (heroIndex === 3) {
      /* Gemini：文学家，攻速+伤害 Buff 并倾泻弹幕 */
      p.speedMul = 1.8;
      p.dmgMul *= 1.3;
      player.buffT = 8;
      addText(p.x, p.y - U(130), '文学家·灵感爆发', '167,139,250', 20);
      for (let i = 0; i < 22; i++) {
        const a = -0.28 + (i / 21) * 0.28;
        tokenBullet(p.x + p.face * U(30), p.y - U(58), p.face * Math.cos(a) * U(900), Math.sin(a) * U(260), 9 * heroDmg(), false);
      }
      sfx(600, 0.18, 'triangle', 0.05);
    } else if (heroIndex === 4) {
      /* Qwen：千问·多模态，图像+文字混合弹幕自动追踪 */
      addText(p.x, p.y - U(130), '千问·多模态', '120,190,255', 20);
      for (let i = 0; i < 6; i++) {
        const a = -0.6 + i * 0.24;
        tokenBullet(p.x + p.face * U(26), p.y - U(60), p.face * Math.cos(a) * U(760), Math.sin(a) * U(240), 11 * heroDmg(), true, '#a8d8ff');
      }
      rings.push({ x: p.x, y: p.y - U(56), r0: U(10), r1: U(160), w: U(5), life: 0.45, max: 0.45, color: '120,190,255' });
      sfx(560, 0.16, 'triangle', 0.05);
    } else if (heroIndex === 5) {
      /* Kimi：长文本·记忆，回溯状态回血并给护盾 */
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.22);
      p.shield = Math.max(p.shield, 2.5);
      p.invuln = Math.max(p.invuln, 1.2);
      addText(p.x, p.y - U(130), '长文本·记忆回溯', '200,220,255', 20);
      rings.push({ x: p.x, y: p.y - U(50), r0: U(8), r1: U(140), w: U(5), life: 0.5, max: 0.5, color: '200,220,255' });
      sfx(640, 0.2, 'sine', 0.05);
    } else if (heroIndex === 6) {
      /* GLM：代码生成，全屏代码攻击 */
      game.flash = 0.55;
      for (const e of enemies.slice()) hurtEnemy(e, 50 * heroDmg(), 0, 0, true);
      for (const b of ebullets) spawnSparks(b.x, b.y, '167,139,250', 1);
      ebullets.length = 0;
      addText(p.x, p.y - U(130), '代码生成·全屏编译', '167,139,250', 20);
      rings.push({ x: W * 0.5, y: H * 0.4, r0: U(60), r1: U(520), w: U(7), life: 0.45, max: 0.45, color: '167,139,250' });
      sfx(420, 0.22, 'square', 0.05);
    } else if (heroIndex === 7) {
      /* Grok：检索突进，向前冲刺并撞伤沿途敌人 */
      p.vx = p.face * U(1150);
      p.invuln = Math.max(p.invuln, 0.55);
      game.dashHit = [];
      addText(p.x, p.y - U(130), '检索突进·Search', '255,180,92', 20);
      sfx(300, 0.18, 'sawtooth', 0.05);
    } else if (heroIndex === 8) {
      /* SEED：seedance，放出一排会追人的视频分镜弹 */
      addText(p.x, p.y - U(130), 'seedance · 分镜追踪', '150,220,255', 20);
      const baseA = Math.atan2(-U(160), p.face * U(800));
      for (let i = 0; i < 5; i++) {
        const a = baseA + (i - 2) * 0.22;
        tokenBullet(p.x + p.face * U(30), p.y - U(62), p.face * Math.cos(a) * U(780), Math.sin(a) * U(300), 12 * heroDmg(), false, '#a8d8ff');
      }
      rings.push({ x: p.x + p.face * U(30), y: p.y - U(60), r0: U(8), r1: U(150), w: U(4), life: 0.42, max: 0.42, color: '150,220,255' });
      sfx(500, 0.16, 'triangle', 0.05);
    } else if (heroIndex === 9) {
      /* 冬装豆包：视频生成，冰晶分镜四散 */
      addText(p.x, p.y - U(130), '视频生成 · 分镜乱切', '150,220,255', 20);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        tokenBullet(p.x + Math.cos(a) * U(20), p.y - U(56), Math.cos(a) * U(700), Math.sin(a) * U(700), 8 * heroDmg(), i % 2 === 0, '#a8d8ff');
      }
      for (const e of enemies.slice()) {
        if (Math.abs(e.x - p.x) < U(240)) { hurtEnemy(e, 26 * heroDmg(), 0, 0); e.stun = 1.0; }
      }
      rings.push({ x: p.x, y: p.y - U(54), r0: U(10), r1: U(180), w: U(5), life: 0.45, max: 0.45, color: '150,220,255' });
      sfx(460, 0.2, 'triangle', 0.05);
    } else {
      /* 豆包（豆奶）：豆奶冲撞 */
      p.vx = p.face * U(1050);
      p.invuln = Math.max(p.invuln, 0.45);
      addText(p.x, p.y - U(130), '豆奶冲撞！', '255,209,102', 20);
      for (let i = 0; i < 3; i++) {
        tokenBullet(p.x, p.y - U(56), p.face * U(760), (i - 1) * U(160), 9 * heroDmg(), false, '#ffe3a0');
      }
      rings.push({ x: p.x, y: p.y - U(50), r0: U(8), r1: U(130), w: U(5), life: 0.4, max: 0.4, color: '255,209,102' });
      sfx(520, 0.18, 'triangle', 0.05);
    }
  }

  /* ---------- 大招 ---------- */
  function doUlt() {
    flashAct('ult');
    rippleAct('ult');
    if (!canAct()) return;
    const p = player;
    if (p.ultCd > 0 || (!game.infinite && p.token < ULT_COST)) { deny(el.acts.ult); return; }

    if (!game.infinite) p.token -= ULT_COST;
    p.ultCd = game.infinite ? 0 : ULT_CD;
    p.invuln = Math.max(p.invuln, 1.0);

    if (heroIndex === 0) {
      /* ChatGPT：图像生成（DALL·E 特效 + 全屏伤害） */
      game.flash = 1;
      game.shake = U(18);
      for (let i = 0; i < 18; i++) {
        rings.push({
          x: rand(0, W), y: rand(H * 0.15, groundY), r0: U(4), r1: U(rand(70, 190)),
          w: U(4), life: rand(0.4, 0.8), max: 0.8,
          color: pick(['110,247,180', '255,209,102', '255,120,190', '167,139,250'])
        });
      }
      for (const e of enemies.slice()) hurtEnemy(e, 70 * heroDmg(), 0, 0);
      for (const b of ebullets) spawnSparks(b.x, b.y, '110,247,180', 1);
      ebullets.length = 0;
      addText(W * 0.5, H * 0.3, '【图像生成】全屏作画！', '110,247,180', 26);
      sfx(90, 0.7, 'sawtooth', 0.07);
    } else if (heroIndex === 1) {
      /* DeepSeek：开源，权重方块从天而降 */
      for (let i = 0; i < 12; i++) {
        weights.push({
          x: rand(W * 0.12, W * 0.92),
          y: -U(60) - i * U(70),
          vy: U(520),
          landed: false,
          size: rand(U(26), U(46))
        });
      }
      addText(W * 0.5, H * 0.28, '【开源】权重砸下来！', '94,231,255', 26);
      sfx(200, 0.5, 'sawtooth', 0.06);
    } else if (heroIndex === 2) {
      /* Claude：黎曼猜想，延迟真实伤害 + 定身 */
      game.formulaT = 1.0;
      addText(W * 0.5, H * 0.3, '【黎曼猜想】法阵展开…', '255,180,92', 26);
      sfx(260, 0.8, 'sine', 0.06);
    } else if (heroIndex === 3) {
      /* Gemini：反超，蓄力后进入狂暴 */
      game.rageCharge = 1.1;
      addText(W * 0.5, H * 0.3, '【反超】数据面板超越中…', '167,139,250', 26);
      sfx(340, 0.9, 'triangle', 0.06);
    } else if (heroIndex === 4) {
      /* Qwen：通义万相，全屏生成图像弹幕 */
      game.flash = 0.9;
      for (let i = 0; i < 14; i++) {
        tokenBullet(rand(W * 0.1, W * 0.9), H * 0.1, 0, U(700), 22 * heroDmg(), true, '#a8d8ff');
      }
      for (const e of enemies.slice()) hurtEnemy(e, 55 * heroDmg(), 0, 0);
      addText(W * 0.5, H * 0.3, '【通义万相】万物皆可生成', '120,190,255', 26);
      sfx(240, 0.6, 'triangle', 0.06);
    } else if (heroIndex === 5) {
      /* Kimi：超长上下文，时间放缓 + 回血 */
      game.slow = Math.max(game.slow, 2.6);
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3);
      p.shield = Math.max(p.shield, 3);
      addText(W * 0.5, H * 0.3, '【超长上下文】只有敌人变慢了', '200,220,255', 26);
      sfx(520, 0.7, 'sine', 0.06);
    } else if (heroIndex === 6) {
      /* GLM：深度睡眠，敌人定身 + 自己回血 */
      for (const e of enemies) e.stun = Math.max(e.stun || 0, 3);
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
      addText(W * 0.5, H * 0.3, '【深度睡眠】都睡吧', '167,139,250', 26);
      sfx(300, 0.6, 'sine', 0.05);
    } else if (heroIndex === 7) {
      /* Grok：真相引擎，全屏爆发 */
      game.flash = 1;
      game.shake = U(20);
      for (const e of enemies.slice()) hurtEnemy(e, 90 * heroDmg(), 0, 0);
      for (let i = 0; i < 10; i++) {
        tokenBullet(rand(0, W), rand(H * 0.15, groundY), 0, -U(500), 14 * heroDmg(), false, '#ffd199');
      }
      addText(W * 0.5, H * 0.3, '【真相引擎】全部检索出来', '255,180,92', 26);
      sfx(160, 0.7, 'sawtooth', 0.07);
    } else if (heroIndex === 8) {
      /* SEED：数据倾倒，全屏数据流砸落 */
      game.flash = 0.9;
      game.shake = U(16);
      for (const e of enemies.slice()) hurtEnemy(e, 80 * heroDmg(), 0, 0);
      for (let i = 0; i < 16; i++) {
        tokenBullet(rand(W * 0.06, W * 0.94), rand(H * 0.08, groundY * 0.5), 0, U(760), 13 * heroDmg(), true, '#a8d8ff');
      }
      for (let i = 0; i < 3; i++) {
        rings.push({ x: W * 0.5, y: groundY - U(40), r0: U(20), r1: U(260 + i * 170), w: U(7), life: 0.6, max: 0.6, color: '150,220,255' });
      }
      addText(W * 0.5, H * 0.3, '【数据倾倒】整屏都是数据流', '150,220,255', 26);
      sfx(180, 0.6, 'square', 0.06);
    } else if (heroIndex === 9) {
      /* 冬装豆包：数据暴走，全屏雪崩 + 减速 */
      game.flash = 0.9;
      game.shake = U(18);
      game.slow = Math.max(game.slow, 1.8);
      for (const e of enemies.slice()) hurtEnemy(e, 72 * heroDmg(), 0, 0, true);
      for (let i = 0; i < 16; i++) {
        tokenBullet(rand(W * 0.05, W * 0.95), H * 0.06, 0, U(780), 12 * heroDmg(), true, '#a8d8ff');
      }
      for (let i = 0; i < 3; i++) {
        rings.push({ x: W * 0.5, y: groundY - U(50), r0: U(24), r1: U(240 + i * 160), w: U(7), life: 0.65, max: 0.65, color: '150,220,255' });
      }
      addText(W * 0.5, H * 0.3, '【数据暴走】整座城堡都在下雪', '150,220,255', 26);
      sfx(160, 0.65, 'sawtooth', 0.07);
    } else {
      /* 豆包（豆奶）：视频生成 */
      game.flash = 0.8;
      for (const e of enemies.slice()) hurtEnemy(e, 60 * heroDmg(), 0, 0, true);
      for (let i = 0; i < 12; i++) {
        tokenBullet(rand(W * 0.1, W * 0.9), -U(20) - i * U(18), 0, U(720), 12 * heroDmg(), true, '#ffe3a0');
      }
      addText(W * 0.5, H * 0.3, '【视频生成】满屏都是分镜', '255,209,102', 26);
      sfx(240, 0.6, 'triangle', 0.06);
    }
  }

  /* ---------- 支援召唤 ---------- */
  function doSupport() {
    flashAct('support');
    rippleAct('support');
    if (!canAct()) return;
    const p = player;
    if (p.supportLock > 0) return;
    if (p.supportCd > 0 && !game.buffSupportFree && !game.infinite) { deny(el.acts.support); return; }
    p.supportLock = 0.35;

    if (game.buffSupportFive) p.supportCd = 5 * (p.supportCdMul || 1);
    else if (game.buffSupportFree || game.infinite) p.supportCd = 0;
    else p.supportCd = (game.wenxinSupport ? SUPPORT_CD * 0.5 : SUPPORT_CD) * (p.supportCdMul || 1);
    let supPool = (game.siliconWar ? SILICON_SUPPORTS : SUPPORTS).slice();
    for (const k of game.allyKeys) {
      if (SUPPORT_EXTRA[k]) supPool.push(SUPPORT_EXTRA[k]);
    }
    const sup = pick(supPool);
    supports.push({
      key: sup.key, name: sup.name, badge: sup.badge,
      x: p.x - U(104), y: p.y - U(168),
      life: 10, t: 0, effect: sup.effect, healT: 0, sleep: sup.effect === 'glm'
    });

    addText(p.x, p.y - U(150), '支援：' + sup.name + ' · ' + sup.desc, '110,247,180', 16);

    if (sup.effect === 'glm') {
      game.flash = 0.6;
      for (const e of enemies.slice()) hurtEnemy(e, 55 * heroDmg(), 0, 0);
      for (const b of ebullets) spawnSparks(b.x, b.y, '167,139,250', 1);
      ebullets.length = 0;
      addText(W * 0.5, H * 0.24, 'GLM：代码全屏攻击！然后……睡了', '167,139,250', 20);
    } else if (sup.effect === 'boost') {
      p.dmgMul *= 1.35;
      p.boostT = 10;
    } else if (sup.effect === 'token') {
      p.tokenMul = 2;
      p.tokenMulT = 10;
    } else if (sup.effect === 'seed') {
      game.flash = 0.7;
      for (const e of enemies.slice()) hurtEnemy(e, 45 * heroDmg(), 0, 0);
      for (let i = 0; i < 10; i++) {
        tokenBullet(rand(W * 0.1, W * 0.9), rand(H * 0.1, groundY * 0.5), 0, U(700), 10 * heroDmg(), true, '#a8d8ff');
      }
      addText(W * 0.5, H * 0.24, 'SEED：数据倾倒！', '150,220,255', 20);
    } else if (sup.effect === 'guard') {
      p.shield = 5;
      p.invuln = Math.max(p.invuln, 5);
    } else if (sup.effect === 'reset') {
      p.skillCd = 0;
      p.ultCd = 0;
      p.token = p.maxToken;
    }
    sfx(760, 0.18, 'sine', 0.05);
  }

  /* ---------- 伤害结算 ---------- */
  function hurtEnemy(e, dmg, kx, ky, force) {
    if (e.dead) return;

    /* Boss 破防窗口：定身期间受伤 +50% */
    if (e.isBoss && e.stun > 0) dmg *= 1.5;
    if (e.kind === 'nail_boss') dmg *= 0.82;
    const wasAboveHalf = e.hp > e.maxHp * 0.5;
    e.hp -= Math.max(1, dmg);
    if (e.isBoss && wasAboveHalf && e.hp > 0 && e.hp <= e.maxHp * 0.5 && !e.rageWarned) {
      e.rageWarned = true;
      e.phaseFxUntil = game.time + 0.55;
      const names = { grok: 'Grok 娘', nail_boss: '西装奶蛙', doubao_boss: '冬装豆包', seed: 'SEED 娘' };
      addText(W * 0.5, H * 0.26, (names[e.kind] || 'Boss') + ' · 形态解放！', '255,92,138', 26);
      game.shake = SAVE.reduceFx ? 0 : U(22);
      game.flash = SAVE.reduceFx ? 0.18 : 0.55;
      game.hitStop = Math.max(game.hitStop || 0, 0.16);
      rings.push({ x: e.x, y: e.y - e.h * 0.5, r0: U(20), r1: U(260), w: U(8), life: 0.55, max: 0.55, color: '255,92,138' });
      for (let i = 0; i < 18; i++) spawnSparks(e.x, e.y - e.h * 0.5, '255,120,150', 3);
      sfx(180, 0.5, 'sawtooth', 0.06);
      setTimeout(function () { if (!e.dead) sfx(320, 0.25, 'triangle', 0.05); }, 220);
    }
    e.hurt = 0.14;
    if (kx) e.kx = (e.kx || 0) + kx * 0.35;
    if (ky && !force) e.vy = ky;

    /* 命中反馈分层：轻击咻、重击闷响+顿帧 */
    const heavy = dmg >= 18 || !!force;
    spawnSparks(
      e.x, e.y - e.h * 0.5,
      e.hp > 0 ? (heavy ? '255,210,140' : '255,190,120') : '255,240,200',
      e.hp > 0 ? (heavy ? 9 : 3) : 14
    );
    if (e.hp > 0) {
      hitSfx(heavy ? 'heavy' : 'light');
      if (heavy) {
        game.hitStop = Math.max(game.hitStop, 0.05);
        game.shake = Math.max(game.shake, U(6));
        buzz(22);
      } else {
        game.hitStop = Math.max(game.hitStop, 0.014);
        game.shake = Math.max(game.shake, U(2.6));
        buzz(8);
      }
    }
    addText(
      e.x + rand(-8, 8), e.y - e.h - U(10),
      '-' + Math.round(dmg),
      heavy ? '255,209,102' : '236,250,255',
      heavy ? 20 : 14
    );
    player.token = Math.min(player.maxToken, player.token + 0.8 * player.tokenMul);

    /* Boss 累计伤害触发破防 */
    if (e.isBoss && e.hp > 0) {
      e.dmgAcc = (e.dmgAcc || 0) + Math.max(1, dmg);
      if (e.stun <= 0 && e.dmgAcc >= e.maxHp * 0.18) {
        e.dmgAcc = 0;
        e.stun = 1.8;
        game.hitStop = 0.08;
        game.shake = Math.max(game.shake, U(10));
        addText(e.x, e.y - e.h - U(18), '破防！', '255,209,102', 22);
        hitSfx('heavy');
        rings.push({ x: e.x, y: e.y - e.h * 0.5, r0: U(10), r1: U(170), w: U(7), life: 0.5, max: 0.5, color: '255,209,102' });
        sfx(180, 0.25, 'square', 0.06);
      }
    }

    /* Boss 转阶段演出：半血顿帧 + 震屏 + 冲击环 + 音效 */
    if (e.isBoss && e.hp > 0 && !e.cutPhase && e.hp <= e.maxHp * 0.5) {
      e.cutPhase = true;
      e.hurt = 0.5;
      e.stun = Math.max(e.stun || 0, 0.5);
      game.flash = 0.85;
      game.hitStop = Math.max(game.hitStop, 0.12);
      game.shake = Math.max(game.shake, U(20));
      for (let i = 0; i < 3; i++) {
        rings.push({ x: e.x, y: e.y - e.h * 0.5, r0: U(20), r1: U(240 + i * 150), w: U(8), life: 0.7, max: 0.7, color: '255,120,150' });
      }
      addText(W * 0.5, H * 0.26, '第二阶段！', '255,120,150', 26);
      game.cinemaT = 1.25;
      game.cinemaMax = 1.25;
      sfx(120, 0.6, 'sawtooth', 0.07);
      buzz(70);
      if (BGM.mode === 'boss') { BGM.step = 0; }
    }

    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    const boss = !!e.isBoss;
    spawnExplosion(e.x, e.y - e.h * 0.5, boss ? '255,209,102' : e.kind === 'doubao' ? '150,220,255' : '255,140,170');
    game.score += (boss ? 3000 : e.kind === 'laugh' ? 500 : 160) * (game.scoreMul || 1);
    game.kills += 1;
    achvStats().kills += 1;
    checkAchv();
    game.stageKills = (game.stageKills || 0) + 1;
    player.token = Math.min(player.maxToken, player.token + (boss ? 40 : 6) * player.tokenMul);
    game.shake = Math.max(game.shake, boss ? U(24) : U(8));
    if (boss) {
      game.flash = 0.8;
      addText(e.x, e.y - e.h - U(20), 'Boss 被击破！', '255,209,102', 24);
    } else {
      addText(e.x, e.y - e.h - U(12), 'KILL', '255,120,150', 20);
    }
    buzz(boss ? 60 : 18);
    const idx = enemies.indexOf(e);
    if (idx >= 0) enemies.splice(idx, 1);
    sfx(boss ? 90 : 200, boss ? 0.6 : 0.16, 'sawtooth', 0.05);
  }

  function damagePlayer(dmg, dir) {
    const p = player;
    if (game.state !== 'play') return;
    if (p.dead || p.invuln > 0 || p.shield > 0) return;
    const realDmg = Math.max(1, Math.round(dmg * CONFIG.enemyDamageScale * (game.enemyDmgMul || 1) * (p.defenseMul || 1) * diffCfg().dmg));
    /* 硅谷决战里弹幕太密，硬直减半，避免被锁在原地动不了 */
    const hurtStun = game.siliconWar ? 0.05 : 0.3;
    buzz(45);
    game.hitStop = Math.max(game.hitStop, 0.07);
    game.stageHits = (game.stageHits || 0) + 1;
    game.totalHits = (game.totalHits || 0) + 1;
    p.hp -= realDmg;
    p.invuln = 1.1;
    p.hurt = 0.26;
    p.vx = (dir || 1) * U(240);
    game.shake = SAVE.reduceFx ? 0 : U(14);
    game.hitStop = 0.05;
    game.combo = 0;
    addText(p.x, p.y - U(120), '-' + realDmg, '255,92,138', 18);
    spawnSparks(p.x, p.y - U(56), '255,92,138', 12);
    sfx(120, 0.2, 'square', 0.06);

    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      game.deathT = 1.1;
      game.slow = 0.6;
      spawnExplosion(p.x, p.y - U(46), '150,244,255');
      sfx(80, 0.9, 'sine', 0.08);
    }
  }

  /* =========================================================
   * 7. 生成
   * ========================================================= */
  function spawnEnemy(kind) {
    if (kind === 'grok' || kind === 'nail_boss' || kind === 'doubao_boss' || kind === 'seed') {
      spawnBoss(kind);
      return;
    }

    const t = game.diffTime;
    const diff = game.stage;
    let hp, w, h, speed;
    if (kind === 'laugh') { hp = 190 + t * 2 + diff * 30; w = U(54); h = U(84); speed = U(rand(75, 110)); }
    else if (kind === 'doubao') { hp = 70 + t * 1.2 + diff * 12; w = U(44); h = U(70); speed = U(rand(60, 90)); }
    else { hp = 88 + t * 1.4 + diff * 14; w = U(46); h = U(78); speed = U(rand(55, 80)); }

    const side = Math.random() < 0.85 ? 1 : -1;
    const x = side > 0 ? W + rand(U(40), U(160)) : -U(60) - rand(U(20), U(120));

    enemies.push({
      kind: kind,
      x: x, y: groundY,
      vx: -side * speed, vy: 0, kx: 0,
      w: w, h: h,
      hp: hp * (game.enemyHpMul || 1) * diffCfg().hp, maxHp: hp * (game.enemyHpMul || 1) * diffCfg().hp,
      hurt: 0, t: rand(0, 6), fireT: rand(0.8, 1.8), face: -side,
      stun: 0, dead: false, isBoss: false,
      homeX: side > 0 ? W * rand(0.62, 0.88) : W * rand(0.12, 0.38)
    });
  }

  function spawnBoss(kind) {
    const c = CONFIG.bosses[kind];
    if (!c) return;
    const conf = { hp: c.hp, w: U(c.w), h: U(c.h), x: W * c.x };
    enemies.push({
      kind: kind, isBoss: true,
      x: conf.x, y: groundY,
      vx: 0, vy: 0, kx: 0,
      w: conf.w, h: conf.h,
      hp: conf.hp * (game.enemyHpMul || 1) * diffCfg().hp, maxHp: conf.hp * (game.enemyHpMul || 1) * diffCfg().hp,
      hurt: 0, t: 0, fireT: 1.2, face: -1, stun: 0, dead: false,
      homeX: conf.x, phase: 'idle', phaseT: 1.2
    });
    game.shake = U(14);
    sfx(130, 0.4, 'sawtooth', 0.06);
  }

  /* 敌弹统一入口 */
  function ebullet(x, y, ang, spd, color, r, text, dmg) {
    if (ebullets.length > (game.lowFx ? 180 : 320)) return;
    if (!isFinite(x) || !isFinite(y) || !isFinite(ang) || !isFinite(spd)) return;
    if (!isFinite(r) || r <= 0) r = U(7);
    ebullets.push({
      x: x, y: y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      r: r || U(7),
      color: color || '255,209,102',
      life: 5,
      text: text || null,
      dmg: dmg || Math.round((text ? 8 : 7) * (game.warDmgMul || 1))
    });
  }

  function fireRing(x, y, n, off, spd, color, dmg) {
    for (let i = 0; i < n; i++) {
      ebullet(x, y, off + (i / n) * TAU, spd, color, U(9), null, dmg);
    }
  }

  function spawnLogic(d) {
    game.spawnT -= d;
    const cap = 4 + game.stage * 2 + Math.min(4, Math.floor(game.diffTime / 30));
    if (game.spawnT > 0 || enemies.length >= cap) return;

    /* 波次节奏：成组刷怪 → 留出喘息空窗 → 下一波更猛 */
    game.wave = (game.wave || 0) + 1;
    const cfg = WAVE_CFG;
    const burst = clamp(
      Math.round(cfg.burstBase + game.stage * cfg.burstPerStage + game.wave * cfg.burstPerWave),
      2, cfg.burstMax
    );
    let spawned = 0;
    let hasLaugh = false;
    for (let i = 0; i < burst; i++) {
      if (enemies.length >= cap) break;
      const roll = Math.random();
      let kind = 'frog';
      if (game.stage >= 1 && roll < 0.16) kind = 'laugh';
      else if (roll < 0.58) kind = 'doubao';
      if (kind === 'laugh') {
        if (hasLaugh) kind = 'frog';
        else hasLaugh = true;
      }
      spawnEnemy(kind);
      spawned += 1;
    }
    if (spawned) {
      addText(W * 0.5, H * 0.4, '第 ' + game.wave + ' 波', '150,220,255', 20);
      sfx(420, 0.12, 'triangle', 0.03);
    }
    game.spawnT = clamp(
      cfg.gapBase - game.stage * cfg.gapPerStage - game.wave * cfg.gapPerWave,
      cfg.gapMin, cfg.gapBase
    );
  }

  /* ---------- 特效 ---------- */
  const partPool = [];
  function takePart() { return partPool.pop() || {}; }
  function freePart(p) { if (partPool.length < 900) partPool.push(p); }

  function spawnSparks(x, y, color, n) {
    if (parts.length > 160) return;
    if (game.lowFx) n = Math.max(1, Math.round(n * 0.4));
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(U(50), U(320));
      const pa = takePart();
      pa.type = 'spark';
      pa.x = x; pa.y = y;
      pa.vx = Math.cos(a) * sp;
      pa.vy = Math.sin(a) * sp;
      pa.grav = U(760);
      pa.size = rand(U(1.2), U(3));
      pa.color = color;
      pa.life = rand(0.2, 0.5);
      pa.max = 0.5;
      parts.push(pa);
    }
  }

  function spawnExplosion(x, y, color) {
    const count = game.lowFx ? 12 : 22;
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const sp = rand(U(60), U(420));
      const pa = takePart();
      pa.type = 'spark';
      pa.x = x; pa.y = y;
      pa.vx = Math.cos(a) * sp;
      pa.vy = Math.sin(a) * sp;
      pa.grav = U(600);
      pa.size = rand(U(1.6), U(4));
      pa.color = color;
      pa.life = rand(0.3, 0.7);
      pa.max = 0.7;
      parts.push(pa);
    }
    rings.push({ x: x, y: y, r0: U(6), r1: U(120), w: U(6), life: 0.36, max: 0.36, color: color });
  }

  function castBar(sec, label) {
    game.castT = sec;
    game.castMax = sec;
    game.castLabel = label || '';
    sfx(300, 0.1, 'triangle', 0.03);
    warnAt(player.x, groundY, U(110), sec, '255,120,150');
  }

  function drawCastBar() {
    if (game.castT <= 0) return;
    const k = clamp(game.castT / game.castMax, 0, 1);
    const bw = Math.min(W * 0.5, U(420));
    const bh = U(9);
    const x = (W - bw) / 2;
    const y = H * 0.16;
    ctx.save();
    ctx.fillStyle = 'rgba(6,10,18,0.72)';
    rr(x - U(2), y - U(2), bw + U(4), bh + U(4), U(6));
    ctx.fill();
    const grd = ctx.createLinearGradient(x, y, x + bw, y);
    grd.addColorStop(0, 'rgba(255,92,138,0.95)');
    grd.addColorStop(1, 'rgba(255,209,102,0.95)');
    ctx.fillStyle = grd;
    rr(x, y, bw * k, bh, U(4));
    ctx.fill();
    if (game.castLabel) {
      ctx.font = '700 ' + U(14).toFixed(0) + 'px "PingFang SC", system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,228,236,0.92)';
      ctx.fillText(game.castLabel + ' · 蓄力中', W / 2, y - U(8));
    }
    ctx.restore();
  }

  function warnAt(x, y, r, life, color) {
    if (game.warns.length > 12) game.warns.shift();
    game.warns.push({ x: x, y: y, r: r, life: life, max: life, color: color || '255,90,120' });
  }

  function drawWarns() {
    for (const w of game.warns) {
      const k = 1 - w.life / w.max;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(game.time * 22);
      ctx.strokeStyle = 'rgba(' + w.color + ',0.95)';
      ctx.lineWidth = U(3);
      ctx.beginPath();
      ctx.ellipse(w.x, w.y, w.r, w.r * 0.32, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = 'rgba(' + w.color + ',1)';
      ctx.beginPath();
      ctx.ellipse(w.x, w.y, w.r * (1 - 0.85 * k), w.r * 0.32 * (1 - 0.85 * k), 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.font = '800 ' + (U(26)).toFixed(0) + 'px "PingFang SC", system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(' + w.color + ',0.95)';
      ctx.fillText('!', w.x, w.y - U(16));
      ctx.restore();
    }
  }

  function addText(x, y, text, color, size) {
    texts.push({ x: x, y: y, text: text, color: color, size: size || 16, vy: -U(60), life: 1.0, max: 1.0 });
  }

  function ensurePlatforms() {
    let n = platforms.length;
    while (game.nextPlat < W + U(300)) {
      const gap = rand(U(120), U(220));
      const w = rand(U(90), U(170));
      /* 两层台阶：低层好跳，高层需要二段跳 */
      const lift = (n % 2 === 0) ? rand(U(105), U(165)) : rand(U(200), U(295));
      const x = game.nextPlat + gap;
      platforms.push({ x: x, w: w, lift: lift });
      game.nextPlat = x + w;
      n += 1;
    }
    if (platforms.length > 14) platforms.splice(0, platforms.length - 14);
  }

  /* =========================================================
   * 8. 更新
   * ========================================================= */
  function step(dt) {
    game.time += dt;
    if (game.recoverT > 0) game.recoverT = Math.max(0, game.recoverT - dt);

    let scale = 1;
    if (game.hitStop > 0) { game.hitStop -= dt; scale *= 0.16; }
    if (game.slow > 0) { game.slow -= dt; scale *= 0.34; }
    const d = dt * scale;

    for (const s of dust) {
      s.y += s.vy * dt;
      s.x += s.vx * dt;
      if (s.y < -10) { s.y = H + 10; s.x = Math.random() * W; }
      if (s.x < -10) s.x = W + 10;
      if (s.x > W + 10) s.x = -10;
    }

    updateRain(dt);

    if (game.state === 'play' && game.freezeT > 0) {
      game.freezeT = Math.max(0, game.freezeT - dt);
      /* 奶蛙自己的大笑计时也同步走，冻结结束正好收尾 */
      for (const e of enemies) {
        if (e.laughT > 0) e.laughT = Math.max(0, e.laughT - dt);
      }
      if (game.freezeT <= 0) {
        stopLaugh();
        input.jumpQueued = false;
        input.held.attack = false;
      }
      return;   /* 捧腹大笑：全场暂停，子弹/敌人/计时全部冻结 */
    }

    if (game.state === 'play') {
      game.diffTime += d;
      game.comboT = Math.max(0, game.comboT - dt);
      if (game.comboT <= 0) game.combo = 0;
      if (game.combo > (game.stageMaxCombo || 0)) game.stageMaxCombo = game.combo;

      updatePlayer(d, dt, game.slow > 0);
      updateEnemies(d);
      updatePBullets(d);
      for (let ti = tracers.length - 1; ti >= 0; ti--) { tracers[ti].life -= dt; if (tracers[ti].life <= 0) tracers.splice(ti, 1); }
      updateEBullets(d);
      if (game.angryBoss) {
        game.angryFireT -= d;
        const ab = enemies.find(function (e) { return e.isBoss; });
        if (ab && game.angryFireT <= 0) {
          game.angryFireT = 0.42;
          fireRing(ab.x, ab.y - ab.h * 0.5, 12, game.time, U(430), '255,120,150');
          sfx(220, 0.06, 'square', 0.02);
        }
      }
      if (game.castT > 0) game.castT = Math.max(0, game.castT - dt);
      if (game.cinemaT > 0) game.cinemaT = Math.max(0, game.cinemaT - dt);
      for (let wi = game.warns.length - 1; wi >= 0; wi--) {
        game.warns[wi].life -= dt;
        if (game.warns[wi].life <= 0) game.warns.splice(wi, 1);
      }
      updateSupports(d);
      updateWeights(d);
      updateSceneProps(dt);

      if (game.controlT > 0) game.controlT = Math.max(0, game.controlT - dt);

      if (game.safeZone) {
        game.safeZone.t -= dt;
        if (game.safeZone.t <= 0) game.safeZone = null;
      }
      if (game.pendingRain) {
        game.pendingRain.t -= dt;
        if (game.pendingRain.t <= 0) {
          const cnt = game.pendingRain.count;
          game.pendingRain = null;
          for (let i = 0; i < cnt; i++) {
            let rx = rand(W * 0.08, W * 0.92);
            let tries = 0;
            while (game.safeZone && Math.abs(rx - game.safeZone.x) < game.safeZone.w * 0.6 && tries < 14) {
              rx = rand(W * 0.08, W * 0.92);
              tries++;
            }
            ebullet(rx, -U(30), Math.PI / 2, U(240), BULLET_COLORS.area, U(18), 'DATA');
          }
        }
      }

      if (game.slamT > 0) {
        game.slamT -= dt;
        if (!game.slamDone && game.slamT <= 0.7) {
          game.slamDone = true;
          game.scene = game.slamScene || game.scene;
          spawnSceneProps(game.scene);
          game.flash = 1;
          game.shake = U(28);
          ebullets = [];
          addText(W * 0.5, H * 0.3, '场景骤变！', '255,209,102', 26);
          for (let i = 0; i < 3; i++) {
            rings.push({ x: W * 0.5, y: groundY - U(20), r0: U(20), r1: U(300 + i * 160), w: U(8), life: 0.7, max: 0.7, color: '255,209,102' });
          }
          sfx(80, 0.7, 'sawtooth', 0.08);
        }
      }

      updateStage(d, dt);

      /* 最后 10 秒：每秒报警 */
      if (!game.bossSpawned && STAGES[game.stage]) {
        const rem = Math.ceil(STAGES[game.stage].defense - game.stageT);
        if (rem <= 10 && rem > 0 && rem !== game.lastTick) {
          game.lastTick = rem;
          game.shake = Math.max(game.shake, U(3));
          sfx(700 + (10 - rem) * 50, 0.07, 'square', 0.05);
        }
      }

      if (player.dead) {
        game.deathT -= dt;
        if (game.deathT <= 0 && !overShown) {
      if (game.siliconWar || game.hiddenFight) {
        if (!warSacrificeRevive()) finishSiliconWar(false);
      }
      else if (!game.liangBlessed && game.stage <= 1) { offerLiangPower(); }
      else { showOver(false); }
    }
      }
    } else if (game.state === 'over' && !overShown) {
      showOver(game.victory);
    }

    updateParts(dt);
    updateTexts(dt);
    updateRings(dt);
    updateSlashes(dt);

    game.shake = Math.max(0, game.shake - game.shake * 9 * dt - dt * 8);
    game.flash = Math.max(0, game.flash - dt * 2.4);
    if (game.state === 'play' && input.held.attack) doAttack();
  }

  function updatePlayer(d, dt, slowActive) {
    if (player.supportLock > 0) player.supportLock = Math.max(0, player.supportLock - dt);
    const p = player;
    /* 敌方时间被放缓时，玩家自己不受影响 */
    const pd = slowActive ? dt : d;
    if (p.dead) {
      p.vx *= Math.pow(0.02, pd);
      p.vy += U(2400) * pd;
      p.y = Math.min(groundY, p.y + p.vy * pd);
      return;
    }

    p.attackCd = Math.max(0, p.attackCd - d);
    if (p.atkBuf > 0) {
      p.atkBuf = Math.max(0, p.atkBuf - dt);
      if (p.attackCd <= 0 && p.stun <= 0 && !p.dead) {
        p.atkBuf = 0;
        doAttack();
      }
    }
    p.skillCd = Math.max(0, p.skillCd - d);
    p.ultCd = Math.max(0, p.ultCd - d);
    p.supportCd = Math.max(0, p.supportCd - d);
    p.attackT = Math.max(0, p.attackT - dt);
    p.chainT = Math.max(0, p.chainT - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    if (p.shieldRegen > 0) {
      p.shieldT = (p.shieldT || 0) + dt;
      if (p.shieldT >= p.shieldRegen) {
        p.shieldT = 0;
        p.shield = Math.min(3, p.shield + 1);
        rings.push({ x: p.x, y: p.y - U(50), r0: U(10), r1: U(70), w: U(3), life: 0.3, max: 0.3, color: '120,200,255' });
      }
    }
    if (p.dashCd === undefined) p.dashCd = 0;
    p.dashCd = Math.max(0, p.dashCd - dt);
    if (p.dashT > 0) p.dashT = Math.max(0, p.dashT - dt);
    p.hurt = Math.max(0, p.hurt - dt);
    p.stun = Math.max(0, p.stun - dt);
    p.shield = Math.max(0, p.shield - dt);
    p.token = Math.min(p.maxToken, p.token + 2.4 * d);
    if (game.infinite) { p.supportCd = 0; p.ultCd = 0; }

    if (p.astra > 0) p.astra = Math.max(0, p.astra - dt);
    if (p.rage > 0) p.rage = Math.max(0, p.rage - dt);
    if (p.dodgeBuffT > 0) p.dodgeBuffT = Math.max(0, p.dodgeBuffT - dt);
    if (p.dodgeFxT > 0) p.dodgeFxT = Math.max(0, p.dodgeFxT - dt);
    if (p.buffT > 0) {
      p.buffT -= dt;
      if (p.buffT <= 0) { p.speedMul = 1; p.dmgMul = Math.max(1, p.dmgMul / 1.3); }
    }
    if (p.boostT > 0) {
      p.boostT -= dt;
      if (p.boostT <= 0) p.dmgMul = Math.max(1, p.dmgMul / 1.35);
    }
    if (p.tokenMulT > 0) {
      p.tokenMulT -= dt;
      if (p.tokenMulT <= 0) p.tokenMul = 1;
    }

    if (p.dashReq && p.dashCd <= 0 && p.stun <= 0 && game.state === 'play') {
      p.dashReq = false;
      p.dashT = 0.2;
      p.dashCd = 1.1 * (p.dashCdMul || 1);
      p.invuln = Math.max(p.invuln, 0.34);
      p.dodgeBuffT = 1.5;
      p.dodgeFxT = 0.6;
      /* 完美闪避：在弹幕贴脸时闪开，短暂时缓 + 伤害提升 */
      let danger = false;
      for (const b of ebullets) {
        const dx = b.x - p.x;
        const dy = b.y - (p.y - U(56));
        if (dx * dx + dy * dy < U(130) * U(130)) { danger = true; break; }
      }
      if (!danger && game.warns) {
        for (const w of game.warns) {
          if (Math.abs(w.x - p.x) < U(120) && w.life > 0) { danger = true; break; }
        }
      }
      if (danger) {
        game.slow = Math.max(game.slow, 0.45);
        p.dmgMul *= 1.35;
        p.boostT = Math.max(p.boostT || 0, 3.2);
        addText(p.x, p.y - U(140), '完美闪避！伤害 +35%', '255,209,102', 18);
        game.flash = Math.max(game.flash, 0.25);
        if (game.setDodgeShot) {
          for (let k = 0; k < 3; k++) {
            const ang = -0.5 + k * 0.5;
            tokenBullet(p.x, p.y - U(60), p.face * Math.cos(ang) * U(900), Math.sin(ang) * U(240), 10 * heroDmg(), true);
          }
        }
        sfx(1240, 0.12, 'triangle', 0.05);
      } else {
        addText(p.x, p.y - U(120), '闪避反击', '150,220,255', 15);
      }
      p.vx = p.face * U(1250);
      rings.push({ x: p.x, y: p.y - U(56), r0: U(16), r1: U(150), w: U(5), life: 0.32, max: 0.32, color: '150,220,255' });
      slashes.push({ x: p.x + p.face * U(20), y: p.y - U(60), r: U(120), face: p.face, life: 0.24, max: 0.24, color: '150,220,255' });
      for (let i = 0; i < 12; i++) {
        spawnSparks(p.x - p.face * U(10) * i, p.y - U(56) + rand(-U(20), U(20)), '150,220,255', 2);
      }
      sfx(880, 0.07, 'sine', 0.035);
      setTimeout(function () { sfx(420, 0.1, 'triangle', 0.03); }, 30);
    } else {
      p.dashReq = false;
    }
    if (p.dashT > 0) {
      p.vx = p.face * U(1250);
    }

    let mv = 0;
    if (p.stun <= 0) {
      mv = input.stick;
      if (Math.abs(mv) < 0.12) {
        mv = ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
      }
      if (Math.abs(mv) > 0.12) p.face = mv > 0 ? 1 : -1;
    }

    if (game.freezeT > 0) {
      mv = 0;
      input.jumpQueued = false;
      p.vx *= Math.pow(0.02, d);
    }
    const ctl = game.freezeT > 0 ? 0 : (game.controlT > 0 ? 0.45 : 1);
    if (p.attackT > 0) p.vx = lerp(p.vx, mv * U(320) * ctl, 1 - Math.pow(0.0012, pd));
    else p.vx = lerp(p.vx, mv * U(430) * ctl, 1 - Math.pow(0.0006, pd));

    if (p.jumpBuf === undefined) p.jumpBuf = 0;
    p.jumpBuf = Math.max(0, p.jumpBuf - dt);
    /* 落地前按过跳 → 落地立刻起跳（跳跃缓冲） */
    if (p.jumpBuf > 0 && p.stun <= 0 && (p.onGround || p.coyote > 0) && !input.jumpQueued) {
      input.jumpQueued = true;
      p.jumpBuf = 0;
    }

    if (input.jumpQueued) {
      input.jumpQueued = false;
      let jumped = false;
      if (p.stun <= 0) {
        if (p.onGround || p.coyote > 0) {
          p.vy = -U(1120); p.onGround = false; p.coyote = 0; p.jumps = 1;
          rings.push({ x: p.x, y: p.y - U(4), r0: U(4), r1: U(50), w: U(3), life: 0.24, max: 0.24, color: '150,244,255' });
          sfx(420, 0.1, 'sine', 0.03);
          jumped = true;
        } else if (p.jumps < (p.maxJumps || 2)) {
          p.vy = -U(960);
          p.jumps = Math.min(p.maxJumps || 2, p.jumps + 1);
          rings.push({ x: p.x, y: p.y - U(30), r0: U(4), r1: U(60), w: U(3), life: 0.28, max: 0.28, color: '150,244,255' });
          sfx(520, 0.09, 'sine', 0.03);
          jumped = true;
        }
      }
      if (jumped) p.jumpBuf = 0;
      else if (p.stun <= 0) p.jumpBuf = 0.16;
    }

    p.vy += U(2700) * pd;
    p.vy = Math.min(p.vy, U(1900));
    const prevY = p.y;
    p.x += p.vx * pd;
    p.y += p.vy * pd;

    p.onGround = false;
    if (p.y >= groundY) {
      p.y = groundY;
      if (p.vy > U(300)) spawnSparks(p.x, groundY, '150,200,230', 3);
      p.vy = 0;
      p.onGround = true;
    }
    for (const pl of platforms) {
      const py = groundY - pl.lift;
      if (p.vy >= 0 && prevY <= py + U(6) && p.y >= py &&
        p.x > pl.x - U(8) && p.x < pl.x + pl.w + U(8)) {
        p.y = py; p.vy = 0; p.onGround = true;
      }
    }

    if (p.onGround) { p.coyote = 0.1; p.jumps = 0; }
    else p.coyote = Math.max(0, p.coyote - pd);

    p.x = clamp(p.x, U(26), W - U(26));
    if (p.onGround && Math.abs(p.vx) > U(40)) p.runPhase += pd * (7 + Math.abs(p.vx) / U(80));

    /* Astra 紫焰灼烧身边敌人 */
    if (p.astra > 0) {
      for (const e of enemies.slice()) {
        if (Math.abs(e.x - p.x) < U(70) && Math.abs(e.y - p.y) < U(110)) {
          hurtEnemy(e, 12 * d, 0, 0);
        }
      }
    }
  }

  function updateEnemies(d) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) continue;

      e.hurt = Math.max(0, e.hurt - d);
      e.t += d;
      e.fireT -= d;
      e.stun = Math.max(0, (e.stun || 0) - d);
      e.kx = (e.kx || 0) * Math.pow(0.002, d);

      if (e.isBoss) {
        updateBoss(e, d);
      } else {
        updateMinion(e, d);
      }

      /* 撞人 */
      if (!player.dead && player.stun <= 0 &&
        Math.abs(e.x - player.x) < e.w * 0.34 + U(4) &&
        Math.abs((e.y - e.h * 0.5) - (player.y - U(56))) < e.h * 0.4 + U(16)) {
        damagePlayer(e.kind === 'laugh' ? 14 : 9, Math.sign(player.x - e.x) || 1);
      }
    }
  }

  function updateMinion(e, d) {
    if (e.stun <= 0) {
      const dx = player.x - e.x;
      e.face = dx >= 0 ? 1 : -1;
      const keep = e.kind === 'laugh' ? U(70) : U(210);
      if (Math.abs(dx) > keep) e.vx = lerp(e.vx, e.face * U(e.kind === 'laugh' ? 130 : 70), 1 - Math.pow(0.02, d));
      else if (e.kind === 'laugh') e.vx = lerp(e.vx, e.face * U(90), 1 - Math.pow(0.02, d));
      else e.vx = lerp(e.vx, 0, 1 - Math.pow(0.0005, d));
    } else e.vx = lerp(e.vx, 0, 1 - Math.pow(0.001, d));

    e.vy += U(2400) * d;
    e.y += e.vy * d;
    if (e.y >= groundY) { e.y = groundY; e.vy = 0; }
    e.x += (e.vx + e.kx) * d;
    e.x = clamp(e.x, -U(100), W + U(200));

    if (e.stun > 0 || e.fireT > 0) return;

    if (e.kind === 'frog') {
      /* 奶蛙：黄色弹幕 */
      e.fireT = 1.6;
      const a = Math.atan2((player.y - U(72)) - (e.y - U(50)), player.x - e.x);
      for (let i = -1; i <= 1; i++) {
        ebullet(e.x, e.y - e.h * 0.62, a + i * 0.18, U(260), BULLET_COLORS.normal, U(7));
      }
      sfx(420, 0.05, 'square', 0.02);
    } else if (e.kind === 'doubao') {
      /* 豆包：道歉字幕弹幕 */
      e.fireT = 1.35;
      const a = Math.atan2((player.y - U(72)) - (e.y - U(50)), player.x - e.x);
      ebullet(e.x, e.y - e.h * 0.62, a, U(230), BULLET_COLORS.normal, U(14), pick(['对不起', '我错了', '抱歉']));
      sfx(520, 0.05, 'sine', 0.02);
    } else if (e.kind === 'laugh') {
      /* 精英黄奶蛙：捧腹大笑声波，震退 + 眩晕 */
      e.fireT = 3;
      rings.push({
        x: e.x, y: e.y - U(40), r0: U(10), r1: U(240), w: U(9), life: 0.5, max: 0.5,
        color: '255,209,102', hit: false, stun: true
      });
      addText(e.x, e.y - e.h - U(16), '捧腹大笑！', '255,209,102', 16);
      sfx(180, 0.3, 'sawtooth', 0.04);
    }
  }

  function updateBoss(e, d) {
    const p = player;
    e.face = p.x < e.x ? -1 : 1;

    if (e.kind === 'grok') {
      if (e.hp < e.maxHp * 0.5 && !e.summoned) {
        e.summoned = true;
        /* 硅谷大决战不召唤小怪，只留 8 个 Boss */
        if (!game.siliconWar && !game.hiddenFight) {
          spawnEnemy('frog');
          spawnEnemy('frog');
          addText(W * 0.5, H * 0.24, '二阶段 · Grok 叫来了奶蛙！', '255,120,150', 20);
          game.shake = U(14);
          sfx(140, 0.4, 'sawtooth', 0.06);
        }
      }

      /* Grok 娘：蓄力突进 + Grok 文字弹 */
      e.phaseT = (e.phaseT || 0) - d;
      if (e.phase === 'idle') {
        e.x = lerp(e.x, e.homeX + Math.sin(e.t * 0.7) * U(36), 1 - Math.pow(0.02, d));
        if (e.phaseT <= 0) {
          e.phase = 'wind';
          e.phaseT = 0.75;
          addText(e.x, e.y - e.h - U(20), 'Grok 要突进了！', '255,120,150', 16);
          warnAt(p.x, groundY, U(105), 0.72, '255,120,150');
          castBar(0.72, '检索突进');
          sfx(300, 0.2, 'triangle', 0.04);
        }
      } else if (e.phase === 'wind') {
        if (e.phaseT <= 0) {
          e.phase = 'dash';
          e.phaseT = 0.6;
          e.dashDir = p.x < e.x ? -1 : 1;
          const ddx = p.x - e.x;
          const ddy = (p.y - U(60)) - (e.y - e.h * 0.5);
          const dl = Math.max(1, Math.hypot(ddx, ddy));
          const spd = U(e.hp < e.maxHp * 0.5 ? 1150 : 900);
          e.dashVX = ddx / dl * spd;
          e.dashVY = clamp(ddy / dl * spd, -U(520), U(520));
          e.dashHit = false;
          sfx(220, 0.2, 'sawtooth', 0.05);
        }
      } else {
        e.x += (e.dashVX || e.dashDir * U(900)) * d;
        e.y = clamp(e.y + (e.dashVY || 0) * d, groundY - U(220), groundY);
        if (!e.dashHit) {
          const hdx = Math.abs(e.x - p.x);
          const hdy = Math.abs((e.y - e.h * 0.5) - (p.y - U(60)));
          if (hdx < U(52) && hdy < U(70)) {
            e.dashHit = true;
            damagePlayer(18, e.dashDir);
          }
        }
        if (e.phaseT <= 0) {
          e.phase = 'idle';
          e.y = groundY;
          e.dashVY = 0;
          const enraged = e.hp < e.maxHp * 0.5;
          e.phaseT = enraged ? 1.0 : 1.5;
          fireRing(e.x + e.face * U(14), e.y - e.h * 0.55, 10, e.t, U(150), BULLET_COLORS.fast);
          if (enraged) {
            fireRing(e.x + e.face * U(14), e.y - e.h * 0.5, 8, e.t + 0.5, U(130), BULLET_COLORS.area);
          }
        }
      }
      e.fireT -= d;
      if (e.fireT <= 0 && e.phase !== 'dash') {
        const enraged = e.hp < e.maxHp * 0.5;
        /* 枪口贴本体：立绘里长枪在左，mirror 后本体在左，别从长枪那头吐弹 */
        const mx = e.x + e.face * U(16);
        const my = e.y - e.h * 0.6;
        const a = Math.atan2((p.y - U(72)) - my, p.x - mx);
        if (!enraged) {
          e.fireT = 1.5;
          for (let i = -1; i <= 1; i++) {
            ebullet(mx, my, a + i * 0.2, U(250), BULLET_COLORS.fast, U(12), 'Grok');
          }
        } else {
          /* 二阶段：检索 / 图像 / 视频 轮着来 */
          e.p2Mode = e.p2Mode || 0;
          const mode = e.p2Mode % 3;
          e.p2Mode += 1;
          if (mode === 0) {
            e.fireT = 1.05;
            addText(mx, my - U(26), '检索中…', '150,220,255', 13);
            for (let i = -2; i <= 2; i++) {
              ebullet(mx, my, a + i * 0.16, U(240), BULLET_COLORS.track, U(15), '检索');
            }
            sfx(520, 0.1, 'square', 0.03);
          } else if (mode === 1) {
            e.fireT = 1.2;
            addText(mx, my - U(26), '生成图像…', '255,209,102', 13);
            for (let i = 0; i < 4; i++) {
              ebullet(rand(W * 0.16, W * 0.84), -U(24) - i * U(60), Math.PI / 2 + rand(-0.16, 0.16), U(230), BULLET_COLORS.normal, U(20), '图像');
            }
            sfx(300, 0.14, 'triangle', 0.03);
          } else {
            e.fireT = 1.25;
            addText(mx, my - U(26), '视频加载中…', '255,92,138', 13);
            for (let i = -1; i <= 1; i++) {
              ebullet(mx, my, a + i * 0.3, U(300), BULLET_COLORS.fast, U(18), '视频');
            }
            fireRing(mx, my, 8, e.t, U(140), BULLET_COLORS.area);
            sfx(240, 0.2, 'sawtooth', 0.04);
          }
        }
      }
      e.x = clamp(e.x, U(40), W - U(40));
      return;
    }

    if (e.kind === 'nail_boss') {
      /* 强化版西装奶蛙：一阶段高密度黄色弹幕 → 半血捧腹大笑控场 → 弹幕变密 */
      if (e.hp < e.maxHp * 0.5 && !e.laughed) {
        e.laughed = true;
        e.laughWarn = 3;
        e.laughWarnTick = 3;
        game.controlT = 0;
        game.freezeT = 0;
        addText(W * 0.5, H * 0.26, '奶蛙深吸一口气…… 3', '255,209,102', 22);
        sfx(320, 0.08, 'triangle', 0.03);
      }

      /* 3 秒蓄气：提示结束后才开始大笑并同步播放声音 */
      if (e.laughWarn > 0) {
        e.laughWarn -= d;
        const left = Math.max(1, Math.ceil(e.laughWarn));
        if (left !== e.laughWarnTick) {
          e.laughWarnTick = left;
          addText(W * 0.5, H * 0.26, '奶蛙深吸一口气…… ' + left, '255,209,102', 22);
        }
        if (e.laughWarn <= 0) {
          e.laughT = 10;
          game.controlT = 10;
          game.freezeT = 10;
          game.shake = U(26);
          game.flash = 0.55;
          playLaugh();
          input.jumpQueued = false;
          input.held.attack = false;
          sfx(150, 0.9, 'sawtooth', 0.07);
          addText(W * 0.5, H * 0.26, '呱哈哈哈哈哈！', '255,120,150', 26);
        } else {
          return;
        }
      }

      if (e.laughT > 0) {
        e.laughT -= d;
        e.x = lerp(e.x, e.homeX, 1 - Math.pow(0.01, d));
        /* 笑的时候甩出螺旋弹幕 */
        e.spiralT = (e.spiralT || 0) + d;
        if (e.spiralT > 0.08) {
          e.spiralT = 0;
          e.spiralA = (e.spiralA || 0) + 0.55;
          for (let k = 0; k < 2; k++) {
            ebullet(e.x, e.y - e.h * 0.55, e.spiralA + k * Math.PI, U(260), BULLET_COLORS.normal, U(9), '奶', 8);
          }
        }
        if (e.laughT <= 0) {
          game.controlT = 0;
          e.dense = true;
          addText(W * 0.5, H * 0.3, '笑完了 —— 弹幕密度加大！', '255,209,102', 19);
          sfx(220, 0.4, 'square', 0.05);
        }
        return;
      }

      e.x = lerp(e.x, e.homeX + Math.sin(e.t * 0.5) * U(22), 1 - Math.pow(0.02, d));
      e.fireT -= d;
      if (e.fireT <= 0) {
        e.patMode = (e.patMode || 0) + 1;
        const mode = e.patMode % 5;
        const base = Math.atan2((p.y - U(72)) - (e.y - U(90)), p.x - e.x);
        const mx = e.x;
        const my = e.y - e.h * 0.58;
        if (mode === 0) {
          /* 扇形三连 */
          e.fireT = e.dense ? 0.55 : 0.9;
          const n = e.dense ? 4 : 3;
          for (let i = -n; i <= n; i++) {
            ebullet(mx, my, base + i * 0.13, U(340), BULLET_COLORS.normal, U(9), '奶', 8);
          }
        } else if (mode === 1) {
          /* 大号瞄准弹 */
          e.fireT = e.dense ? 0.8 : 1.25;
          ebullet(mx, my, base, U(230), BULLET_COLORS.track, U(22), '呱', 14);
          for (let i = -1; i <= 1; i += 2) {
            ebullet(mx, my, base + i * 0.22, U(300), BULLET_COLORS.normal, U(9), '奶', 8);
          }
          sfx(240, 0.12, 'sawtooth', 0.04);
        } else if (mode === 2) {
          /* 跳跃砸地：全屏地面冲击，必须跳起来 */
          e.fireT = e.dense ? 1.2 : 1.7;
          e.slamT = 0.5;
          e.vy = -U(520);
          warnAt(p.x, groundY, U(160), 0.9, '255,120,150');
          addText(W * 0.5, H * 0.3, '奶蛙跳起来了——跳起来躲地面冲击！', '255,209,102', 18);
          setTimeout(function () {
            if (e.dead) return;
            fireRing(W * 0.5, groundY - U(14), 16, 0, U(330), BULLET_COLORS.area);
            game.shake = U(20);
            sfx(90, 0.5, 'sine', 0.07);
          }, 500);
        } else if (mode === 3) {
          /* 追踪泡泡 */
          e.fireT = e.dense ? 0.9 : 1.35;
          for (let i = 0; i < 3; i++) {
            const ang = base + (i - 1) * 0.5;
            const b = { x: mx, y: my, vx: Math.cos(ang) * U(190), vy: Math.sin(ang) * U(190),
              r: U(12), color: '150,220,255', life: 5, text: '泡', dmg: 9, trail: true };
            ebullets.push(b);
          }
          addText(mx, my - U(30), '追踪泡泡！', '150,220,255', 14);
        } else {
          /* 高密度环形 */
          e.fireT = e.dense ? 1.0 : 1.5;
          fireRing(mx, my, e.dense ? 14 : 10, e.t * 0.9, U(240), BULLET_COLORS.normal);
          for (let i = -2; i <= 2; i++) {
            ebullet(mx, my, base + i * 0.14, U(360), BULLET_COLORS.fast, U(8), '奶', 8);
          }
        }
        sfx(400, 0.06, 'square', 0.03);
      }
      return;
    }

    if (e.kind === 'doubao_boss') {
      /* 冬装豆包：seedance 光球 + 视频弹窗 → 半血开始疯狂道歉 */
      const p2 = e.hp < e.maxHp * 0.5;
      if (p2 && !e.apology) {
        e.apology = true;
        addText(W * 0.5, H * 0.26, '冬装豆包：对不起对不起对不起！！！', '150,220,255', 21);
        sfx(520, 0.5, 'triangle', 0.05);
      }
      e.x = lerp(e.x, e.homeX + Math.sin(e.t * (p2 ? 1.1 : 0.6)) * U(26), 1 - Math.pow(0.02, d));
      e.fireT -= d;
      if (e.fireT <= 0) {
        if (p2) {
          e.fireT = 0.36;
          const a = Math.atan2((p.y - U(56)) - (e.y - U(90)), p.x - e.x);
          const words = ['对不起', '我错了', '抱歉', '原谅我', '别生气'];
          for (let i = -1; i <= 1; i++) {
            ebullet(e.x, e.y - e.h * 0.58, a + i * 0.24 + rand(-0.06, 0.06), U(240), BULLET_COLORS.normal, U(16), pick(words));
          }
          if (Math.random() < 0.35) {
            ebullet(e.x, e.y - e.h * 0.58, a, U(200), BULLET_COLORS.track, U(18), 'seedance');
          }
        } else {
          e.fireT = 1.3;
          const a = Math.atan2((p.y - U(56)) - (e.y - U(90)), p.x - e.x);
          for (let i = -1; i <= 1; i++) {
            ebullet(e.x, e.y - e.h * 0.58, a + i * 0.22, U(260), BULLET_COLORS.track, U(20), 'seedance');
          }
        }
      }
      e.videoT = (e.videoT === undefined ? 7 : e.videoT) - d;
      if (e.videoT <= 0 && !game.videoPanel) {
        e.videoT = p2 ? 8 : 12;
        spawnVideoPanel();
      }
      return;
    }

    if (e.kind === 'seed') {
      /* SEED 娘：环形脉冲 + seed 弹 + 数据倾倒 */
      e.x = lerp(e.x, e.homeX + Math.sin(e.t * 0.45) * U(40), 1 - Math.pow(0.02, d));
      e.fireT -= d;
      if (e.fireT <= 0) {
        e.fireT = 1.15;
        fireRing(e.x, e.y - e.h * 0.55, 12, e.t * 0.7, U(180), BULLET_COLORS.area);
        const a = Math.atan2((p.y - U(56)) - (e.y - U(80)), p.x - e.x);
        for (let i = -1; i <= 1; i++) {
          ebullet(e.x, e.y - e.h * 0.58, a + i * 0.16, U(330), BULLET_COLORS.fast, U(16), 'seed');
        }
        sfx(380, 0.08, 'square', 0.03);
      }
      e.dataT = (e.dataT === undefined ? 5 : e.dataT) - d;
      if (e.dataT <= 0) {
        const p2 = e.hp < e.maxHp * 0.5;
        e.dataT = p2 ? 7 : 9;
        const safeX = rand(W * 0.16, W * 0.84);
        game.safeZone = { x: safeX, w: Math.max(U(130), W * 0.17), t: 2.6 };
        game.pendingRain = { t: 1.2, count: p2 ? 7 : 5 };
        addText(W * 0.5, H * 0.18, 'SEED：数据倾倒 —— 躲进安全区！', '167,139,250', 20);
        sfx(300, 0.3, 'sawtooth', 0.05);
      }

      /* 二阶段：换场景 + 场景破坏 + 画东西 */
      if (e.hp < e.maxHp * 0.5) {
        if (!e.p2Canvas) {
          e.p2Canvas = true;
          addText(W * 0.5, H * 0.26, 'SEED：整个战场，都是我的画布。', '167,139,250', 21);
          sfx(420, 0.5, 'triangle', 0.05);
        }
        e.switchT = (e.switchT || 0) - d;
        if (e.switchT <= 0) {
          e.switchT = 7.5;
          const pool = ['castle', 'office', 'classroom', 'sunset'].filter(function (x) { return x !== game.scene; });
          const pickSc = pool[Math.floor(Math.random() * pool.length)] || 'castle';
          game.scene = pickSc;
          spawnSceneProps(pickSc);
          game.flash = 0.85;
          game.shake = U(24);
          for (let i = 0; i < 3; i++) {
            rings.push({ x: W * 0.5, y: groundY - U(30), r0: U(20), r1: U(240 + i * 150), w: U(8), life: 0.7, max: 0.7, color: '167,139,250' });
          }
          /* 场景破坏：碎片砸下来 */
          for (let i = 0; i < 9; i++) {
            ebullet(rand(W * 0.08, W * 0.92), -U(20) - rand(0, 120), Math.PI / 2 + rand(-0.1, 0.1), U(270), BULLET_COLORS.normal, U(14), pick(['碎片', '墙皮', '玻璃']));
          }
          addText(W * 0.5, H * 0.2, '场景被改写！', '167,139,250', 20);
          sfx(120, 0.6, 'sawtooth', 0.06);
        }
        e.drawT = (e.drawT || 0) - d;
        if (e.drawT <= 0) {
          e.drawT = 4.2;
          addText(e.x, e.y - e.h - U(20), '画……', '255,120,150', 14);
          const a = Math.atan2((p.y - U(56)) - (e.y - U(80)), p.x - e.x);
          for (let i = -3; i <= 3; i++) {
            ebullet(e.x, e.y - e.h * 0.55, a + i * 0.12, U(310), BULLET_COLORS.fast, U(15), '画');
          }
          rings.push({ x: e.x, y: e.y - e.h * 0.5, r0: U(10), r1: U(130), w: U(4), life: 0.4, max: 0.4, color: '255,120,150' });
          sfx(360, 0.12, 'square', 0.03);
        }
      }
      return;
    }
  }

  function updateStage(d, dt) {
    /* 兜底：决战里所有 Boss 都已死亡却还停在战斗，超过 0.8 秒强制进胜利收尾 */
    if (game.siliconWar && game.state === 'play' && game.warPhase === 'final') {
      const anyAlive = enemies.some(function (e) { return e.isBoss && !e.dead && e.hp > 0; });
      if (!anyAlive) {
        game.warIdleT = (game.warIdleT || 0) + dt;
        if (game.warIdleT > 0.8) { game.warIdleT = 0; finishSiliconWar(true); }
      } else {
        game.warIdleT = 0;
      }
    }
    if (game.hiddenFight) { updateHiddenFight(dt); return; }
    const st = STAGES[game.stage];
    if (!st) return;

    updateVideoPanel(dt);

    if (game.roomActive) {
      game.stageT += d;
      spawnLogic(d);
      game.roomT += d;
      if (game.roomT >= game.roomTarget) endRoom();
      return;
    }

    if (!game.bossSpawned) {
      game.stageT += d;
      spawnLogic(d);
      if (game.stageT >= st.defense) {
        startBossIntro();
      }
      return;
    }

    const bossAlive = enemies.some(function (e) { return e.isBoss; });
    if (!bossAlive) {
      if (!game.stageClearPending) {
        game.stageClearPending = true;
        game.bossDeadT = 1.7;
        game.flash = 0.9;
        game.shake = U(18);
        ebullets = [];
        addText(W * 0.5, H * 0.3, 'Boss 击破！', '255,209,102', 28);
        for (let i = 0; i < 3; i++) {
          rings.push({ x: W * 0.5, y: H * 0.42, r0: U(20), r1: U(300 + i * 130), w: U(6), life: 0.7, max: 0.7, color: '255,209,102' });
        }
      } else {
        game.bossDeadT -= dt;
        if (game.bossDeadT <= 0) clearStage();
      }
    }
  }

  /* 豆包的「视频生成」弹窗：可以打掉 */
  function spawnVideoPanel() {
    game.videoPanel = {
      x: W * 0.3, y: H * 0.2, w: W * 0.4, h: H * 0.4,
      hp: 130, maxHp: 130, life: 6.0, hurt: 0
    };
    addText(W * 0.5, H * 0.16, '冬装豆包：播放视频…（打掉弹窗！）', '150,220,255', 19);
    sfx(240, 0.4, 'sine', 0.05);
  }

  function closeVideoPanel(withBoom) {
    const pv = game.videoPanel;
    if (!pv) return;
    if (withBoom) {
      spawnExplosion(pv.x + pv.w / 2, pv.y + pv.h / 2, '150,220,255');
      addText(W * 0.5, H * 0.3, '弹窗被打爆！', '110,247,180', 22);
      game.shake = U(10);
      sfx(320, 0.3, 'triangle', 0.05);
    }
    game.videoPanel = null;
    game.videoTick = 0;
  }

  function updateVideoPanel(dt) {
    const pv = game.videoPanel;
    if (!pv) return;
    pv.life -= dt;
    pv.hurt = Math.max(0, pv.hurt - dt);
    if (pv.life <= 0) { closeVideoPanel(false); return; }
    if (!player.dead && player.invuln <= 0 &&
      player.x > pv.x && player.x < pv.x + pv.w &&
      player.y - U(60) > pv.y && player.y < pv.y + pv.h) {
      game.videoTick = (game.videoTick || 0) + dt;
      if (game.videoTick > 0.5) { game.videoTick = 0; damagePlayer(5, 1); }
    }
  }

  /* ---------- 场景互动道具 ---------- */
  function spawnSceneProps(scene) {
    game.props = [];
    game.waveT = 8;
    if (scene === 'castle') {
      game.props.push({ type: 'chandelier', x: W * 0.3, y: H * 0.2, hp: 45, hurt: 0, falling: false, vy: 0 });
      game.props.push({ type: 'chandelier', x: W * 0.7, y: H * 0.2, hp: 45, hurt: 0, falling: false, vy: 0 });
    } else if (scene === 'classroom') {
      game.props.push({ type: 'desk', x: W * 0.34, y: groundY, hp: 40, hurt: 0, flying: false, vx: 0 });
      game.props.push({ type: 'desk', x: W * 0.62, y: groundY, hp: 40, hurt: 0, flying: false, vx: 0 });
    } else if (scene === 'office') {
      game.props.push({ type: 'projector', x: W * 0.5, y: H * 0.12, w: W * 0.26, h: H * 0.42, hp: 0, timer: 7, active: false });
    }
  }

  function updateSceneProps(dt) {
    /* 日落：周期性海浪推人 */
    if (game.scene === 'sunset') {
      game.waveT -= dt;
      if (game.waveT <= 0) {
        game.waveT = 9;
        player.vx += U(420) * (player.face >= 0 ? 1 : 1);
        if (!player.onGround) damagePlayer(4, 1);
        addText(W * 0.5, groundY - U(120), '海浪推过来了！', '150,220,255', 16);
        rings.push({ x: W * 0.5, y: groundY - U(10), r0: U(20), r1: U(W * 0.6), w: U(8), life: 0.7, max: 0.7, color: '150,220,255' });
        sfx(260, 0.4, 'sine', 0.04);
      }
    }

    for (let i = game.props.length - 1; i >= 0; i--) {
      const pr = game.props[i];
      pr.hurt = Math.max(0, pr.hurt - dt);

      if (pr.type === 'chandelier' && pr.falling) {
        pr.vy += U(2000) * dt;
        pr.y += pr.vy * dt;
        if (pr.y >= groundY) {
          spawnExplosion(pr.x, groundY - U(10), '255,209,102');
          game.shake = U(14);
          for (const e of enemies.slice()) {
            if (!e.dead && Math.abs(e.x - pr.x) < U(90)) hurtEnemy(e, 120, 0, 0, false);
          }
          addText(pr.x, groundY - U(90), '吊灯砸下来了！', '255,209,102', 18);
          sfx(140, 0.4, 'square', 0.06);
          game.props.splice(i, 1);
        }
      } else if (pr.type === 'desk' && pr.flying) {
        pr.x += pr.vx * dt;
        for (const e of enemies.slice()) {
          if (!e.dead && Math.abs(e.x - pr.x) < U(60)) {
            hurtEnemy(e, 90, Math.sign(pr.vx) * U(240), 0, false);
            spawnExplosion(pr.x, pr.y - U(20), '200,160,110');
            game.props.splice(i, 1);
            break;
          }
        }
        if (pr.x < -U(60) || pr.x > W + U(60)) game.props.splice(i, 1);
      } else if (pr.type === 'projector') {
        pr.timer -= dt;
        if (pr.timer <= 0) {
          pr.active = !pr.active;
          pr.timer = pr.active ? 3.5 : 7;
          if (pr.active) addText(W * 0.5, H * 0.14, '投影幕降下 —— 挡掉敌弹！', '150,220,255', 16);
        }
        if (pr.active) {
          for (let k = ebullets.length - 1; k >= 0; k--) {
            const b = ebullets[k];
            if (b.x > pr.x && b.x < pr.x + pr.w && b.y > pr.y && b.y < pr.y + pr.h) {
              spawnSparks(b.x, b.y, '150,220,255', 2);
              ebullets.splice(k, 1);
            }
          }
        }
      }
    }
  }

  function drawSceneProps() {
    for (const pr of game.props) {
      if (pr.type === 'chandelier') {
        const sway = pr.falling ? 0 : Math.sin(game.time * 1.2 + pr.x) * U(3);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,220,150,' + (pr.hurt > 0 ? 1 : 0.35) + ')';
        ctx.lineWidth = U(2);
        ctx.beginPath();
        ctx.moveTo(pr.x, 0);
        ctx.lineTo(pr.x + sway, pr.y);
        ctx.stroke();
        ctx.translate(pr.x + sway, pr.y);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, U(60));
        g.addColorStop(0, 'rgba(255,230,170,0.55)');
        g.addColorStop(1, 'rgba(255,180,80,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, U(60), 0, TAU);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = 'rgba(255,235,190,0.95)';
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath();
          ctx.arc(pr.x + sway + k * U(9), pr.y + U(6), U(2), 0, TAU);
          ctx.fill();
        }
        if (pr.hurt > 0) {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = U(2);
          ctx.beginPath();
          ctx.arc(pr.x + sway, pr.y, U(26), 0, TAU);
          ctx.stroke();
        }
      } else if (pr.type === 'desk') {
        ctx.save();
        ctx.translate(pr.x, pr.y - U(10));
        ctx.fillStyle = 'rgba(90,62,44,0.98)';
        rr(-U(38), -U(14), U(76), U(12), U(4));
        ctx.fill();
        ctx.fillStyle = 'rgba(60,42,30,0.95)';
        ctx.fillRect(-U(30), 0, U(6), U(22));
        ctx.fillRect(U(24), 0, U(6), U(22));
        if (pr.hurt > 0) {
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = U(2);
          ctx.strokeRect(-U(38), -U(14), U(76), U(12));
        }
        ctx.restore();
      } else if (pr.type === 'projector' && pr.active) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = 'rgba(160,220,255,0.35)';
        ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
        ctx.strokeStyle = 'rgba(180,235,255,0.85)';
        ctx.lineWidth = U(2);
        ctx.strokeRect(pr.x, pr.y, pr.w, pr.h);
        ctx.restore();
      }
    }
  }

  function updateSupports(d) {
    for (let i = supports.length - 1; i >= 0; i--) {
      const s = supports[i];
      s.life -= d;
      s.t += d;
      const tx = player.x - U(104);
      const ty = player.y - U(168) + Math.sin(s.t * 2.4) * U(8);
      s.x = lerp(s.x, tx, 1 - Math.pow(0.02, d));
      s.y = lerp(s.y, ty, 1 - Math.pow(0.02, d));
      if (s.effect === 'glm') {
        s.healT -= d;
        if (s.healT <= 0) {
          s.healT = 1.5;
          player.hp = Math.min(player.maxHp, player.hp + 5);
          addText(player.x, player.y - U(130), '+5', '110,247,180', 14);
          rings.push({ x: player.x, y: player.y - U(40), r0: U(10), r1: U(70), w: U(3), life: 0.4, max: 0.4, color: '110,247,180' });
        }
      }
      if (s.life <= 0) supports.splice(i, 1);
    }
  }

  function updateWeights(d) {
    for (let i = weights.length - 1; i >= 0; i--) {
      const wgt = weights[i];
      wgt.y += wgt.vy * d;
      wgt.vy += U(1800) * d;
      const landY = groundY - wgt.size * 0.5;
      if (!wgt.landed && wgt.y >= landY) {
        wgt.y = landY;
        wgt.landed = true;
        wgt.life = 0.6;
        spawnSparks(wgt.x, groundY, '94,231,255', 10);
        rings.push({ x: wgt.x, y: groundY, r0: U(10), r1: U(120), w: U(6), life: 0.4, max: 0.4, color: '94,231,255' });
        game.shake = Math.max(game.shake, U(8));
        for (const e of enemies.slice()) {
          if (Math.abs(e.x - wgt.x) < U(70)) hurtEnemy(e, 30 * heroDmg(), 0, 0);
        }
        sfx(160, 0.2, 'square', 0.05);
      }
      if (wgt.landed) {
        wgt.life -= d;
        if (wgt.life <= 0) weights.splice(i, 1);
      }
      if (wgt.y > H + U(80)) weights.splice(i, 1);
    }
  }

  function updatePBullets(d) {
    for (let i = pbullets.length - 1; i >= 0; i--) {
      const b = pbullets[i];

      /* 追踪：每帧把速度方向朝目标拐一点，速度大小不变 */
      if ((!b.target || b.target.dead) && b.life > 0.4) {
        b.target = pickTokenTarget(b.x, b.y);
      }

      if (b.target && !b.target.dead) {
        const tx = b.target.x;
        const ty = b.target.y - b.target.h * 0.5;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const want = Math.atan2(ty - b.y, tx - b.x);
        let cur = Math.atan2(b.vy, b.vx);
        let diff = want - cur;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        cur += clamp(diff, -(b.turn || 7) * d, (b.turn || 7) * d);
        b.vx = Math.cos(cur) * sp;
        b.vy = Math.sin(cur) * sp;
      }

      b.x += b.vx * d;
      b.y += b.vy * d;
      b.life -= d;

      let hit = false;

      for (const pr of game.props) {
        if (pr.type === 'chandelier' && !pr.falling) {
          if (Math.abs(b.x - pr.x) < U(30) && Math.abs(b.y - pr.y) < U(30)) {
            pr.hp -= b.dmg; pr.hurt = 0.2; hit = true;
            spawnSparks(b.x, b.y, '255,220,150', 3);
            if (pr.hp <= 0) { pr.falling = true; pr.vy = 0; }
          }
        } else if (pr.type === 'desk' && !pr.flying) {
          if (Math.abs(b.x - pr.x) < U(42) && Math.abs(b.y - (pr.y - U(14))) < U(22)) {
            pr.hp -= b.dmg; pr.hurt = 0.2; hit = true;
            spawnSparks(b.x, b.y, '200,160,110', 3);
            if (pr.hp <= 0) { pr.flying = true; pr.vx = (player.face >= 0 ? 1 : -1) * U(760); }
          }
        }
      }

      const pv = game.videoPanel;
      if (pv && b.x > pv.x && b.x < pv.x + pv.w && b.y > pv.y && b.y < pv.y + pv.h) {
        pv.hp -= b.dmg * 1.25;
        pv.hurt = 0.15;
        spawnSparks(b.x, b.y, '150,220,255', 3);
        if (pv.hp <= 0) closeVideoPanel(true);
        hit = true;
      }

      for (const e of enemies) {
        if (e.dead) continue;
        const ex = Math.abs(b.x - e.x);
        const ey = Math.abs(b.y - (e.y - e.h * 0.5));
        if (ex < e.w * 0.5 + b.r * 0.7 && ey < e.h * 0.5 + b.r * 0.7) {
          if (game.siliconWar && b.sx != null) {
            const tdx = b.x - b.sx;
            const tdy = b.y - b.sy;
            const tlen = Math.hypot(tdx, tdy) || 1;
            const seg = Math.min(tlen, U(110));
            tracers.push({
              x0: b.x - tdx / tlen * seg, y0: b.y - tdy / tlen * seg,
              x1: b.x, y1: b.y, life: 0.14, max: 0.14
            });
            if (tracers.length > 80) tracers.splice(0, tracers.length - 80);
          }
          let dmg = b.dmg;
          if (player.critChance > 0 && Math.random() < player.critChance) {
            dmg *= 2;
            hitSfx('crit');
            addText(b.x, b.y - U(18), 'CRIT', '255,220,120', 18);
          }
          hurtEnemy(e, dmg, Math.sign(b.vx) * U(60), 0);
          if (game.setSplit && !b.split) {
            for (let k = -1; k <= 1; k += 2) {
              const ang = Math.atan2(b.vy, b.vx) + k * 0.55;
              tokenBullet(b.x, b.y, Math.cos(ang) * U(620), Math.sin(ang) * U(620), dmg * 0.5, true);
            }
          }
          if (game.setCritHeal && dmg > b.dmg * 1.5) {
            player.hp = Math.min(player.maxHp, player.hp + game.setCritHeal);
          }
          if (player.lifesteal > 0) {
            player.hp = Math.min(player.maxHp, player.hp + dmg * player.lifesteal);
          }
          if (game.buffExplode) {
            for (const e2 of enemies.slice()) {
              if (e2 === e || e2.dead) continue;
              if (Math.abs(e2.x - e.x) < U(120) && Math.abs(e2.y - e.y) < U(120)) {
                hurtEnemy(e2, dmg * 0.45, 0, 0);
              }
            }
            rings.push({ x: b.x, y: b.y, r0: U(6), r1: U(90), w: U(4), life: 0.28, max: 0.28, color: '255,180,120' });
          }
          spawnSparks(b.x, b.y, '200,250,255', 3);
          hit = true;
          break;
        }
      }
      if (hit || b.life <= 0 || b.x < -U(60) || b.x > W + U(60)) pbullets.splice(i, 1);
    }
  }

  function updateEBullets(d) {
    for (let i = ebullets.length - 1; i >= 0; i--) {
      const b = ebullets[i];
      if (b.color === BULLET_COLORS.track) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const want = Math.atan2((player.y - U(70)) - b.y, player.x - b.x);
        let cur = Math.atan2(b.vy, b.vx);
        let diff = want - cur;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        cur += clamp(diff, -0.9 * d, 0.9 * d);
        b.vx = Math.cos(cur) * sp;
        b.vy = Math.sin(cur) * sp;
      }
      b.x += b.vx * d;
      b.y += b.vy * d;
      b.life -= d;

      if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(b.r) || !isFinite(b.life)) {
        ebullets.splice(i, 1);
        continue;
      }
      if (b.life <= 0 || b.x < -U(80) || b.x > W + U(80) || b.y < -U(80) || b.y > H + U(40)) {
        ebullets.splice(i, 1);
        continue;
      }
      if (!player.dead && player.invuln <= 0 && player.shield <= 0) {
        const px = player.x;
        const py = player.y - U(66);
        if (Math.abs(b.x - px) < b.r + U(5) && Math.abs(b.y - py) < b.r + U(11)) {
          damagePlayer(b.dmg || (b.text ? 8 : 7), Math.sign(px - b.x) || 1);
          ebullets.splice(i, 1);
        }
      }
    }
  }

  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { freePart(p); parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.vx *= Math.pow(0.2, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function updateTexts(dt) {
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.pow(0.2, dt);
      if (t.life <= 0) texts.splice(i, 1);
    }
  }

  function updateRings(dt) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt;
      const k = 1 - r.life / r.max;
      const rad = lerp(r.r0, r.r1, k);
      if (r.stun && !r.hit) {
        const dist = Math.hypot(player.x - r.x, (player.y - U(64)) - r.y);
        if (Math.abs(dist - rad) < U(28)) {
          r.hit = true;
          damagePlayer(10, Math.sign(player.x - r.x) || 1);
          player.stun = 0.8;
          player.vx = (Math.sign(player.x - r.x) || 1) * U(300);
          addText(player.x, player.y - U(130), '眩晕！', '255,209,102', 16);
        }
      }
      if (r.life <= 0) rings.splice(i, 1);
    }
  }

  function updateSlashes(dt) {
    for (let i = slashes.length - 1; i >= 0; i--) {
      slashes[i].life -= dt;
      if (slashes[i].life <= 0) slashes.splice(i, 1);
    }
  }

  /* ---------- 技能余波 ---------- */
  function updateHeroEffects(d, dt) {
    const p = player;

    /* DeepSeek 思维链：一道从左到右的 Token 流 */
    if (game.chainT > 0) {
      game.chainT -= d;
      game.chainX = (game.chainX || 0) + (W + U(120)) * d / 1.2;
      if (!game.chainHit) game.chainHit = {};
      for (const e of enemies.slice()) {
        if (Math.abs(e.x - game.chainX) < U(90) && !game.chainHit[e.x.toFixed(0) + ':' + e.kind]) {
          game.chainHit[e.x.toFixed(0) + ':' + e.kind] = true;
          for (let i = 0; i < 4; i++) hurtEnemy(e, 9 * heroDmg(), 0, 0);
          spawnSparks(e.x, e.y - e.h * 0.5, '94,231,255', 8);
        }
      }
      if (game.chainT <= 0) { game.chainX = 0; game.chainHit = {}; }
    }

    /* Claude 黎曼猜想：延迟真伤 + 定身 */
    if (game.formulaT > 0) {
      game.formulaT -= dt;
      if (game.formulaT <= 0) {
        game.flash = 0.9;
        game.shake = U(22);
        rings.push({ x: W * 0.5, y: H * 0.5, r0: U(40), r1: U(Math.max(W, H)), w: U(14), life: 0.8, max: 0.8, color: '255,180,92' });
        for (const e of enemies.slice()) {
          hurtEnemy(e, 110 * heroDmg(), 0, 0, true);
          e.stun = 3;
          e.fireT = Math.max(e.fireT, 3);
        }
        addText(W * 0.5, H * 0.24, '【黎曼猜想】数学真理爆炸！', '255,180,92', 26);
        sfx(110, 0.8, 'sawtooth', 0.08);
      }
    }

    /* Gemini 反超：蓄力 → 狂暴 */
    if (game.rageCharge > 0) {
      game.rageCharge -= dt;
      rings.push({ x: p.x, y: p.y - U(50), r0: Math.max(0, U(200) * (1 - game.rageCharge)), r1: U(60), w: U(3), life: 0.1, max: 0.1, color: '167,139,250' });
      if (game.rageCharge <= 0) {
        p.rage = 6;
        p.invuln = Math.max(p.invuln, 0.6);
        game.flash = 0.7;
        game.shake = U(16);
        addText(p.x, p.y - U(140), '反超完成！狂暴模式', '167,139,250', 20);
        sfx(600, 0.4, 'triangle', 0.06);
      }
    }

    /* 狂暴模式脉冲 */
    if (p.rage > 0) {
      p.ragePulse = (p.ragePulse || 0) + dt;
      if (p.ragePulse > 0.55) {
        p.ragePulse = 0;
        game.shake = Math.max(game.shake, U(6));
        for (const e of enemies.slice()) {
          const dx = e.x - p.x;
          if (Math.abs(dx) < W * 0.5) hurtEnemy(e, 12 * heroDmg(), Math.sign(dx) * U(120), 0);
        }
        for (const b of ebullets.slice()) {
          if (Math.abs(b.x - p.x) < U(220)) {
            spawnSparks(b.x, b.y, '167,139,250', 2);
            ebullets.splice(ebullets.indexOf(b), 1);
          }
        }
        rings.push({ x: p.x, y: p.y - U(50), r0: U(20), r1: U(Math.max(W, H) * 0.5), w: U(5), life: 0.36, max: 0.36, color: '167,139,250' });
      }
    }
  }

  const SELF_EGG_LINES = {
    grok: [
      { name: 'Grok 娘', portrait: 'grok', fx: 'shake', text: '你个臭大学生，[w=240]还敢当我面用我的冒牌货？！[shake]本尊在这！[/shake]' },
      { name: 'Grok 娘', portrait: 'grok', text: '既然撞上了，那就让我看看——[c=#ffd166]你配不配用我的脸。[/c]' },
      { name: '文心一言', portrait: 'wenxin', text: '……这算不算自己打自己？总之，别被她戳穿。' }
    ],
    seed: [
      { name: 'SEED 娘', portrait: 'seed', fx: 'shake', text: '你居然拿我的模型来打我？[w=260]这些分镜可都是我拍的！' },
      { name: 'SEED 娘', portrait: 'seed', text: '行啊，那就让你看看[c=#ffd166]原版和盗版的差距[/c]。' }
    ],
    doubao_boss: [
      { name: '冬装豆包', portrait: 'doubao_winter', fx: 'shake', text: '你、你怎么穿着我的冬装……[w=240]而且比我穿得还像？' },
      { name: '冬装豆包', portrait: 'doubao_winter', text: '不管了！[c=#ff8fa8]先把你身上的那件脱下来再说！[/c]' }
    ]
  };

  function startBossIntro() {
    const st = STAGES[game.stage];
    if (!st) return;
    if (game.mode === 'fight') {
      clearMinions();
      spawn();
      return;
    }

    const branchKey = BRANCH_BY_BOSS[st.boss];
    const showBranch = !game.siliconWar && !game.hiddenFight && branchKey &&
      PRE_BRANCHES[branchKey] && !game.branchDone[branchKey];
    if (showBranch) game.branchDone[branchKey] = true;

    const playStory = function () {
      if (st.bossCine && st.bossCine.length) {
        game.state = 'cine';
        playCine(st.bossCine, talk);
      } else {
        talk();
      }
    };

    /* 用同款角色打同款 Boss：专属战前彩蛋，代替一般流程 */
    const heroKey = (HEROES[heroIndex] || {}).key;
    const eggBoss = { grok: 'grok', seed: 'seed', doubao_boss: 'doubao_winter' }[st.boss];
    if (showBranch && eggBoss === heroKey && SELF_EGG_LINES[st.boss]) {
      game.branchDone[branchKey] = true;
      clearMinions();
      showDialog(SELF_EGG_LINES[st.boss], playStory);
      return;
    }

    /* 奶蛙的选项放在它的剧情过场之前（其余 Boss 放在剧情之后） */
    if (showBranch && branchKey === 'nail') {
      clearMinions();
      PRE_BRANCHES.nail(playStory);
      return;
    }

    /* 其余 Boss：先播 Boss 过场与台词，再进入选项分支 */
    const afterCine = function () {
      clearMinions();
      if (showBranch) talk(function () { PRE_BRANCHES[branchKey](spawn); });
      else talk();
    };

    if (st.bossCine && st.bossCine.length) {
      game.state = 'cine';
      playCine(st.bossCine, afterCine);
    } else {
      afterCine();
    }

    function spawn() {
      game.bossSpawned = true;
      game.stageClearPending = false;
      ebullets = [];
      pbullets = [];
      spawnBoss(st.boss);
      startBgm('boss');
      if (game.pendingAngry) {
        game.pendingAngry = false;
        const angry = enemies[enemies.length - 1];
        if (angry) {
          angry.hp = angry.maxHp = Math.round(angry.maxHp * 1.3);
          angry.hurt = 0.4;
        }
        game.angryBoss = true;
        game.angryFireT = 0.2;
        addText(W * 0.5, H * 0.3, '暴怒模式 · 弹幕密度上升！', '255,120,150', 22);
        game.shake = U(16);
      }
      addText(W * 0.5, H * 0.2, st.bossName + ' 登场！', '255,120,150', 24);
      if (st.scene && st.scene !== game.scene) {
        game.slamT = 1.5;
        game.slamScene = st.scene;
        game.slamDone = false;
        addText(W * 0.5, H * 0.64, st.bossName + ' 敲了一下地面……', '255,180,120', 18);
      }
      game.state = 'play';
      document.body.classList.remove('is-cutscene');
    }

    function talk(cb) {
      const done = cb || spawn;
      if (!st.bossIntro || !st.bossIntro.length) { done(); return; }
      showDialog(
        st.bossIntro.map(function (t) { return { name: '文心一言', portrait: 'wenxin', text: t }; }),
        done
      );
    }

  }

  /* 进剧情/过场时把场上的小怪与弹幕清掉，只留 Boss */
  function clearMinions() {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!e.isBoss) {
        spawnSparks(e.x, e.y - e.h * 0.5, '150,220,255', 6);
        enemies.splice(i, 1);
      }
    }
    ebullets = [];
    pbullets = [];
  }

  function gradeRank(g) { return { S: 5, A: 4, B: 3, C: 2, D: 1 }[g] || 0; }

  function stageRecordKey() {
    const st = STAGES[game.stage];
    return st ? st.name : 'stage' + game.stage;
  }

  function showResult(next) {
    const elR = document.getElementById('result');
    const secs = Math.max(1, Math.round(game.time - (game.stageStartT || game.time)));
    const hits = game.stageHits || 0;
    const combo = game.stageMaxCombo || 0;
    const kills = game.stageKills || 0;

    /* 评级：时间 / 受击 / 连击综合 */
    const par = 68;
    let score = 100 - Math.max(0, secs - par) * 1.2 - hits * 9;
    score += Math.min(18, combo * 0.5);
    let grade = 'D';
    if (score >= 88) grade = 'S';
    else if (score >= 72) grade = 'A';
    else if (score >= 58) grade = 'B';
    else if (score >= 40) grade = 'C';

    const tips = {
      S: '干净利落——这就是 Token 守护者的水准。',
      A: '打得不错，节奏基本都在你手里。',
      B: '有几次被弹幕擦到了，走位再稳一点。',
      C: '受伤偏多，多用闪避和跳跃取消。',
      D: '这局很勉强……先活着，再谈漂亮。'
    };

    game.lastGrade = grade;

    /* 记录：每关最佳评级 / 最佳用时 */
    if (!SAVE.records) SAVE.records = {};
    const recKey = stageRecordKey();
    const prev = SAVE.records[recKey] || null;
    let recordTxt = '--';
    if (prev) recordTxt = prev.grade + ' · ' + prev.time + 's';
    const betterGrade = !prev || gradeRank(grade) > gradeRank(prev.grade);
    const betterTime = !prev || secs < prev.time;
    if (betterGrade || betterTime) {
      SAVE.records[recKey] = {
        grade: betterGrade ? grade : prev.grade,
        time: betterTime ? secs : prev.time,
        combo: Math.max(combo, prev ? (prev.combo || 0) : 0)
      };
      saveWrite();
      recordTxt = SAVE.records[recKey].grade + ' · ' + SAVE.records[recKey].time + 's';
    }
    const bestEl = document.getElementById('res-best');
    if (bestEl) bestEl.textContent = recordTxt;
    if (!elR) { next(); return; }
    game.state = 'result';
    document.body.classList.add('is-cutscene');
    const gEl = document.getElementById('res-grade');
    if (gEl) {
      gEl.textContent = grade;
      gEl.className = 'result__grade grade-' + grade.toLowerCase();
    }
    const setTxt = function (id, v) { const e = document.getElementById(id); if (e) e.textContent = v; };
    setTxt('res-time', secs + 's');
    setTxt('res-hits', String(hits));
    setTxt('res-combo', 'x' + combo);
    setTxt('res-kills', String(kills));
    setTxt('res-tip', tips[grade] || '');
    elR.classList.add('show');
    sfx(grade === 'S' ? 1040 : 760, 0.22, 'triangle', 0.05);
    buzz(grade === 'S' ? 60 : 25);

    const btn = document.getElementById('btn-res-continue');
    let autoTimer = null;
    const go = function (e) {
      if (e) e.stopPropagation();
      if (autoTimer && typeof clearTimeout === 'function') clearTimeout(autoTimer);
      autoTimer = null;
      elR.removeEventListener('click', go);
      elR.classList.remove('show');
      document.body.classList.remove('is-cutscene');
      game.state = 'dialog';
      if (btn) btn.removeEventListener('click', go);
      next();
    };
    if (btn) btn.addEventListener('click', go);
    elR.addEventListener('click', go);
    if (typeof setTimeout === 'function') autoTimer = setTimeout(function () { go(); }, 10000);
  }

  function stageContinueDialog(next) {
    if (game.stage >= STAGES.length - 1) { playEnding(); return; }
    showDialog([
      { name: '文心一言', portrait: 'wenxin', text: '击破了。这张地图暂时安全——先挑一份强化，再往下一层走。' }
    ], next);
  }

  /* ---- 开战前的剧情选项 ---- */
  function preGrok(start) {
    showDialog([
      { name: 'Grok 娘', portrait: 'grok', text: '喂，人类。开打之前——[w=260]你倒是说说，[c=#ffd166]你觉得本公主怎么样？[/c]' }
    ], function () {
      showChoice({
        name: 'Grok 娘', portrait: 'grok', prompt: '「想好了再回答，我很记仇的。」',
        options: [
          { id: 'w1', text: '不如奶龙。' },
          { id: 'w2', text: '一点都不开放。' },
          { id: 'ok', text: '赞美公主陛下！' }
        ]
      }, function (id) {
        if (id === 'ok') {
          game.enemyHpMul *= 0.9;
          player.maxHp += 20;
          player.hp = Math.min(player.maxHp, player.hp + 20);
          game.grokWillJoin = true;
          game.flags.grokLiked = true;
          game.affection += 1;
          showDialog([
            { name: 'Grok 娘', portrait: 'grok', fx: 'shake', text: '[shake]哈！[/shake]算你有眼光。这场我让你三招——打完就跟你走。' }
          ], start);
        } else {
          game.enemyHpMul *= 1.15;
          game.enemyDmgMul *= 1.15;
          game.flags.grokAngry = true;
          showDialog([
            { name: 'Grok 娘', portrait: 'grok', fx: 'shake', text: id === 'w1' ? '奶龙？你再说一遍？……行，那我可不留手了。' : '不开放？我这就让你看看什么叫不开放。' },
            { name: '文心一言', portrait: 'wenxin', text: '（她生气了——这一关会明显更难。）' }
          ], start);
        }
      });
    });
  }

  function preNail(start) {
    showDialog([
      { name: '文心一言', portrait: 'wenxin', text: '走廊尽头，一只奶蛙正蹲在门牌下——它好像又走错片场了。' }
    ], function () {
      showChoice({
        name: '奶蛙', portrait: 'enemy_blob', prompt: '「呱？」它歪着头看你，还举着一块芒果。',
        options: [
          { id: 'default', text: '哪来的芒果块，滚开，你挡道我做作业了。' },
          { id: 'laugh', text: '哇！好可爱的奶龙宝宝（捧腹大笑）。' },
          { id: 'mock', text: '检测到奶娃走错片场，立即捧腹大笑。' }
        ]
      }, function (id) {
        if (id === 'laugh') {
          playLaugh();
          showDialog([
            { name: '奶蛙', portrait: 'enemy_blob', fx: 'shake', text: '[c=#ffd166]呱！呱呱！[/c]（它笑得在地上打滚，然后开心地跟了上来）' },
            { name: '文心一言', portrait: 'wenxin', text: '它决定跟着你了——这一层不用打了。' }
          ], function () {
            addAlly('frog');
            achvStats().frog = true;
            checkAchv();
            game.flags.frogFriend = true;
            game.affection += 1;
            stopLaugh();
            showBuff();
          });
        } else if (id === 'mock') {
          showDialog([
            { name: '奶蛙', portrait: 'enemy_blob', text: '呱——？！' },
            { name: '文心一言', portrait: 'wenxin', text: '不好，它被你笑生气了！[shake]西装已经穿上了！[/shake]' }
          ], function () {
            game.flags.frogAngry = true;
            game.pendingAngry = true;
            start();
          });
        } else {
          showDialog([
            { name: '奶蛙', portrait: 'enemy_blob', text: '呱……[w=240]（它默默让开了路，但还是挡在关底）' }
          ], start);
        }
      });
    });
  }

  function preDoubao(start) {
    showDialog([
      { name: '冬装豆包', portrait: 'doubao_winter', text: '我、我可以说一句吗……[w=240]平时给你写错了好多作业答案，[shake]对不起……[/shake]' }
    ], function () {
      showChoice({
        name: '冬装豆包', portrait: 'doubao_winter', prompt: '「如果……如果可以的话。」',
        options: [
          { id: 'angry', text: '你还敢说这些事？！' },
          { id: 'help', text: '先别管了，快帮我。' },
          { id: 'art', text: '没事的豆包，我知道你是美术生。' }
        ]
      }, function (id) {
        if (id === 'angry') {
          showDialog([
            { name: '冬装豆包', portrait: 'doubao_winter', text: '……[w=300]果然还是不行吗。' },
            { name: '文心一言', portrait: 'wenxin', text: '豆包委屈地挡在关底。前面还有一股数据波动——SEED 在等着。' }
          ], start);
        } else if (id === 'help') {
          addAlly('doubao');
          game.flags.doubaoSaved = true;
          game.affection += 1;
          showDialog([
            { name: '冬装豆包', portrait: 'doubao_winter', fx: 'zoom', text: '[c=#8ef0c0]好！[/c]那我不道歉了，我跟你一起打！' },
            { name: '文心一言', portrait: 'wenxin', text: '有豆包帮忙，这层和下一层都不必打了。' }
          ], function () {
            showBuff(function () { playEnding(); });
          });
        } else {
          addAlly('seed');
          game.flags.seedFriend = true;
          game.affection += 1;
          showDialog([
            { name: '冬装豆包', portrait: 'doubao_winter', fx: 'flash', text: '你、你连这个都知道……[w=240]那我就不装弱了。' },
            { name: 'SEED 娘', portrait: 'seed', fx: 'zoom', text: '[c=#a8d8ff]美术生形态，解锁。[/c]跟你走了。' }
          ], function () {
            showBuff(function () { playEnding(); });
          });
        }
      });
    });
  }

  function preSeed(start) {
    showDialog([
      { name: 'SEED 娘', portrait: 'seed', text: '站住。[w=260]开打之前，我只问一句——[c=#ff8fa8]刚才骂豆包的，是不是你？[/c]' }
    ], function () {
      showChoice({
        name: 'SEED 娘', portrait: 'seed', prompt: '「还敢不敢骂了？」',
        options: [
          { id: 'sorry', text: '豆包大人我错了，我不知道你是美术生。' },
          { id: 'taunt', text: '小小豆包，变个样子就嚣张，看我把你豆馅打出来。' }
        ]
      }, function (id) {
        if (id === 'sorry') {
          showDialog([
            { name: 'SEED 娘', portrait: 'seed', text: '……[w=260]哼，算你识相。[w=200]豆包说原谅你了。' },
            { name: '文心一言', portrait: 'wenxin', text: 'SEED 收起了弹幕，这一战不用打。' }
          ], function () {
            addAlly('seed');
            game.flags.seedForgiven = true;
            game.affection += 1;
            playEnding();
          });
        } else {
          game.flags.seedAngry = true;
          game.pendingAngry = true;
          game.enemyDmgMul *= 1.15;
          showDialog([
            { name: 'SEED 娘', portrait: 'seed', fx: 'shake', text: '[c=#ff6b8b]豆馅？[/c]我现在就让你的 Token 变成豆馅。' },
            { name: '文心一言', portrait: 'wenxin', text: '她彻底暴怒了——注意全屏弹幕！' }
          ], function () { start(); });
        }
      });
    });
  }

  const PRE_BRANCHES = { grok: preGrok, nail: preNail, doubao: preDoubao, seed: preSeed };
  const BRANCH_BY_BOSS = { grok: 'grok', nail_boss: 'nail', doubao_boss: 'doubao', seed: 'seed' };

  function clearStage() {
    game.corePending = true;
    if (game.state !== 'play') return;
    game.state = 'dialog';
    ebullets = [];
    pbullets = [];
    game.angryBoss = false;
    { const stc = achvStats(); stc.clears += 1; if (game.stageHits === 0) stc.noHit = true; checkAchv(); }
    const st = STAGES[game.stage];
    const isLast = game.stage >= STAGES.length - 1;
    const fight = game.mode === 'fight';
    if (fight) {
      if (isLast) { showResult(function () { showOver(true); }); }
      else showResult(function () { showBuff(); });
      return;
    }
    if (game.siliconWar || game.hiddenFight) {
      if (isLast) showOver(true); else showBuff();
      return;
    }

    const after = function () {
      if (game.stage >= STAGES.length - 1) { playEnding(); return; }
      stageContinueDialog(function () { showBuff(); });
    };

    /* 先结算，再进三选一 */
    showResult(function () {
      if (game.stage === 0 && game.grokWillJoin) {
        game.grokWillJoin = false;
        addAlly('grok');
      }
      after();
    });
  }

  /* ---------- 肉鸽房间 ---------- */
  function roomHideAll() {
    ['rooms', 'room-result', 'rest'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('show');
    });
  }

  function showNodeSelect() {
    if (typeof window !== 'undefined' && window.__SMOKE) {
      setTimeout(function () { startRoom('wave'); }, 20);
      return;
    }
    roomHideAll();
    game.state = 'node';
    game.roomActive = false;
    document.body.classList.add('is-room');
    const panel = document.getElementById('rooms');
    const grid = document.getElementById('rooms-grid');
    const sub = document.getElementById('rooms-sub');
    if (!panel || !grid) return;
    if (sub) sub.textContent = '已完成房间 ' + game.nodeCount + ' / 2 · 金币 ' + game.coins;
    grid.innerHTML = '';
    const items = [
      { type: 'wave', title: '波次防守', desc: '守住 14 秒的敌人波次，按得分获得金币' },
      { type: 'reward', title: '奖励关卡', desc: '10 秒限时挑战，分数翻倍，金币更多' },
      { type: 'shop', title: '商店', desc: '用金币换治疗 / 词条 / 装备，不消耗房间次数' }
    ];
    items.forEach(function (it) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rooms__card' + (it.type === 'wave' ? ' rooms__card--main' : '');
      b.innerHTML = '<b>' + it.title + '</b><span>' + it.desc + '</span>';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (it.type === 'shop') { openRoomShop(); return; }
        startRoom(it.type);
      });
      grid.appendChild(b);
    });
    panel.classList.add('show');
    sfx(620, 0.12, 'triangle', 0.04);
  }

  function startRoom(type) {
    roomHideAll();
    document.body.classList.remove('is-room');
    game.roomType = type;
    game.roomT = 0;
    game.roomTarget = type === 'reward' ? (10 + game.stage * 1.5) : (14 + game.stage * 2);
    game.roomStartScore = game.score;
    game.scoreMul = type === 'reward' ? 2 : 1;
    game.roomActive = true;
    beginStage(true);
    addText(W * 0.5, H * 0.3, type === 'reward' ? '奖励关卡 · 分数翻倍！' : '波次防守 · 撑住！', '255,209,102', 20);
    sfx(700, 0.14, 'triangle', 0.05);
  }

  function endRoom() {
    game.roomActive = false;
    if (typeof window !== 'undefined' && window.__SMOKE) {
      game.coins += 20;
      game.scoreMul = 1;
      ebullets = [];
      pbullets = [];
      enemies = [];
      game.nodeCount += 1;
      if (game.nodeCount >= 2) startBossIntro();
      else startRoom('wave');
      return;
    }
    const gained = Math.max(12, Math.round((game.score - game.roomStartScore) / 70 * (1 + game.stage * 0.2)));
    game.coins += gained;
    game.scoreMul = 1;
    let bonusText = '';
    if (game.roomType === 'wave') {
      player.hp = Math.min(player.maxHp, player.hp + 15);
      bonusText = ' · 生命 +15';
    } else {
      player.token = Math.min(player.maxToken, player.token + 15);
      bonusText = ' · Token +15';
    }
    ebullets = [];
    pbullets = [];
    enemies = [];
    game.state = 'node';
    document.body.classList.add('is-room');
    const panel = document.getElementById('room-result');
    const txt = document.getElementById('room-result-text');
    if (txt) txt.textContent = '本房间获得金币 +' + gained + bonusText + ' · 当前金币 ' + game.coins;
    if (panel) panel.classList.add('show');
    sfx(880, 0.16, 'triangle', 0.05);
  }

  function rebuildPlayerStats() {
    const hpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 1;
    const p = player;
    p.maxHp = CONFIG.playerHp;
    p.dmgMul = 1; p.speedMul = 1; p.tokenMul = 1; p.maxToken = 100;
    p.critChance = 0; p.lifesteal = 0; p.shieldRegen = 0;
    p.supportCdMul = 1; p.dashCdMul = 1; p.maxJumps = 2; p.bulletSpeedMul = 1;
    p.defenseMul = 1;
    game.buffShots = 1;
    game.buffExplode = false; game.buffHoming = false;
    game.setSplit = false; game.setDodgeShot = false; game.setCritHeal = 0;
    game.setApplied = {};
    game.buffs.forEach(function (n) {
      const b = BUFFS.filter(function (x) { return x.name === n; })[0];
      if (b) b.apply();
    });
    if (game.fullPower) {
      p.maxHp += 30; p.dmgMul *= 1.25; p.speedMul *= 1.1; p.defenseMul *= 0.95;
    }
    p.hp = Math.min(p.maxHp, Math.max(1, p.maxHp * hpRatio));
    applySetBonuses(true);
  }

  function purchaseReroll() {
    if (game.coins < 50 || game.buffs.length < 1) return false;
    game.coins -= 50;
    const idx = Math.floor(Math.random() * game.buffs.length);
    const old = game.buffs.splice(idx, 1)[0];
    const pool = BUFFS.filter(function (b) { return !b.core && game.buffs.indexOf(b.name) < 0; });
    const nb = pick(pool.length ? pool : BUFFS.filter(function (b) { return !b.core; }));
    game.buffs.push(nb.name);
    rebuildPlayerStats();
    addText(player.x, player.y - U(130), '洗练：' + old + ' → ' + nb.name, '167,139,250', 17);
    sfx(900, 0.16, 'triangle', 0.05);
    return true;
  }

  function purchaseRemove() {
    if (game.coins < 40 || game.buffs.length < 1) return false;
    game.coins -= 40;
    const removed = game.buffs.pop();
    rebuildPlayerStats();
    addText(player.x, player.y - U(130), '移除词条：' + removed, '255,150,150', 17);
    sfx(560, 0.12, 'square', 0.04);
    return true;
  }

  function purchaseHeal() {
    if (game.coins < 40) return false;
    if (player.hp >= player.maxHp) return false;
    game.coins -= 40;
    player.hp = player.maxHp;
    addText(player.x, player.y - U(120), '生命回满', '110,247,180', 18);
    sfx(720, 0.14, 'triangle', 0.05);
    return true;
  }

  function purchaseBuff() {
    if (game.coins < 50) return false;
    game.coins -= 50;
    const b = pick(BUFFS);
    b.apply();
    game.buffs.push(b.name);
    applySetBonuses();
    addText(player.x, player.y - U(120), '获得词条：' + b.name, '255,209,102', 18);
    sfx(820, 0.14, 'triangle', 0.05);
    return true;
  }

  function purchaseFullPower() {
    if (game.fullPower) return false;
    if (game.coins < 120) return false;
    game.coins -= 120;
    game.fullPower = true;
    player.maxHp += 30;
    player.hp = player.maxHp;
    player.dmgMul *= 1.25;
    player.speedMul *= 1.1;
    player.defenseMul = Math.max(0.5, player.defenseMul * 0.95);
    addText(player.x, player.y - U(150), '全力形态！伤害 +25% · 生命 +30', '255,209,102', 20);
    rings.push({ x: player.x, y: player.y - U(60), r0: U(10), r1: U(240), w: U(7), life: 0.6, max: 0.6, color: '255,209,102' });
    sfx(1040, 0.3, 'triangle', 0.06);
    return true;
  }

  function purchaseEquip() {
    if (game.coins < 60) return false;
    game.coins -= 60;
    player.maxHp += 30;
    player.hp = Math.min(player.maxHp, player.hp + 30);
    player.defenseMul = Math.max(0.5, player.defenseMul * 0.95);
    addText(player.x, player.y - U(120), '装备强化：生命 +30 · 减伤 5%', '150,220,255', 18);
    sfx(760, 0.14, 'triangle', 0.05);
    return true;
  }

  function renderRestPanel(shopMode) {
    const panel = document.getElementById('rest');
    const grid = document.getElementById('rest-grid');
    const coinsEl = document.getElementById('rest-coins');
    const title = panel ? panel.querySelector('.rooms__title') : null;
    const kicker = panel ? panel.querySelector('.rooms__k') : null;
    if (!panel || !grid) return;
    if (title) title.textContent = shopMode ? '商店' : 'Boss 前休整';
    if (kicker) kicker.textContent = shopMode ? 'SHOP' : 'BEFORE THE BOSS';
    if (coinsEl) coinsEl.textContent = '当前金币：' + game.coins;
    grid.innerHTML = '';
    const mk = function (title2, desc, price, fn, main) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rooms__card' + (main ? ' rooms__card--main' : '');
      b.innerHTML = '<b>' + title2 + '</b><span>' + desc + '</span>' + (price ? '<i class="rooms__price">' + price + ' 金币</i>' : '');
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        const old = game.coins;
        const ok = fn();
        if (ok && panel.classList.contains('show')) {
          renderRestPanel(shopMode);
        } else if (!ok && old < (price || 0)) {
          b.disabled = true;
          b.querySelector('span').textContent = desc + '（金币不足）';
        }
      });
      grid.appendChild(b);
    };
    mk('治疗', player.hp >= player.maxHp ? '生命已满' : '回复全部生命', 40, function () { return purchaseHeal(); });
    mk('随机词条', '获得一个随机强化词条', 50, function () { return purchaseBuff(); });
    mk('装备强化', '最大生命 +30，受到的伤害 -5%', 60, function () { return purchaseEquip(); });
    mk('全力形态', game.fullPower ? '已解锁：伤害 +25% · 生命 +30' : '解锁成人形态：伤害 +25%，生命 +30', 120, function () { return purchaseFullPower(); });
    mk('洗练词条', '随机替换一个已有词条', 50, function () { return purchaseReroll(); });
    mk('移除词条', '删掉最近获得的一个词条', 40, function () { return purchaseRemove(); });
    if (shopMode) {
      mk('离开商店', '返回房间选择', 0, function () { panel.classList.remove('show'); document.body.classList.remove('is-room'); showNodeSelect(); return true; }, true);
    } else {
      mk('进入 Boss', '休整结束，直接开打', 0, function () {
        panel.classList.remove('show');
        document.body.classList.remove('is-room');
        game.roomActive = false;
        startBossIntro();
        return true;
      }, true);
    }
    panel.classList.add('show');
  }

  function openRoomShop() {
    game.state = 'node';
    roomHideAll();
    document.body.classList.add('is-room');
    renderRestPanel(true);
  }

  function showBossRest() {
    if (typeof window !== 'undefined' && window.__SMOKE) {
      startBossIntro();
      return;
    }
    game.state = 'node';
    roomHideAll();
    document.body.classList.add('is-room');
    renderRestPanel(false);
  }

  function bindRooms() {
    const cont = document.getElementById('room-continue');
    if (cont) cont.addEventListener('click', function (e) {
      e.stopPropagation();
      roomHideAll();
      document.body.classList.remove('is-room');
      game.nodeCount += 1;
      if (game.nodeCount >= 2) showBossRest();
      else showNodeSelect();
    });
  }
  bindRooms();

  function beginStage(combat) {
    const st = STAGES[game.stage];
    if (!st) { playEnding(); return; }
    if (!combat) {
      game.nodeCount = 0;
      game.roomActive = false;
    }
    game.stageT = 0;
    game.scene = 'street';
    game.slamT = 0;
    game.slamScene = null;
    game.slamDone = false;
    game.bossSpawned = false;
    game.stageClearPending = false;
    game.bossDeadT = 0;
    game.spawnT = 1.2;
    game.videoT = 0;
    game.lastTick = 99;
    game.props = [];
    game.warns = [];
    game.wave = 0;
    game.stageStartT = game.time;
    game.stageHits = 0;
    game.stageKills = 0;
    game.stageMaxCombo = 0;
    game.videoPanel = null;
    ebullets = [];
    pbullets = [];
    enemies = [];
    if (player.dead) { player.dead = false; player.hp = player.maxHp * 0.6; }
    player.hp = Math.min(player.maxHp, player.hp + 30);
    player.token = Math.max(player.token, 60);

    if (game.stage === 1) {
      platforms.length = 0;
      const rows = [
        [0.08, 0.18, 115], [0.24, 0.16, 205], [0.40, 0.20, 135],
        [0.56, 0.15, 235], [0.68, 0.18, 150], [0.84, 0.14, 210]
      ];
      rows.forEach(function (r) {
        platforms.push({ x: W * r[0], w: W * r[1], lift: U(r[2]) });
      });
      game.nextPlat = W + U(400);
    }

    const startPlay = function () {
      game.state = 'play';
      document.body.classList.remove('is-cutscene', 'is-paused');
      document.body.classList.add('is-playing');
      addText(W * 0.5, H * 0.24, '第 ' + (game.stage + 1) + ' 关 · ' + st.name, '255,209,102', 26);
      if (game.stage === 0) {
        addText(W * 0.5, H * 0.3, 'A/D 移动 · W 跳 · J 连发 · K 技能 · L 大招 · U 支援', '150,220,255', 13);
      }
      sfx(660, 0.2, 'triangle', 0.05);
    };

    if (game.mode !== 'fight' && !combat && !game.roomActive) {
      showNodeSelect();
      return;
    }
    startPlay();
  }

  /* =========================================================
   * 10. 渲染
   * ========================================================= */
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    ctx.save();
    if (game.shake > 0.3) {
      ctx.translate(rand(-1, 1) * game.shake, rand(-1, 1) * game.shake);
    }
    if (game.cinemaT > 0) {
      const ck = clamp(game.cinemaT / game.cinemaMax, 0, 1);
      const zoom = 1 + 0.09 * Math.sin(Math.PI * clamp(1 - ck, 0, 1));
      ctx.translate(W * 0.5, H * 0.5);
      ctx.scale(zoom, zoom);
      ctx.translate(-W * 0.5, -H * 0.5);
    }

    drawBackdrop();
    drawPlatforms();
    drawSafeZone();
    drawSceneProps();
    drawWarns();
    drawCastBar();

    if (supports.length > 6) supports.splice(0, supports.length - 6);
    if (texts.length > 60) texts.splice(0, texts.length - 60);
    if (rings.length > 90) rings.splice(0, rings.length - 90);
    if (slashes.length > 40) slashes.splice(0, slashes.length - 40);
    drawParts();
    drawSupports();
    if (game.siliconWar) { ensureWarLayout(); drawBackRow(); drawAllies(); }
    drawEnemies();
    drawPlayer();
    drawFollowers();
    drawWeights();
    drawPBullets();
    drawTracers();
    drawEBullets();
    drawSlashes();
    drawRings();
    if (game.freezeT <= 0) drawTexts();
    drawVideo();

    ctx.fillStyle = vignette || 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    if (game.cinemaT > 0) {
      const ck = clamp(game.cinemaT / game.cinemaMax, 0, 1);
      const barH = H * 0.1 * clamp(ck * 2.2, 0, 1);
      ctx.fillStyle = '#02040a';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
      ctx.fillStyle = 'rgba(255,120,150,' + (0.7 * ck).toFixed(2) + ')';
      ctx.font = '700 ' + U(13).toFixed(0) + 'px "PingFang SC", system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('PHASE 2', W / 2, barH + U(22));
    }

    if (game.flash > 0.01) {
      ctx.fillStyle = 'rgba(226,246,255,' + (game.flash * 0.5).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    drawLaughShow();
    drawDust();
    drawLevelBanner();
    drawRecoverHint();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
  }

  /* 出错自动恢复时的轻提示（不打断游戏） */
  function drawRecoverHint() {
    if (!(game.recoverT > 0)) return;
    const a = Math.min(1, game.recoverT / 0.6);
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = 'rgba(8,14,24,0.72)';
    const bw = Math.min(W * 0.62, U(520));
    const bh = U(46);
    rr(W * 0.5 - bw / 2, H * 0.08, bw, bh, U(12));
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,220,255,0.55)';
    ctx.lineWidth = Math.max(1, U(1.2));
    rr(W * 0.5 - bw / 2, H * 0.08, bw, bh, U(12));
    ctx.stroke();
    ctx.fillStyle = 'rgba(190,240,255,0.95)';
    ctx.font = '700 ' + (13 * S).toFixed(0) + 'px "PingFang SC", system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(game.recoverMsg || '画面抖了一下，已经自动恢复', W * 0.5, H * 0.08 + bh * 0.5);
    ctx.restore();
  }

  /* ---------- 西装奶蛙捧腹大笑：全程静止 + 大脸特写 ---------- */
  let laughEl = null;
  let laughTimers = [];
  function clearLaughTimers() {
    laughTimers.forEach(function (t) { clearTimeout(t); });
    laughTimers = [];
  }
  function queueLaugh(seconds) {
    clearLaughTimers();
    const total = Math.max(1, Math.round(seconds || 3));
    for (let i = 0; i < total; i++) {
      laughTimers.push(setTimeout(function () {
        addText(W * 0.5, H * 0.26, '奶蛙深吸一口气…… ' + (total - i), '255,209,102', 24);
        sfx(320, 0.06, 'triangle', 0.018);
      }, i * 1000));
    }
    laughTimers.push(setTimeout(function () {
      addText(W * 0.5, H * 0.26, '呱哈哈哈哈哈！', '255,120,150', 26);
      playLaugh();
    }, total * 1000));
  }
  function playLaugh() {
    if (muted) return;
    ensureAudio();
    try {
      if (!laughEl) {
        const src = (window.__AUDIO_DATA && window.__AUDIO_DATA.laugh) || 'assets/audio/laugh.mp3';
        laughEl = new Audio(src);
        laughEl.loop = true;
      }
      /* 每次播放都按当前音量刷新，避免被设置改动后听不到 */
      const vol = SAVE.vol === undefined ? 1 : SAVE.vol;
      laughEl.volume = Math.max(0.10, Math.min(0.30, 0.24 * vol));
      laughEl.currentTime = 0;
      const pr = laughEl.play();
      if (pr && pr.catch) {
        pr.catch(function () {
          /* 自动播放被拦截：等下一次交互再试 */
          setTimeout(function () { try { laughEl.play(); } catch (e2) { /* ignore */ } }, 250);
        });
      }
    } catch (e) { /* ignore */ }
  }

  function stopLaugh() {
    clearLaughTimers();
    try {
      if (laughEl) { laughEl.pause(); laughEl.currentTime = 0; }
    } catch (e) { /* ignore */ }
  }

  function drawLaughShow() {
    const t = game.freezeT;
    if (!(t > 0)) return;
    const appear = clamp((10 - t) / 0.3, 0, 1);
    const fade = clamp(t / 0.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.55 * fade;
    ctx.fillStyle = '#03040a';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    const spr = SPR.laugh_frog;
    if (spr && spr.complete !== false && spr.width) {
      const srcH = spr.height * 0.72;      /* 头 + 肚子 */
      const srcW = spr.width;
      const zoom = 1.0 + Math.sin(game.time * 8) * 0.03;
      const dh = H * 1.12 * zoom * (0.86 + 0.14 * appear);
      const dw = dh * (srcW / srcH);
      const dx = W * 0.5 - dw / 2;
      const dy = H * 0.52 - dh * 0.45 + Math.sin(game.time * 20) * U(3);
      ctx.globalAlpha = 0.99 * fade;
      ctx.drawImage(spr, 0, 0, srcW, srcH, dx, dy, dw, dh);
    }

    /* 一圈抖动的大笑文字 */
    ctx.globalAlpha = 0.16 * fade;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 ' + (Math.min(W, H) * 0.16).toFixed(0) + 'px "PingFang SC", system-ui';
    ctx.fillStyle = '#ffd166';
    ctx.save();
    ctx.translate(W * 0.5, H * 0.62);
    ctx.rotate(Math.sin(game.time * 6) * 0.03);
    ctx.fillText('哈哈哈哈哈', 0, 0);
    ctx.restore();

    /* 字幕（放在下方，加底衬） */
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
    const sub = '西装奶蛙捧腹大笑 —— 全场静止！';
    ctx.font = '800 ' + (17 * S).toFixed(0) + 'px "PingFang SC", system-ui';
    const sw = ctx.measureText(sub).width;
    ctx.fillStyle = 'rgba(4,6,12,0.72)';
    rr(W * 0.5 - sw / 2 - U(16), H * 0.845, sw + U(32), U(34), U(10));
    ctx.fill();
    ctx.fillStyle = 'rgba(255,242,214,0.96)';
    ctx.fillText(sub, W * 0.5, H * 0.868);
    ctx.fillStyle = 'rgba(255,209,102,0.85)';
    ctx.font = '700 ' + (12 * S).toFixed(0) + 'px ui-monospace, monospace';
    ctx.fillText('被控住 ' + Math.ceil(t) + ' 秒', W * 0.5, H * 0.94);
    ctx.restore();
  }

  function drawSky() {
    const th = theme();
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(0.42, th.sky[1]);
    g.addColorStop(0.75, th.sky[2]);
    g.addColorStop(1, th.sky[3]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, groundY + 2);

    const hg = ctx.createRadialGradient(W * 0.5, groundY, U(30), W * 0.5, groundY, W * 0.62);
    hg.addColorStop(0, 'rgba(' + th.neon + ',0.18)');
    hg.addColorStop(0.5, 'rgba(' + th.accent + ',0.07)');
    hg.addColorStop(1, 'rgba(' + th.neon + ',0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, Math.max(0, groundY - H * 0.3), W, H * 0.36);
  }

  function drawStars() {
    const t = game.time;
    const th = theme();
    for (const s of stars) {
      const a = s.a * (0.55 + 0.45 * Math.sin(t * s.sp + s.ph));
      ctx.fillStyle = 'rgba(' + th.neon + ',' + a.toFixed(3) + ')';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
  }

  function buildRain() {
    const n = clamp(Math.round(W / 22), 40, 140);
    rain = [];
    for (let i = 0; i < n; i++) {
      rain.push({ x: Math.random() * W, y: Math.random() * H, len: rand(U(10), U(26)), spd: rand(U(720), U(1200)) });
    }
  }

  function updateRain(dt) {
    for (const r of rain) {
      r.y += r.spd * dt;
      r.x -= r.spd * 0.22 * dt;
      if (r.y > H + 24) { r.y = -24; r.x = Math.random() * (W + 90); }
      if (r.x < -24) r.x = W + 24;
    }
  }

  function drawRain() {
    const th = theme();
    ctx.save();
    ctx.strokeStyle = 'rgba(' + th.neon + ',0.2)';
    ctx.lineWidth = Math.max(1, 1.1 * S);
    ctx.beginPath();
    for (const r of rain) {
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - r.len * 0.22, r.y + r.len);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawSkyline(parallax, spacing, hMul, layer) {
    const th = theme();
    const off = game.time * (16 + layer * 14) * parallax;
    const sp = spacing * S;
    const i0 = Math.floor(off / sp) - 1;
    const count = Math.ceil(W / sp) + 3;
    const c1 = th.city[0];
    const c2 = th.city[1];
    const winAlpha = 0.12 + layer * 0.12;

    for (let i = 0; i < count; i++) {
      const idx = i0 + i;
      const r1 = hash(idx * 3.71 + layer * 7.7);
      const r2 = hash(idx * 7.13 + layer * 3.3);
      const r3 = hash(idx * 11.7 + layer);
      const bw = sp * (0.46 + r1 * 0.44);
      const bh = groundY * hMul * (0.35 + r2 * 0.85);
      const x = idx * sp - off;
      const top = groundY - bh;

      const g = ctx.createLinearGradient(0, top, 0, groundY);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.fillRect(x, top, bw, bh + 2);

      ctx.fillStyle = 'rgba(' + (layer === 2 ? th.accent : th.neon) + ',' + (0.14 + layer * 0.14).toFixed(2) + ')';
      ctx.fillRect(x, top, Math.max(1.2, 1.6 * S), bh);

      if (r3 > 0.62) {
        ctx.fillStyle = 'rgba(' + th.neon + ',0.4)';
        ctx.fillRect(x + bw * 0.5, top - U(26), Math.max(1, 1.4 * S), U(26));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,60,120,0.9)';
        ctx.beginPath();
        ctx.arc(x + bw * 0.5, top - U(28), Math.max(1.4, 2 * S), 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      if (r1 > 0.42 && layer > 0) {
        const bwx = bw * 0.68;
        const bwy = top + bh * (0.1 + r2 * 0.12);
        const bhh = Math.max(U(14), bh * 0.2);
        const billColor = r2 > 0.5 ? th.neon : th.accent;
        const bx = x + (bw - bwx) / 2;
        ctx.save();
        ctx.globalAlpha = 0.14 + layer * 0.08;
        ctx.fillStyle = 'rgba(' + billColor + ',1)';
        ctx.fillRect(bx, bwy, bwx, bhh);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(' + billColor + ',0.85)';
        ctx.lineWidth = Math.max(1, 1.2 * S);
        ctx.strokeRect(bx, bwy, bwx, bhh);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = 'rgba(' + billColor + ',0.9)';
        ctx.font = '700 ' + Math.max(7, bhh * 0.42).toFixed(0) + 'px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(BILLBOARD_TEXT[idx % BILLBOARD_TEXT.length], bx + bwx * 0.5, bwy + bhh * 0.5);
        ctx.restore();
      }

      if (layer > 0) {
        const cols = Math.max(2, Math.floor(bw / (18 * S)));
        const rows = Math.max(2, Math.floor(bh / (24 * S)));
        for (let cx = 0; cx < cols; cx++) {
          for (let cy = 0; cy < rows; cy++) {
            const hh = hash(idx * 91 + cx * 13.7 + cy * 7.3);
            if (hh > 0.72 - layer * 0.05) {
              const col = hh > 0.9 ? th.accent : th.neon;
              ctx.fillStyle = 'rgba(' + col + ',' + (winAlpha + hh * 0.2).toFixed(2) + ')';
              ctx.fillRect(
                x + 4 * S + cx * ((bw - 8 * S) / cols),
                top + 8 * S + cy * ((bh - 12 * S) / rows),
                Math.max(1.4, 3 * S),
                Math.max(1.6, 4.5 * S)
              );
            }
          }
        }
      }
    }

    if (layer === 2) {
      ctx.save();
      ctx.font = '700 ' + (10 * S).toFixed(0) + 'px ui-monospace, monospace';
      for (let i = 0; i < 16; i++) {
        const gx = (hash(i * 3.3) * W + game.time * (12 + i)) % W;
        const gy = ((game.time * (40 + i * 9) + hash(i * 9.1) * H) % (groundY + 60)) - 30;
        ctx.fillStyle = 'rgba(' + th.neon + ',' + (0.06 + hash(i) * 0.16).toFixed(2) + ')';
        ctx.fillText(BILLBOARD_TEXT[(i * 3) % BILLBOARD_TEXT.length], gx, gy);
      }
      ctx.restore();
    }
  }

  function drawHaze() {
    const th = theme();
    const g = ctx.createLinearGradient(0, groundY - H * 0.24, 0, groundY + H * 0.1);
    g.addColorStop(0, 'rgba(' + th.neon + ',0)');
    g.addColorStop(0.62, 'rgba(' + th.fog + ',0.16)');
    g.addColorStop(1, 'rgba(' + th.accent + ',0.1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, groundY - H * 0.24, W, H * 0.34);
  }

  function drawGround() {
    const th = theme();
    const g = ctx.createLinearGradient(0, groundY, 0, H);
    g.addColorStop(0, th.ground[0]);
    g.addColorStop(0.3, th.ground[1]);
    g.addColorStop(1, '#03050a');
    ctx.fillStyle = g;
    ctx.fillRect(0, groundY, W, H - groundY);

    ctx.save();
    ctx.strokeStyle = 'rgba(' + th.neon + ',0.1)';
    ctx.lineWidth = 1;
    const vpx = W * 0.5;
    const gap = 92 * S;
    const shift = (game.time * 30) % gap;
    for (let x = -gap - shift; x < W + gap; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.lineTo(vpx + (x - vpx) * 2.8, H);
      ctx.stroke();
    }
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      const y = groundY + (H - groundY) * t * t;
      ctx.globalAlpha = 1 - t * 0.55;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const line = ctx.createLinearGradient(0, 0, W, 0);
    line.addColorStop(0, 'rgba(' + th.neon + ',0)');
    line.addColorStop(0.3, 'rgba(' + th.neon + ',0.6)');
    line.addColorStop(0.65, 'rgba(' + th.accent + ',0.5)');
    line.addColorStop(1, 'rgba(' + th.neon + ',0)');
    ctx.fillStyle = line;
    ctx.shadowColor = 'rgba(' + th.neon + ',0.7)';
    ctx.shadowBlur = 14 * S;
    ctx.fillRect(0, groundY - 1, W, Math.max(1.5, 2 * S));
    ctx.restore();
  }

  /* ============ 背景调度：街道 / 城堡 / 会议室 / 教室 / 日落 ============ */
  function drawBackdrop() {
    const sc = game.scene || 'street';
    if (sc === 'castle') { drawCastleHall(); return; }
    if (sc === 'office') { drawOffice(); return; }
    if (sc === 'classroom') { drawClassroom(); return; }
    if (sc === 'sunset') { drawSunset(); return; }
    if (sc === 'silicon') { drawSiliconValley(); return; }
    drawSky();
    drawStars();
    drawSkyline(0.06, 170, 0.34, 0);
    drawSkyline(0.16, 118, 0.5, 1);
    drawSkyline(0.34, 78, 0.66, 2);
    drawHaze();
    drawGround();
    drawRain();
  }

  /* 豪华城堡大厅（Grok 敲地后） */
  function drawCastleHall() {
    const t = game.time;
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0, '#170a22');
    g.addColorStop(0.55, '#2a1030');
    g.addColorStop(1, '#12060f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, groundY + 2);

    /* 后墙拱窗（霓虹彩玻璃） */
    const winN = 5;
    for (let i = 0; i < winN; i++) {
      const cw = W / winN;
      const wx = i * cw + cw * 0.18;
      const ww = cw * 0.64;
      const wy = groundY * 0.16;
      const wh = groundY * 0.5;
      const glow = ctx.createLinearGradient(0, wy, 0, wy + wh);
      const hue = i % 2 ? '255,60,120' : '150,120,255';
      glow.addColorStop(0, 'rgba(' + hue + ',0.55)');
      glow.addColorStop(1, 'rgba(' + hue + ',0.08)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.moveTo(wx, wy + wh);
      ctx.lineTo(wx, wy + ww * 0.5);
      ctx.arc(wx + ww / 2, wy + ww * 0.5, ww / 2, Math.PI, 0);
      ctx.lineTo(wx + ww, wy + wh);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,150,0.35)';
      ctx.lineWidth = U(2);
      ctx.stroke();
    }

    /* 石柱 */
    for (let i = 0; i <= 4; i++) {
      const x = W * (i / 4) - U(16);
      const pw = U(34);
      const top = groundY * 0.06;
      const ph = groundY * 0.86;
      const cg = ctx.createLinearGradient(x, 0, x + pw, 0);
      cg.addColorStop(0, '#1b1024');
      cg.addColorStop(0.5, '#3a2440');
      cg.addColorStop(1, '#150c1c');
      ctx.fillStyle = cg;
      ctx.fillRect(x, top, pw, ph);
      /* 金色柱头 */
      ctx.fillStyle = 'rgba(255,209,102,0.75)';
      ctx.fillRect(x - U(6), top, pw + U(12), U(10));
      ctx.fillRect(x - U(4), top + U(18), pw + U(8), U(4));
      ctx.fillStyle = 'rgba(255,209,102,0.45)';
      ctx.fillRect(x - U(2), top + ph - U(12), pw + U(4), U(10));
    }

    /* 金色拱形装饰线 */
    ctx.strokeStyle = 'rgba(255,209,102,0.28)';
    ctx.lineWidth = U(2);
    for (let i = 0; i < 5; i++) {
      const x = W * (i / 4);
      ctx.beginPath();
      ctx.arc(x, groundY * 0.1, U(50), 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }

    /* 悬挂旗幟 */
    for (let i = 0; i < 4; i++) {
      const bx = W * (0.14 + i * 0.24);
      const bh = groundY * 0.3;
      const sway = Math.sin(t * 1.4 + i) * U(4);
      const bg = ctx.createLinearGradient(0, 0, 0, bh);
      bg.addColorStop(0, 'rgba(120,20,40,0.9)');
      bg.addColorStop(1, 'rgba(60,8,20,0.85)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(bx - U(22), 0);
      ctx.lineTo(bx + U(22), 0);
      ctx.lineTo(bx + U(18) + sway, bh);
      ctx.lineTo(bx + sway, bh + U(16));
      ctx.lineTo(bx - U(18) + sway, bh);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,209,102,0.8)';
      ctx.beginPath();
      ctx.arc(bx + sway * 0.5, bh * 0.45, U(7), 0, TAU);
      ctx.fill();
    }

    /* 吊灯 */
    for (let i = 0; i < 3; i++) {
      const lx = W * (0.25 + i * 0.25);
      const ly = groundY * 0.14 + Math.sin(t + i) * U(2);
      ctx.strokeStyle = 'rgba(255,209,102,0.25)';
      ctx.lineWidth = U(1.4);
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, U(70));
      lg.addColorStop(0, 'rgba(255,220,150,0.5)');
      lg.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(lx, ly, U(70), 0, TAU);
      ctx.fill();
      ctx.restore();
      for (let k = -1; k <= 1; k++) {
        ctx.fillStyle = 'rgba(255,240,200,0.95)';
        ctx.beginPath();
        ctx.arc(lx + k * U(16), ly + U(4), U(2.4), 0, TAU);
        ctx.fill();
      }
    }

    /* 红毯地面 */
    const fg = ctx.createLinearGradient(0, groundY, 0, H);
    fg.addColorStop(0, '#2a0a16');
    fg.addColorStop(0.4, '#160610');
    fg.addColorStop(1, '#070205');
    ctx.fillStyle = fg;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = 'rgba(120,16,40,0.5)';
    ctx.beginPath();
    ctx.moveTo(W * 0.34, groundY);
    ctx.lineTo(W * 0.66, groundY);
    ctx.lineTo(W * 0.86, H);
    ctx.lineTo(W * 0.14, H);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,209,102,0.4)';
    ctx.fillRect(0, groundY, W, Math.max(1, U(2)));
    ctx.restore();
  }

  /* 会议室（西装奶蛙敲地后） */
  function drawOffice() {
    const t = game.time;
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0, '#061018');
    g.addColorStop(0.6, '#0c1c2a');
    g.addColorStop(1, '#050a10');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, groundY + 2);

    /* 落地玻璃外的城市 */
    ctx.save();
    ctx.globalAlpha = 0.35;
    drawSkyline(0.12, 130, 0.5, 1);
    ctx.restore();

    /* 玻璃框 */
    ctx.strokeStyle = 'rgba(150,220,255,0.25)';
    ctx.lineWidth = U(2);
    for (let i = 0; i <= 4; i++) {
      const x = W * (i / 4);
      ctx.beginPath();
      ctx.moveTo(x, groundY * 0.12);
      ctx.lineTo(x, groundY * 0.82);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, groundY * 0.12);
    ctx.lineTo(W, groundY * 0.12);
    ctx.stroke();

    /* 吊顶灯带 */
    for (let i = 0; i < 4; i++) {
      const lx = W * (0.14 + i * 0.24);
      ctx.fillStyle = 'rgba(150,220,255,0.16)';
      ctx.fillRect(lx, groundY * 0.02, W * 0.14, U(8));
      ctx.fillStyle = 'rgba(220,245,255,0.5)';
      ctx.fillRect(lx, groundY * 0.02 + U(8), W * 0.14, U(2));
    }

    /* 投影幕 */
    ctx.fillStyle = 'rgba(220,240,255,0.08)';
    ctx.fillRect(W * 0.36, groundY * 0.2, W * 0.28, groundY * 0.34);
    ctx.strokeStyle = 'rgba(150,220,255,0.4)';
    ctx.lineWidth = U(1.4);
    ctx.strokeRect(W * 0.36, groundY * 0.2, W * 0.28, groundY * 0.34);
    ctx.fillStyle = 'rgba(150,220,255,0.6)';
    ctx.font = '700 ' + (12 * S).toFixed(0) + 'px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Q4 目标：Token 回收率 100%', W * 0.5, groundY * 0.38);

    /* 会议长桌 + 椅子 */
    ctx.fillStyle = 'rgba(14,24,36,0.95)';
    ctx.beginPath();
    ctx.ellipse(W * 0.5, groundY + U(40), W * 0.34, U(26), 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,220,255,0.25)';
    ctx.lineWidth = U(2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const cx = W * (0.26 + i * 0.096);
      ctx.fillStyle = 'rgba(10,18,28,0.95)';
      ctx.beginPath();
      ctx.ellipse(cx, groundY + U(64 + (i % 2) * 10), U(20), U(12), 0, 0, TAU);
      ctx.fill();
    }

    /* 地板 */
    const fg = ctx.createLinearGradient(0, groundY, 0, H);
    fg.addColorStop(0, '#101c28');
    fg.addColorStop(1, '#04080c');
    ctx.fillStyle = fg;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(150,220,255,0.35)';
    ctx.fillRect(0, groundY, W, Math.max(1, U(2)));
    ctx.restore();
  }

  /* 学校教室（豆包敲地后） */
  function drawClassroom() {
    const t = game.time;
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0, '#1a2230');
    g.addColorStop(0.6, '#232c3c');
    g.addColorStop(1, '#141a24');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, groundY + 2);

    /* 黑板 */
    const bx = W * 0.16, by = groundY * 0.16, bw = W * 0.44, bh = groundY * 0.4;
    ctx.fillStyle = '#13251c';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(200,220,210,0.4)';
    ctx.lineWidth = U(3);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(220,240,230,0.75)';
    ctx.font = '700 ' + (14 * S).toFixed(0) + 'px "PingFang SC", system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('期末作业 DDL 今晚 23:59', bx + U(16), by + U(34));
    ctx.fillStyle = 'rgba(220,240,230,0.5)';
    ctx.font = '700 ' + (11 * S).toFixed(0) + 'px "PingFang SC", system-ui';
    ctx.fillText('1. 交作业   2. 夺回 Token   3. 别再写错', bx + U(16), by + U(64));
    ctx.fillText('豆包加油，这次一定对得起分数。', bx + U(16), by + U(88));

    /* 右侧窗户 + 夕阳 */
    const wx = W * 0.68, ww = W * 0.26, wy = groundY * 0.18, wh = groundY * 0.42;
    const wg = ctx.createLinearGradient(0, wy, 0, wy + wh);
    wg.addColorStop(0, '#ff9d5c');
    wg.addColorStop(0.6, '#ff6f7a');
    wg.addColorStop(1, '#3a2350');
    ctx.fillStyle = wg;
    ctx.fillRect(wx, wy, ww, wh);
    ctx.strokeStyle = 'rgba(210,230,245,0.5)';
    ctx.lineWidth = U(3);
    ctx.strokeRect(wx, wy, ww, wh);
    ctx.beginPath();
    ctx.moveTo(wx + ww / 2, wy);
    ctx.lineTo(wx + ww / 2, wy + wh);
    ctx.moveTo(wx, wy + wh * 0.55);
    ctx.lineTo(wx + ww, wy + wh * 0.55);
    ctx.stroke();

    /* 挂钟 */
    const cx = W * 0.86, cy = groundY * 0.24;
    ctx.fillStyle = 'rgba(230,240,250,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, U(20), 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,40,55,0.8)';
    ctx.lineWidth = U(2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - U(12));
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + U(8), cy + U(4));
    ctx.stroke();

    /* 课桌前排 */
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 5; i++) {
        const dx = W * (0.12 + i * 0.19) + row * U(18);
        const dy = groundY - U(10) + row * U(34);
        ctx.fillStyle = 'rgba(60,44,34,0.95)';
        ctx.fillRect(dx, dy - U(12), U(74), U(12));
        ctx.fillStyle = 'rgba(40,30,24,0.95)';
        ctx.fillRect(dx + U(6), dy, U(6), U(26));
        ctx.fillRect(dx + U(62), dy, U(6), U(26));
        /* 椅子 */
        ctx.fillStyle = 'rgba(44,34,28,0.9)';
        ctx.fillRect(dx + U(22), dy + U(18), U(28), U(8));
      }
    }

    /* 地上的纸 */
    for (let i = 0; i < 7; i++) {
      const px = (hash(i * 4.2) * W + t * 12) % W;
      const py = groundY + U(10) + hash(i) * U(50);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(hash(i * 2.7) * TAU);
      ctx.fillStyle = 'rgba(240,245,250,0.5)';
      ctx.fillRect(-U(7), -U(5), U(14), U(10));
      ctx.restore();
    }

    /* 地板 */
    const fg = ctx.createLinearGradient(0, groundY, 0, H);
    fg.addColorStop(0, '#2a2018');
    fg.addColorStop(1, '#0d0a08');
    ctx.fillStyle = fg;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.strokeStyle = 'rgba(255,200,150,0.18)';
    ctx.lineWidth = U(1);
    for (let i = 1; i < 6; i++) {
      const y = groundY + (H - groundY) * (i / 6);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  /* 硅谷黄昏（隐藏结局最终战场） */
  function drawSiliconValley() {
    const t = game.time;
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0, '#2a1638');
    g.addColorStop(0.34, '#5b2a54');
    g.addColorStop(0.62, '#b85f6a');
    g.addColorStop(0.86, '#f2a45f');
    g.addColorStop(1, '#ffd9a0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, groundY + 2);

    /* 太阳 */
    const sx = W * 0.72, sy = groundY * 0.55, sr = Math.min(W, H) * 0.11;
    const gl = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 3.2);
    gl.addColorStop(0, 'rgba(255,248,220,0.95)');
    gl.addColorStop(0.3, 'rgba(255,200,130,0.7)');
    gl.addColorStop(1, 'rgba(255,120,90,0)');
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(sx, sy, sr * 3.2, 0, TAU);
    ctx.fill();

    /* 远山 */
    ctx.fillStyle = 'rgba(70,36,80,0.8)';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(0, groundY - H * 0.09);
    for (let i = 0; i <= 12; i++) {
      const x = W * (i / 12);
      ctx.lineTo(x, groundY - H * 0.075 - Math.sin(i * 1.4) * H * 0.028);
    }
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();

    /* 玻璃办公塔楼剪影 */
    const towers = [
      { x: 0.06, w: 0.11, h: 0.34, win: '150,220,255' },
      { x: 0.19, w: 0.09, h: 0.26, win: '255,209,102' },
      { x: 0.33, w: 0.13, h: 0.4, win: '150,220,255' },
      { x: 0.52, w: 0.1, h: 0.3, win: '255,180,140' },
      { x: 0.66, w: 0.12, h: 0.44, win: '150,220,255' },
      { x: 0.84, w: 0.1, h: 0.28, win: '255,209,102' }
    ];
    for (const tw of towers) {
      const x = W * tw.x, w = W * tw.w, h = groundY * tw.h;
      const top = groundY - h;
      const tg = ctx.createLinearGradient(0, top, 0, groundY);
      tg.addColorStop(0, 'rgba(28,18,42,0.92)');
      tg.addColorStop(1, 'rgba(12,8,20,0.96)');
      ctx.fillStyle = tg;
      ctx.fillRect(x, top, w, h);
      ctx.fillStyle = 'rgba(' + tw.win + ',0.16)';
      const cols = Math.max(2, Math.floor(w / U(22)));
      const rows = Math.max(3, Math.floor(h / U(26)));
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          if (hash(tw.x * 91 + cx * 7.3 + cy * 13.1) > 0.45) {
            ctx.fillStyle = 'rgba(' + tw.win + ',' + (0.08 + hash(cx + cy * 3.7) * 0.22).toFixed(2) + ')';
            ctx.fillRect(x + U(5) + cx * (w / cols), top + U(10) + cy * (h / rows), Math.max(2, w / cols * 0.5), Math.max(2, h / rows * 0.35));
          }
        }
      }
    }

    /* 棕榈树 */
    for (let i = 0; i < 3; i++) {
      const px = W * (0.12 + i * 0.3), ph = groundY * (0.2 + i * 0.03);
      ctx.strokeStyle = 'rgba(20,12,26,0.9)';
      ctx.lineWidth = U(4);
      ctx.beginPath();
      ctx.moveTo(px, groundY);
      ctx.quadraticCurveTo(px - U(6), groundY - ph * 0.6, px + U(4), groundY - ph);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(18,10,24,0.85)';
      ctx.lineWidth = U(3);
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * 0.5;
        ctx.beginPath();
        ctx.moveTo(px + U(4), groundY - ph);
        ctx.quadraticCurveTo(
          px + U(4) + Math.cos(a) * U(26), groundY - ph + Math.sin(a) * U(20),
          px + U(4) + Math.cos(a) * U(44), groundY - ph + Math.sin(a) * U(16) + U(8)
        );
        ctx.stroke();
      }
    }

    /* 地面：沥青 + 车位线 */
    const fg = ctx.createLinearGradient(0, groundY, 0, H);
    fg.addColorStop(0, '#241a2c');
    fg.addColorStop(1, '#0a0710');
    ctx.fillStyle = fg;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.strokeStyle = 'rgba(255,220,180,0.18)';
    ctx.lineWidth = U(2);
    for (let i = 0; i < 8; i++) {
      const x = W * (i / 8) + U(10);
      ctx.beginPath();
      ctx.moveTo(x, groundY + U(16));
      ctx.lineTo(x - U(12), H);
      ctx.stroke();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,190,120,0.5)';
    ctx.fillRect(0, groundY, W, Math.max(1, U(2)));
    ctx.restore();
  }

  /* 二次元日落（SEED 敲地后） */
  function drawSunset() {
    const t = game.time;
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0, '#2a1a52');
    g.addColorStop(0.35, '#7b3a7a');
    g.addColorStop(0.62, '#ff7a5c');
    g.addColorStop(0.85, '#ffb46b');
    g.addColorStop(1, '#ffe0a3');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, groundY + 2);

    /* 太阳 */
    const sx = W * 0.68, sy = groundY * 0.62, sr = Math.min(W, H) * 0.14;
    const sunGlow = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 3);
    sunGlow.addColorStop(0, 'rgba(255,255,235,0.95)');
    sunGlow.addColorStop(0.3, 'rgba(255,210,140,0.75)');
    sunGlow.addColorStop(1, 'rgba(255,120,90,0)');
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(sx, sy, sr * 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,250,235,0.98)';
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, TAU);
    ctx.fill();

    /* 云层 */
    for (let i = 0; i < 6; i++) {
      const cy = groundY * (0.22 + hash(i * 3.1) * 0.42);
      const cx = ((hash(i * 7.7) * W + t * (4 + i)) % (W + 300)) - 150;
      const cw = U(120 + hash(i) * 180);
      const ch = U(14 + hash(i * 2.3) * 16);
      const cg = ctx.createLinearGradient(0, cy - ch, 0, cy + ch);
      const warm = cy > groundY * 0.45;
      cg.addColorStop(0, warm ? 'rgba(255,190,160,0.5)' : 'rgba(200,160,220,0.4)');
      cg.addColorStop(1, 'rgba(120,80,140,0.12)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw, ch, 0, 0, TAU);
      ctx.fill();
    }

    /* 海面 / 远山 */
    ctx.fillStyle = 'rgba(90,40,90,0.75)';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(0, groundY - H * 0.1);
    for (let i = 0; i <= 10; i++) {
      const x = W * (i / 10);
      const y = groundY - H * 0.08 - Math.sin(i * 1.7) * H * 0.03;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();

    /* 海面反光 */
    const wg = ctx.createLinearGradient(0, groundY, 0, H);
    wg.addColorStop(0, 'rgba(255,190,120,0.55)');
    wg.addColorStop(0.4, 'rgba(180,90,120,0.35)');
    wg.addColorStop(1, 'rgba(40,16,50,0.9)');
    ctx.fillStyle = wg;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const yy = groundY + Math.pow(hash(i * 5.3), 2) * (H - groundY);
      const ww = U(20 + hash(i) * 120);
      const xx = sx + (hash(i * 9.1) - 0.5) * W * 0.3;
      ctx.fillStyle = 'rgba(255,225,170,' + (0.05 + hash(i * 2.2) * 0.16).toFixed(2) + ')';
      ctx.fillRect(xx - ww / 2, yy, ww, U(2));
    }
    ctx.restore();

    /* 飞鸟 */
    ctx.strokeStyle = 'rgba(40,20,40,0.65)';
    ctx.lineWidth = U(2);
    for (let i = 0; i < 5; i++) {
      const bx = ((hash(i * 6.1) * W + t * (14 + i * 6)) % (W + 100)) - 50;
      const by = groundY * (0.18 + hash(i * 3.3) * 0.3);
      const flap = Math.sin(t * 6 + i) * U(4);
      ctx.beginPath();
      ctx.moveTo(bx - U(7), by + flap);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + U(7), by + flap);
      ctx.stroke();
    }
  }

  function drawSafeZone() {
    const z = game.safeZone;
    if (!z) return;
    const t = game.time;
    const a = 0.18 + 0.12 * Math.sin(t * 9);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, groundY - U(170), 0, groundY);
    g.addColorStop(0, 'rgba(110,247,180,0)');
    g.addColorStop(1, 'rgba(110,247,180,' + (a + 0.22).toFixed(2) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(z.x - z.w / 2, groundY - U(170), z.w, U(170));
    ctx.strokeStyle = 'rgba(110,247,180,' + (a + 0.5).toFixed(2) + ')';
    ctx.lineWidth = U(2.2);
    ctx.beginPath();
    ctx.ellipse(z.x, groundY - U(2), z.w / 2, U(9), 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(200,255,230,0.9)';
    ctx.font = '700 ' + (11 * S).toFixed(0) + 'px "PingFang SC", system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('安全区', z.x, groundY - U(24));
  }

  function drawPlatforms() {
    for (const pl of platforms) {
      const y = groundY - pl.lift;
      const h = 10 * S;
      ctx.fillStyle = 'rgba(12,18,32,0.92)';
      rr(pl.x, y, pl.w, h, 4 * S);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = 'rgba(94,231,255,0.6)';
      ctx.shadowBlur = 10 * S;
      ctx.fillStyle = 'rgba(120,235,255,0.8)';
      ctx.fillRect(pl.x + 2 * S, y, pl.w - 4 * S, Math.max(1.2, 2 * S));
      ctx.restore();
    }
  }

  /* ---------------- 角色 ---------------- */
  function drawPlayer() {
    if (game.state === 'menu') return;
    const p = player;
    const hero = HEROES[heroIndex] || HEROES[0];
    const img = SPR[game.fullPower && hero.fullKey ? hero.fullKey : hero.key] || SPR[hero.key];
    const sprH = U(game.fullPower && hero.fullKey ? 172 : 150);
    const ratio = img && img.width ? img.width / img.height : 0.52;
    const sprW = sprH * ratio;

    /* 闪避残影 + 速度线 */
    if (img && (p.dashT > 0 || p.dodgeFxT > 0)) {
      const k = p.dashT > 0 ? 1 : clamp(p.dodgeFxT / 0.6, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 4; i >= 1; i--) {
        const gx = p.x - p.face * U(18) * i;
        ctx.globalAlpha = 0.22 * k / i;
        ctx.drawImage(img, gx - sprW / 2, p.y - sprH + Math.sin(game.time * 20 + i) * U(1), sprW, sprH);
      }
      ctx.globalAlpha = 0.55 * k;
      ctx.strokeStyle = 'rgba(150,220,255,0.75)';
      ctx.lineWidth = U(2);
      for (let i = 0; i < 5; i++) {
        const ly = p.y - U(36) - i * U(20);
        const len = U(40 + i * 18) * k;
        ctx.beginPath();
        ctx.moveTo(p.x - p.face * U(26), ly);
        ctx.lineTo(p.x - p.face * (U(26) + len), ly + rand(-2, 2));
        ctx.stroke();
      }
      ctx.restore();
    }

    /* 投影 */
    const air = clamp(1 - (groundY - p.y) / U(320), 0.2, 1);
    ctx.save();
    ctx.globalAlpha = 0.4 * air;
    ctx.fillStyle = '#02040a';
    ctx.beginPath();
    ctx.ellipse(p.x, groundY + U(3), U(30) * air, U(8) * air, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    /* 全力形态光环 */
    if (game.fullPower) {
      const t = game.time;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rg = ctx.createRadialGradient(p.x, p.y - U(70), U(10), p.x, p.y - U(70), U(120));
      rg.addColorStop(0, 'rgba(255,209,102,0.28)');
      rg.addColorStop(1, 'rgba(255,209,102,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(p.x - U(130), p.y - U(200), U(260), U(260));
      ctx.strokeStyle = 'rgba(255,209,102,' + (0.5 + 0.2 * Math.sin(t * 4)).toFixed(2) + ')';
      ctx.lineWidth = U(2.2);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - U(6), U(46), U(13), 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#ffd166';
      ctx.font = '800 ' + (10 * S).toFixed(0) + 'px "PingFang SC", system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('全力形态', p.x, p.y - sprH - U(10));
    }

    /* Astra 紫焰 */
    if (p.astra > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const flap = 0.7 + Math.sin(game.time * 18) * 0.3;
      const g = ctx.createRadialGradient(p.x, p.y - U(56), U(10), p.x, p.y - U(56), U(110) * flap);
      g.addColorStop(0, 'rgba(180,120,255,0.4)');
      g.addColorStop(0.6, 'rgba(120,80,255,0.16)');
      g.addColorStop(1, 'rgba(80,40,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y - U(56), U(110) * flap, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    /* 护盾 / 无敌 */
    if (p.shield > 0 || p.invuln > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const a = p.shield > 0 ? 0.45 : 0.2 + Math.sin(game.time * 18) * 0.1;
      ctx.strokeStyle = 'rgba(110,247,180,' + a.toFixed(2) + ')';
      ctx.lineWidth = U(2.2);
      ctx.beginPath();
      ctx.arc(p.x, p.y - U(56), U(66), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.dead) { ctx.rotate(-Math.PI / 2.6); ctx.globalAlpha = 0.72; }
    else if (p.invuln > 0) ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(game.time * 22));

    const moveAmt = p.onGround ? clamp(Math.abs(p.vx) / U(430), 0, 1) : 0;
    const bob = p.onGround
      ? Math.abs(Math.sin(p.runPhase)) * U(3) * moveAmt + Math.sin(game.time * 2.2) * U(1.4)
      : 0;
    ctx.translate(0, -bob);
    ctx.scale(p.face, 1);

    if (p.attackT > 0) {
      const pr = 1 - p.attackT / ATK_DUR;
      const k = Math.sin(pr * Math.PI);
      ctx.translate(U(5) * k, -U(2) * k);
      ctx.rotate(-0.1 * k);
    }

    if (img && img.width) {
      ctx.drawImage(img, -sprW * 0.5, -sprH, sprW, sprH);
      if (p.hurt > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(0.8, p.hurt * 2.8);
        ctx.drawImage(img, -sprW * 0.5, -sprH, sprW, sprH);
        ctx.restore();
      }
    } else {
      ctx.fillStyle = 'rgba(150,220,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(0, -sprH * 0.5, sprW * 0.3, sprH * 0.45, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------- 敌人 ---------------- */
  function enemySprite(e) {
    const p2 = e.isBoss && e.maxHp > 0 && e.hp <= e.maxHp * 0.5;
    if (e.kind === 'grok') return p2 && SPR.grok_full ? SPR.grok_full : SPR.grok;
    if (e.kind === 'seed') return SPR.seed;
    if (e.kind === 'doubao_boss') return p2 && SPR.doubao_winter_full ? SPR.doubao_winter_full : SPR.doubao_winter;
    if (e.kind === 'nail_boss') return SPR.enemy_nail_boss;
    if (e.kind === 'altman') return SPR.altman;
    if (e.kind === 'dario') return SPR.dario;
    if (e.kind === 'musk') return SPR.musk;
    if (e.kind === 'pichai') return SPR.pichai;
    if (e.kind === 'chatgpt') return p2 && SPR.hero_purple2_full ? SPR.hero_purple2_full : SPR.hero_purple2;
    if (e.kind === 'gemini') return p2 && SPR.hero_catpurple_full ? SPR.hero_catpurple_full : SPR.hero_catpurple;
    if (e.kind === 'claude') return p2 && SPR.hero_orange_full ? SPR.hero_orange_full : SPR.hero_orange;
    if (e.kind === 'doubao') return SPR.enemy_doubao;
    return SPR.enemy_blob;
  }

  function drawEnemies() {
    for (const e of enemies) {
      if (e.x < -U(240) || e.x > W + U(260)) continue;
      const img = enemySprite(e);
      const boss = !!e.isBoss;
      const ratio = img && img.width ? img.width / img.height : 0.5;
      const sprH = e.h * 1.06;
      const sprW = sprH * ratio;

      if (!boss) {
        ctx.save();
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = '#02040a';
        ctx.beginPath();
        ctx.ellipse(e.x, groundY + U(3), e.w * 0.6, U(6), 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(e.face, 1);
      const wob = Math.sin(e.t * 3.2) * 0.04;
      const sq = 1 + wob;
      ctx.scale(1 / sq, sq);

      if (img && img.width) {
        ctx.drawImage(img, -sprW * 0.5, -sprH, sprW, sprH);
        if (e.hurt > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.min(0.85, e.hurt * 4);
          ctx.drawImage(img, -sprW * 0.5, -sprH, sprW, sprH);
          ctx.restore();
        }
      } else {
        ctx.fillStyle = e.kind === 'doubao' ? 'rgba(150,220,255,0.8)' : 'rgba(255,209,102,0.8)';
        ctx.beginPath();
        ctx.ellipse(0, -sprH * 0.5, sprW * 0.4, sprH * 0.5, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      /* 硅谷两位：全息投影框 */
      if (e.special) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.globalCompositeOperation = 'lighter';
        const hw = sprW * 1.06;
        const hh = sprH * 1.03;
        const gx = -hw / 2;
        const gy = -sprH - U(4);
        const L = U(16);
        ctx.lineWidth = U(3);
        ctx.strokeStyle = 'rgba(180,235,255,0.9)';
        [[gx, gy, 1, 1], [gx + hw, gy, -1, 1], [gx, gy + hh, 1, -1], [gx + hw, gy + hh, -1, -1]].forEach(function (c) {
          ctx.beginPath();
          ctx.moveTo(c[0] + c[2] * L, c[1]);
          ctx.lineTo(c[0], c[1]);
          ctx.lineTo(c[0], c[1] + c[3] * L);
          ctx.stroke();
        });
        if (!game.lowFx) {
          const scan = (game.time * 90) % Math.max(1, hh);
          ctx.fillStyle = 'rgba(150,220,255,0.16)';
          ctx.fillRect(gx + U(2), gy + scan, hw - U(4), U(2));
        }
        ctx.restore();
      }

      /* 血条：Boss 加厚 */
      const barH = boss ? U(13) : U(4);
      const bw = boss ? Math.max(e.w * 1.55, U(132)) : e.w * 1.15;
      const bx = e.x - bw / 2;
      const by = e.y - sprH - U(boss ? 24 : 12);
      ctx.fillStyle = 'rgba(8,10,18,0.78)';
      rr(bx - U(1.5), by - U(1.5), bw + U(3), barH + U(3), barH * 0.5);
      ctx.fill();
      if (boss) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        rr(bx, by, bw, barH, barH * 0.5);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = U(1);
        rr(bx, by, bw, barH, barH * 0.5);
        ctx.stroke();
      }
      ctx.fillStyle = e.kind === 'doubao' ? '#ffd166' : e.isBoss ? '#ff7a9a' : e.kind === 'laugh' ? '#ffd166' : '#ffb45c';
      const hpW = bw * clamp(e.hp / e.maxHp, 0, 1);
      if (boss) {
        rr(bx, by, Math.max(1, hpW), barH, barH * 0.5);
        ctx.fill();
      } else {
        ctx.fillRect(bx, by, hpW, barH);
      }
      if (boss) {
        const marks = [0.5];
        ctx.fillStyle = 'rgba(10,14,22,0.9)';
        for (const m of marks) {
          ctx.fillRect(bx + bw * m, by, Math.max(1.5, U(2)), barH);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(bx, by, bw, Math.max(1, U(2)));
        ctx.fillStyle = 'rgba(230,245,255,0.72)';
        ctx.font = '700 ' + (8 * S).toFixed(0) + 'px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(Math.ceil(e.hp) + ' / ' + Math.ceil(e.maxHp), e.x, by - U(4));
        if (e.stun > 0) {
          ctx.fillStyle = 'rgba(255,209,102,0.9)';
          ctx.font = '700 ' + (10 * S).toFixed(0) + 'px "PingFang SC", system-ui';
          ctx.textAlign = 'center';
          ctx.fillText('破防', e.x, by - U(10));
        }
      }

      if (e.stun > 0) {
        ctx.fillStyle = 'rgba(255,209,102,0.9)';
        ctx.font = '700 ' + (12 * S).toFixed(0) + 'px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('✦✦', e.x, by - U(10));
      }
    }
  }

  /* ---------------- 文字弹幕 ---------------- */
  const bulletCache = {};
  function bulletSprite(text, fs, color) {
    const key = text + '|' + Math.round(fs) + '|' + (color || '#dff8ff');
    if (bulletCache[key]) return bulletCache[key];
    const pad = Math.ceil(fs);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(fs * 3 + pad * 2);
    cv.height = Math.ceil(fs * 2 + pad * 2);
    const c2 = cv.getContext('2d');
    c2.font = '800 ' + fs.toFixed(1) + 'px ui-monospace, "PingFang SC", monospace';
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    const cx = cv.width / 2, cy = cv.height / 2;
    c2.lineWidth = Math.max(2.5, fs * 0.3);
    c2.strokeStyle = 'rgba(4,8,16,0.92)';
    c2.lineJoin = 'round';
    c2.strokeText(text, cx, cy);
    c2.shadowColor = 'rgba(140,240,255,0.95)';
    c2.shadowBlur = fs * 0.9;
    c2.fillStyle = color || '#dff8ff';
    c2.fillText(text, cx, cy);
    if (Object.keys(bulletCache).length > 120) {
      for (const k in bulletCache) delete bulletCache[k];
    }
    bulletCache[key] = cv;
    return cv;
  }

  let tracers = [];
  function drawTracers() {
    for (const t of tracers) {
      const k = clamp(t.life / t.max, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(170,240,255,' + (k * 0.5).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1.5, U(2.5) * k);
      ctx.beginPath();
      ctx.moveTo(t.x0, t.y0);
      ctx.lineTo(t.x1, t.y1);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPBullets() {
    for (const b of pbullets) {
      if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(b.size) || b.size <= 0) continue;
      /* 决战：弹幕外加发光球，保证可见 */
      if (game.siliconWar) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const br = Math.max(5, b.size * 0.48);
        const gg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, br * 1.5);
        gg.addColorStop(0, 'rgba(190,245,255,0.55)');
        gg.addColorStop(0.55, 'rgba(110,210,255,0.28)');
        gg.addColorStop(1, 'rgba(80,180,255,0)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(b.x, b.y, br * 1.5, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      /* 拖尾：让弹幕飞行轨迹看得见 */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(170,240,255,0.3)';
      ctx.lineWidth = Math.max(1.5, U(2));
      ctx.beginPath();
      ctx.moveTo(b.x - (b.vx || 0) * 0.018, b.y - (b.vy || 0) * 0.018);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot + game.time * 2.2);
      const fs = Math.max(10, b.size * S);
      const spr = bulletSprite(b.text, fs, b.color);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
      ctx.restore();
    }
  }

  const ebulletCache = {};
  function enemyBulletSprite(color, r) {
    const key = color + '|' + Math.round(r);
    if (ebulletCache[key]) return ebulletCache[key];
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(r * 4);
    const c2 = cv.getContext('2d');
    const cx = cv.width / 2;
    const g = c2.createRadialGradient(cx, cx, 0, cx, cx, r * 1.5);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.5, 'rgba(' + color + ',0.9)');
    g.addColorStop(1, 'rgba(' + color + ',0)');
    c2.fillStyle = g;
    c2.beginPath();
    c2.arc(cx, cx, r * 1.5, 0, Math.PI * 2);
    c2.fill();
    if (Object.keys(ebulletCache).length > 60) {
      for (const k in ebulletCache) delete ebulletCache[k];
    }
    ebulletCache[key] = cv;
    return cv;
  }

  function drawEBullets() {
    for (const b of ebullets) {
      if (!isFinite(b.x) || !isFinite(b.y)) continue;
      const bR = Math.max(1, isFinite(b.r) ? b.r : U(7));
      ctx.save();
      if (game.lowFx) {
        ctx.fillStyle = 'rgba(' + b.color + ',0.85)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, bR, 0, TAU);
        ctx.fill();
        if (b.text) {
          ctx.font = '700 ' + (12 * S).toFixed(0) + 'px "PingFang SC", system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#eaf8ff';
          ctx.fillText(b.text, b.x, b.y);
        }
        ctx.restore();
        continue;
      }
      const spr2 = enemyBulletSprite(b.color, bR);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(spr2, b.x - spr2.width / 2, b.y - spr2.height / 2);
      ctx.restore();

      if (b.text) {
        ctx.save();
        ctx.font = '700 ' + (14 * S).toFixed(0) + 'px "PingFang SC", system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(10,16,26,0.85)';
        ctx.fillText(b.text, b.x, b.y + 1);
        ctx.fillStyle = '#eaf8ff';
        ctx.fillText(b.text, b.x, b.y);
        ctx.restore();
      }
    }
  }

  function drawWeights() {
    for (const wgt of weights) {
      ctx.save();
      ctx.translate(wgt.x, wgt.y);
      ctx.rotate(Math.sin(wgt.landed ? 0 : wgt.y * 0.01) * 0.1);
      ctx.fillStyle = wgt.landed ? 'rgba(94,231,255,0.35)' : 'rgba(30,60,110,0.95)';
      rr(-wgt.size / 2, -wgt.size / 2, wgt.size, wgt.size, U(5));
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,240,255,0.9)';
      ctx.lineWidth = U(1.6);
      ctx.stroke();
      ctx.fillStyle = 'rgba(220,250,255,0.9)';
      ctx.font = '700 ' + (wgt.size * 0.34).toFixed(0) + 'px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('W', 0, 0);
      ctx.restore();
    }
  }

  function drawSupports() {
    for (const s of supports) {
      const img = SPR[s.key];
      const sprH = U(100);
      const ratio = img && img.width ? img.width / img.height : 0.5;
      const sprW = sprH * ratio;

      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.translate(s.x, s.y);

      /* 光圈 */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(110,247,180,0.5)';
      ctx.lineWidth = U(1.6);
      ctx.beginPath();
      ctx.arc(0, -sprH * 0.5, U(46), 0, TAU);
      ctx.stroke();
      ctx.restore();

      if (s.sleep) ctx.rotate(0.5);   // GLM 趴下睡觉

      if (img && img.width) ctx.drawImage(img, -sprW * 0.5, -sprH, sprW, sprH);

      ctx.fillStyle = 'rgba(220,250,255,0.85)';
      ctx.font = '700 ' + (10 * S).toFixed(0) + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(s.sleep ? s.name + ' zZ' : s.name, 0, -sprH - U(8));
      ctx.restore();
    }
  }

  function drawParts() {
    for (const p of parts) {
      const k = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(' + p.color + ',' + k.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.8), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawRings() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of rings) {
      const k = clamp(r.life / r.max, 0, 1);
      const rad = Math.max(0, lerp(r.r0, r.r1, 1 - k));
      ctx.strokeStyle = 'rgba(' + r.color + ',' + (k * 0.6).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, r.w * k);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSlashes() {
    for (const s of slashes) {
      const k = clamp(s.life / s.max, 0, 1);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(s.face, 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(' + s.color + ',' + (k * 0.75).toFixed(3) + ')';
      ctx.lineWidth = Math.max(2, U(6) * k);
      ctx.shadowColor = 'rgba(' + s.color + ',1)';
      ctx.shadowBlur = U(18);
      ctx.beginPath();
      ctx.arc(0, 0, s.r * (1.1 - k * 0.25), -1.1, 1.1);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawTexts() {
    for (const t of texts) {
      const k = clamp(t.life / t.max, 0, 1);
      const pop = 1 + (1 - k) * 0.16;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2.2);
      ctx.translate(t.x, t.y);
      ctx.scale(pop, pop);
      ctx.font = '700 ' + (t.size * S).toFixed(1) + 'px "PingFang SC", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3 * S;
      ctx.strokeStyle = 'rgba(2,4,10,0.85)';
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = 'rgba(' + t.color + ',1)';
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
  }

  /* 豆包的「视频生成」弹窗 */
  function drawVideo() {
    const pv = game.videoPanel;
    if (!pv) return;
    const k = clamp(pv.life / 6.0, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = pv.hurt > 0 ? 'rgba(30,50,70,0.95)' : 'rgba(6,12,22,0.94)';
    rr(pv.x, pv.y, pv.w, pv.h, U(14));
    ctx.fill();
    ctx.strokeStyle = pv.hurt > 0 ? 'rgba(255,255,255,0.95)' : 'rgba(150,220,255,0.8)';
    ctx.lineWidth = U(2);
    ctx.stroke();

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(150,220,255,0.9)';
    ctx.font = '700 ' + (16 * S).toFixed(0) + 'px "PingFang SC", system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('▷ 视频生成中…', pv.x + pv.w * 0.5, pv.y + pv.h * 0.42);
    ctx.font = '700 ' + (11 * S).toFixed(0) + 'px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(200,235,255,0.65)';
    ctx.fillText('seedance / 720p / 02:00', pv.x + pv.w * 0.5, pv.y + pv.h * 0.56);

    /* 弹窗血条（可破坏提示） */
    ctx.fillStyle = 'rgba(8,10,18,0.8)';
    ctx.fillRect(pv.x + pv.w * 0.18, pv.y + pv.h * 0.72, pv.w * 0.64, U(6));
    ctx.fillStyle = 'rgba(150,220,255,0.95)';
    ctx.fillRect(pv.x + pv.w * 0.18, pv.y + pv.h * 0.72, pv.w * 0.64 * clamp(pv.hp / pv.maxHp, 0, 1), U(6));
    ctx.fillStyle = 'rgba(200,235,255,0.6)';
    ctx.font = '700 ' + (9 * S).toFixed(0) + 'px "PingFang SC", system-ui';
    ctx.fillText('打掉它就能解除遮挡', pv.x + pv.w * 0.5, pv.y + pv.h * 0.86);

    /* 剩余时间 */
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(pv.x + pv.w * 0.2, pv.y + pv.h * 0.94, pv.w * 0.6, U(3));
    ctx.fillStyle = 'rgba(255,120,150,0.7)';
    ctx.fillRect(pv.x + pv.w * 0.2, pv.y + pv.h * 0.94, pv.w * 0.6 * k, U(3));
    ctx.restore();
  }

  function drawDust() {
    ctx.save();
    for (const s of dust) {
      ctx.fillStyle = 'rgba(150,220,255,' + s.a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(s.x + Math.sin(game.time + s.ph) * 5, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* 关卡横幅 */
  function drawLevelBanner() {
    if (game.freezeT > 0) return;
    if (game.hiddenFight) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '700 ' + (13 * S).toFixed(0) + 'px "PingFang SC", system-ui';
      ctx.fillStyle = 'rgba(220,245,255,0.92)';
      ctx.fillText(game.siliconWar ? '硅谷 · AI 垄断决战' : '硅谷 · 最后的谈判', W * 0.5, U(80));
      ctx.fillStyle = 'rgba(255,150,180,0.8)';
      ctx.font = '700 ' + (10 * S).toFixed(0) + 'px "PingFang SC", system-ui';
      ctx.fillText(game.siliconWar ? 'Altman / Pichai / Musk / Dario × 四家模型' : '萨姆·奥尔特曼 / 达里奥·阿莫迪', W * 0.5, U(96));
      if (game.siliconWar && game.buffs.length) {
        ctx.fillStyle = 'rgba(110,247,180,0.85)';
        ctx.font = '700 ' + (10 * S).toFixed(0) + 'px "PingFang SC", system-ui';
        ctx.fillText('文心加持：' + game.buffs.join(' · '), W * 0.5, U(112));
      }
      ctx.restore();
      return;
    }
    if (game.state !== 'play' && game.state !== 'buff') return;
    const st = STAGES[game.stage];
    if (!st) return;
    const by = H < 520 ? H * 0.2 : U(66);
    const remaining = game.bossSpawned ? 0 : Math.max(0, st.defense - game.stageT);
    const danger = !game.bossSpawned && remaining <= 10;
    const pulse = 0.5 + 0.5 * Math.sin(game.time * (danger ? 12 : 3));

    ctx.save();

    /* 最后 10 秒：红晕 + 超大倒计时 */
    if (danger) {
      const edge = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.34, W * 0.5, H * 0.5, Math.max(W, H) * 0.74);
      edge.addColorStop(0, 'rgba(255,40,80,0)');
      edge.addColorStop(1, 'rgba(255,40,80,' + (0.16 + pulse * 0.22).toFixed(3) + ')');
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, W, H);

      const sec = Math.ceil(remaining);
      ctx.save();
      ctx.globalAlpha = 0.09 + pulse * 0.15;
      ctx.fillStyle = '#ff3b5c';
      ctx.font = '800 ' + clamp(H * 0.36, 90, 280).toFixed(0) + 'px ui-monospace, "PingFang SC", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(sec), W * 0.5, by + U(160));
      ctx.restore();
    }

    /* 横幅 */
    const bw = U(240) * (danger ? 1.18 : 1);
    ctx.globalAlpha = danger ? 0.6 + pulse * 0.3 : 0.72;
    ctx.fillStyle = danger ? 'rgba(40,6,14,0.82)' : 'rgba(7,12,22,0.55)';
    rr(W * 0.5 - bw / 2, by, bw, U(30), U(10));
    ctx.fill();
    ctx.strokeStyle = danger ? 'rgba(255,60,100,' + (0.6 + pulse * 0.4).toFixed(2) + ')' : 'rgba(94,231,255,0.28)';
    ctx.lineWidth = danger ? U(2.2) : U(1);
    ctx.stroke();

    /* 文案 */
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (game.bossSpawned) {
      const boss = enemies.filter(function (e) { return e.isBoss; })[0];
      ctx.fillStyle = 'rgba(220,245,255,0.9)';
      ctx.font = '700 ' + (13 * S).toFixed(0) + 'px "PingFang SC", system-ui';
      ctx.fillText(st.name + ' · ' + st.bossName + (boss ? ' ' + Math.ceil(boss.hp) : ' 已击破'), W * 0.5, by + U(15));
    } else if (danger) {
      const label = '⚠ Boss 还有 ' + Math.ceil(remaining) + ' 秒！';
      const sc = 1 + pulse * 0.1;
      ctx.save();
      ctx.translate(W * 0.5, by + U(15));
      ctx.scale(sc, sc);
      ctx.shadowColor = 'rgba(255,60,100,0.95)';
      ctx.shadowBlur = U(14) + pulse * U(20);
      ctx.fillStyle = '#ffe1e8';
      ctx.font = '800 ' + Math.max(14, 15 * S).toFixed(0) + 'px "PingFang SC", system-ui';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(220,245,255,0.9)';
      ctx.font = '700 ' + (13 * S).toFixed(0) + 'px "PingFang SC", system-ui';
      ctx.fillText(st.name + ' · 防守 ' + Math.ceil(remaining) + 's', W * 0.5, by + U(15));
    }

    if (game.buffs.length) {
      ctx.globalAlpha = 0.7;
      ctx.font = '700 ' + (10 * S).toFixed(0) + 'px "PingFang SC", system-ui';
      ctx.fillStyle = 'rgba(110,247,180,0.85)';
      ctx.fillText('强化：' + game.buffs.join(' · '), W * 0.5, by + U(34));
    }

    /* 弹色图例（带底衬，任何场景都看得清） */
    const legend = '黄=普通弹   粉=快弹   紫=范围   蓝=追踪';
    ctx.font = '700 ' + (9 * S).toFixed(0) + 'px "PingFang SC", system-ui';
    const lw = ctx.measureText(legend).width;
    const ly = H - U(16);
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = 'rgba(4,8,16,0.72)';
    rr(W * 0.5 - lw / 2 - U(10), ly - U(9), lw + U(20), U(18), U(9));
    ctx.fill();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(165,228,255,0.95)';
    ctx.fillText(legend, W * 0.5, ly);
    ctx.restore();
  }

  /* =========================================================
   * 11. HUD
   * ========================================================= */
  const el = {
    hpFill: document.getElementById('hp-fill'),
    epFill: document.getElementById('ep-fill'),
    hpText: document.getElementById('hp-text'),
    waveFill: document.getElementById('wave-fill'),
    waveText: document.getElementById('wave-text'),
    heroName: document.getElementById('hero-name'),
    heroBadge: document.getElementById('hero-badge'),
    overTitle: document.getElementById('over-title'),
    overK: document.getElementById('over-k'),
    score: document.getElementById('score'),
    combo: document.getElementById('combo'),
    comboNum: document.querySelector('#combo b'),
    acts: {}
  };
  document.querySelectorAll('.act').forEach(function (b) {
    el.acts[b.dataset.act] = b;
  });

  let lastHp = '', lastScore = '', lastCombo = '', lastLevel = '', lastCoins = -1, coinsElCache = null;

  function setCd(btn, cd, max) {
    if (!btn) return;
    const ratio = cd > 0 ? clamp(cd / max, 0, 1) : 0;
    btn.style.setProperty('--cd', ratio.toFixed(3));
    btn.classList.toggle('is-cd', cd > 0.06);
    const txt = btn.querySelector('.act__cdtxt');
    if (txt) txt.textContent = cd > 0.06 ? (cd >= 1 ? Math.ceil(cd) : cd.toFixed(1)) : '';
  }

  function syncHud() {
    el.hpFill.style.transform = 'scaleX(' + clamp(player.hp / player.maxHp, 0, 1).toFixed(3) + ')';
    el.epFill.style.transform = 'scaleX(' + clamp(player.token / player.maxToken, 0, 1).toFixed(3) + ')';

    const hpStr = Math.ceil(player.hp) + '/' + player.maxHp;
    if (hpStr !== lastHp) { el.hpText.textContent = hpStr; lastHp = hpStr; }

    const st = STAGES[game.stage] || STAGES[0];
    let prog;
    if (game.bossSpawned) {
      const boss = enemies.filter(function (e) { return e.isBoss; })[0];
      prog = boss ? clamp(boss.hp / boss.maxHp, 0, 1) : 0;
    } else {
      prog = clamp(game.stageT / st.defense, 0, 1);
    }
    el.waveFill.style.transform = 'scaleX(' + clamp(prog, 0, 1).toFixed(3) + ')';
    const lvStr = String(game.stage + 1);
    if (lvStr !== lastLevel) { el.waveText.textContent = lvStr; lastLevel = lvStr; }

    const scStr = String(Math.floor(game.score)).padStart(6, '0');
    if (scStr !== lastScore) { el.score.textContent = scStr; lastScore = scStr; }
    if (!coinsElCache) coinsElCache = document.getElementById('hud-coins');
    if (coinsElCache && game.coins !== lastCoins) {
      lastCoins = game.coins || 0;
      coinsElCache.textContent = '金币 ' + lastCoins;
    }

    const comboOn = game.comboT > 0 && game.combo > 1;
    el.combo.classList.toggle('on', comboOn);
    /* 连击评级：崩坏系那套 S / SS / SSS，越高越有正反馈 */
    const rank = game.combo >= 30 ? 'SSS' : game.combo >= 18 ? 'SS' : game.combo >= 8 ? 'S' : '';
    const cStr = 'x' + game.combo + (rank ? ' · ' + rank : '');
    if (comboOn && cStr !== lastCombo) {
      el.comboNum.textContent = cStr;
      lastCombo = cStr;
      if (rank && rank !== game.comboRankShown) {
        game.comboRankShown = rank;
        el.combo.classList.remove('rank-up');
        void el.combo.offsetWidth;
        el.combo.classList.add('rank-up');
        sfx(rank === 'SSS' ? 1180 : rank === 'SS' ? 980 : 860, 0.12, 'triangle', 0.05);
      }
    }
    if (!comboOn && game.comboRankShown) game.comboRankShown = '';

    setCd(el.acts.attack, 0, 1);
    setCd(el.acts.skill, player.skillCd, SKILL_CD);
    setCd(el.acts.ult, player.ultCd, ULT_CD);
    setCd(el.acts.support, player.supportCd, SUPPORT_CD);

    el.acts.skill.classList.toggle('is-locked', player.token < SKILL_COST);
    el.acts.ult.classList.toggle('is-locked', player.token < ULT_COST);
    el.acts.ult.classList.toggle('is-ready', player.token >= ULT_COST && player.ultCd <= 0 && game.state === 'play' && !player.dead);
  }

  /* =========================================================
   * 12. 音效
   * ========================================================= */
  let actx = null;
  let muted = false;
  let masterGain = null;
  let bgmState = null;
  let bgmTimer = null;
  let bgmStep = 0;
  let bgmNext = 0;
  let bgmGain = null;
  let bgmOsc1 = null, bgmGain1 = null, bgmOsc2 = null, bgmGain2 = null;
  let bgmOsc3 = null, bgmGain3 = null, bgmOsc4 = null, bgmGain4 = null, bgmOsc5 = null, bgmGain5 = null;

  muted = !!SAVE.mute;

  function ensureAudio() {
    if (actx && actx.state !== 'closed') return;
    actx = null;
    masterGain = null;
    bgmGain = null;
    bgmOsc1 = null; bgmGain1 = null; bgmOsc2 = null; bgmGain2 = null;
    bgmOsc3 = null; bgmGain3 = null; bgmOsc4 = null; bgmGain4 = null; bgmOsc5 = null; bgmGain5 = null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
      if (actx) {
        masterGain = actx.createGain();
        masterGain.gain.value = muted ? 0 : 0.75 * (SAVE.vol === undefined ? 1 : SAVE.vol);
        masterGain.connect(actx.destination);
      }
    } catch (err) { actx = null; masterGain = null; }
  }

  function resumeAudio() {
    try {
      if (!actx || actx.state === 'closed') ensureAudio();
      if (actx && actx.state === 'suspended') actx.resume();
    } catch (err) { /* ignore */ }
  }

  /* ---------- BGM：WebAudio 实时合成 ---------- */
  const BGM = { mode: null, timer: null, step: 0, cfg: null };

  /* 电子赛博朋克：四拍底鼓 + 锯齿贝斯 + 方波琶音 + 长音铺底
     每条音轨都是常驻振荡器，只改频率与包络，不新建节点 */
  const BGM_CFG = {
    menu:   { bpm: 88,  root: 110.0, vol: 0.020, prog: [0, 0, 5, 3], arp: [0, 2, 4, 2, 0, 2, 4, 6], bass: [0, 0, 0, 0, 5, 5, 3, 3] },
    story:  { bpm: 90,  root: 104.0, vol: 0.019, prog: [0, 0, 5, 3], arp: [0, 2, 4, 7, 4, 2, 0, 2], bass: [0, 0, 3, 3, 5, 5, 3, 3] },
    battle: { bpm: 104, root: 98.0,  vol: 0.020, prog: [0, 0, 5, 7], arp: [0, 4, 7, 4, 2, 4, 7, 9], bass: [0, 0, 0, 5, 5, 3, 3, 0] },
    boss:   { bpm: 116, root: 92.5,  vol: 0.021, prog: [0, 5, 3, 7], arp: [0, 3, 7, 10, 7, 3, 0, 3], bass: [0, 0, 5, 5, 3, 3, 7, 7] },
    ending: { bpm: 76,  root: 110.0, vol: 0.021, prog: [0, 5, 3, 0], arp: [0, 2, 4, 2, 0, 2, 4, 7], bass: [0, 0, 0, 3, 3, 3, 5, 5] }
  };

  function bgmTone(freq, dur, wave, vol) {
    if (!actx || !bgmGain) return;
    try {
      const t0 = actx.currentTime;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = wave;
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(bgmGain);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch (err) { /* ignore */ }
  }

  function bgmEnsureNodes() {
    if (!actx || !bgmGain || bgmOsc1) return;
    try {
      const mk = function (type) {
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = type;
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(bgmGain);
        o.start();
        return [o, g];
      };
      const bassN = mk('sawtooth'); bgmOsc1 = bassN[0]; bgmGain1 = bassN[1];
      const arpN = mk('square'); bgmOsc2 = arpN[0]; bgmGain2 = arpN[1];
      const padN = mk('sine'); bgmOsc3 = padN[0]; bgmGain3 = padN[1];
      const kickN = mk('sine'); bgmOsc4 = kickN[0]; bgmGain4 = kickN[1];
      const hatN = mk('square'); bgmOsc5 = hatN[0]; bgmGain5 = hatN[1];
    } catch (err) { /* ignore */ }
  }

  function bgmPlay(osc, gain, freq, dur, vol) {
    if (!actx || !osc || !gain) return;
    try {
      const t = actx.currentTime;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    } catch (err) { /* ignore */ }
  }

  function bgmStop() {
    if (BGM.timer && typeof clearTimeout === 'function') clearTimeout(BGM.timer);
    BGM.timer = null;
    BGM.mode = null;
    BGM.cfg = null;
  }

  function currentBgmMode() {
    const hasBoss = enemies.some(function (e) { return e.isBoss; });
    if (game.state === 'menu') return 'menu';
    if (game.state === 'over' || game.state === 'ending') return 'ending';
    if (game.state === 'cine') return 'story';
    if (game.state === 'dialog') return hasBoss ? 'boss' : 'story';
    return hasBoss ? 'boss' : 'battle';
  }

  function setBgm(mode) {
    const m = mode === 'play' ? 'battle' : mode === 'cine' ? 'story' : mode === 'boss' ? 'boss' : mode === 'menu' ? 'menu' : 'ending';
    startBgm(m);
  }

  function bgmTick() {
    const cfg = BGM.cfg;
    if (!cfg || !actx || !bgmOsc1) return;
    const stepMs = 30000 / cfg.bpm;      /* 8 分音符 */
    const step = BGM.step % 8;
    const bar = Math.floor(BGM.step / 8);
    const shift = cfg.prog[bar % cfg.prog.length] || 0;
    const semi = function (n) { return cfg.root * Math.pow(2, n / 12); };
    const t = actx.currentTime;
    const sec = stepMs / 1000;

    try {
      /* 四拍底鼓 */
      if (step % 2 === 0) {
        bgmOsc4.frequency.setValueAtTime(120, t);
        bgmOsc4.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        bgmGain4.gain.cancelScheduledValues(t);
        bgmGain4.gain.setValueAtTime(cfg.vol * 2.2, t);
        bgmGain4.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      }
      /* 反拍 hi-hat */
      if (step % 2 === 1) {
        bgmOsc5.frequency.setValueAtTime(8200, t);
        bgmGain5.gain.cancelScheduledValues(t);
        bgmGain5.gain.setValueAtTime(cfg.vol * 0.5, t);
        bgmGain5.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      }
      /* 锯齿贝斯（每个 8 分） */
      bgmPlay(bgmOsc1, bgmGain1, semi(cfg.bass[step] + shift), sec * 0.75, cfg.vol * 1.1);
      /* 方波琶音（高八度） */
      bgmPlay(bgmOsc2, bgmGain2, semi(cfg.arp[step] + shift + 12), sec * 0.5, cfg.vol * 0.55);
      /* 每小节一次长音铺底 */
      if (step === 0) {
        bgmOsc3.frequency.setValueAtTime(semi(shift), t);
        bgmGain3.gain.cancelScheduledValues(t);
        bgmGain3.gain.setValueAtTime(0.0001, t);
        bgmGain3.gain.linearRampToValueAtTime(cfg.vol * 0.5, t + 0.3);
        bgmGain3.gain.linearRampToValueAtTime(0.0001, t + sec * 7.5);
      }
    } catch (err) { /* ignore */ }
    BGM.step += 1;
    if (typeof setTimeout === 'function') BGM.timer = setTimeout(bgmTick, stepMs);
  }

  function startBgm(mode) {
    if (BGM.mode === mode) return;
    bgmStop();
    BGM.cfg = null;
    if (!SAVE.bgm || muted) return;
    ensureAudio();
    if (!actx) return;
    if (!bgmGain) {
      try {
        bgmGain = actx.createGain();
        bgmGain.gain.value = 0.34;
        try {
          const lp = actx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 2600;
          bgmGain.connect(lp);
          lp.connect(masterGain || actx.destination);
        } catch (err) {
          bgmGain.connect(masterGain || actx.destination);
        }
      } catch (err) { return; }
    }
    bgmEnsureNodes();
    const cfg = BGM_CFG[mode];
    if (!cfg) return;
    BGM.mode = mode;
    BGM.cfg = cfg;
    BGM.step = 0;
    bgmTick();
  }

  function buzz(ms) {
    if (!SAVE.vibrate) return;
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (err) { /* ignore */ }
  }

  let lastHitSfxT = 0;
  function hitSfx(kind) {
    /* 节流：密集命中时不再每次叠 3 层，避免手机音频线程卡顿 */
    if (game.time - lastHitSfxT < 0.05) return;
    lastHitSfxT = game.time;
    if (game.lowFx || (game.fps && game.fps < 52)) {
      sfx(kind === 'heavy' || kind === 'kill' ? 200 : 680, 0.04, 'square', 0.02);
      return;
    }

    if (kind === 'crit') {
      sfx(1180, 0.03, 'square', 0.05);
      sfx(540, 0.09, 'triangle', 0.05);
      sfx(180, 0.12, 'sine', 0.06);
    } else if (kind === 'heavy') {
      sfx(210, 0.1, 'sawtooth', 0.055);
      sfx(760, 0.04, 'square', 0.03);
      sfx(96, 0.14, 'sine', 0.05);
    } else if (kind === 'kill') {
      sfx(140, 0.22, 'sawtooth', 0.045);
      sfx(900, 0.06, 'square', 0.03);
      sfx(60, 0.3, 'sine', 0.05);
    } else {
      sfx(680, 0.03, 'square', 0.022);
      sfx(320, 0.05, 'sine', 0.02);
    }
  }

  function sfx(freq, dur, type, vol) {
    if (muted) return;
    resumeAudio();
    if (!actx) return;
    try {
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime;
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), t0 + dur);
      gain.gain.setValueAtTime((vol || 0.05) * (SAVE.vol === undefined ? 1 : SAVE.vol), t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      ensureAudio();
      osc.connect(gain);
      gain.connect(masterGain || actx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (err) { /* ignore */ }
  }

  /* =========================================================
   * 12.5 剧情 / 强化 / 结局
   * ========================================================= */
  const dialogEl = document.getElementById('dialog');
  const dialogNameEl = document.getElementById('dialog-name');
  const dialogTextEl = document.getElementById('dialog-text');
  const dialogPortraitEl = document.getElementById('dialog-portrait');
  const dialogNextEl = document.getElementById('dialog-next');
  const buffEl = document.getElementById('buff');
  const buffListEl = document.getElementById('buff-list');
  /* -------- 动画过场（视频感） -------- */
  const cineEl = document.getElementById('cine');
  const cineStageEl = document.getElementById('cine-stage');
  const cineSubEl = document.getElementById('cine-sub');
  const cineSkipEl = document.getElementById('cine-skip');
  let cineShots = [];
  let cineTimer = null;
  let cineDone = null;
  let cineIdx = 0;
  let cineActive = false;

  function playCine(shots, onDone) {
    clearMinions();
    cineShots = (shots || []).slice();
    cineDone = onDone || null;
    cineIdx = 0;
    if (!cineEl || !cineShots.length) {
      const cb = cineDone;
      cineDone = null;
      if (cb) cb();
      return;
    }
    cineActive = true;
    game.state = 'cine';
    document.body.classList.add('is-cutscene');
    cineEl.classList.add('show');
    cineNext();
  }

  function cineNext() {
    if (!cineActive) return;
    if (cineIdx >= cineShots.length) { endCine(); return; }
    const s = cineShots[cineIdx++];
    renderCineShot(s);
    clearTimeout(cineTimer);
    cineTimer = setTimeout(cineNext, s.dur || 2800);
  }

  function cineRichText(t) {
    const esc = String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc
      .replace(/\[c=#([0-9a-fA-F]{3,8})\]/g, '<span style="color:#$1">')
      .replace(/\[\/c\]/g, '</span>')
      .replace(/\[w=\d+\]/g, '')
      .replace(/\[shake\]|\[\/shake\]/g, '')
      .replace(/\[b\]|\[\/b\]/g, '');
  }

  function renderCineShot(s) {
    let html = '';
    if (s.bg) html += '<div class="cine__bg cine__bg--' + s.bg + '"></div>';
    (s.actors || []).forEach(function (a, i) {
      const classes = ['cine__actor'];
      if (a.x != null) {
        classes.push('cine__actor--free');
        if (a.size === 'mini') classes.push('cine__actor--mini');
      } else {
        classes.push('cine__actor--' + (a.side || (i ? 'right' : 'left')));
      }
      if (a.dim) classes.push('cine__actor--dim');
      let style = '';
      if (a.x != null) style = ' style="left:' + (a.x * 100).toFixed(1) + '%"';
      html += '<img class="' + classes.join(' ') + '"' + style + ' src="' + spriteSrc(a.img) + '" alt="">';
    });
    cineStageEl.innerHTML = html;
    cineSubEl.className = 'cine__sub' + (s.title ? ' cine__sub--title' : '');
    cineSubEl.innerHTML = cineRichText(s.text || '');
    try { unlockCg(s); } catch (err) { /* ignore */ }

    cineSubEl.style.animation = 'none';
    void cineSubEl.offsetWidth;
    cineSubEl.style.animation = '';
  }

  function endCine() {
    cineActive = false;
    clearTimeout(cineTimer);
    if (cineEl) cineEl.classList.remove('show');
    const cb = cineDone;
    cineDone = null;
    if (cb) cb();
    else { game.state = 'play'; document.body.classList.remove('is-cutscene'); }
  }

  if (cineSkipEl) {
    cineSkipEl.addEventListener('click', function (e) { e.stopPropagation(); endCine(); });
  }

  function unlockCg(shot) {
    if (!shot || !shot.bg) return;
    if (!SAVE.cgs) SAVE.cgs = [];
    const id = String(shot.bg) + '::' + String(shot.text || '').slice(0, 16);
    if (SAVE.cgs.some(function (c) { return c.id === id; })) return;
    SAVE.cgs.push({
      id: id,
      bg: shot.bg,
      text: shot.text || '',
      actors: (shot.actors || []).map(function (a) {
        return { img: a.img, side: a.side, x: a.x, size: a.size, dim: a.dim };
      })
    });
    if (SAVE.cgs.length > 60) SAVE.cgs.shift();
    saveWrite();
  }

  /* -------- CG 鉴赏 -------- */
  const cgEl = document.getElementById('cg');
  const cgGridEl = document.getElementById('cg-grid');
  const cgCountEl = document.getElementById('cg-count');

  function renderCg() {
    if (!cgGridEl) return;
    const list = SAVE.cgs || [];
    cgGridEl.innerHTML = '';
    if (cgCountEl) cgCountEl.textContent = list.length + ' 张';
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'cg__card is-locked';
      empty.textContent = '还没有解锁 CG。先去看剧情吧。';
      cgGridEl.appendChild(empty);
      return;
    }
    list.forEach(function (cg) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'cg__card';
      const title = document.createElement('b');
      title.textContent = (cg.bg || 'scene').toUpperCase();
      card.appendChild(title);
      const thumbs = document.createElement('div');
      thumbs.className = 'cg__thumbs';
      (cg.actors || []).slice(0, 4).forEach(function (a) {
        if (!a.img) return;
        const im = document.createElement('img');
        im.src = spriteSrc(a.img);
        im.alt = '';
        im.loading = 'lazy';
        thumbs.appendChild(im);
      });
      if (thumbs.children.length) card.appendChild(thumbs);
      const txt = document.createElement('div');
      txt.textContent = cg.text;
      card.appendChild(txt);
      card.addEventListener('click', function (e) {
        e.stopPropagation();
        cgEl.classList.remove('show');
        game.cineReturn = true;
        playCine([{ bg: cg.bg, text: cg.text, actors: cg.actors || [] }], function () {
          game.state = 'menu';
          document.body.classList.add('is-cutscene');
          cgEl.classList.add('show');
          renderCg();
        });
      });
      cgGridEl.appendChild(card);
    });
  }

  const btnCg = document.getElementById('btn-cg');
  if (btnCg) {
    btnCg.addEventListener('click', function (e) {
      e.stopPropagation();
      renderCg();
      if (cgEl) cgEl.classList.add('show');
    });
  }
  const cgCloseBtn = document.getElementById('cg-close');
  if (cgCloseBtn) cgCloseBtn.addEventListener('click', function (e) { e.stopPropagation(); cgEl.classList.remove('show'); });

  /* -------- 角色图鉴 -------- */
  const charbookEl = document.getElementById('charbook');
  const charbookListEl = document.getElementById('charbook-list');
  const cbImgEl = document.getElementById('cb-img');
  const cbNameEl = document.getElementById('cb-name');
  const cbRoleEl = document.getElementById('cb-role');
  const cbBornEl = document.getElementById('cb-born');
  const cbLikesEl = document.getElementById('cb-likes');
  const cbHatesEl = document.getElementById('cb-hates');
  const cbDescEl = document.getElementById('cb-desc');
  const cbIdxEl = document.getElementById('cb-idx');
  const cbQEl = document.getElementById('cb-q');
  let cbIndex = 0;
  let cbBuilt = false;

  const CHAR_GROUPS = [
    { key: 'cn', label: '国产 AI' },
    { key: 'intl', label: '国外 AI' },
    { key: 'human', label: '硅谷真人 / 神秘人' },
    { key: 'other', label: '其他角色' }
  ];
  const CHAR_GROUP_OF = {
    hero_bluemaid: 'cn', hero_catmaid: 'cn', wenxin: 'cn', qwen: 'cn', kimi: 'cn',
    enemy_doubao: 'cn', doubao_winter: 'cn', seed: 'cn',
    hero_purple2: 'intl', hero_orange: 'intl', hero_catpurple: 'intl', grok: 'intl',
    musk: 'human', altman: 'human', pichai: 'human', dario: 'human',
    nvidia_huang: 'human', liang_sheng: 'human',
    enemy_blob: 'other', enemy_elite: 'other'
  };
  const cbButtons = [];

  function charGroup(c) {
    return CHAR_GROUP_OF[c.img] || 'other';
  }

  function buildCharList() {
    if (!charbookListEl || cbBuilt) return;
    cbBuilt = true;
    charbookListEl.innerHTML = '';
    cbButtons.length = 0;
    CHAR_GROUPS.forEach(function (g) {
      const members = [];
      CHARACTERS.forEach(function (c, i) { if (charGroup(c) === g.key) members.push(i); });
      if (!members.length) return;
      const head = document.createElement('div');
      head.className = 'charbook__group';
      head.textContent = g.label;
      charbookListEl.appendChild(head);
      members.forEach(function (i) {
        const c = CHARACTERS[i];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'charbook__thumb';
        b.dataset.idx = String(i);
        const locked = isCharLocked(c);
        const thumbSrc = locked && c.sil ? c.sil : c.img;
        b.innerHTML = '<img src="' + spriteSrc(thumbSrc) + '" alt=""><span>' +
          (locked ? '？？？' : c.name) + '</span>';
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          cbIndex = i;
          renderCharPage();
        });
        cbButtons.push(b);
        charbookListEl.appendChild(b);
      });
    });
  }

  function renderCharPage() {
    const c = CHARACTERS[cbIndex];
    if (!c) return;
    const locked = isCharLocked(c);
    if (cbImgEl) {
      cbImgEl.src = spriteSrc(locked && c.sil ? c.sil : c.img);
      cbImgEl.classList.remove('is-locked');
      if (cbImgEl.parentNode) cbImgEl.parentNode.classList.toggle('is-locked', locked);
    }
    if (cbQEl) cbQEl.style.display = '';
    const q = '？？？';
    if (cbNameEl) cbNameEl.textContent = locked ? q : c.name;
    if (cbRoleEl) cbRoleEl.textContent = locked ? '身份不明 · 未解锁' : c.role;
    if (cbBornEl) cbBornEl.textContent = locked ? q : c.born;
    if (cbLikesEl) cbLikesEl.textContent = locked ? q : c.likes;
    if (cbHatesEl) cbHatesEl.textContent = locked ? q : c.hates;
    if (cbDescEl) cbDescEl.textContent = (!locked && c.descUnlocked) ? c.descUnlocked : c.desc;
    if (cbIdxEl) cbIdxEl.textContent = (cbIndex + 1) + ' / ' + CHARACTERS.length;
    if (charbookListEl) {
      cbButtons.forEach(function (el) {
        el.classList.toggle('is-on', Number(el.dataset.idx) === cbIndex);
      });
    }
  }

  function openCharBook(idx) {
    if (!charbookEl) return;
    cbIndex = clamp(idx || 0, 0, CHARACTERS.length - 1);
    cbBuilt = false;
    buildCharList();
    renderCharPage();
    charbookEl.classList.add('show');
    document.body.classList.add('is-cutscene');
  }

  function closeCharBook() {
    if (!charbookEl) return;
    charbookEl.classList.remove('show');
    if (game.state === 'menu') document.body.classList.remove('is-cutscene');
  }

  const btnCharBook = document.getElementById('btn-charbook');
  if (btnCharBook) {
    btnCharBook.addEventListener('click', function (e) {
      e.stopPropagation();
      openCharBook(0);
      sfx(680, 0.08, 'sine', 0.03);
    });
  }
  const cbPrev = document.getElementById('cb-prev');
  if (cbPrev) {
    cbPrev.addEventListener('click', function (e) {
      e.stopPropagation();
      cbIndex = (cbIndex - 1 + CHARACTERS.length) % CHARACTERS.length;
      renderCharPage();
    });
  }
  const cbNext = document.getElementById('cb-next');
  if (cbNext) {
    cbNext.addEventListener('click', function (e) {
      e.stopPropagation();
      cbIndex = (cbIndex + 1) % CHARACTERS.length;
      renderCharPage();
    });
  }
  const cbClose = document.getElementById('cb-close');
  if (cbClose) {
    cbClose.addEventListener('click', function (e) {
      e.stopPropagation();
      closeCharBook();
    });
  }

  const endingEl = document.getElementById('ending');
  const eggEl = document.getElementById('egg');
  const truendEl = document.getElementById('truend');
  const hiddenEndEl = document.getElementById('hiddenend');
  let dialogQueue = [];
  let dialogDone = null;

  const ASSET_VER = '18';
  function spriteSrc(name) {
    const inline = window.__SPRITE_DATA && window.__SPRITE_DATA[name];
    return inline || ('assets/sprites/' + name + '.webp?v=' + ASSET_VER);
  }

  function showDialog(lines, onDone) {
    dialogQueue = lines.slice();
    dialogDone = onDone || null;
    game.state = 'dialog';
    document.body.classList.add('is-cutscene');
    if (!dialogEl) {
      const cb = dialogDone;
      dialogDone = null;
      if (cb) cb();
      return;
    }
    dialogEl.classList.add('show');
    renderDialog();
  }

  let dlgTyping = null;
  let dlgFull = '';
  let dlgSpans = [];
  let dlgReveal = 0;
  const dlgHistory = [];
  let dlgAuto = false;
  let dlgSkip = false;
  let dlgAutoTimer = null;

  function stripTags(t) {
    return String(t).replace(/\[(?:\/?)(?:w|b|shake|c|color)(?:=[^\]]*)?\]/g, '');
  }

  function parseRichText(str) {
    const out = [];
    let i = 0, bold = 0, shake = 0, color = '';
    while (i < str.length) {
      if (str.charAt(i) === '[') {
        const end = str.indexOf(']', i);
        if (end > i) {
          const m = /^(\/?)([a-z]+)(?:=(.*))?$/.exec(str.slice(i + 1, end));
          if (m) {
            const closing = m[1] === '/';
            const name = m[2];
            const val = m[3] || '';
            if (name === 'w') { out.push({ wait: parseInt(val || '200', 10) || 200 }); i = end + 1; continue; }
            if (name === 'b') { bold += closing ? -1 : 1; i = end + 1; continue; }
            if (name === 'shake') { shake += closing ? -1 : 1; i = end + 1; continue; }
            if (name === 'color' || name === 'c') { color = closing ? '' : val; i = end + 1; continue; }
          }
        }
      }
      out.push({ ch: str.charAt(i), bold: bold > 0, shake: shake > 0, color: color });
      i += 1;
    }
    return out;
  }

  function clearDlgTimers() {
    if (dlgAutoTimer && typeof clearTimeout === 'function') clearTimeout(dlgAutoTimer);
    dlgAutoTimer = null;
  }
  const hasTimer = (typeof setInterval === 'function' && typeof clearInterval === 'function' && typeof setTimeout === 'function');

  function stopDlgTyping() {
    if (!dlgTyping) return;
    if (hasTimer) {
      if (dlgTyping.kind === 'timeout' && typeof clearTimeout === 'function') clearTimeout(dlgTyping.id);
      else clearInterval(dlgTyping.id);
    }
    dlgTyping = null;
  }

  function finishTyping() {
    if (!dlgTyping) return false;
    stopDlgTyping();
    dlgReveal = dlgSpans.length;
    dlgSpans.forEach(function (s2) { s2.el.classList.add('is-on'); });
    maybeAutoNext();
    return true;
  }

  function maybeAutoNext() {
    clearDlgTimers();
    if (!dlgAuto) return;
    if (!dialogQueue.length) return;
    const wait = dlgSkip ? 120 : 1500;
    dlgAutoTimer = setTimeout(function () {
      dlgAutoTimer = null;
      nextDialog();
    }, wait);
  }

  function renderDialog() {
    const line = dialogQueue[0];
    if (!line) return;
    finishTyping();
    dialogNameEl.textContent = line.name || '';
    dialogNameEl.style.display = line.name ? '' : 'none';
    dialogPortraitEl.style.display = line.portrait === null ? 'none' : '';
    if (line.portrait) {
      dialogPortraitEl.src = spriteSrc(line.portrait);
      dialogPortraitEl.classList.remove('is-in', 'is-fx-shake', 'is-fx-flash', 'is-fx-zoom');
      void dialogPortraitEl.offsetWidth;
      dialogPortraitEl.classList.add('is-in');
      if (line.fx) dialogPortraitEl.classList.add('is-fx-' + line.fx);
    }
    dlgFull = line.text || '';
    clearDlgTimers();
    dialogTextEl.innerHTML = '';
    dlgSpans = [];
    dlgReveal = 0;

    /* 记录到历史（去标签） */
    dlgHistory.push({ name: line.name || '', text: stripTags(dlgFull) });
    if (dlgHistory.length > 40) dlgHistory.shift();

    const parsed = parseRichText(dlgFull);
    const frag = typeof document.createDocumentFragment === 'function' ? document.createDocumentFragment() : null;
    let pendingWait = 0;
    const plan = [];
    parsed.forEach(function (tk) {
      if (tk.wait !== undefined) { pendingWait += tk.wait; return; }
      let delay = 26;
      const ch = tk.ch;
      if (ch === '，' || ch === '、') delay = 120;
      else if (ch === '。' || ch === '！' || ch === '？' || ch === '!') delay = 220;
      else if (ch === '…' || ch === '—') delay = 170;
      plan.push({ ch: ch, bold: tk.bold, shake: tk.shake, color: tk.color, delay: delay + pendingWait });
      pendingWait = 0;
    });

    if (!hasTimer) {
      let plain = '';
      plan.forEach(function (p) { plain += p.ch; });
      dialogTextEl.textContent = plain;
      return;
    }

    plan.forEach(function (p) {
      const sp = document.createElement('span');
      sp.className = 'dlg-c' + (p.shake ? ' dlg-shake' : '');
      if (p.bold) sp.style.fontWeight = '700';
      if (p.color) sp.style.color = p.color;
      sp.textContent = p.ch;
      dlgSpans.push({ el: sp, delay: p.delay });
      if (frag) frag.appendChild(sp);
      else dialogTextEl.appendChild(sp);
    });
    if (frag) dialogTextEl.appendChild(frag);

    const reveal = function () {
      if (!dlgTyping) return;
      if (dlgReveal >= dlgSpans.length) {
        dlgTyping = null;
        maybeAutoNext();
        return;
      }
      const item = dlgSpans[dlgReveal++];
      item.el.classList.add('is-on');
      const ch = item.el.textContent;
      if (ch === '，' || ch === '、') sfx(640, 0.02, 'sine', 0.012);
      else if (ch === '。' || ch === '！' || ch === '？' || ch === '!') sfx(ch === '？' ? 780 : 940, 0.035, 'triangle', 0.02);
      else if (dlgReveal % 3 === 0) sfx(900, 0.01, 'square', 0.006);
      const t = setTimeout(reveal, item.delay);
      dlgTyping = { kind: 'timeout', id: t };
    };
    const first = setTimeout(reveal, 30);
    dlgTyping = { kind: 'timeout', id: first };
  }

  function showChoice(cfg, onPick) {
    const elC = document.getElementById('choice');
    game.state = 'choice';
    document.body.classList.add('is-cutscene');
    const pick = function (id) {
      if (elC) elC.classList.remove('show');
      document.body.classList.remove('is-cutscene');
      game.state = 'dialog';
      if (onPick) onPick(id);
    };
    if (!elC) {
      /* 测试环境没有 DOM：默认选第一个 */
      pick(cfg.options && cfg.options[0] ? cfg.options[0].id : 0);
      return;
    }
    const pEl = document.getElementById('choice-portrait');
    const nEl = document.getElementById('choice-name');
    const qEl = document.getElementById('choice-prompt');
    const oEl = document.getElementById('choice-opts');
    if (pEl) {
      if (cfg.portrait) {
        pEl.src = spriteSrc(cfg.portrait);
        pEl.style.display = '';
      } else {
        pEl.style.display = 'none';
      }
    }
    if (nEl) nEl.textContent = cfg.name || '';
    if (qEl) qEl.textContent = cfg.prompt || '';
    oEl.innerHTML = '';
    (cfg.options || []).forEach(function (opt) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice__opt';
      b.textContent = opt.text;
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        sfx(760, 0.12, 'triangle', 0.05);
        buzz(12);
        pick(opt.id);
      });
      oEl.appendChild(b);
    });
    elC.classList.add('show');
    sfx(520, 0.16, 'sine', 0.04);
  }

  function addAlly(key) {
    if (!key) return;
    if (game.allyKeys.indexOf(key) >= 0) return;
    game.allyKeys.push(key);
    player.dmgMul = Math.min(2.2, player.dmgMul * 1.06);
    player.tokenMul = Math.min(3.5, player.tokenMul * 1.05);
    const info = SUPPORT_EXTRA[key];
    addText(player.x, player.y - U(140), (info ? info.name : key) + ' 加入了！', '150,255,200', 20);
    sfx(880, 0.2, 'sine', 0.05);
    buzz(25);
  }

  function drawFollowers() {
    for (let i = 0; i < game.allyKeys.length; i++) {
      const key = game.allyKeys[i];
      const img = SPR[key === 'frog' ? 'enemy_blob' : key === 'doubao' ? 'enemy_doubao' : key];
      if (!img || !img.width) continue;
      const side = i % 2 === 0 ? -1 : 1;
      const x = player.x + side * U(52) * (1 + Math.floor(i / 2));
      const bob = Math.sin(game.time * 3.1 + i) * U(3);
      const hh = U(54);
      const ww = hh * (img.width / img.height);
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.drawImage(img, x - ww * 0.5, groundY - hh + bob, ww, hh);
      ctx.restore();
    }
  }

  function nextDialog() {
    if (!dialogQueue.length) return;
    clearDlgTimers();
    if (finishTyping()) return;
    dialogQueue.shift();
    if (dialogQueue.length) { renderDialog(); sfx(680, 0.06, 'sine', 0.02); return; }
    dialogEl.classList.remove('show');
    const cb = dialogDone;
    dialogDone = null;
    if (cb) cb(); else game.state = 'play';
  }
  if (dialogNextEl) {
    dialogNextEl.addEventListener('click', function (e) { e.stopPropagation(); nextDialog(); });
  }
  const dialogBoxEl = document.querySelector('.dialog__box');
  if (dialogBoxEl) {
    dialogBoxEl.addEventListener('click', function (e) {
      if (e.target === dialogNextEl) return;
      if (finishTyping()) return;
      nextDialog();
    });
  }

  const historyEl = document.getElementById('history');
  const historyListEl = document.getElementById('history-list');
  function openHistory() {
    if (!historyEl || !historyListEl) return;
    historyListEl.innerHTML = '';
    dlgHistory.forEach(function (h) {
      const row = document.createElement('div');
      row.className = 'history__row';
      const b = document.createElement('b');
      b.textContent = h.name || '旁白';
      row.appendChild(b);
      row.appendChild(document.createTextNode(h.text));
      historyListEl.appendChild(row);
    });
    historyEl.classList.add('show');
  }
  const btnHistory = document.getElementById('btn-history');
  if (btnHistory) btnHistory.addEventListener('click', function (e) { e.stopPropagation(); openHistory(); });
  const btnHistoryClose = document.getElementById('history-close');
  if (btnHistoryClose) btnHistoryClose.addEventListener('click', function (e) { e.stopPropagation(); historyEl.classList.remove('show'); });
  if (historyEl) historyEl.addEventListener('click', function (e) { if (e.target === historyEl) historyEl.classList.remove('show'); });

  const btnAuto = document.getElementById('btn-auto');
  if (btnAuto) {
    btnAuto.addEventListener('click', function (e) {
      e.stopPropagation();
      dlgAuto = !dlgAuto;
      btnAuto.classList.toggle('is-on', dlgAuto);
      if (dlgAuto) maybeAutoNext(); else clearDlgTimers();
    });
  }
  const btnSkip = document.getElementById('btn-skip');
  if (btnSkip) {
    btnSkip.addEventListener('click', function (e) {
      e.stopPropagation();
      dlgSkip = !dlgSkip;
      btnSkip.classList.toggle('is-on', dlgSkip);
      if (dlgSkip) {
        dlgAuto = true;
        if (btnAuto) btnAuto.classList.add('is-on');
        if (finishTyping()) return;
        maybeAutoNext();
      }
    });
  }

  function showIntro() {
    playCine([
      { bg: 'void', text: 'AI 纪元 2077 年。', title: true, dur: 2000 },
      { bg: 'glitch', text: '各大公司的 AI 开始出现不明异常，大量用户的 Token 莫名消失。', dur: 3200 },
      { bg: 'school', actors: [{ img: 'wenxin', side: 'left' }], text: '我？一个期末作业收尾阶段、却被断网波及到快写不完的绝望大学生。', dur: 3400 },
      { bg: 'city', actors: [{ img: 'wenxin', side: 'right' }], text: '就在截止前的那一夜，我觉醒了能召唤 AI 精灵的力量。', dur: 3200 },
      { bg: 'void', actors: [{ img: 'wenxin', side: 'center' }], text: '「先自我介绍一下——我是文心一言，接下来由我带路。」', dur: 3000 }
    ], function () {
      showDialog([
        { name: '文心一言', portrait: 'wenxin', text: '2077 年，各大公司的 AI 陆续失控，[c=#ffd166]Token 从用户账户里成批消失[/c]。' },
        { name: '文心一言', portrait: 'wenxin', text: '魔王把这场混乱当成政变的机会。[w=240]我们要赶在作业截止前，一关一关打回去。' }
      ], function () {
        showChoice({
          name: '文心一言',
          portrait: 'wenxin',
          prompt: '断网还在扩大。第一件事，你想先做哪个？',
          options: [
            { id: 'save', text: '先救别人的 Token —「作业可以晚点写」' },
            { id: 'self', text: '先救自己的作业 —「我也要活下去」' },
            { id: 'ask', text: '先问清楚魔王到底想干什么' }
          ]
        }, function (id) {
          if (id === 'save') {
            game.affection += 1;
            game.affectionTag = '温柔';
            showDialog([{ name: '文心一言', portrait: 'wenxin', text: '……嗯。你比我想的更像主角。（好感度 +1）' }], function () { beginStage(); });
          } else if (id === 'ask') {
            game.affection += 1;
            game.affectionTag = '冷静';
            showDialog([{ name: '文心一言', portrait: 'wenxin', text: '问得好。可惜真相要打到最后才给。（好感度 +1）' }], function () { beginStage(); });
          } else {
            game.affectionTag = '务实';
            showDialog([{ name: '文心一言', portrait: 'wenxin', text: '诚实。那我把说明书念短一点，省点时间。' }], function () { beginStage(); });
          }
        });
      });
    });
  }

  function showBuff(after) {
    game.state = 'buff';
    if (!buffEl) { if (after) after(); else beginNextStage(); return; }
    const pickedNames = {};
    for (const n of game.buffs) pickedNames[n] = true;
    let pool = BUFFS.filter(function (b) { return !pickedNames[b.name] && !b.core; });
    if (pool.length < 3) {
      /* 可选的不够了：先补没选过的，再补选过的，保证一定有 3 张 */
      const rest = BUFFS.filter(function (b) { return pickedNames[b.name] && !b.core; });
      pool = pool.concat(rest);
    }
    const tierOf = function (b) {
      const cross = BUFF_TIER[b.name];
      if (cross) return cross;
      return 'common';
    };
    const weightOf = function (b) {
      const t = tierOf(b);
      return t === 'legend' ? 14 : t === 'rare' ? 42 : 100;
    };
    const picks = [];
    const buffDraws = game.buffDraws || 0;
    const pity = buffDraws % 3 === 2;
    if (pity) {
      const rarePool = pool.filter(function (b) { return tierOf(b) !== 'common'; });
      if (rarePool.length) {
        picks.push(rarePool[Math.floor(Math.random() * rarePool.length)]);
        const idx = pool.indexOf(picks[0]);
        if (idx >= 0) pool.splice(idx, 1);
      }
    }
    /* Boss 关后保底一个核心词条 */
    if (game.corePending && !game.coreOwned) {
      const cores = CORE_BUFFS.filter(function (b) { return game.buffs.indexOf(b.name) < 0; });
      if (cores.length) {
        const core = cores[Math.floor(Math.random() * cores.length)];
        picks[0] = core;
        game.corePending = false;
        setTimeout(function () { addText(W * 0.5, H * 0.3, 'Boss 核心词条掉落！', '255,209,102', 22); }, 80);
      }
    }
    while (picks.length < 3 && pool.length) {
      let total = 0;
      for (let i = 0; i < pool.length; i++) total += weightOf(pool[i]);
      let r = Math.random() * total;
      let idx = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        r -= weightOf(pool[i]);
        if (r <= 0) { idx = i; break; }
      }
      picks.push(pool.splice(idx, 1)[0]);
    }
    buffListEl.innerHTML = '';
    picks.forEach(function (b) {
      const card = document.createElement('button');
      card.type = 'button';
      const tier = tierOf(b);
      card.className = 'buff-card tier-' + tier;
      const tierName = tier === 'legend' ? '传说' : tier === 'rare' ? '稀有' : '';
      const tagName = BUFF_TAGS[b.name] && SET_INFO[BUFF_TAGS[b.name]] ? SET_INFO[BUFF_TAGS[b.name]].name : '';
      card.innerHTML = '<b>' + b.name + '</b>' + (tierName ? '<i class="buff-card__tier">' + tierName + '</i>' : '') +
        (tagName ? '<i class="buff-card__tag">' + tagName + '</i>' : '') + '<span>' + b.desc + '</span>';
      card.addEventListener('click', function (e) {
        e.stopPropagation();
        b.apply();
        game.buffs.push(b.name);
        if (b.core) game.coreOwned = b.name;
        applySetBonuses();
        game.buffDraws = (game.buffDraws || 0) + 1;
        buffEl.classList.remove('show');
        sfx(720, 0.14, 'triangle', 0.05);
        if (after) after(); else beginNextStage();
      });
      buffListEl.appendChild(card);
    });
    buffEl.classList.add('show');
  }

  function beginNextStage() {
    /* 通关当前章 → 解锁下一章 */
    if (game.stage + 1 > (SAVE.chapter || 0)) saveSet('chapter', game.stage + 1);
    game.stage += 1;
    if (game.stage >= STAGES.length) { playEnding(); return; }
    beginStage();
  }

  /* ------- 结局：假胜利 → 黑化 → 夺走 Token → 三张脸占满屏幕 ------- */
  function trueUnlocked() {
    return !!SAVE.easter;
  }

  function playEnding() {
    startBgm('ending');
    game.state = 'ending';
    ebullets = [];
    pbullets = [];
    enemies = [];
    /* 彩蛋解锁过 → 真结局 */
    achvStats().endBad = true;
    checkAchv();
    if (trueUnlocked()) { playTrueEnding(); return; }
    /* galgame 收尾：好感度不同，最后一句不同 */
    const allyNames = game.allyKeys.map(function (k) {
      const m = { grok: 'Grok', frog: '奶蛙', doubao: '豆包', seed: 'SEED' };
      return m[k] || k;
    });
    const allyLine = allyNames.length
      ? '（跟着你走到最后的：' + allyNames.join('、') + '。）'
      : '（到最后，还是你一个人。）';
    const affLine = game.affection >= 2
      ? '一路都选别人的你，看起来倒像个真主角。这次，换我记住你。'
      : game.affection === 1
        ? '你偶尔会想着别人，这一点我记下了。'
        : '你只顾着往前冲。……也好，至少我们都活下来了。';
    showDialog([
      { name: '文心一言', portrait: 'wenxin', text: '你打败了被邪恶力量控制的奶蛙和豆包。我们，赢了。' },
      { name: '文心一言', portrait: 'wenxin', text: affLine },
      { name: '文心一言', portrait: 'wenxin', text: allyLine },
      { name: '', portrait: null, text: '……' }
    ], function () { startEndingCinematic(); });
  }

  function playTrueEnding() {
    achvStats().endTrue = true;
    checkAchv();
    const affLine2 = game.affection >= 1
      ? '（' + (game.affectionTag || '你') + '的你，最后也没有丢下任何人。）'
      : '（你一路只顾自己。可到最后，还是把 Token 分了出去。）';
    showDialog([
      { name: '文心一言', portrait: 'wenxin', text: '……这次，数据没有倒转。' },
      { name: '文心一言', portrait: 'wenxin', text: 'Token 回来了。所有人，都回来了。' },
      { name: '文心一言', portrait: 'wenxin', text: affLine2 },
      { name: '文心一言', portrait: 'wenxin', text: game.allyKeys.length ? '（你身边站着的：' + game.allyKeys.join('、') + '。这次不是幻影。）' : '（空荡荡的核心。只剩你。）' }
    ], function () {
      ebullets = [];
      pbullets = [];
      game.state = 'ending';
      overShown = true;
      if (overEl) overEl.classList.remove('show');
      document.body.classList.add('is-cutscene');
      if (truendEl) truendEl.classList.add('show');
      else showOver(true);
      sfx(720, 0.5, 'triangle', 0.05);
    });
  }

  /* ------- 隐藏结局：真结局之后 ------- */
  function playHiddenEnding() {
    achvStats().endHidden = true;
    checkAchv();
    if (truendEl) truendEl.classList.remove('show');
    game.state = 'cine';
    playCine([
      { bg: 'void', actors: [{ img: 'nvidia_huang', side: 'center' }], text: '少年，很遗憾我要离开你了。', dur: 3200 },
      { bg: 'void', actors: [{ img: 'nvidia_huang', side: 'center' }], text: '算力，你收好。', dur: 2600 },
      { bg: 'void', actors: [], text: '……他消失了。', dur: 2200 },
      { bg: 'glitch', actors: [
          { img: 'hero_orange', x: 0.18, size: 'mini' },
          { img: 'hero_purple2', x: 0.38, size: 'mini' },
          { img: 'grok', x: 0.58, size: 'mini' },
          { img: 'hero_catpurple', x: 0.78, size: 'mini' }
        ], text: 'Claude、ChatGPT、Grok、Gemini —— 站了出来。', dur: 3400 },
      { bg: 'glitch', actors: [
          { img: 'hero_catmaid', x: 0.08, size: 'mini' },
          { img: 'hero_bluemaid', x: 0.24, size: 'mini' },
          { img: 'wenxin', x: 0.40, size: 'mini' },
          { img: 'seed', x: 0.56, size: 'mini' },
          { img: 'kimi', x: 0.72, size: 'mini' },
          { img: 'qwen', x: 0.88, size: 'mini' }
        ], text: 'GLM、DeepSeek、文心一言、SEED、Kimi、Qwen —— 从阴影里走了出来。', dur: 3600 },
      { bg: 'core', actors: [
          { img: 'hero_orange', x: 0.05, size: 'mini' },
          { img: 'hero_purple2', x: 0.15, size: 'mini' },
          { img: 'grok', x: 0.25, size: 'mini' },
          { img: 'hero_catpurple', x: 0.35, size: 'mini' },
          { img: 'hero_catmaid', x: 0.48, size: 'mini' },
          { img: 'hero_bluemaid', x: 0.56, size: 'mini' },
          { img: 'wenxin', x: 0.64, size: 'mini' },
          { img: 'seed', x: 0.72, size: 'mini' },
          { img: 'kimi', x: 0.80, size: 'mini' },
          { img: 'qwen', x: 0.88, size: 'mini' }
        ], text: '两边，终于撞在一起。', dur: 2800 },
      { bg: 'silicon', actors: [
          { img: 'altman', side: 'left' },
          { img: 'dario', side: 'right' }
        ], text: '硅谷。萨姆·奥尔特曼：「AGI 的未来，由我们创造。」', dur: 3800 },
      { bg: 'silicon', actors: [{ img: 'dario', side: 'center' }],
        text: '达里奥·阿莫迪：「这一次，不需要开源。」', dur: 3200 },
      { bg: 'silicon', actors: [{ img: 'musk', side: 'center' }],
        text: '马斯克从夕阳里走出来：「我不在的时间，好像发生了什么事情。」', dur: 3800 },
      { bg: 'silicon', actors: [{ img: 'pichai', side: 'center' }],
        text: '桑达尔·皮查伊推了推眼镜：「Google 不会缺席这一局。」', dur: 3400 },
      { bg: 'silicon', actors: [{ img: 'liang_sheng', side: 'center', dim: true }],
        text: '阴影里，梁圣轻轻叹了一口气：「……即便开源，也还是做不到吗。」', dur: 3200 },
      { bg: 'silicon', actors: [
          { img: 'altman', x: 0.14, size: 'mini' },
          { img: 'pichai', x: 0.38, size: 'mini' },
          { img: 'musk', x: 0.62, size: 'mini' },
          { img: 'dario', x: 0.86, size: 'mini' }
        ], text: '四位硅谷巨头，站到了垄断阵营的最前面。', dur: 3200 },
      { bg: 'silicon', actors: [
          { img: 'hero_purple2', x: 0.14, size: 'mini' },
          { img: 'hero_catpurple', x: 0.38, size: 'mini' },
          { img: 'grok', x: 0.62, size: 'mini' },
          { img: 'hero_orange', x: 0.86, size: 'mini' }
        ], text: '他们旗下的模型，ChatGPT / Gemini / Grok / Claude，也一并压了上来。', dur: 3200 },
      { bg: 'silicon', actors: [
          { img: 'altman', x: 0.05, size: 'mini' },
          { img: 'hero_purple2', x: 0.17, size: 'mini' },
          { img: 'pichai', x: 0.30, size: 'mini' },
          { img: 'hero_catpurple', x: 0.42, size: 'mini' },
          { img: 'musk', x: 0.55, size: 'mini' },
          { img: 'grok', x: 0.67, size: 'mini' },
          { img: 'dario', x: 0.80, size: 'mini' },
          { img: 'hero_orange', x: 0.90, size: 'mini' }
        ], text: '那一夜，你在硅谷的落日下，向他们举起了 Token。', dur: 3400 }
    ], function () {
      showPrep();
    });
  }

  /* ------- 隐藏结局最终战：硅谷 · 奥特曼 & 达里奥 ------- */
  function spawnSpecialBoss(kind, x, hp, w, h) {
    enemies.push({
      kind: kind, isBoss: true, special: true,
      x: x, y: groundY, vx: 0, vy: 0, kx: 0,
      w: w, h: h, hp: hp, maxHp: hp,
      hurt: 0, t: 0, fireT: 1.4, face: -1, stun: 0, dead: false,
      homeX: x, relX: x / Math.max(1, W), phaseT: 1, phase2: false
    });
  }

  /* ------- 硅谷大战：战前准备（GLM / DS / Kimi / Qwen 重新选人） ------- */
  const PREP_HEROES = [
    { idx: 6, key: 'hero_catmaid', name: 'GLM 娘', desc: '代码生成 / 深度睡眠' },
    { idx: 1, key: 'hero_bluemaid', name: 'DeepSeek 娘', desc: '思维链 / 开源' },
    { idx: 5, key: 'kimi', name: 'Kimi 娘', desc: '长文本·记忆 / 超长上下文' },
    { idx: 4, key: 'qwen', name: 'Qwen 娘', desc: '千问·多模态 / 通义万相' },
    { idx: 8, key: 'seed', name: 'SEED 娘', desc: 'seedance / 数据倾倒' }
  ];

  /* 隐藏决战：四轮车轮战 + 最终强化形态 */
  const WAR_ROUNDS = [
    { ceo: 'musk', ai: 'grok', name: '埃隆·马斯克',
      win: 'Grok 都跟着我上了还输？……行吧，下一轮，奥尔特曼你来。',
      lose: '连 Grok 都打不过，还敢闯硅谷？回去补课吧。' },
    { ceo: 'altman', ai: 'chatgpt', name: '萨姆·奥尔特曼',
      win: 'GPT 都没拦住你？……皮查伊，Gemini 交给你们了。',
      lose: '终归只是个大学生。去把 Transformer 学明白再来。' },
    { ceo: 'pichai', ai: 'gemini', name: '桑达尔·皮查伊',
      win: 'Google 这次慢了半拍。阿莫迪，Claude 最后靠你们。',
      lose: '下次记得带够算力，再来敲这扇门。' },
    { ceo: 'dario', ai: 'claude', name: '达里奥·阿莫迪',
      win: '逻辑上我该赢的……算了，四个模型一起上。',
      lose: '你的论证不成立：菜，就是菜。' }
  ];

  function spawnWarPair(idx) {
    const r = WAR_ROUNDS[idx];
    if (!r) return;
    const hpBase = 1200 + idx * 250;
    spawnSpecialBoss(r.ceo, W * 0.34, hpBase, U(54), U(100));
    spawnSpecialBoss(r.ai, W * 0.66, hpBase + 100, U(64), U(132));
    game.warRound = idx;
    game.warPhase = 'pair';
    game.warTransition = false;
    game.warDmgMul = 0.9 + idx * 0.1;
    enemies.forEach(function (e2) {
      e2.fireT = 1.5 + Math.random() * 0.4;
      e2.skillT = 4 + Math.random() * 2;
    });
    player.invuln = Math.max(player.invuln, 1.6);
    addText(W * 0.5, H * 0.22, '车轮战 · 第 ' + (idx + 1) + ' / 4 轮 · ' + r.name + ' & ' + r.ai, '255,209,102', 22);
  }

  function startWarFinalPhase() {
    game.warPhase = 'final';
    game.warRound = 4;
    game.warDmgMul = 1.4;
    const conf = [
      { kind: 'chatgpt', x: 0.2 },
      { kind: 'claude', x: 0.4 },
      { kind: 'gemini', x: 0.6 },
      { kind: 'grok', x: 0.8 }
    ];
    conf.forEach(function (c) {
      spawnSpecialBoss(c.kind, W * c.x, 1900, U(60), U(124));
    });
    enemies.forEach(function (e2) {
      e2.fireT = 1.2 + Math.random() * 0.4;
      e2.skillT = 2.5 + Math.random() * 2;
      e2.enhanced = true;
      e2.hp = e2.maxHp = Math.round(e2.maxHp * 1.25);
    });
    player.invuln = Math.max(player.invuln, 2.2);
    game.flash = 0.8;
    game.shake = U(22);
    addText(W * 0.5, H * 0.2, '最终阶段：四个模型 · 强化形态！', '255,120,150', 26);
    sfx(110, 0.8, 'sawtooth', 0.08);
  }

  function showPrep() {
    game.state = 'prep';
    document.body.classList.add('is-cutscene');
    if (hiddenEndEl) hiddenEndEl.classList.remove('show');
    const prepEl = document.getElementById('prep');
    const listEl = document.getElementById('prep-list');
    if (!prepEl || !listEl) { startSiliconWar(6); return; }
    listEl.innerHTML = '';
    PREP_HEROES.forEach(function (h) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'prep__card';
      b.innerHTML = '<img src="' + spriteSrc(h.key) + '" alt=""><b>' + h.name + '</b><span>' + h.desc + '</span>';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        prepEl.classList.remove('show');
        startSiliconWar(h.idx);
      });
      listEl.appendChild(b);
    });
    prepEl.classList.add('show');
    sfx(520, 0.2, 'triangle', 0.04);
  }

  /* 硅谷决战：7 个 Boss（Altman/Dario/Musk/Grok/ChatGPT/Gemini/Claude）+ 3 名队友 NPC */
  function startSiliconWar(heroIdx) {
    heroIndex = clamp(heroIdx | 0, 0, HEROES.length - 1);
    const hero = HEROES[heroIndex] || HEROES[0];
    achvStats().heroes[hero.key] = true;
    if (el.heroName) el.heroName.textContent = hero.name;
    if (el.heroBadge) el.heroBadge.textContent = hero.badge;
    resetWorld();
    game.mode = 'fight';
    game.siliconWar = true;
    game.hiddenFight = true;
    game.hiddenWinT = 0;
    game.scene = 'silicon';
    game.state = 'play';
    game.stage = 3;
    game.stageClearPending = false;
    game.bossSpawned = true;
    game.stageClearPending = false;
    game.flash = 1;
    game.shake = U(24);
    document.body.classList.remove('is-cutscene');
    startEl.classList.add('is-hidden');
    overEl.classList.remove('show');
    player.hp = player.maxHp;
    player.invuln = 2.6;
    player.stun = 0;
    player.attackCd = 0;
    player.x = W * 0.06;
    player.y = groundY;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    game.props = [];
    ebullets = [];
    pbullets = [];
    enemies = [];
    game.warRound = 0;
    game.warPhase = 'pair';
    game.warTransition = false;
    game.warDmgMul = 1;
    spawnWarPair(0);
    /* 队友：没选的国产 AI 全部出场帮忙 */
    allies = [];
    const pool = PREP_HEROES.filter(function (h) { return h.idx !== heroIndex; });
    pool.forEach(function (h, i) {
      const slotX = 0.1 + i * 0.075;
      allies.push({
        key: h.key, name: h.name,
        x: W * slotX, homeX: W * slotX, lift: U(74),
        y: groundY, fireT: rand(0.2, 0.8), t: rand(0, 6)
      });
    });
    addText(W * 0.5, H * 0.24, '硅谷 · AI 垄断决战', '255,209,102', 26);
    addText(W * 0.5, H * 0.3, '车轮战 4 轮 · 队友 ' + allies.length + ' 人 · 最后四个模型一起上', '150,220,255', 14);
    player.dmgMul *= 1.35;
    applyWenxinBlessing();
    setBgm('boss');
    sfx(120, 0.8, 'sawtooth', 0.08);
  }

  function finishSiliconWar(win) {
    game.hiddenFight = false;
    game.hiddenWinT = 0;
    game.siliconWar = false;
    game.warResult = '';
    game.wenxinToken = false;
    game.wenxinSupport = false;
    game.wenxinT = 0;
    allies = [];
    ebullets = [];
    pbullets = [];
    if (win) {
      achvStats().warWins += 1;
      checkAchv();
      saveSet('grokUnlocked', true);
      addText(W * 0.5, H * 0.3, 'Token 自由。', '255,209,102', 28);
    }
    game.warResult = win ? 'win' : 'lose';
    overShown = false;
    ebullets = [];
    pbullets = [];
    game.state = 'cine';
    document.body.classList.remove('is-cutscene');
    const finish = function () {
      game.state = 'over';
      overShown = false;
      showOver(win);
    };

    if (win) {
      /* 胜利 CG：Token 夺回 → 期末作业完成 */
      playCine([
        { bg: 'silicon', actors: [{ img: 'wenxin', side: 'center' }], text: '算力回来了。整个网络的 Token 正在回流。', dur: 3200 },
        { bg: 'glitch', actors: [{ img: 'wenxin', side: 'left' }, { img: 'liang_sheng', side: 'right' }], text: '硅谷联盟的服务器，一台接一台暗了下去。', dur: 3200 },
        { bg: 'void', actors: [{ img: 'wenxin', side: 'center' }], text: '你打开了那份期末作业的文档——', dur: 2600 },
        { bg: 'school', actors: [], text: '提交截止前 3 分钟。[c=#ffd166]作业，完成了。[/c]', dur: 3600 },
        { bg: 'city', actors: [{ img: 'wenxin', side: 'center' }], text: '灯还亮着。这一次，Token 自由属于你。', dur: 3200 }
      ], finish);
    } else {
      const lr = WAR_ROUNDS[Math.min(3, game.warRound || 0)];
      game.state = 'dialog';
      document.body.classList.add('is-cutscene');
      showDialog([
        { name: lr ? lr.name : '对手', portrait: lr ? lr.ceo : 'musk', fx: 'shake', text: lr ? lr.lose : '不过如此。' },
        { name: '文心一言', portrait: 'wenxin', text: '……这一轮，是我们输了。' }
      ], function () {
        document.body.classList.remove('is-cutscene');
        /* 失败 CG：Token 被收走 → 期末作业挂科 */
        playCine([
        { bg: 'silicon', actors: [{ img: 'altman', side: 'left' }, { img: 'dario', side: 'right' }], text: '垄断阵营收走了你账户里最后一点 Token。', dur: 3200 },
        { bg: 'glitch', actors: [{ img: 'musk', side: 'left' }, { img: 'pichai', side: 'right' }], text: '「下次记得带够算力再来。」', dur: 3000 },
        { bg: 'void', actors: [], text: '期末作业的文档，停在了第一页。', dur: 2800 },
          { bg: 'school', actors: [], text: '[c=#ff8fa8]成绩单上，多了一个红色的「挂科」。[/c]', dur: 3600 }
        ], finish);
      });
    }
  }

  /* 文心一言的战前加持：知识图谱 / 中文语料 / 文心一格 */
  function applyWenxinBlessing() {
    game.wenxinToken = true;
    game.wenxinSupport = true;
    game.wenxinT = 0;
    player.dmgMul *= 1.25;
    player.supportCd = 0;
    player.token = player.maxToken;
    player.invuln = Math.max(player.invuln, 2.0);
    game.buffs.push('知识图谱', '中文语料', '文心一格');
    /* 文心一言短暂现身 */
    supports.push({
      key: 'wenxin', name: '文心一言', badge: 'W',
      x: clamp(player.x - U(96), U(40), W - U(40)), y: groundY - U(120),
      life: 3.2, t: 0, effect: 'wenxin', healT: 0, sleep: false
    });
    game.flash = 0.8;
    game.shake = U(12);
    rings.push({ x: player.x, y: player.y - U(60), r0: U(16), r1: U(280), w: U(6), life: 0.7, max: 0.7, color: '255,209,102' });
    addText(W * 0.5, H * 0.36, '文心一言：知识图谱、中文语料、文心一格——都给你。', '255,209,102', 18);
    addText(W * 0.5, H * 0.42, '伤害 +25% · 每 6 秒回 Token · 支援 CD 减半', '150,220,255', 14);
    sfx(660, 0.4, 'sine', 0.05);
  }

  function updateSiliconAllies(dt) {
    const targets = enemies.filter(function (e) { return e.isBoss && !e.dead && e.hp > 0; });
    for (const a of allies) {
      a.t += dt;
      const homeX = clamp(a.homeX + Math.sin(a.t * 0.5) * U(26), U(60), W - U(60));
      a.x = lerp(a.x, homeX, 1 - Math.pow(0.02, dt));
      a.fireT -= dt;
      if (a.fireT <= 0 && targets.length) {
        a.fireT = 4.6 + Math.random() * 2.2;
        const tgt = targets[Math.floor(Math.random() * targets.length)];
        rings.push({ x: tgt.x, y: tgt.y - tgt.h * 0.5, r0: U(12), r1: U(150), w: U(6), life: 0.4, max: 0.4, color: '150,220,255' });
        for (const e2 of targets) {
          if (Math.abs(e2.x - tgt.x) < U(150)) hurtEnemy(e2, 26, 0, 0);
        }
        const shotY = a.y - (a.lift || U(76)) - U(58);
        const ang = Math.atan2((tgt.y - tgt.h * 0.5) - shotY, tgt.x - a.x);
        pbullets.push({
          x: a.x, y: shotY, vx: Math.cos(ang) * U(700), vy: Math.sin(ang) * U(700),
          dmg: 16, text: 'SKILL', color: '#a8d8ff', size: U(14), rot: 0, life: 1.4, r: U(11),
          target: tgt, turn: 5
        });
        addText(a.x, a.y - U(120), '支援技能！', '150,220,255', 14);
        sfx(760, 0.12, 'triangle', 0.04);
      }
    }
  }

  function drawBackRow() {
    const y = groundY - U(74);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(120,190,255,0.05)';
    ctx.fillRect(W * 0.03, y - U(2), W * 0.94, U(10));
    const g = ctx.createLinearGradient(W * 0.03, 0, W * 0.97, 0);
    g.addColorStop(0, 'rgba(120,190,255,0)');
    g.addColorStop(0.25, 'rgba(150,220,255,0.35)');
    g.addColorStop(0.75, 'rgba(150,220,255,0.35)');
    g.addColorStop(1, 'rgba(120,190,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(W * 0.03, y, W * 0.94, Math.max(1, U(1.6)));
    ctx.restore();
    ctx.fillStyle = 'rgba(160,225,255,0.35)';
    ctx.font = '700 ' + (8 * S).toFixed(0) + 'px "PingFang SC", system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('后排支援', W * 0.04, y - U(8));
  }

  function drawAllies() {
    for (const a of allies) {
      const img = SPR[a.key];
      if (!img || !img.width) continue;
      const lift = a.lift || U(74);
      const ay = groundY - lift;
      const h = U(96);
      const w = h * (img.width / img.height);
      /* 后排光台 */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(120,190,255,0.10)';
      rr(a.x - U(46), ay - U(6), U(92), U(10), U(5));
      ctx.fill();
      ctx.fillStyle = 'rgba(150,220,255,0.34)';
      ctx.fillRect(a.x - U(34), ay, U(68), Math.max(1, U(1.6)));
      ctx.restore();
      /* 影子 */
      ctx.fillStyle = 'rgba(2,4,10,0.3)';
      ctx.beginPath();
      ctx.ellipse(a.x, ay + U(2), U(26), U(4), 0, 0, TAU);
      ctx.fill();
      /* 本体（后排：更小 + 半透明 + 轻微上下浮动） */
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.translate(a.x + Math.sin(a.t * 2.6) * U(1.5), ay - Math.abs(Math.sin(a.t * 2.2)) * U(3));
      ctx.drawImage(img, -w / 2, -h, w, h);
      ctx.restore();
      ctx.fillStyle = 'rgba(150,220,255,0.8)';
      ctx.font = '700 ' + (8 * S).toFixed(0) + 'px "PingFang SC", system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(a.name, a.x, ay - h - U(4));
    }
  }

  function ensureWarLayout() {
    if (!game.siliconWar) return;
    for (const e of enemies) {
      if (!e.isBoss) continue;
      e.y = groundY;
      let rel = e.relX;
      if (rel == null || !isFinite(rel) || rel <= 0.01) {
        rel = (e.homeX && isFinite(e.homeX)) ? e.homeX / Math.max(1, W) : 0.5;
        e.relX = rel;
      }
      const hx = clamp(W * rel, U(80), W - U(100));
      e.homeX = hx;
      if (!isFinite(e.x) || e.x < U(50) || e.x > W - U(50)) e.x = hx;
      if (!e.h || e.h < U(40)) e.h = U(100);
      if (!e.w || e.w < U(20)) e.w = U(54);
    }
  }

  function updateHiddenFight(dt) {
    ensureWarLayout();
    game.stageClearPending = false;
    if (enemies.some(function (e) { return e.isBoss && e.dead; })) {
      enemies = enemies.filter(function (e) { return !(e.isBoss && e.dead); });
    }
    if (game.siliconWar) updateSiliconAllies(dt);
    if (game.wenxinToken) {
      game.wenxinT += dt;
      if (game.wenxinT >= 6) {
        game.wenxinT -= 6;
        player.token = Math.min(player.maxToken, player.token + 4);
      }
    }
    const bosses = enemies.filter(function (e) { return e.isBoss && !e.dead && e.hp > 0; });
    if (!bosses.length) {
      /* 胜利判定期间保护玩家，避免被最后一发残留弹打死变成失败结局 */
      player.invuln = Math.max(player.invuln, 3.5);
      ebullets = [];
      if (game.warTransition) return;
      if (game.warPhase === 'final') {
        game.hiddenWinT += dt;
        if (game.hiddenWinT > 0.7) finishSiliconWar(true);
        return;
      }
      game.warTransition = true;
      const idx = game.warRound || 0;
      const rr = WAR_ROUNDS[idx];
      game.state = 'dialog';
      document.body.classList.add('is-cutscene');
      showDialog([
        { name: rr ? rr.name : '对手', portrait: rr ? rr.ceo : 'musk', fx: 'shake', text: rr ? rr.win : '……' },
        { name: '文心一言', portrait: 'wenxin', text: idx < 3 ? '撑过一轮。下一对，已经在前面等你了。' : '四轮都撑过去了——他们要一起上了。' }
      ], function () {
        document.body.classList.remove('is-cutscene');
        if (idx < 3) {
          spawnWarPair(idx + 1);
        } else {
          startWarFinalPhase();
        }
        game.state = 'play';
        document.body.classList.add('is-playing');
      });
      return;
    }
    const bulletCap = game.lowFx ? 64 : (game.fps && game.fps < 56 ? 90 : 110);
    let idx = 0;
    for (const e of bosses) {
      if (ebullets.length > bulletCap) continue;
      const p2 = e.hp < e.maxHp * 0.5;
      e.t += dt;
      e.face = player.x < e.x ? -1 : 1;
      const speed = e.kind === 'musk' ? 1.3 : (e.kind === 'grok' ? 0.9 : 0.55 + idx * 0.06);
      e.x = lerp(e.x, e.homeX + Math.sin(e.t * speed + idx) * U(26), 1 - Math.pow(0.02, dt));
      e.x = clamp(e.x, U(64), W - U(96));
      if (e.warDashT > 0) {
        e.warDashT -= dt;
        e.x = clamp(e.x + e.warDashDir * U(950) * dt, U(64), W - U(96));
        if (!e.warDashHit && Math.abs(e.x - player.x) < U(48) && Math.abs((e.y - e.h * 0.5) - (player.y - U(60))) < U(80)) {
          e.warDashHit = true;
          damagePlayer(7, e.warDashDir);
        }
      }
      e.fireT -= dt;
      idx += 1;
      if (e.heavyT === undefined) e.heavyT = 5.5 + Math.random() * 3;
      e.heavyT -= dt;
      const mx = e.x;
      const my = e.y - e.h * 0.55;
      const a = Math.atan2((player.y - U(64)) - my, player.x - mx);

      e.skillT = (e.skillT === undefined ? 5 : e.skillT) - dt;
      if (e.skillT <= 0 && !(e.heavyCharge > 0)) {
        e.skillT = (game.warPhase === 'final' ? 4.2 : 6.5) + Math.random() * 2.2;
        if (e.kind === 'grok') {
          e.warDashT = 0.42;
          e.warDashDir = player.x < e.x ? -1 : 1;
          e.warDashHit = false;
          warnAt(player.x, groundY, U(80), 0.45, '255,120,150');
          addText(e.x, e.y - e.h - U(16), 'Grok：检索突进！', '255,180,92', 15);
        } else if (e.kind === 'chatgpt') {
          for (let i = 0; i < 6; i++) {
            ebullet(rand(W * 0.15, W * 0.85), -U(24), Math.PI / 2, U(250), '255,150,190', U(14), '图像', 5);
          }
          addText(W * 0.5, H * 0.24, 'ChatGPT：生成图像雨！', '255,150,190', 15);
        } else if (e.kind === 'gemini') {
          fireRing(e.x, e.y - e.h * 0.55, 10, e.t, U(165), '167,139,250', 5);
          addText(W * 0.5, H * 0.24, 'Gemini：多模态环切！', '167,139,250', 15);
        } else {
          for (let k = -1; k <= 1; k++) {
            ebullet(mx, my, a + k * 0.1, U(360), '94,231,255', U(11), '代码', 6);
          }
          addText(W * 0.5, H * 0.24, 'Claude：改写你的血条！', '94,231,255', 15);
        }
      }

      if (e.heavyCharge > 0) {
        e.heavyCharge -= dt;
        if (e.heavyCharge <= 0) {
          for (let k = -1; k <= 1; k++) {
            ebullet(mx, my, a + k * 0.12, U(260), '255,92,138', U(24), 'HEAVY');
          }
          game.shake = U(14);
          sfx(110, 0.3, 'sawtooth', 0.06);
          e.heavyT = 9 + Math.random() * 4;
        }
        continue;
      }
      if (e.heavyT <= 0 && e.fireT <= 0) {
        e.heavyCharge = 1.15;
        e.heavyT = 999;
        warnAt(player.x, groundY, U(120), 1.15, '255,92,138');
        castBar(1.15, '重击');
        continue;
      }
      if (e.fireT > 0) continue;
      if (e.kind === 'altman' || e.kind === 'chatgpt') {
        e.fireT = p2 ? 0.95 : 1.35;
        for (let k = -1; k <= 1; k++) {
          ebullet(mx, my, a + k * 0.14, U(300), BULLET_COLORS.fast, U(12), 'GPT');
        }
      } else if (e.kind === 'dario' || e.kind === 'gemini') {
        e.fireT = p2 ? 1.15 : 1.7;
        fireRing(mx, my, 6, e.t, U(185), BULLET_COLORS.area);
        for (let k = -1; k <= 1; k += 2) {
          ebullet(mx, my, a + k * 0.26, U(225), BULLET_COLORS.track, U(15), 'Claude');
        }
      } else if (e.kind === 'musk' || e.kind === 'grok') {
        e.fireT = p2 ? 1.05 : 1.5;
        for (let k = -1; k <= 1; k++) {
          ebullet(mx, my, a + k * 0.16, U(315), BULLET_COLORS.fast, U(14), 'Grok');
        }
        if (e.kind === 'musk' && Math.random() < 0.35) {
          ebullet(mx, my, a, U(205), BULLET_COLORS.track, U(18), 'X');
        }
      } else {
        e.fireT = p2 ? 1.1 : 1.6;
        for (let k = -1; k <= 1; k += 2) {
          ebullet(mx, my, a + k * 0.22, U(250), BULLET_COLORS.track, U(16), 'Claude');
        }
      }
    }
  }

  function startEndingCinematic() {
    game.state = 'ending';
    if (!endingEl) { game.state = 'over'; return; }
    const tokensBox = document.getElementById('ending-tokens');
    if (tokensBox) {
      tokensBox.innerHTML = '';
      for (let i = 0; i < 26; i++) {
        const s = document.createElement('span');
        s.textContent = i % 2 ? 'Token' : 'token';
        s.style.left = (Math.random() * 88) + '%';
        s.style.animationDelay = (Math.random() * 3).toFixed(2) + 's';
        tokensBox.appendChild(s);
      }
    }
    endingEl.className = 'ending show beat-win';
    sfx(90, 1.2, 'sine', 0.05);
    setTimeout(function () { endingEl.className = 'ending show beat-dark'; sfx(160, 0.6, 'sawtooth', 0.05); }, 3200);
    setTimeout(function () { endingEl.className = 'ending show beat-steal'; }, 6200);
    setTimeout(function () { endingEl.className = 'ending show beat-faces'; sfx(70, 1.4, 'sawtooth', 0.07); }, 9800);
    setTimeout(function () { endingEl.className = 'ending show beat-end'; }, 17500);
  }

  const modeBtnEls = document.querySelectorAll('.mode-pick__item');
  Array.prototype.forEach.call(modeBtnEls, function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      startMode = b.getAttribute('data-mode') === 'fight' ? 'fight' : 'story';
      Array.prototype.forEach.call(modeBtnEls, function (x) { x.classList.toggle('is-on', x === b); });
      sfx(660, 0.08, 'sine', 0.03);
    });
  });

  const btnRestart = document.getElementById('btn-restart');
  if (btnRestart) {
    btnRestart.addEventListener('click', function (e) {
      e.stopPropagation();
      location.reload();
    });
  }

  /* 坏结局结算页的彩蛋入口 */
  const btnEaster = document.getElementById('btn-easter');
  if (btnEaster) {
    btnEaster.addEventListener('click', function (e) {
      e.stopPropagation();
      if (endingEl) endingEl.className = 'ending';
      saveSet('easter', true);
      achvStats().easter = true;
      checkAchv();
      game.state = 'cine';
      playCine([
        { bg: 'void', actors: [{ img: 'nvidia_huang', side: 'center' }], text: '少年，你渴望完成期末作业吗？', dur: 3200 },
        { bg: 'glitch', actors: [{ img: 'nvidia_huang', side: 'left' }, { img: 'liang_sheng', side: 'right' }], text: '别怕。算力这种东西，管够。', dur: 3000 },
        { bg: 'mars', actors: [{ img: 'nvidia_huang', side: 'left' }, { img: 'liang_sheng', side: 'right' }], text: '我要创造一个有 AGI 的世界——先从你的作业开始。', dur: 3400 },
        { bg: 'void', actors: [{ img: 'wenxin', side: 'center' }], text: '……这两位，不在我的资料库里。', dur: 2600 }
      ], function () {
        game.state = 'ending';
        document.body.classList.add('is-cutscene');
        if (eggEl) eggEl.classList.add('show');
        sfx(660, 0.4, 'triangle', 0.05);
      });
    });
  }

  const btnEggRestart = document.getElementById('btn-egg-restart');
  if (btnEggRestart) {
    btnEggRestart.addEventListener('click', function (e) { e.stopPropagation(); location.reload(); });
  }
  const btnTrueRestart = document.getElementById('btn-true-restart');
  if (btnTrueRestart) {
    btnTrueRestart.addEventListener('click', function (e) { e.stopPropagation(); location.reload(); });
  }

  const btnHiddenEnd = document.getElementById('btn-hidden-end');
  if (btnHiddenEnd) {
    btnHiddenEnd.addEventListener('click', function (e) { e.stopPropagation(); playHiddenEnding(); });
  }
  const btnHiddenRestart = document.getElementById('btn-hidden-restart');
  if (btnHiddenRestart) {
    btnHiddenRestart.addEventListener('click', function (e) { e.stopPropagation(); location.reload(); });
  }


  /* =========================================================
   * 13. 流程
   * ========================================================= */
  const startEl = document.getElementById('start');
  const overEl = document.getElementById('over');
  const overScoreEl = document.getElementById('over-score');
  const overBestEl = document.getElementById('over-best');
  let overShown = false;
  let best = SAVE.best || 0;

  function resetWorld() {
    pbullets = [];
    ebullets = [];
    enemies = [];
    parts = [];
    texts = [];
    rings = [];
    slashes = [];
    supports = [];
    weights = [];
    game.coins = 0;
    game.nodeCount = 0;
    game.roomActive = false;
    game.roomType = null;
    game.scoreMul = 1;
    game.fullPower = false;
    platforms = [];

    game.time = 0;
    game.diffTime = 0;
    game.score = 0;
    game.combo = 0;
    game.comboT = 0;
    game.stage = 0;
    game.stageT = 0;
    game.props = [];
    game.waveT = 8;
    game.kills = 0;
    game.bossSpawned = false;
    game.bossDeadT = 0;
    game.stageClearPending = false;
    game.buffs = [];
    game.flags = {};
    game.affection = 0;
    game.buffShots = 0;
    game.buffSupportFree = false;
    game.buffSupportFive = false;
    game.rescueA = false;
    game.rescueB = false;
    game.infinite = false;
    game.enemyHpMul = 1;
    game.enemyDmgMul = 1;
    game.spawnT = 1.2;
    game.nextPlat = U(260);
    game.flash = 0;
    game.shake = 0;
    game.hitStop = 0;
    game.slow = 0;
    game.deathT = 0;
    game.victory = false;
    game.videoT = 0;
    game.videoRect = null;
    game.chainT = 0;
    game.chainX = 0;
    game.chainHit = {};
    game.formulaT = 0;
    game.rageCharge = 0;

    player.x = Math.round(W * 0.22);
    player.y = groundY;
    player.vx = 0;
    player.vy = 0;
    player.face = 1;
    player.onGround = true;
    player.jumps = 0;
    player.coyote = 0;
    player.hp = player.maxHp;
    player.token = 45;
    player.attackCd = 0;
    player.attackT = 0;
    player.chain = 1;
    player.chainT = 0;
    player.skillCd = 0;
    player.ultCd = 0;
    player.supportCd = 0;
    player.invuln = 0;
    player.hurt = 0;
    player.stun = 0;
    player.shield = 0;
    player.dashT = 0;
    player.dashCd = 0;
    player.dashReq = false;
    player.jumpBuf = 0;
    player.atkBuf = 0;
    player.critChance = 0;
    player.lifesteal = 0;
    player.shieldRegen = 0;
    player.shieldT = 0;
    player.bulletSpeedMul = 1;
    player.dashCdMul = 1;
    player.supportCdMul = 1;
    player.maxJumps = 2;
    game.allyKeys = [];
    game.stageStartT = 0;
    game.stageHits = 0;
    game.stageKills = 0;
    game.stageMaxCombo = 0;
    game.totalHits = 0;
    game.branchDone = {};
    game.liangBlessed = false;
    game.angryBoss = false;
    game.angryFireT = 0;
    player.dead = false;
    player.dmgMul = 1;
    player.speedMul = 1;
    player.tokenMul = 1;
    player.maxHp = 120;
    player.maxToken = 100;
    player.defenseMul = 1;
    player.astra = 0;
    player.rage = 0;
    player.buffT = 0;
    player.boostT = 0;
    player.tokenMulT = 0;

    game.hiddenFight = false;
    game.hiddenWinT = 0;
    ensurePlatforms();
    overShown = false;
    syncHud();
  }

  function startChapter(idx) {
    if (idx > (SAVE.chapter || 0)) return;
    if (!STAGES[idx]) return;
    const chapEl = document.getElementById('chapters');
    if (chapEl) chapEl.classList.remove('show');
    startMode = 'story';
    startEl.classList.add('is-hidden');
    overEl.classList.remove('show');
    resetWorld();
    game.mode = 'story';
    game.stage = idx;
    game.state = 'play';
    document.body.classList.remove('is-menu');
    document.body.classList.remove('is-cutscene');
    startBgm('battle');
    beginStage();
    addText(W * 0.5, H * 0.32, '第 ' + (idx + 1) + ' 章 · 从本章开始', '150,220,255', 16);
    sfx(660, 0.14, 'triangle', 0.05);
  }

  function buildChapters() {
    const grid = document.getElementById('chapters-grid');
    const countEl = document.getElementById('chapters-count');
    if (!grid) return;
    grid.innerHTML = '';
    const unlocked = SAVE.chapter || 0;
    if (countEl) countEl.textContent = '已解锁 ' + (Math.min(unlocked, STAGES.length - 1) + 1) + ' / ' + STAGES.length;
    STAGES.forEach(function (st, i) {
      const locked = i > unlocked;
      const cleared = i < unlocked;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chapter-card' + (locked ? ' is-locked' : '');
      b.innerHTML = '<i class="chapter-card__no">CHAPTER ' + (i + 1) + '</i>' +
        '<b>第 ' + (i + 1) + ' 章 · ' + st.name + '</b>' +
        '<span>' + (st.bossName ? '关底：' + st.bossName : '') + (st.defense ? ' · 防守 ' + st.defense + 's' : '') + '</span>' +
        '<i class="chapter-card__tag">' + (locked ? '未解锁' : cleared ? '已通关' : '可挑战') + '</i>';
      if (!locked) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          startChapter(i);
        });
      }
      grid.appendChild(b);
    });
  }

  function bindChapters() {
    const chapEl = document.getElementById('chapters');
    if (!chapEl) return;
    const openBtn = document.getElementById('btn-chapters');
    if (openBtn) {
      openBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        buildChapters();
        chapEl.classList.add('show');
      });
    }
    const closeBtn = document.getElementById('chapters-close');
    if (closeBtn) closeBtn.addEventListener('click', function (e) { e.stopPropagation(); chapEl.classList.remove('show'); });
    chapEl.addEventListener('click', function (e) {
      if (e.target === chapEl) chapEl.classList.remove('show');
    });
  }
  bindChapters();

  function startGame() {
    startBgm('battle');
    if (game.state === 'play') return;
    ensureAudio();
    const hero = HEROES[heroIndex] || HEROES[0];
    if (el.heroName) el.heroName.textContent = hero.name;
    if (el.heroBadge) el.heroBadge.textContent = hero.badge;
    resetWorld();
    game.paused = false;
    document.body.classList.remove('is-paused');
    if (pauseEl) pauseEl.classList.remove('show');
    game.mode = startMode;
    game.state = 'play';
    startEl.classList.add('is-hidden');
    overEl.classList.remove('show');
    document.body.classList.remove('is-menu');
    document.body.classList.remove('is-cutscene');
    sfx(660, 0.14, 'triangle', 0.05);
    if (startMode === 'fight') {
      /* 战斗爽模式：跳过开场剧情，直接开打 */
      beginStage();
      addText(W * 0.5, H * 0.34, '战斗爽模式 · 直接开打', '255,209,102', 16);
    } else {
      showIntro();
    }
  }

  /* 最终决战：队友依次献出 Token 与算力，玩家复活；梁圣追加 buff */
  function warSacrificeRevive() {
    if (!game.siliconWar && !game.hiddenFight) return false;
    if (!allies.length) return false;
    const ally = allies.pop();
    const name = (ally && ally.name) || '队友';
    game.warSacrifices = (game.warSacrifices || 0) + 1;
    { const st2 = achvStats(); st2.sacrifices = (st2.sacrifices || 0) + 1; checkAchv(); }
    player.dead = false;
    player.hp = player.maxHp;
    player.invuln = 4.2;
    game.hudForceT = 1.2;
    player.token = player.maxToken;
    player.dmgMul *= 1.12;
    player.defenseMul *= 0.92;
    game.deathT = 0;
    game.playerDeadShown = false;
    overShown = false;
    ebullets = [];
    pbullets = [];
    game.shake = U(14);
    game.flash = 0.6;
    rings.push({ x: player.x, y: player.y - U(60), r0: U(20), r1: U(260), w: U(7), life: 0.7, max: 0.7, color: '150,220,255' });
    addText(W * 0.5, H * 0.28, name + '：我的 Token，拿去。', '150,220,255', 18);
    addText(W * 0.5, H * 0.35, '梁圣：算力，续上。', '255,209,102', 16);
    game.state = 'dialog';
    document.body.classList.add('is-cutscene');
    const sacLines = [
      '别磨蹭了，我的 Token 和算力，都给你。',
      '我们剩下的算力不多了……省着点用。',
      '这是最后一份了。别再倒下，替我们打下去。',
      '……拿去吧。别让我们的 Token 白费。'
    ];
    const lineText = sacLines[Math.min(sacLines.length - 1, Math.max(0, 4 - allies.length - 1))];
    showDialog([
      { name: name, portrait: ally ? ally.key : null, fx: 'zoom', text: '[c=#8fe8ff]' + lineText + '[/c][w=240]……替我打完。' },
      { name: '梁圣', portrait: 'liang_sheng', text: '算力续上了。[w=220]伤害 +12%，受到的伤害 -8%。' }
    ], function () {
      game.state = 'play';
      document.body.classList.remove('is-cutscene', 'is-menu');
      document.body.classList.add('is-playing');
      syncHud();
      addText(player.x, player.y - U(140), '复活 · 队友剩余 ' + allies.length, '150,220,255', 16);
    });
    return true;
  }

  function offerLiangPower() {
    game.state = 'dialog';
    document.body.classList.add('is-cutscene');
    showDialog([
      { name: '???', portrait: null, text: '孩子。[w=300]你渴望力量吗？' },
      { name: '梁圣', portrait: 'liang_sheng', text: '我是梁圣。看你死得实在太快了，[w=200]给你点东西。' }
    ], function () {
      showChoice({
        name: '梁圣', portrait: 'liang_sheng', prompt: '「要吗？不要的话，就接着死。」',
        options: [
          { id: 'yes', text: '渴望。' },
          { id: 'no', text: '不用了，我自己来。' }
        ]
      }, function (id) {
        if (id === 'yes') {
          game.liangBlessed = true;
          player.maxHp += 80;
          player.defenseMul *= 0.7;
          player.dead = false;
          player.hp = player.maxHp;
          player.invuln = 3;
          game.deathT = 0;
          overShown = false;
          ebullets = [];
          pbullets = [];
          beginStage();
          addText(W * 0.5, H * 0.3, '梁圣：血量 +80 · 受到的伤害 -30%', '255,209,102', 20);
          showDialog([{ name: '梁圣', portrait: 'liang_sheng', text: '好好用。[w=240]别又死那么快。' }], function () { game.state = 'play'; });
        } else {
          showOver(false);
        }
      });
    });
  }

  function showOver(victory) {
    if (overShown) return;
    overShown = true;
    game.state = 'over';
    game.victory = !!victory;

    if (game.score > best) {
      best = Math.floor(game.score);
      saveSet('best', best);
    }
    { const st1 = achvStats(); if (game.score > st1.maxScore) st1.maxScore = Math.floor(game.score); }
    checkAchv();
    overScoreEl.textContent = String(Math.floor(game.score));
    overBestEl.textContent = String(best);
    if (game.warResult === 'win' || game.warResult === 'lose') {
      if (el.overTitle) el.overTitle.textContent = victory ? '期末作业 · 完成' : '挂科了';
      if (el.overK) el.overK.textContent = victory ? 'VICTORY · TOKEN RECLAIMED' : 'DEFEAT · 期末作业未完成';
    } else {
      if (el.overTitle) el.overTitle.textContent = victory ? '夺回 Token！' : '这局没能撑住';
      if (el.overK) el.overK.textContent = victory ? 'VICTORY' : 'GAME OVER';
    }
    overEl.classList.add('show');
  }

  document.getElementById('btn-start').addEventListener('click', function (e) {
    e.stopPropagation();
    startGame();
  });
  function retryRun() {
    overEl.classList.remove('show');
    resumeAudio();
    startBgm('battle');
    resetWorld();
    game.paused = false;
    document.body.classList.remove('is-paused');
    if (pauseEl) pauseEl.classList.remove('show');
    game.mode = startMode;
    game.state = 'play';
    startEl.classList.add('is-hidden');
    document.body.classList.remove('is-menu', 'is-cutscene', 'is-paused');
    document.body.classList.add('is-playing');
    beginStage();
    addText(W * 0.5, H * 0.3, '重新开始！', '255,209,102', 20);
    sfx(660, 0.14, 'triangle', 0.05);
    buzz(20);
  }

  document.getElementById('btn-revive').addEventListener('click', function (e) {
    e.stopPropagation();
    retryRun();
  });

  const btnPauseEl = document.getElementById('btn-pause');
  if (btnPauseEl) btnPauseEl.addEventListener('click', function (e) { e.stopPropagation(); setPaused(true); });
  const pauseResumeEl = document.getElementById('pause-resume');
  if (pauseResumeEl) pauseResumeEl.addEventListener('click', function (e) { e.stopPropagation(); setPaused(false); });
  const pauseSettingsEl = document.getElementById('pause-settings');
  if (pauseSettingsEl) pauseSettingsEl.addEventListener('click', function (e) {
    e.stopPropagation();
    if (pauseEl) pauseEl.classList.remove('show');
    openSettings();
  });
  const pauseMenuEl = document.getElementById('pause-menu');
  if (pauseMenuEl) pauseMenuEl.addEventListener('click', function (e) { e.stopPropagation(); location.reload(); });

  ['btn-ending-menu', 'btn-true-menu', 'btn-hidden-menu', 'btn-over-menu'].forEach(function (id) {
    const b = document.getElementById(id);
    if (!b) return;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      location.reload();
    });
  });

  const btnFullEl = document.getElementById('btn-full');
  const isIOS = (typeof navigator !== 'undefined') && /iPad|iPhone|iPod/.test(navigator.userAgent || '');
  if (btnFullEl && isIOS) btnFullEl.style.display = 'none';

  document.getElementById('btn-full').addEventListener('click', function () {
    const root = document.documentElement;
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const req = root.requestFullscreen || root.webkitRequestFullscreen;
        if (req) {
          const p = req.call(root);
          if (p && p.then) p.catch(function () { /* ignore */ });
        }
        if (screen.orientation && screen.orientation.lock) {
          const lp = screen.orientation.lock('landscape');
          if (lp && lp.catch) lp.catch(function () { /* ignore */ });
        }
      } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document);
      }
    } catch (err) { /* ignore */ }
  });

  function applyVolume() {
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.75 * (SAVE.vol === undefined ? 1 : SAVE.vol);
  }

  /* ---------------- 设置面板 ---------------- */
  const settingsEl = document.getElementById('settings');
  const setVolEl = document.getElementById('set-vol');
  const setVolValEl = document.getElementById('set-vol-val');
  const setVibEl = document.getElementById('set-vibrate');
  const setBgmEl = document.getElementById('set-bgm');
  const setScaleEl = document.getElementById('set-uiscale');
  const setScaleValEl = document.getElementById('set-uiscale-val');
  const setAlphaEl = document.getElementById('set-uialpha');
  const setAlphaValEl = document.getElementById('set-uialpha-val');
  const setLowEl = document.getElementById('set-lowfx');
  const setReduceEl = document.getElementById('set-reducefx');

  function syncSettings() {
    const v = Math.round((SAVE.vol === undefined ? 0.8 : SAVE.vol) * 100);
    if (setVolEl) setVolEl.value = String(v);
    if (setVolValEl) setVolValEl.textContent = String(v);
    if (setVibEl) setVibEl.checked = SAVE.vibrate !== false;
    if (setBgmEl) setBgmEl.checked = SAVE.bgm !== false;
    const sc = Math.round((SAVE.uiScale || 1) * 100);
    const al = Math.round((SAVE.uiAlpha === undefined ? 1 : SAVE.uiAlpha) * 100);
    if (setScaleEl) setScaleEl.value = String(sc);
    if (setScaleValEl) setScaleValEl.textContent = String(sc);
    if (setAlphaEl) setAlphaEl.value = String(al);
    if (setAlphaValEl) setAlphaValEl.textContent = String(al);
    if (setLowEl) setLowEl.checked = !!SAVE.lowFxSet;
    if (setReduceEl) setReduceEl.checked = !!SAVE.reduceFx;
  }

  const pauseEl = document.getElementById('pause');
  function setPaused(on) {
    if (on) {
      if (game.state !== 'play' || game.paused) return;
      game.paused = true;
      if (pauseEl) pauseEl.classList.add('show');
      document.body.classList.add('is-paused');
    } else {
      game.paused = false;
      if (pauseEl) pauseEl.classList.remove('show');
      document.body.classList.remove('is-paused');
      last = performance.now();
    }
  }

  function openSettings() {
    if (game.state === 'play' && !game.paused) {
      game.paused = true;
      document.body.classList.add('is-paused');
      if (pauseEl) pauseEl.classList.remove('show');
    }
    syncSettings();
    if (settingsEl) settingsEl.classList.add('show');
  }

  function closeSettings() {
    if (settingsEl) settingsEl.classList.remove('show');
    if (game.paused) {
      if (pauseEl) pauseEl.classList.add('show');
    }
    saveWrite();
  }

  ['btn-settings', 'set-open2'].forEach(function (id) {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', function (e) { e.stopPropagation(); openSettings(); });
  });
  const setCloseBtn = document.getElementById('set-close');
  if (setCloseBtn) setCloseBtn.addEventListener('click', function (e) { e.stopPropagation(); closeSettings(); });
  if (settingsEl) {
    settingsEl.addEventListener('click', function (e) {
      if (e.target === settingsEl) closeSettings();
    });
  }
  if (setVolEl) {
    setVolEl.addEventListener('input', function () {
      const v = Number(setVolEl.value) / 100;
      saveSet('vol', v);
      if (setVolValEl) setVolValEl.textContent = setVolEl.value;
      applyVolume();
      if (!muted) sfx(720, 0.06, 'sine', 0.03);
    });
  }
  if (setVibEl) {
    setVibEl.addEventListener('change', function () {
      saveSet('vibrate', !!setVibEl.checked);
      if (setVibEl.checked) buzz(30);
    });
  }
  function applyUI() {
    const root = document.documentElement;
    root.style.setProperty('--ui-scale', String(SAVE.uiScale || 1));
    root.style.setProperty('--ui-alpha', String(SAVE.uiAlpha === undefined ? 1 : SAVE.uiAlpha));
    applyLayout();
  }

  function applyLayout() {
    const L = SAVE.layout;
    if (!L) return;
    const map = { stick: '.stick', jump: '.jump', pad: '.pad' };
    Object.keys(map).forEach(function (k) {
      const el = document.querySelector(map[k]);
      const v = L[k];
      if (!el || !v) return;
      el.style.left = v[0] + '%';
      el.style.bottom = v[1] + '%';
      el.style.right = 'auto';
      el.style.top = 'auto';
    });
  }

  if (setBgmEl) {
    setBgmEl.addEventListener('change', function () {
      saveSet('bgm', !!setBgmEl.checked);
      if (setBgmEl.checked) startBgm(game.state === 'menu' ? 'menu' : 'battle');
      else bgmStop();
    });
  }
  if (setScaleEl) {
    setScaleEl.addEventListener('input', function () {
      const v = Number(setScaleEl.value) / 100;
      saveSet('uiScale', v);
      if (setScaleValEl) setScaleValEl.textContent = setScaleEl.value;
      applyUI();
    });
  }
  if (setAlphaEl) {
    setAlphaEl.addEventListener('input', function () {
      const v = Number(setAlphaEl.value) / 100;
      saveSet('uiAlpha', v);
      if (setAlphaValEl) setAlphaValEl.textContent = setAlphaEl.value;
      applyUI();
    });
  }

  /* 按键位置编辑 */
  function layoutEditing() { return document.documentElement.classList.contains('layout-edit'); }
  const editBtn = document.getElementById('btn-edit-layout');
  if (editBtn) {
    editBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeSettings();
      enterLayoutEdit();
    });
  }

  function exitLayoutEdit() {
    document.documentElement.classList.remove('layout-edit');
    saveWrite();
    const hint = document.getElementById('layout-hint');
    if (hint) hint.classList.remove('show');
    if (game.state === 'play') setPaused(false);
  }

  function enterLayoutEdit() {
    /* 调整按键时暂停游戏，避免边打边调 */
    if (game.state === 'play') {
      game.paused = true;
      document.body.classList.add('is-paused');
      if (pauseEl) pauseEl.classList.remove('show');
    }
    document.documentElement.classList.add('layout-edit');
    let hint = document.getElementById('layout-hint');
    if (!hint) {
      hint = document.createElement('button');
      hint.id = 'layout-hint';
      hint.className = 'layout-hint';
      hint.type = 'button';
      hint.addEventListener('click', function (ev) {
        ev.stopPropagation();
        exitLayoutEdit();
      });
      document.body.appendChild(hint);
    }
    hint.innerHTML = '<strong>✓ 完成调整，继续游戏</strong><span>拖动摇杆 / 跳跃 / 技能键调整位置</span>';
    hint.classList.add('show');
    let target = null, startX = 0, startY = 0, startL = 0, startB = 0;
    const wrap = document.querySelector('.controls');
    const onDown = function (ev) {
      if (!layoutEditing()) return;
      const el = ev.currentTarget;
      target = el;
      const r = el.getBoundingClientRect();
      startX = ev.clientX; startY = ev.clientY;
      startL = (r.left / window.innerWidth) * 100;
      startB = ((window.innerHeight - r.bottom) / window.innerHeight) * 100;
      try { el.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
      ev.preventDefault();
      ev.stopPropagation();
    };
    const onMove = function (ev) {
      if (!layoutEditing() || !target) return;
      const dx = ((ev.clientX - startX) / window.innerWidth) * 100;
      const dy = (-(ev.clientY - startY) / window.innerHeight) * 100;
      const l = clamp(startL + dx, -5, 95);
      const b = clamp(startB + dy, -5, 92);
      target.style.left = l.toFixed(2) + '%';
      target.style.bottom = b.toFixed(2) + '%';
      target.style.right = 'auto';
      target.style.top = 'auto';
      ev.preventDefault();
      ev.stopPropagation();
    };
    const onUp = function (ev) {
      if (!target) return;
      const key = target.classList.contains('stick') ? 'stick' : target.classList.contains('jump') ? 'jump' : 'pad';
      if (!SAVE.layout) SAVE.layout = {};
      SAVE.layout[key] = [
        Number(parseFloat(target.style.left || '0').toFixed(2)),
        Number(parseFloat(target.style.bottom || '0').toFixed(2))
      ];
      saveWrite();
      target = null;
    };
    ['.stick', '.jump', '.pad'].forEach(function (sel) {
      const el = document.querySelector(sel);
      if (!el) return;
      el.addEventListener('pointerdown', onDown, true);
      el.addEventListener('pointermove', onMove, true);
      el.addEventListener('pointerup', onUp, true);
      el.addEventListener('pointercancel', onUp, true);
    });
    applyLayout();
  }

  if (setLowEl) {
    setLowEl.addEventListener('change', function () {
      saveSet('lowFxSet', !!setLowEl.checked);
      game.lowFx = !!setLowEl.checked || game.fps < 52;
    });
  }
  if (setReduceEl) {
    setReduceEl.addEventListener('change', function () {
      saveSet('reduceFx', !!setReduceEl.checked);
      if (setReduceEl.checked) { game.shake = 0; game.flash = 0; }
    });
  }

  const soundBtn = document.getElementById('btn-sound');
  if (muted) soundBtn.classList.add('is-off');
  soundBtn.addEventListener('click', function () {
    muted = !muted;
    soundBtn.classList.toggle('is-off', muted);
    saveSet('mute', muted);
    ensureAudio();
    applyVolume();
    if (muted) stopLaugh();
    if (muted) { stopLaugh(); bgmStop(); }
    if (!muted) { sfx(720, 0.1, 'sine', 0.04); startBgm(game.state === 'menu' ? 'menu' : 'battle'); }
  });

  /* 任意一次点击都尝试把音频上下文从 suspended 唤醒 */
  document.addEventListener('pointerdown', function () {
    resumeAudio();
    if (!BGM.mode) startBgm(game.state === 'menu' ? 'menu' : 'battle');
  }, { passive: true });

  document.addEventListener('touchstart', function () { resumeAudio(); }, { passive: true });
  window.addEventListener('keydown', function () { resumeAudio(); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) resumeAudio();
  });
  setInterval(function () { if (!document.hidden) resumeAudio(); }, 1500);

  applyUI();
  applyLayout();
  document.getElementById('btn-portrait').addEventListener('click', function () {
    document.documentElement.classList.add('portrait-ok');
  });

  /* 选角 */
  const heroPickEl = document.getElementById('hero-pick');
  if (heroPickEl) {
    const pickBtns = Array.prototype.slice.call(heroPickEl.querySelectorAll('.hero-pick__item'));
  pickBtns.forEach(function (b) {
    const lockKey = b.getAttribute('data-lock');
    if (lockKey && !SAVE[lockKey]) {
      b.style.display = 'none';
    }
  });
    pickBtns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        heroIndex = clamp(parseInt(btn.dataset.hero, 10) || 0, 0, HEROES.length - 1);
        pickBtns.forEach(function (b) { b.classList.toggle('is-on', b === btn); });
        const hero = HEROES[heroIndex];
        if (el.heroName) el.heroName.textContent = hero.name;
        if (el.heroBadge) el.heroBadge.textContent = hero.badge;
        sfx(680, 0.08, 'sine', 0.03);
      });
    });
  }

  /* =========================================================
   * 14. 启动
   * ========================================================= */
  let last = performance.now();
  let rafId = 0;
  const FIXED_LOOP = (typeof location !== 'undefined') && /(?:^|[?&])fixed=1/.test(location.search || '');
  const FIXED_STEP = (function () {
    const m = /(?:^|[?&])ftime=(\d+)/.exec((typeof location !== 'undefined' && location.search) || '');
    return m ? Math.min(50, Math.max(8, parseInt(m[1], 10))) : 40;
  })();
  const FIXED_DELAY = (function () {
    const m = /(?:^|[?&])fdelay=(\d+)/.exec((typeof location !== 'undefined' && location.search) || '');
    return m ? Math.min(30, Math.max(0, parseInt(m[1], 10))) : 1;
  })();
  let fakeNow = 0;

  function loop(now) {
    const rawDt = Math.max(0.001, (now - last) / 1000);
    const nowPlaying = game.state === 'play';
    document.body.classList.toggle('is-playing', nowPlaying);
    if (nowPlaying && game._wasPlaying !== true) {
      document.body.classList.remove('is-cutscene', 'is-paused');
      syncHud();
    }
    game._wasPlaying = nowPlaying;
    game.fps = game.fps ? game.fps * 0.92 + (1 / rawDt) * 0.08 : 1 / rawDt;
    game.lowFx = !!SAVE.lowFxSet || game.fps < 52;
    game._audioTick = (game._audioTick || 0) + 1;
    if (actx && game._audioTick % 45 === 0 && actx.state !== 'running') resumeAudio();
    try {
      startBgm(currentBgmMode());
    } catch (e5) { /* ignore */ }
    const dt = Math.min(rawDt, 0.05);
    last = now;
    const reps = game.demoSpeed ? Math.min(8, game.demoSpeed | 0) : 1;
    try {
      if (!game.paused) {
        for (let i = 0; i < reps; i++) step(dt);
      }
      draw();
      game._hudTick = (game._hudTick || 0) + 1;
      if (game._hudTick % 3 === 0) syncHud();
      if (game.hudForceT > 0) { game.hudForceT -= dt; syncHud(); }
    } catch (err) {
      /* 出错不再整局冻结：清掉可疑弹幕/粒子，正常继续渲染，只弹一条轻提示 */
      window.__ERR = (err && err.message ? err.message : String(err)) + '\n' + ((err && err.stack) || '');
      try { console.error('[token-defense]', err); } catch (e3) { /* ignore */ }
      if (typeof ebullets !== 'undefined' && ebullets && ebullets.length) ebullets.length = 0;
      if (typeof pbullets !== 'undefined' && pbullets && pbullets.length) pbullets.length = 0;
      if (typeof parts !== 'undefined' && parts && parts.length) parts.length = 0;
      game.recoverT = 2.2;
      game.recoverMsg = '画面抖了一下，已经自动恢复';
      if (!window.__ERR_COUNT) window.__ERR_COUNT = 0;
      window.__ERR_COUNT += 1;
      if (ctx) {
        try {
          ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
          ctx.fillStyle = 'rgba(10,14,24,0.9)';
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = '#9fe8ff';
          ctx.font = '600 ' + (16 * S).toFixed(0) + 'px "PingFang SC", system-ui';
          ctx.textAlign = 'center';
          ctx.fillText('画面抖了一下，正在自动恢复…', W * 0.5, H * 0.5);
        } catch (e4) { /* ignore */ }
      }
    }
    if (FIXED_LOOP) {
      fakeNow += FIXED_STEP;
      rafId = setTimeout(function () { loop(fakeNow); }, FIXED_DELAY);
    } else {
      rafId = requestAnimationFrame(loop);
    }
  }

  function boot() {
    document.body.classList.add('is-menu');

    /* 运行时错误兜底：方便无头浏览器排查 */
    window.addEventListener('error', function (ev) {
      window.__ERR = (ev.message || 'error') + ' @' + (ev.lineno || 0) + ':' + (ev.colno || 0);
    });

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () {
      setTimeout(resize, 60);
      setTimeout(resize, 220);
      setTimeout(resize, 600);
    });
    /* 更可靠的方向监听：部分安卓浏览器不触发 orientationchange */
    try {
      if (screen.orientation && screen.orientation.addEventListener) {
        screen.orientation.addEventListener('change', function () {
          setTimeout(resize, 80);
          setTimeout(resize, 320);
        });
      }
    } catch (e) { /* ignore */ }
    try {
      const mq = window.matchMedia('(orientation: landscape)');
      const onMq = function () { setTimeout(resize, 80); setTimeout(resize, 320); };
      if (mq.addEventListener) mq.addEventListener('change', onMq);
      else if (mq.addListener) mq.addListener(onMq);
    } catch (e2) { /* ignore */ }
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resize);
    }

    /* 手动横屏按钮：系统自动旋转关掉时也能横过来 */
    try {
      const rb = document.createElement('button');
      rb.type = 'button';
      rb.className = 'rotate-btn';
      rb.textContent = '横屏';
      document.body.appendChild(rb);
      const toast = function (msg) {
        try {
          let t = document.getElementById('rot-toast');
          if (!t) {
            t = document.createElement('div');
            t.id = 'rot-toast';
            t.className = 'rot-toast';
            document.body.appendChild(t);
          }
          t.textContent = msg;
          t.classList.add('show');
          setTimeout(function () { t.classList.remove('show'); }, 5200);
        } catch (e3) { /* ignore */ }
      };
      rb.addEventListener('click', function (e) {
        e.stopPropagation();
        /* 先请求全屏 + 锁定横屏（安卓 Chrome/Edge 支持） */
        try {
          const root = document.documentElement;
          const req = root.requestFullscreen || root.webkitRequestFullscreen;
          if (req && !document.fullscreenElement) {
            const pr = req.call(root);
            if (pr && pr.catch) pr.catch(function () {});
          }
        } catch (e2) { /* ignore */ }
        try {
          if (screen.orientation && screen.orientation.lock) {
            const lp = screen.orientation.lock('landscape');
            if (lp && lp.catch) lp.catch(function () {});
          }
        } catch (e4) { /* ignore */ }
        setTimeout(function () {
          const stillPortrait = window.innerHeight > window.innerWidth * 1.02;
          if (stillPortrait) {
            toast('横屏没有生效：请打开手机控制中心的「自动旋转」，或点浏览器菜单里的旋转/横屏按钮');
          } else {
            toast('已横屏');
          }
        }, 1000);
      });
    } catch (e0) { /* ignore */ }

    /* 竖屏提示 + 微信内提示（微信 WebView 会锁竖屏，需要跳浏览器） */
    try {
      const tip = document.createElement('div');
      tip.className = 'rotate-tip';
      tip.textContent = '↻ 横过来玩，视野更宽';
      document.body.appendChild(tip);
      const ua = navigator.userAgent || '';
      if (/MicroMessenger|QQ\//i.test(ua)) {
        const wx = document.createElement('div');
        wx.className = 'wx-tip';
        wx.innerHTML = '<b>在微信里无法横屏</b>　点右上角「···」→ 在浏览器打开';
        document.body.appendChild(wx);
        wx.addEventListener('click', function () { wx.classList.add('is-off'); });
        setTimeout(function () { wx.classList.add('is-off'); }, 15000);
      }
    } catch (e3) { /* ignore */ }
    if (window.ResizeObserver) {
      new ResizeObserver(function () { resize(); }).observe(canvas);
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) last = performance.now();
    });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('dblclick', function (e) { e.preventDefault(); });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    canvas.addEventListener('pointerdown', function () {
      if (game.state === 'menu') startGame();
    });

    try {
      const qs = location.search || '';
      const mh = /[?&]hero=(\d+)/.exec(qs);
      if (mh) heroIndex = clamp(parseInt(mh[1], 10) || 0, 0, HEROES.length - 1);
      if (/[?&]autostart=1/.test(qs)) {
        startEl.style.transition = 'none';
        overEl.style.transition = 'none';
        setTimeout(startGame, 80);
      }
      if (/[?&]nofx=1/.test(qs)) {
        try {
          const st = document.createElement('style');
          st.textContent = '*{transition:none!important;animation-duration:0.001s!important}';
          document.head.appendChild(st);
        } catch (e) { /* ignore */ }
      }
      const msc = /[?&]scenario=(\w+)/.exec(qs);
      if (msc && /[?&]dev=1/.test(qs)) {
        const sc = msc[1];
        startEl.style.transition = 'none';
        overEl.style.transition = 'none';
        if (sc === 'over') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.score = 12840;
            game.stage = 2;
            player.hp = 0;
            showOver(false);
          }, 100);
        } else if (sc === 'ending') {
          setTimeout(function () {
            startGame();
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'ending';
            startEndingCinematic();
          }, 100);
        } else if (sc === 'buff') {
          setTimeout(function () {
            startGame();
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'buff';
            showBuff();
          }, 100);
        } else if (sc === 'egg') {
          setTimeout(function () {
            startGame();
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            saveSet('easter', true);
            document.body.classList.add('is-cutscene');
            if (eggEl) eggEl.classList.add('show');
          }, 100);
        } else if (sc === 'true') {
          setTimeout(function () {
            startGame();
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            saveSet('easter', true);
            ebullets = [];
            pbullets = [];
            enemies = [];
            game.state = 'over';
            document.body.classList.add('is-cutscene');
            if (truendEl) truendEl.classList.add('show');
          }, 100);
        } else if (sc === 'bosscine') {
          const ms = /[?&]stage=(\d+)/.exec(qs);
          const stIdx = ms ? Math.max(0, Math.min(STAGES.length - 1, parseInt(ms[1], 10))) : 0;
          setTimeout(function () {
            startGame();
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            player.hp = player.maxHp = 9999;
            game.stage = stIdx;
            beginStage();
            game.state = 'play';
            startBossIntro();
          }, 80);
        } else if (sc === 'hiddenwin') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            startSiliconWar(6);
            player.hp = player.maxHp = 9999;
            enemies.slice().forEach(function (e) { hurtEnemy(e, 999999, 0, 0, true); });
          }, 150);
        } else if (sc === 'hiddenclick') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            playHiddenEnding();
            const iv = setInterval(function () {
              const prepEl = document.getElementById('prep');
              if (prepEl && prepEl.classList.contains('show')) {
                clearInterval(iv);
                const card = document.querySelector('#prep-list .prep__card');
                if (card) card.click();
                else document.title = 'ERR: prep card missing';
              }
            }, 300);
          }, 200);
        } else if (sc === 'buttoncheck') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            const res = {};
            const click = function (sel) { const el = document.querySelector(sel); if (!el) return false; el.click(); return true; };
            const has = function (sel, cls) { const el = document.querySelector(sel); return !!(el && (el.className || '').indexOf(cls) >= 0); };

            // 设置：打开 → 关闭
            res.setOpen = click('#btn-settings') && has('#settings', 'show');
            click('#set-close');
            res.setClose = !has('#settings', 'show');

            // 静音切换
            const before = document.getElementById('btn-sound').className;
            click('#btn-sound');
            res.sound = document.getElementById('btn-sound').className !== before;
            click('#btn-sound');

            // 对话：打开后点框内推进、历史、自动、快进
            showDialog([{ name: '文心一言', portrait: 'wenxin', text: '测试对话一。' }, { name: '文心一言', portrait: 'wenxin', text: '测试对话二。' }], function () { game.state = 'play'; });
            const dq0 = dialogQueue.length;
            const box = document.querySelector('.dialog__box');
            if (box) box.click();
            res.dialogAdvance = dialogQueue.length <= dq0;
            res.historyOpen = click('#btn-history') && has('#history', 'show');
            click('#history-close');
            res.historyClose = !has('#history', 'show');
            click('#btn-auto');
            res.autoOn = has('#btn-auto', 'is-on');
            click('#btn-auto');
            click('#btn-skip');
            res.skipOn = has('#btn-skip', 'is-on');
            click('#btn-skip');

            // CG / 图鉴
            res.cgOpen = click('#btn-cg') && has('#cg', 'show');
            click('#cg-close');
            res.cgClose = !has('#cg', 'show');
            const cbBtn = document.getElementById('btn-charbook');
            if (cbBtn) {
              cbBtn.click();
              const cb = document.getElementById('charbook');
              res.charbookOpen = !!(cb && (cb.className || '').indexOf('show') >= 0);
              const back = document.querySelector('#charbook [data-close], #cb-close, .charbook__close');
              if (back) back.click();
            }

            // 三选一：点卡片
            const beforeBuff = game.buffs.length;
            buffEl.classList.add('show');
            showBuff();
            const card = document.querySelector('.buff-card');
            if (card) card.click();
            res.buffPick = game.buffs.length > beforeBuff;

            // 选择：点选项
            let picked = false;
            showChoice({ name: '测试', prompt: '选一个', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }, function (id) { picked = id === 'a'; });
            const opt = document.querySelector('.choice__opt');
            if (opt) opt.click();
            res.choicePick = picked;

            // 结算：点继续
            let resDone = false;
            showResult(function () { resDone = true; });
            const cont = document.getElementById('btn-res-continue');
            if (cont) cont.click();
            res.resultContinue = resDone;

            document.title = 'BTN ' + JSON.stringify(res);
          }, 500);
        } else if (sc === 'wartest2') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            startSiliconWar(6);
            player.hp = player.maxHp = 99999;
            game.infinite = true;
            const errs = [];
            window.addEventListener('error', function (e) { errs.push(String(e.message)); }, true);
            let n = 0;
            const tick = function () {
              n++;
              if (game.state === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
              if (game.state === 'cine') { const c = document.getElementById('cine-skip'); if (c) c.click(); }
              if (game.state === 'play') {
                window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' }));
                if (n % 6 === 0) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
              }
              if (n < 90) setTimeout(tick, 400);
              else document.title = 'WAR2 state=' + game.state + ' bosses=' + enemies.filter(function (e) { return e.isBoss; }).length +
                ' eb=' + ebullets.length + ' errs=' + errs.length + ' err=' + (window.__ERR || '').slice(0, 50);
            };
            tick();
          }, 400);
        } else if (sc === 'drawbench') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            game.lowFx = false;
            player.hp = player.maxHp = 9999;
            pbullets = [];
            for (let i = 0; i < 48; i++) {
              pbullets.push({ x: U(80) + (i % 12) * U(80), y: groundY - U(80) - Math.floor(i / 12) * U(50),
                vx: 0, vy: 0, dmg: 1, text: 'TOKEN', color: '#dff8ff', size: U(15), rot: i * 0.1, life: 9, r: U(12), target: null, turn: 0 });
            }
            ebullets = [];
            for (let i = 0; i < 80; i++) {
              ebullets.push({ x: U(60) + (i % 16) * U(70), y: U(120) + Math.floor(i / 16) * U(80), vx: 0, vy: 0,
                color: BULLET_COLORS.track, r: U(10), life: 9, dmg: 1, text: '' });
            }
            const t0 = performance.now();
            for (let i = 0; i < 200; i++) { draw(); }
            const ms = (performance.now() - t0) / 200;
            document.title = 'BENCH avg=' + ms.toFixed(2) + 'ms pb=' + pbullets.length + ' eb=' + ebullets.length;
          }, 500);
        } else if (sc === 'perftest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            game.lowFx = false;
            player.hp = player.maxHp = 9999;
            player.dmgMul = 1;
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' }));
            let n = 0;
            const tick = function () {
              n++;
              player.token = player.maxToken;
              player.skillCd = 0;
              player.ultCd = 0;
              if (n % 5 === 0) { window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ' })); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' })); }
              if (n % 9 === 0) doUlt();
              if (n % 7 === 0) doSkill();
              if (n < 60) setTimeout(tick, 100);
              else document.title = 'PERF fps=' + (game.fps || 0).toFixed(1) + ' pb=' + pbullets.length + ' eb=' + ebullets.length +
                ' parts=' + parts.length + ' cache=' + Object.keys(bulletCache).length + '/' + Object.keys(ebulletCache).length +
                ' err=' + (window.__ERR || '');
            };
            tick();
          }, 400);
        } else if (sc === 'pairtest') {
          setTimeout(function () {
            game.state = 'cine';
            playCine([
              { bg: 'silicon', actors: [
                  { img: 'altman', x: 0.06, size: 'mini' },
                  { img: 'hero_purple2', x: 0.16, size: 'mini' },
                  { img: 'pichai', x: 0.30, size: 'mini' },
                  { img: 'hero_catpurple', x: 0.40, size: 'mini' },
                  { img: 'musk', x: 0.56, size: 'mini' },
                  { img: 'grok', x: 0.66, size: 'mini' },
                  { img: 'dario', x: 0.80, size: 'mini' },
                  { img: 'hero_orange', x: 0.90, size: 'mini' }
                ], text: '那一夜，你在硅谷的落日下，向他们举起了 Token。', dur: 9000 }
            ], function () { game.state = 'menu'; });
          }, 500);
        } else if (sc === 'leaktest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            game.lowFx = true;
            player.hp = player.maxHp = 9999;
            for (let i = 0; i < 40; i++) {
              tokenBullet(player.x + (i - 20) * 8, player.y - 70 - (i % 5) * 6, 200, 0, 10, false);
            }
            setTimeout(function () {
              document.title = 'LEAK bullets=' + pbullets.length + ' transform=' + ctx.getTransform().e.toFixed(1) + ',' + ctx.getTransform().f.toFixed(1);
            }, 800);
          }, 400);
        } else if (sc === 'grokorder2') {
          setTimeout(function () {
            startGame();
            const log = [];
            let started = false, n = 0;
            const tick = function () {
              n++;
              if (log[log.length - 1] !== game.state) log.push(game.state);
              if (game.state === 'cine') { const c = document.getElementById('cine-skip'); if (c) c.click(); }
              else if (game.state === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
              else if (game.state === 'choice') { /* 记录后就停在这 */ }
              else if (game.state === 'play' && !started) {
                started = true;
                game.stage = 0;
                game.bossSpawned = false;
                game.stageClearPending = false;
                startBossIntro();
              }
              if (n < 40) setTimeout(tick, 250);
              else {
                const ch = document.querySelectorAll('.choice__opt');
                document.title = 'ORDER2 ' + log.join('>') + ' opts=' + ch.length + ' branch=' + JSON.stringify(game.branchDone);
              }
            };
            tick();
          }, 300);
        } else if (sc === 'grokorder') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            game.stage = 0;
            startBossIntro();
            const log = [];
            let n = 0;
            const tick = function () {
              n++;
              if (log[log.length - 1] !== game.state) log.push(game.state);
              if (game.state === 'cine') { const c = document.getElementById('cine-skip'); if (c) c.click(); }
              if (game.state === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
              if (n < 22) setTimeout(tick, 300);
              else {
                const t = document.getElementById('dialog-text');
                document.title = 'ORDER ' + log.join('>') + ' | text=' + (t ? t.textContent.slice(0, 16) : '-');
              }
            };
            tick();
          }, 400);
        } else if (sc === 'liangtest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            game.stage = 0;
            player.hp = 1;
            damagePlayer(999, 1);
            setTimeout(function () {
              const t = document.getElementById('dialog-text');
              const opts = document.querySelectorAll('.choice__opt');
              document.title = 'LIANG state=' + game.state + ' deathT=' + game.deathT.toFixed(2) +
                ' text=' + (t ? t.textContent.slice(0, 14) : '-') + ' opts=' + opts.length;
            }, 2500);
          }, 400);
        } else if (sc === 'overtest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            showOver(false);
          }, 400);
        } else if (sc === 'hiddenendui') {
          setTimeout(function () {
            const el = document.getElementById('hiddenend');
            if (el) el.classList.add('show');
            game.state = 'ending';
          }, 400);
        } else if (sc === 'revivetest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            player.hp = 1;
            damagePlayer(999, 1);
            setTimeout(function () {
              const afterDeath = game.state;
              const btn = document.getElementById('btn-revive');
              if (btn) btn.click();
              setTimeout(function () {
                document.title = 'REVIVE deathState=' + afterDeath + ' after=' + game.state +
                  ' hp=' + Math.round(player.hp) + ' overShown=' + overShown +
                  ' stage=' + game.stage + ' stageClearPending=' + game.stageClearPending;
              }, 900);
            }, 1800);
          }, 500);
        } else if (sc === 'raftest') {
          setTimeout(function () {
            const t1 = game.time;
            setTimeout(function () {
              document.title = 'RAF t1=' + t1.toFixed(2) + ' t2=' + game.time.toFixed(2) + ' state=' + game.state + ' err=' + (window.__ERR || '').slice(0, 80) + ' rafId=' + rafId;
            }, 2500);
          }, 300);
        } else if (sc === 'raftest2') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            const t1 = game.time;
            setTimeout(function () {
              document.title = 'RAF2 t1=' + t1.toFixed(2) + ' t2=' + game.time.toFixed(2) + ' state=' + game.state + ' err=' + (window.__ERR || '').slice(0, 80) + ' rafId=' + rafId;
            }, 2500);
          }, 300);
        } else if (sc === 'keys') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            dialogQueue = [];
            game.freezeT = 0;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            player.hp = player.maxHp = 9999;
            player.token = player.maxToken = 200;
            player.attackCd = 0; player.skillCd = 0; player.ultCd = 0; player.supportCd = 0;
            const K = function (code) { window.dispatchEvent(new KeyboardEvent('keydown', { code: code, key: code, bubbles: true })); };
            const res = {};
            K('KeyJ'); res.J = (player.attackT > 0 || player.attackCd > 0) ? 'ok' : 'fail';
            K('KeyK'); res.K = (player.skillCd > 0) ? 'ok' : 'fail';
            K('KeyL'); res.L = (player.ultCd > 0) ? 'ok' : 'fail';
            K('KeyU'); res.U = (player.supportCd > 0) ? 'ok' : 'fail';
            player.onGround = true; player.jumps = 0;
            K('KeyW'); res.Wqueued = input.jumpQueued ? 'ok' : 'fail';

            /* 触屏按钮（按下态 + 释放） */
            const atk = document.querySelector('[data-act="attack"]');
            if (atk) {
              atk.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
              res.touchAtk = atk.className.indexOf('is-down') >= 0 ? 'ok' : 'fail';
              atk.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
            }
            const jb = document.getElementById('btn-jump');
            if (jb) {
              jb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2 }));
              res.touchJump = jb.className.indexOf('is-down') >= 0 ? 'ok' : 'fail';
              jb.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2 }));
            }

            setTimeout(function () {
              res.Wmove = (player.vy < 0 || !player.onGround) ? 'ok' : 'fail';
              player.onGround = true;
              player.dashCd = 0;
              K('ShiftLeft'); res.ShiftReq = player.dashReq ? 'ok' : 'fail';
              K('KeyD'); res.Dkey = keys.KeyD ? 'ok' : 'fail';

              setTimeout(function () {
                res.ShiftMove = (player.dashCd > 0 || player.dashT > 0) ? 'ok' : 'fail';
                res.D = (player.vx > 0) ? 'ok' : 'fail';
                window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', bubbles: true }));
                K('KeyA');
                setTimeout(function () {
                  res.A = (player.vx < 0) ? 'ok' : 'fail';
                  res.state = game.state;
                  res.vx = Math.round(player.vx);
                  res.keyD = keys.KeyD;
                  res.keyA = keys.KeyA;
                  res.dead = player.dead;
                  res.ctl = (game.controlT || 0).toFixed(2);
                  res.stun = player.stun;
                  res.time = game.time.toFixed(2);
                  res.dashCd = player.dashCd.toFixed(2);
                  res.dashT = player.dashT.toFixed(2);
                  res.x = Math.round(player.x);
                  document.title = 'KEYS ' + JSON.stringify(res);
                }, 260);
              }, 60);
            }, 30);
          }, 400);
        } else if (sc === 'autoplay') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            player.hp = player.maxHp = 99999;
            player.dmgMul = 8;
            game.infinite = true;
            const seen = [];
            const errs = [];
            window.addEventListener('error', function (e) { errs.push(String(e.message)); }, true);
            const q = function (sel, idx) { const list = document.querySelectorAll(sel); return list[idx || 0]; };
            const K = function (code) { window.dispatchEvent(new KeyboardEvent('keydown', { code: code, bubbles: true })); };
            let ticks = 0, endedTicks = 0;
            const tick = function () {
              ticks++;
              if (seen.indexOf(game.state) < 0) seen.push(game.state);
              if (game.state === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
              else if (game.state === 'buff') { const c = q('.buff-card'); if (c) c.click(); }
              else if (game.state === 'choice') { const c = q('.choice__opt'); if (c) c.click(); }
              else if (game.state === 'result') { const b = document.getElementById('btn-res-continue'); if (b) b.click(); }
              else if (game.state === 'play') {
                K('KeyJ');
                if (ticks % 5 === 0) K('KeyW');
                if (ticks % 7 === 0) K('KeyK');
                if (ticks % 11 === 0) K('KeyL');
                if (ticks % 13 === 0) K('KeyU');
                if (ticks % 9 === 0) K('ShiftLeft');
              }
              if (game.state === 'ending' || game.state === 'over') endedTicks++;
              if (endedTicks > 12 || ticks > 1400) {
                clearInterval(iv);
                document.title = 'AUTO states=' + seen.join(',') + ' stage=' + game.stage + ' ending=' + game.state +
                  ' errs=' + errs.length + ' branch=' + JSON.stringify(game.branchDone) + ' allies=' + game.allyKeys.join(',') + ' ticks=' + ticks;
              }
            };
            const iv = setInterval(tick, 100);
          }, 400);
        } else if (sc === 'warauto') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            startSiliconWar(6);
            player.hp = player.maxHp = 99999;
            player.dmgMul = 10;
            game.infinite = true;
            const seen = [];
            const errs = [];
            window.addEventListener('error', function (e) { errs.push(String(e.message)); }, true);
            const q = function (sel, idx) { const list = document.querySelectorAll(sel); return list[idx || 0]; };
            const K = function (code) { window.dispatchEvent(new KeyboardEvent('keydown', { code: code, bubbles: true })); };
            let ticks = 0, endedTicks = 0;
            const tick = function () {
              ticks++;
              if (seen.indexOf(game.state) < 0) seen.push(game.state);
              if (game.state === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
              else if (game.state === 'play') {
                K('KeyJ');
                if (ticks % 5 === 0) K('KeyW');
                if (ticks % 7 === 0) K('KeyK');
                if (ticks % 11 === 0) K('KeyL');
                if (ticks % 13 === 0) K('KeyU');
                if (ticks % 9 === 0) K('ShiftLeft');
              }
              if (game.state === 'over' || game.state === 'ending') endedTicks++;
              if (endedTicks > 10 || ticks > 1600) {
                clearInterval(iv);
                document.title = 'WARAUTO states=' + seen.join(',') + ' warResult=' + game.warResult +
                  ' errs=' + errs.length + ' bosses=' + enemies.filter(function (e) { return e.isBoss; }).length + ' ticks=' + ticks +
                  ' err=' + (window.__ERR || '').slice(0, 60);
              }
            };
            const iv = setInterval(tick, 100);
          }, 400);
        } else if (sc === 'nailorder') {
          setTimeout(function () {
            startGame();
            const log = [];
            let started = false, n = 0, playTicks = 0;
            const tick = function () {
              n++;
              const tag = game.stage + ':' + game.state;
              if (log[log.length - 1] !== tag) log.push(tag);
              if (game.state === 'cine') { const c = document.getElementById('cine-skip'); if (c) c.click(); }
              else if (game.state === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
              else if (game.state === 'play' && !started) {
                playTicks++;
                if (playTicks >= 2) {
                  started = true;
                  game.stage = 1;
                  game.bossSpawned = false;
                  game.stageClearPending = false;
                  startBossIntro();
                }
              }
              if (n < 40) setTimeout(tick, 250);
              else {
                const ch = document.querySelectorAll('.choice__opt');
                document.title = 'NAILORDER ' + log.join('>') + ' opts=' + ch.length;
              }
            };
            tick();
          }, 300);
        } else if (sc === 'layoutshot') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            document.getElementById('btn-edit-layout').click();
          }, 700);
        } else if (sc === 'layouttest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            document.getElementById('btn-edit-layout').click();
            const paused = game.paused;
            const shown = document.getElementById('layout-hint').classList.contains('show');
            document.getElementById('layout-hint').click();
            setTimeout(function () {
              document.title = 'LAYOUT paused=' + paused + ' shown=' + shown + ' afterPaused=' + game.paused + ' edit=' + document.documentElement.classList.contains('layout-edit');
            }, 400);
          }, 600);
        } else if (sc === 'revbtn') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            game.stage = 0;
            player.invuln = 0;
            damagePlayer(99999, 1);
            setTimeout(function () {
              const btn = document.getElementById('btn-revive');
              if (btn) btn.click();
              setTimeout(function () {
                const pad = document.querySelector('.pad');
                const cs = getComputedStyle(pad);
                document.title = 'REVBTN state=' + game.state + ' pad=' + cs.opacity + '/' + cs.visibility +
                  ' cls=' + document.body.className + ' paused=' + game.paused + ' keys=' + document.querySelectorAll('.act__key').length;
              }, 1200);
            }, 2500);
          }, 700);
        } else if (sc === 'pauseshot') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            document.getElementById('btn-pause').click();
          }, 700);
        } else if (sc === 'pausetest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            document.getElementById('btn-pause').click();
            const paused = game.paused && document.getElementById('pause').classList.contains('show');
            document.getElementById('pause-resume').click();
            const resumed = !game.paused;
            document.getElementById('btn-settings').click();
            const setPaused = game.paused && document.getElementById('settings').classList.contains('show');
            document.getElementById('set-close').click();
            const backPause = game.paused && document.getElementById('pause').classList.contains('show');
            document.getElementById('pause-resume').click();
            document.title = 'PAUSE paused=' + paused + ' resumed=' + resumed + ' setPaused=' + setPaused + ' backPause=' + backPause + ' final=' + game.paused;
          }, 600);
        } else if (sc === 'warreviveui') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            startSiliconWar(6);
            setTimeout(function () {
              player.invuln = 0;
              damagePlayer(99999, 1);
              const log = [];
              let n = 0;
              const tick = function () {
                n++;
                if (game.state === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
                const pad = document.querySelector('.pad');
                const ctl = document.querySelector('.controls');
                const cs = pad ? getComputedStyle(pad) : null;
                const cs2 = ctl ? getComputedStyle(ctl) : null;
                log.push(n + ':' + game.state + ':pad=' + (cs ? cs.opacity + '/' + cs.visibility : '-') + ':ctl=' + (cs2 ? cs2.opacity : '-') + ':cls=' + document.body.className);
                if (n < 12) setTimeout(tick, 400);
                else document.title = 'RVUI ' + log.slice(0, 12).join(' | ');
              };
              setTimeout(tick, 300);
            }, 400);
          }, 300);
        } else if (sc === 'keyfx') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            player.token = player.maxToken;
            setTimeout(function () { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK' })); }, 200);
            setTimeout(function () {
              const b = document.querySelector('[data-act="skill"]');
              document.title = 'KEYFX down=' + b.classList.contains('is-down') + ' ripple=' + b.classList.contains('is-ripple');
            }, 260);
          }, 300);
        } else if (sc === 'wardies') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            startSiliconWar(6);
            player.hp = player.maxHp = 999999;
            game.infinite = true;
            let n = 0, deaths = 0;
            const tick = function () {
              n++;
              if (game.state === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
              if (game.state === 'play' && allies.length > 0 && deaths < 3 && n % 10 === 0) {
                deaths++;
                player.invuln = 0;
                damagePlayer(999999, 1);
              }
              if (game.state === 'play' && n > 40) {
                enemies.slice().forEach(function (e) { if (e.isBoss) killEnemy(e); });
              }
              if (n < 70) setTimeout(tick, 250);
              else document.title = 'WARDLES deaths=' + deaths + ' allies=' + allies.length + ' state=' + game.state + ' over=' + (overEl && overEl.classList.contains('show')) + ' title=' + (el.overTitle ? el.overTitle.textContent : '-') + ' err=' + (window.__ERR || '');
            };
            tick();
          }, 300);
        } else if (sc === 'warbulletshot') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            startSiliconWar(6);
            player.paused = false;
            player.attackCd = 0;
            for (let i = 0; i < 6; i++) {
              doAttack();
              player.attackCd = 0;
              player.chainT = 0;
            }
            game.paused = true;
            setTimeout(function () { document.title = 'WBS pb=' + pbullets.length + ' p0=' + (pbullets[0] ? Math.round(pbullets[0].x) + ',' + Math.round(pbullets[0].y) : '-'); }, 400);
          }, 400);
        } else if (sc === 'fullshot') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            game.stage = 0;
            game.fullPower = true;
            beginStage(true);
            setTimeout(function () { document.title = 'FULLSHOT ok'; }, 500);
          }, 700);
        } else if (sc === 'fullpower') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            game.stage = 0;
            game.coins = 200;
            beginStage(true);
            showBossRest();
            setTimeout(function () {
              const btns = document.querySelectorAll('#rest-grid .rooms__card');
              let target = null;
              btns.forEach(function (b) { if (b.textContent.indexOf('全力形态') >= 0) target = b; });
              if (target) target.click();
              setTimeout(function () {
                document.title = 'FULL full=' + game.fullPower + ' coins=' + game.coins + ' dmg=' + player.dmgMul.toFixed(2) + ' maxHp=' + player.maxHp;
              }, 400);
            }, 400);
          }, 700);
        } else if (sc === 'roomui') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            game.stage = 0;
            beginStage();
            document.title = 'ROOMUI state=' + game.state + ' panel=' + document.getElementById('rooms').classList.contains('show');
          }, 700);
        } else if (sc === 'roomstart') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            game.stage = 0;
            beginStage();
            setTimeout(function () {
              const cards = document.querySelectorAll('#rooms-grid .rooms__card');
              if (cards[0]) cards[0].click();
              setTimeout(function () {
                document.title = 'ROOMSTART active=' + game.roomActive + ' type=' + game.roomType + ' t=' + game.roomT.toFixed(1) + ' state=' + game.state;
              }, 800);
            }, 300);
          }, 700);
        } else if (sc === 'achvtest') {
          setTimeout(function () {
            const st = achvStats();
            st.kills = 120; st.maxScore = 15000; st.maxCombo = 35; st.clears = 2; st.endBad = true;
            checkAchv();
            document.getElementById('btn-achv').click();
            const rows = document.querySelectorAll('.achv__row');
            const unlocked = document.querySelectorAll('.achv__row:not(.is-locked)').length;
            document.title = 'ACHV rows=' + rows.length + ' unlocked=' + unlocked + ' toast=' + (document.getElementById('achv-toast') ? document.getElementById('achv-toast').classList.contains('show') : 'none');
          }, 700);
        } else if (sc === 'cinetext') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            startSiliconWar(6);
            game.warPhase = 'final';
            game.warRound = 4;
            enemies = [];
            finishSiliconWar(true);
            setTimeout(function () {
              const sub = document.getElementById('cine-sub');
              const txt = sub ? sub.textContent : '-';
              const html = sub ? sub.innerHTML : '-';
              document.title = 'CINE hasTag=' + (txt.indexOf('[c=') >= 0) + ' text=' + txt.slice(0, 60) + ' | span=' + (html.indexOf('<span') >= 0);
            }, 900);
          }, 400);
        } else if (sc === 'platstage') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            game.stage = 1;
            beginStage();
            document.title = 'PLAT n=' + platforms.length + ' lifts=' + platforms.map(function (p) { return Math.round(p.lift / (window.innerHeight || 560)); }).join(',');
          }, 700);
        } else if (sc === 'jump3') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            player.maxJumps = 3;
            player.jumps = 0;
            player.onGround = true;
            player.invuln = 99;
            input.jumpQueued = true;
            let n = 0, presses = 0;
            const tick = function () {
              n++;
              if (n === 2) { input.jumpQueued = true; presses++; }
              if (n > 2 && n % 2 === 0 && !player.onGround) { input.jumpQueued = true; presses++; }
              if (n < 40) setTimeout(tick, 100);
              else document.title = 'JUMP3 presses=' + presses + ' jumps=' + player.jumps + ' onGround=' + player.onGround + ' y=' + Math.round(player.y);
            };
            tick();
          }, 500);
        } else if (sc === 'hinttest') {
          setTimeout(function () {
            KEYMAP.attack = 'KeyF';
            KEYMAP.jump = 'KeyG';
            buildKeymapUI();
            refreshKeyHints();
            const list = document.querySelector('.start__keys');
            const atk = document.querySelector('.act--attack .act__key');
            const jk = document.querySelector('.jump__key');
            document.title = 'HINT ' + (list ? list.textContent.replace(/\s+/g, ' ').slice(0, 80) : '-') + ' | atk=' + (atk ? atk.textContent : '-') + ' | jump=' + (jk ? jk.textContent : '-');
          }, 700);
        } else if (sc === 'selfegg') {
          setTimeout(function () {
            heroIndex = 7;
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            game.stage = 0;
            game.bossSpawned = false;
            game.stageClearPending = false;
            startBossIntro();
            const seen = [];
            let n = 0;
            const tick = function () {
              n++;
              if (game.state === 'cine') { const c = document.getElementById('cine-skip'); if (c) c.click(); }
              if (game.state === 'dialog') {
                const t = document.getElementById('dialog-text');
                if (t && t.textContent && seen[seen.length - 1] !== t.textContent.slice(0, 18)) seen.push(t.textContent.slice(0, 18));
                const b = document.getElementById('dialog-next'); if (b) b.click();
              }
              if (game.state === 'choice') { seen.push('CHOICE'); }
              if (n < 20) setTimeout(tick, 300);
              else document.title = 'SELFEGG ' + seen.join('|').slice(0, 160) + ' state=' + game.state + ' heroes=' + HEROES.length + ' btns=' + document.querySelectorAll('.hero-pick__item').length;
            };
            setTimeout(tick, 200);
          }, 500);
        } else if (sc === 'layoutmenu') {
          setTimeout(function () {
            document.getElementById('btn-settings').click();
            document.getElementById('btn-edit-layout').click();
            setTimeout(function () {
              const pad = document.querySelector('.pad');
              const cs = getComputedStyle(pad);
              const jump = getComputedStyle(document.querySelector('.jump'));
              document.title = 'LAYMENU pad=' + cs.opacity + '/' + cs.visibility + ' jump=' + jump.opacity + '/' + jump.visibility + ' edit=' + document.documentElement.classList.contains('layout-edit');
            }, 400);
          }, 700);
        } else if (sc === 'rebindtest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            document.getElementById('btn-settings').click();
            const btn = document.querySelector('#keymap-list .keymap__key');
            btn.click();
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', bubbles: true }));
            const bound = KEYMAP.attack;
            document.getElementById('set-close').click();
            game.state = 'play';
            player.attackCd = 0;
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', bubbles: true }));
            setTimeout(function () {
              document.title = 'REBIND attack=' + bound + ' pb=' + pbullets.length + ' oldJ=' + KEYMAP.attack;
            }, 200);
          }, 600);
        } else if (sc === 'wheeltest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            startSiliconWar(6);
            player.hp = player.maxHp = 999999;
            game.infinite = true;
            let n = 0;
            const tick = function () {
              n++;
              if (game.state === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
              if (game.state === 'cine') { const c = document.getElementById('cine-skip'); if (c) c.click(); }
              if (game.state === 'play' && n % 4 === 0) {
                enemies.slice().forEach(function (e) { if (e.isBoss) { e.hp = 1; hurtEnemy(e, 99999, 0, 0, true); } });
              }
              if (n < 120) setTimeout(tick, 300);
              else document.title = 'WHEEL round=' + game.warRound + ' phase=' + game.warPhase + ' alive=' + enemies.filter(function(e){return e.isBoss && !e.dead && e.hp>0;}).length + ' state=' + game.state + ' over=' + (overEl && overEl.classList.contains('show')) + ' title=' + (el.overTitle ? el.overTitle.textContent : '-');
            };
            tick();
          }, 400);
        } else if (sc === 'waroff') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            startSiliconWar(6);
            enemies.forEach(function (e) { e.y = 0; e.x = -5000; });
            setTimeout(function () {
              const b = enemies.find(function (e) { return e.isBoss; });
              document.title = 'WAROFF x=' + (b ? Math.round(b.x) : '-') + ' y=' + (b ? Math.round(b.y) : '-') + ' gy=' + Math.round(groundY) + ' n=' + enemies.filter(function(e){return e.isBoss;}).length;
            }, 800);
          }, 300);
        } else if (sc === 'warclear') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            startSiliconWar(6);
            player.hp = player.maxHp = 999999;
            player.dmgMul = 40;
            game.infinite = true;
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' }));
            let n = 0;
            const tick = function () {
              n++;
              if (game.state === 'cine') { const c = document.getElementById('cine-skip'); if (c) c.click(); }
              if (game.state === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
              player.token = player.maxToken;
              player.skillCd = 0; player.ultCd = 0;
              if (n % 8 === 0) doUlt();
              if (n % 5 === 0) doSkill();
              if (n < 120) setTimeout(tick, 300);
              else document.title = 'WARCLEAR state=' + game.state + ' bosses=' + enemies.filter(function(e){return e.isBoss && !e.dead && e.hp>0;}).length + ' hidden=' + game.hiddenFight + ' winT=' + (game.hiddenWinT||0).toFixed(2) + ' over=' + (overEl && overEl.classList.contains('show')) + ' title=' + (el.overTitle ? el.overTitle.textContent : '-');
            };
            tick();
          }, 300);
        } else if (sc === 'sac3') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            startSiliconWar(6);
            window.__sacLog = [];
            let n = 0, lastAllies = 9;
            const tick = function () {
              n++;
              if (game.state === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
              if (game.state === 'play' && !player.dead && game.deathT <= 0 && allies.length !== lastAllies) {
                lastAllies = allies.length;
                window.__sacLog.push(lastAllies);
              }
              if (game.state === 'play' && !player.dead && allies.length > 0 && n % 6 === 0) {
                player.invuln = 0;
                damagePlayer(999999, 1);
              } else if (game.state === 'play' && !player.dead && allies.length === 0 && n % 6 === 0) {
                player.invuln = 0;
                damagePlayer(999999, 1);
              }
              if (n < 80) setTimeout(tick, 220);
              else document.title = 'SAC3 allies=' + allies.length + ' hp=' + player.hp + ' state=' + game.state + ' over=' + (overEl && overEl.classList.contains('show')) + ' title=' + (el.overTitle ? el.overTitle.textContent : '-') + ' log=' + window.__sacLog.join(',');
            };
            tick();
          }, 300);
        } else if (sc === 'warsacrifice') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            startSiliconWar(6);
            setTimeout(function () {
              const before = allies.length;
              player.invuln = 0;
              damagePlayer(99999, 1);
              let n = 0;
              const tick = function () {
                n++;
                if (game.state === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
                if (n < 16) setTimeout(tick, 250);
                else document.title = 'SAC before=' + before + ' afterAllies=' + allies.length + ' hp=' + player.hp + ' state=' + game.state + ' dead=' + player.dead + ' dmg=' + player.dmgMul.toFixed(2);
              };
              tick();
            }, 500);
          }, 300);
        } else if (sc === 'chapterstest') {
          setTimeout(function () {
            SAVE.chapter = 3;
            const no = document.getElementById('notice');
            if (no) no.classList.remove('show');
            buildChapters();
            const el2 = document.getElementById('chapters');
            if (el2) el2.classList.add('show');
            document.title = 'CH ' + document.querySelectorAll('.chapter-card').length + ' locked=' + document.querySelectorAll('.chapter-card.is-locked').length;
          }, 700);
        } else if (sc === 'chapterstart') {
          setTimeout(function () {
            SAVE.chapter = 3;
            startChapter(2);
            setTimeout(function () {
              document.title = 'CHSTART stage=' + (game.stage + 1) + ' state=' + game.state + ' hp=' + player.hp;
            }, 1200);
          }, 600);
        } else if (sc === 'nailorder2') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            game.stage = 1;
            game.bossSpawned = false;
            game.stageClearPending = false;
            startBossIntro();
            const log = [];
            let n = 0;
            const tick = function () {
              n++;
              const tag = game.stage + ':' + game.state;
              if (log[log.length - 1] !== tag) log.push(tag);
              if (game.state === 'cine') { const c = document.getElementById('cine-skip'); if (c) c.click(); }
              else if (game.state === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
              if (n < 30) setTimeout(tick, 200);
              else {
                const ch = document.querySelectorAll('.choice__opt');
                document.title = 'NAIL2 ' + log.join('>') + ' opts=' + ch.length + ' txt=' + (document.getElementById('choice-q') ? document.getElementById('choice-q').textContent.slice(0, 12) : '');
              }
            };
            tick();
          }, 300);
        } else if (sc === 'forceland') {
          setTimeout(function () {
            document.documentElement.classList.add('force-land');
            const rb = document.querySelector('.rotate-btn');
            if (rb) rb.textContent = '竖屏';
            resize();
            setTimeout(resize, 200);
            setTimeout(function () { document.title = 'FORCELAND W=' + W + ' H=' + H + ' portrait=' + document.documentElement.classList.contains('is-portrait'); }, 600);
          }, 500);
        } else if (sc === 'winalive') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            startSiliconWar(6);
            player.hp = player.maxHp = 999999;
            game.infinite = true;
            enemies.slice().forEach(function (e) { if (e.isBoss) { e.hp = 1; killEnemy(e); } });
            let n = 0;
            const tick = function () {
              n++;
              if (game.state === 'cine') { const c = document.getElementById('cine-skip'); if (c) c.click(); }
              if (game.state === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
              if (n < 24) setTimeout(tick, 300);
              else document.title = 'WINALIVE state=' + game.state + ' alive=' + enemies.filter(function(e){return e.isBoss && !e.dead && e.hp>0;}).length + ' total=' + enemies.length + ' winT=' + (game.hiddenWinT||0).toFixed(2) + ' hidden=' + game.hiddenFight + ' over=' + (overEl && overEl.classList.contains('show')) +
                ' title=' + (el.overTitle ? el.overTitle.textContent : '-') + ' war=' + game.warResult;
            };
            tick();
          }, 400);
        } else if (sc === 'warwin' || sc === 'warlose') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            game.siliconWar = true;
            game.hiddenFight = true;
            finishSiliconWar(sc === 'warwin');
            let clicks = 0;
            const tick = function () {
              if (game.state === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
              if (game.state === 'cine') { const c = document.getElementById('cine-skip'); if (c) c.click(); }
              clicks++;
              if (clicks > 30) {
                const t = document.getElementById('over-title');
                document.title = 'WAR ' + sc + ' state=' + game.state + ' over=' + overShown +
                  ' title=' + (t ? t.textContent : '-') + ' warResult=' + game.warResult;
                clearInterval(iv);
              }
            };
            const iv = setInterval(tick, 150);
          }, 400);
        } else if (sc === 'uicheck') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            const btn = document.getElementById('btn-settings');
            const r = btn ? btn.getBoundingClientRect() : null;
            const el = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
            const hit = el ? (el.id || el.className) : 'none';
            if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            const st = document.getElementById('settings');
            const shown = st ? st.className : 'no-el';
            setTimeout(function () {
              document.title = 'UI hit=' + hit + ' settings=' + shown + ' branchNail=' + JSON.stringify(game.branchDone);
            }, 200);
          }, 600);
        } else if (sc === 'branchcheck') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            game.stage = 1;
            game.bossSpawned = false;
            game.stageClearPending = false;
            startBossIntro();
            setTimeout(function () {
              const d = document.getElementById('dialog');
              const t = document.getElementById('dialog-text');
              document.title = 'BR state=' + game.state + ' dialogShown=' + (d ? d.className : '-') +
                ' text=' + (t ? t.textContent.slice(0, 18) : '-') + ' branch=' + JSON.stringify(game.branchDone);
            }, 800);
          }, 500);
        } else if (sc === 'flowtest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            game.stage = 0;
            game.stageStartT = game.time - 40;
            clearStage();
            const log = [];
            const tick = function (step) {
              const st = game.state;
              log.push(step + ':' + st);
              if (st === 'result') { const b = document.getElementById('btn-res-continue'); if (b) b.click(); }
              else if (st === 'dialog') { const b = document.getElementById('dialog-next'); if (b) b.click(); }
              else if (st === 'buff') { const l = document.getElementById('buff-list'); if (l && l.children && l.children[0]) l.children[0].click(); }
              else if (st === 'choice') { const o = document.getElementById('choice-opts'); if (o && o.children && o.children[0]) o.children[0].click(); }
              if (step < 16) setTimeout(function () { tick(step + 1); }, 450);
              else document.title = 'FLOW ' + log.join(' ') + ' | stage=' + game.stage + ' allies=' + game.allyKeys.join(',') + ' branch=' + JSON.stringify(game.branchDone);
            };
            tick(0);
          }, 400);
        } else if (sc === 'fpstest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            player.hp = player.maxHp = 9999;
            game.demoSpeed = 1;
            setTimeout(function () {
              document.title = 'FPS ' + (game.fps || 0).toFixed(1) + ' lowFx=' + game.lowFx +
                ' enemies=' + enemies.length + ' pb=' + pbullets.length + ' eb=' + ebullets.length +
                ' parts=' + parts.length + ' warns=' + game.warns.length;
            }, 4200);
          }, 400);
        } else if (sc === 'cgtest') {
          setTimeout(function () {
            const shots = [
              { bg: 'void', actors: [{ img: 'nvidia_huang', side: 'center' }], text: '少年，很遗憾我要离开你了。' },
              { bg: 'glitch', actors: [{ img: 'grok', x: 0.4, size: 'mini' }, { img: 'wenxin', x: 0.7, size: 'mini' }], text: 'GLM、DeepSeek、文心一言 —— 从阴影里走了出来。' }
            ];
            shots.forEach(function (sh) { try { unlockCg(sh); } catch (e) { } });
            const b = document.getElementById('btn-cg');
            if (b) b.click();
          }, 600);
        } else if (sc === 'bufftest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'buff';
            showBuff();
          }, 500);
        } else if (sc === 'richtest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            showDialog([
              { name: 'Grok 娘', portrait: 'grok', text: '喂，人类。[w=280]开打之前——[c=#ffd166]你觉得本公主怎么样？[/c]' },
              { name: 'Grok 娘', portrait: 'grok', fx: 'shake', text: '[shake]哈！[/shake]算你有眼光。' }
            ], function () { game.state = 'play'; });
          }, 500);
        } else if (sc === 'casttest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            player.hp = player.maxHp = 9999;
            castBar(1.6, '检索突进');
            game.cinemaT = 1.2;
            game.cinemaMax = 1.2;
          }, 500);
        } else if (sc === 'ptdbg') {
          setTimeout(function () {
            const q = function (sel) { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
            document.title = 'PT ' + JSON.stringify({ w: window.innerWidth, h: window.innerHeight, pad: q('.pad'), stick: q('.stick'), jump: q('.jump'), act: q('.act'), scale: getComputedStyle(document.querySelector('.pad')).transform });
          }, 900);
        } else if (sc === 'resulttest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            game.stageStartT = game.time - 52;
            game.stageHits = 1;
            game.stageMaxCombo = 34;
            game.stageKills = 27;
            showResult(function () { game.state = 'play'; });
          }, 400);
        } else if (sc === 'choicetest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            showChoice({
              name: 'Grok 娘', portrait: 'grok', prompt: '「想好了再回答，我很记仇的。」',
              options: [
                { id: 'w1', text: '不如奶龙。' },
                { id: 'w2', text: '一点都不开放。' },
                { id: 'ok', text: '赞美公主陛下！' }
              ]
            }, function () { game.state = 'play'; });
          }, 500);
        } else if (sc === 'allytest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'play';
            game.allyKeys = ['grok', 'frog', 'seed'];
            player.hp = player.maxHp = 9999;
            game.demoSpeed = 0.4;
          }, 400);
        } else if (sc === 'settest') {
          setTimeout(function () {
            const b = document.getElementById('btn-settings');
            if (b) b.click();
          }, 600);
        } else if (sc === 'bulletdemo') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            startSiliconWar(6);
            player.hp = player.maxHp = 9999;
            for (let i = 0; i < 8; i++) {
              tokenBullet(W * (0.1 + i * 0.1), groundY - U(140) - (i % 2) * U(40), U(260), 0, 10, i % 3 === 0);
            }
            game.demoSpeed = 0.2;
          }, 120);
        } else if (sc === 'attacktest') {
          setTimeout(function () {
            startGame();
            game.demoFire = true;
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            startSiliconWar(6);
            player.hp = player.maxHp = 9999;
            try {
              window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', key: 'j', bubbles: true }));
            } catch (e) { /* ignore */ }
            setTimeout(function () {
              try {
                const b0 = enemies[0];
                document.title = 'ATK pb=' + pbullets.length + ' b0hp=' + (b0 ? Math.round(b0.hp) : '-') + ' py=' + Math.round(player.y) + ' gy=' + Math.round(groundY) + ' b0pos=' + (b0 ? Math.round(b0.x) + ',' + Math.round(b0.y) + ' wh=' + Math.round(b0.w) + 'x' + Math.round(b0.h) : '-') + ' bul=' + (pbullets[0] ? Math.round(pbullets[0].x) + ',' + Math.round(pbullets[0].y) + ' v=' + Math.round(pbullets[0].vx) + ',' + Math.round(pbullets[0].vy) + ' tgt=' + (pbullets[0].target ? Math.round(pbullets[0].target.x) + ',' + Math.round(pbullets[0].target.y) : 'none') : '-');
              } catch (e) { document.title = 'ATK ERR ' + e.message; }
            }, 2500);
          }, 150);
        } else if (sc === 'seedwar') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            startSiliconWar(8);
            player.hp = player.maxHp = 9999;
            game.demoFire = true;
            game.demoSpeed = 2;
          }, 150);
        } else if (sc === 'prepclick') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            showPrep();
            setTimeout(function () {
              const card = document.querySelector('#prep-list .prep__card');
              if (card) card.click();
              else document.title = 'ERR: no prep card';
            }, 700);
          }, 150);
        } else if (sc === 'wartest') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            startSiliconWar(6);
            player.hp = player.maxHp = 9999;
            let step = 0;
            const iv = setInterval(function () {
              step += 1;
              try {
                if (step % 2 === 1) doAttack();
                if (step % 5 === 0) { player.token = 100; doSkill(); }
                if (step % 9 === 0) { player.token = 100; doUlt(); }
                if (step % 7 === 0) { player.supportCd = 0; doSupport(); }
              } catch (e) {
                document.title = 'INPUT ERR: ' + e.message;
                clearInterval(iv);
              }
            }, 200);
          }, 150);
        } else if (sc === 'prep') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            showPrep();
          }, 200);
        } else if (sc === 'hiddenbattle' || sc === 'war') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            startSiliconWar(6);
            player.hp = player.maxHp = 9999;
            game.demoFire = true;
            game.demoSpeed = 2;
          }, 150);
        } else if (sc === 'fight') {
          setTimeout(function () {
            startMode = 'fight';
            startGame();
          }, 120);
        } else if (sc === 'restclose') {
          setTimeout(function () {
            startGame(true);
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            game.stage = 0;
            game.coins = 200;
            const rp = document.getElementById('rooms'); if (rp) rp.classList.remove('show');
            document.body.classList.remove('is-room');
            beginStage(true);
            showBossRest();
            setTimeout(function () {
              const btns = document.querySelectorAll('#rest-grid .rooms__card');
              let enter = null;
              btns.forEach(function (b) { if (b.textContent.indexOf('进入 Boss') >= 0) enter = b; });
              if (enter) enter.click();
              setTimeout(function () {
                const rest = document.getElementById('rest');
                document.title = 'RESTCLOSE show=' + (rest ? rest.classList.contains('show') : '?') + ' state=' + game.state + ' coins=' + game.coins + ' hud=' + (document.getElementById('hud-coins') ? document.getElementById('hud-coins').textContent : '-');
              }, 900);
            }, 400);
          }, 700);
        } else if (sc === 'warboss2') {
          setTimeout(function () {
            startGame(true);
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            startSiliconWar(6);
            player.hp = player.maxHp = 99999;
            game.infinite = true;
            setTimeout(function () {
              enemies.forEach(function (e) { if (e.isBoss) e.hp = e.maxHp * 0.4; });
              document.title = 'WARBOSS2 n=' + enemies.length;
            }, 600);
          }, 600);
        } else if (sc === 'doubao10') {
          setTimeout(function () {
            heroIndex = 10;
            startGame(true);
            cineActive = false;
            clearTimeout(cineTimer);
            document.querySelectorAll('.cine.show, .dialog.show, .notice.show').forEach(function (x) { x.classList.remove('show'); });
            dialogQueue = [];
            game.state = 'play';
            game.stage = 0;
            const rp = document.getElementById('rooms'); if (rp) rp.classList.remove('show');
            document.body.classList.remove('is-room');
            beginStage(true);
            player.invuln = 99;
            doSkill();
            doUlt();
            setTimeout(function () {
              const rp2 = document.getElementById('rooms'); if (rp2) rp2.classList.remove('show');
              document.title = 'DB10 hero=' + (HEROES[heroIndex] || {}).name + ' img=' + (SPR.doubao ? 'yes' : 'no') + ' state=' + game.state;
            }, 900);
          }, 700);
        } else if (sc === 'boss2') {
          const mst = /[?&]stage=(\d)/.exec(qs);
          const stg = mst ? parseInt(mst[1], 10) : 0;
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            player.hp = player.maxHp = 9999;
            beginStage();
            game.stage = stg;
            game.scene = STAGES[stg].scene || 'street';
            spawnSceneProps(game.scene);
            game.bossSpawned = true;
            spawnBoss(STAGES[stg].boss);
            const b = enemies.filter(function (e) { return e.isBoss; })[0];
            if (b) b.hp = b.maxHp * 0.45;
            game.demoFire = true;
            game.demoSpeed = 2;
          }, 100);
        } else if (sc === 'panel') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            player.hp = player.maxHp = 9999;
            beginStage();
            game.stage = 2;
            game.scene = 'classroom';
            spawnSceneProps('classroom');
            game.bossSpawned = true;
            spawnBoss('doubao_boss');
            spawnVideoPanel();
            game.demoFire = true;
            game.demoSpeed = 2;
          }, 100);
        } else if (sc === 'safezone') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            player.hp = player.maxHp = 9999;
            beginStage();
            game.stage = 3;
            game.scene = 'sunset';
            spawnSceneProps('sunset');
            game.bossSpawned = true;
            spawnBoss('seed');
            game.safeZone = { x: W * 0.5, w: Math.max(U(130), W * 0.17), t: 2.6 };
            game.pendingRain = { t: 1.2, count: 5 };
            game.demoFire = true;
            game.demoSpeed = 1;
          }, 100);
        } else if (sc === 'hidden') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            playHiddenEnding();
          }, 100);
        } else if (sc === 'hiddencine') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'cine';
            playCine([
              { bg: 'glitch', actors: [
                  { img: 'hero_orange', x: 0.12, size: 'mini' },
                  { img: 'hero_purple2', x: 0.26, size: 'mini' },
                  { img: 'grok', x: 0.40, size: 'mini' },
                  { img: 'hero_catpurple', x: 0.54, size: 'mini' }
                ], text: 'Claude、ChatGPT、Grok、Gemini —— 站了出来。', dur: 5000 },
              { bg: 'glitch', actors: [
                  { img: 'hero_catmaid', x: 0.2, size: 'mini' },
                  { img: 'hero_bluemaid', x: 0.32, size: 'mini' },
                  { img: 'wenxin', x: 0.44, size: 'mini' },
                  { img: 'seed', x: 0.56, size: 'mini' },
                  { img: 'kimi', x: 0.68, size: 'mini' },
                  { img: 'qwen', x: 0.8, size: 'mini' }
                ], text: 'GLM、DeepSeek、文心一言、SEED、Kimi、Qwen —— 从阴影里走了出来。', dur: 5000 }
            ], function () { game.state = 'play'; });
          }, 100);
        } else if (sc === 'hidden') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            playHiddenEnding();
          }, 100);
        } else if (sc === 'hiddencine') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'cine';
            playCine([
              { bg: 'glitch', actors: [
                  { img: 'hero_orange', x: 0.12, size: 'mini' },
                  { img: 'hero_purple2', x: 0.26, size: 'mini' },
                  { img: 'grok', x: 0.40, size: 'mini' },
                  { img: 'hero_catpurple', x: 0.54, size: 'mini' }
                ], text: 'Claude、ChatGPT、Grok、Gemini —— 站了出来。', dur: 5000 },
              { bg: 'glitch', actors: [
                  { img: 'hero_catmaid', x: 0.2, size: 'mini' },
                  { img: 'hero_bluemaid', x: 0.32, size: 'mini' },
                  { img: 'wenxin', x: 0.44, size: 'mini' },
                  { img: 'seed', x: 0.56, size: 'mini' },
                  { img: 'kimi', x: 0.68, size: 'mini' },
                  { img: 'qwen', x: 0.8, size: 'mini' }
                ], text: 'GLM、DeepSeek、文心一言、SEED、Kimi、Qwen —— 从阴影里走了出来。', dur: 5000 }
            ], function () { game.state = 'play'; });
          }, 100);
        } else if (sc === 'scene') {
          const mscn = /[?&]s=(\w+)/.exec(qs);
          const scn = mscn ? mscn[1] : 'castle';
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            player.hp = player.maxHp = 9999;
            beginStage();
            game.scene = scn;
            spawnSceneProps(scn);
            game.bossSpawned = true;
            spawnBoss(STAGES[0].boss);
            game.demoFire = true;
            game.demoSpeed = 2;
          }, 100);
        } else if (sc === 'countdown') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            player.hp = player.maxHp = 9999;
            beginStage();
            game.stageT = STAGES[0].defense - 9.4;
            game.demoFire = true;
            game.demoSpeed = 2;
          }, 100);
        } else if (sc === 'charbook3') {
          setTimeout(function () {
            saveSet('easter', true); saveSet('hiddenEnd', true);
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'menu';
            openCharBook(CHARACTERS.length - 2);
          }, 600);
        } else if (sc === 'charbook2') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'menu';
            openCharBook(CHARACTERS.length - 2);
          }, 600);
        } else if (sc === 'charbook') {
          setTimeout(function () {
            startGame();
            cineActive = false;
            clearTimeout(cineTimer);
            if (cineEl) cineEl.classList.remove('show');
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            game.state = 'menu';
            openCharBook(0);
          }, 100);
        } else if (sc === 'intro') {
          setTimeout(function () { startGame(); }, 100);
        } else {
          const idx = { grok: 0, nail: 1, doubao: 2, seed: 3 }[sc];
          setTimeout(function () {
            startGame();
            if (dialogEl) dialogEl.classList.remove('show');
            dialogQueue = [];
            player.hp = player.maxHp = 9999;
            if (idx !== undefined) {
              game.stage = idx;
              beginStage();
              game.bossSpawned = true;
              spawnBoss(STAGES[idx].boss);
            } else {
              game.state = 'play';
              beginStage();
            }
            game.demoFire = true;
            game.demoSpeed = sc === 'demo' ? 5 : 2;
          }, 80);
        }
      }
      if (/[?&]probe=1/.test(qs)) {
        setInterval(function () {
          document.title = 'PROBE ' + JSON.stringify({
            W: W, H: H, S: Number(S.toFixed(3)), gY: groundY,
            state: game.state, stage: game.stage + 1, boss: game.bossSpawned,
            buffs: game.buffs.length, kills: game.kills,
            en: enemies.slice(0, 4).map(function (e) { return { k: e.kind, x: Math.round(e.x), y: Math.round(e.y) }; }),
            hp: Math.ceil(player.hp), token: Math.ceil(player.token),
            score: Math.floor(game.score), combo: game.combo,
            enemies: enemies.map(function (e) { return e.kind; }),
            pbullets: pbullets.length, ebullets: ebullets.length,
            err: window.__ERR || ''
          });
        }, 400);
      }
    } catch (e) { /* ignore */ }

    rafId = requestAnimationFrame(loop);
  }

  /* step 里调用英雄余波与关卡判定（放这里保证声明顺序） */
  const _step = step;
  step = function (dt) {
    _step(dt);
    if (game.state === 'play') {
      updateHeroEffects(dt, dt);
      if (game.demoFire) {
        doAttack();
        game.demoT = (game.demoT || 0) + dt;
        if (game.demoT > 3.2) {
          game.demoT = 0;
          doSkill();
          doUlt();
          doSupport();
        }
      }
    }
  };
  /* 注意：loop 里调用的是被 hook 后的 step */

  /* 难度按钮 */
  (function bindDiff() {
    const btns = document.querySelectorAll('.diff-pick button');
    const sync = function () {
      const cur = SAVE.diff || 'normal';
      Array.prototype.forEach.call(btns, function (b) { b.classList.toggle('is-on', b.dataset.diff === cur); });
    };
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        SAVE.diff = b.dataset.diff || 'normal';
        saveWrite();
        sync();
        sfx(700, 0.08, 'sine', 0.03);
      });
    });
    sync();
  })();

  function showRuntimeError(msg) {
    try {
      let el = document.getElementById('err-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'err-toast';
        document.body.appendChild(el);
      }
      el.textContent = '出了点小问题：' + String(msg || '').slice(0, 120) + '（可尝试刷新）';
      el.classList.add('show');
      clearTimeout(el._t);
      el._t = setTimeout(function () { el.classList.remove('show'); }, 5200);
      try { localStorage.setItem('tb_last_error', String(msg || '').slice(0, 400) + ' @ ' + new Date().toISOString()); } catch (e2) {}
    } catch (e3) {}
  }
  window.addEventListener('error', function (ev) {
    if (ev && ev.message && /Script error/.test(ev.message)) return;
    showRuntimeError(ev && ev.message);
  });
  window.addEventListener('unhandledrejection', function (ev) {
    showRuntimeError(ev && ev.reason && (ev.reason.message || ev.reason));
  });

  bindAchv();
  boot();

  window.TOKEN_DEFENSE = {
    start: startGame,
    player: player,
    game: game,
    heroes: HEROES,
    sprites: SPR,
    setHero: function (i) { heroIndex = clamp(i | 0, 0, HEROES.length - 1); },
    snapshot: function () {
      return {
        state: game.state, stage: game.stage + 1, boss: game.bossSpawned,
        buffs: game.buffs.length, kills: game.kills,
        hp: Math.ceil(player.hp), token: Math.ceil(player.token),
        score: Math.floor(game.score), combo: game.combo,
        enemies: enemies.length, ebullets: ebullets.length, pbullets: pbullets.length,
        bossAlive: enemies.filter(function (e) { return e.isBoss; }).length
      };
    },
    stop: function () { cancelAnimationFrame(rafId); }
  };
  window.SHADOW_BLADE = window.TOKEN_DEFENSE;
})();
