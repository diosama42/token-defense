# 绝地反击：词元保卫战

横版 2D 动作闯关 + Token 文字弹幕 + Galgame 分支叙事的网页游戏。
纯 HTML/CSS/JavaScript（Canvas 2D）实现，无第三方运行依赖。

## 在线游玩

- 正式地址：https://diosama42.github.io/token-defense/
- 单文件版：https://diosama42.github.io/token-defense/play.html


- 直接打开 `play.html`（单文件版，全部资源已内嵌）
- 或打开 `index.html`（开发版，按文件加载 assets）

## 操作

| 按键 | 功能 |
| --- | --- |
| A / D | 移动 |
| W / 空格 | 跳跃（二段跳） |
| J | 平A（按住连发，空中跳劈） |
| K | 技能 |
| L | 大招 |
| U | 支援 |
| Shift / S | 闪避冲刺 |

手机：左下摇杆移动，右侧四键对应支援/技能/大招/平A，跳跃键在摇杆上方。

## 内容

- 4 个剧情关卡 + Boss 转阶段演出 + 分支选项影响难度与队友
- 隐藏结局：8 位硅谷 Boss 决战，两种战后结局剧情
- 16 种战后强化（普通/稀有/传说，带保底）
- Galgame 对话：打字机、富文本标签、历史/自动/快进、立绘演出
- 结算评级（S/A/B/C/D）、CG 鉴赏、角色图鉴、设置页（音量/音乐/震动/按键自定义）

## 本地运行

```
# 任意静态服务器，例如：
python -m http.server 8000
# 然后打开 http://localhost:8000/
```

或直接双击 `play.html`（单文件版，无需服务器）。

## GitHub Pages 部署

1. 新建仓库（推荐名字 `token-defense`）
2. 把本目录所有文件上传到仓库根目录
3. Settings → Pages → Source: Deploy from a branch → Branch: `main` / `/ (root)` → Save
4. 等 1~2 分钟，访问 `https://<你的用户名>.github.io/token-defense/`

> `play.html` 是单文件版，加载最快；根路径 `index.html` 是开发版。

## 资源说明

- 图片素材均取自网络上的二传作品（同人二创）
- 音效与 BGM 由 WebAudio 程序化合成；奶蛙笑声取自网络视频片段

素材版权归原作者所有；如认为不宜使用请联系删除。

本作品为校内学习实践使用，无盈利、无广告。