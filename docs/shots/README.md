# 截图索引

按开发顺序编号；冒烟测试会覆盖对应编号的文件。

| 编号 | 内容 | 产出方式 |
|---|---|---|
| 01-start.png | 起始房间、HUD、小地图 | 手动 |
| 02-room-normal.png | 穿门后的普通房（刷怪、锁门） | 手动 |
| 03-room-boss-cleared.png | Boss 房清空、活板门 | `smoke-floor.mjs` |
| 04-floor-2.png | 踩活板门下到第 2 层 | `smoke-floor.mjs` |
| 05-layout-pit.png | 坑洞布局（双坑） | `smoke-layout.mjs` |
| 06-layout-spike.png | 尖刺走廊布局 | `smoke-layout.mjs` |
| 07-treasure-filled.png | 宝物房基座 + 遗物 | `smoke-rooms.mjs` |
| 08-treasure-looted.png | 宝物房拾取后 | `smoke-rooms.mjs` |
| 09-item-picked.png | 拾取提示 + HUD 道具图标 | `smoke-items.mjs` |
| 10-shop.png | 商店三货架 + 价格 | `smoke-rooms.mjs` |
| 11-door-treasure.png | 宝物门外观（金 + 星） | 手动 |
| 12-enemies-all.png | 11 种普通敌人同屏 | `smoke-enemies.mjs` |
| 13-boss-room.png | Boss 房（锅炉奶奶 + 血条） | `smoke-boss.mjs` |
| 14-boss-cleared.png | 击杀 Boss 后出活板门 | `smoke-boss.mjs` |
| 15-boss-tumor.png | 肉瘤墙（固定 Boss） | `smoke-boss.mjs` |
| 16-boss-chandelier.png | 心脏吊灯（固定 Boss） | `smoke-boss.mjs` |
| 17-boss-drain.png | 排水管虫（5 节） | `smoke-boss.mjs` |
| 18-boss-greedgut.png | 贪吃囊（3 节） | `smoke-boss.mjs` |
| 19-boss-attic.png | 阁楼腿（踩击） | `smoke-boss.mjs` |
| 20-boss-armor.png | 装甲蛆（装甲尾节） | `smoke-boss.mjs` |
| 21-boss-hush.png | 静默者 | `smoke-boss.mjs` |
| 22-boss-pitlord.png | 深井之主（三阶段） | `smoke-boss.mjs` |
| 23-boss-pale.png | 白袍人（三阶段） | `smoke-boss.mjs` |
| 24-boss-nameless.png | 无名（最终 Boss） | `smoke-boss.mjs` |
| 25-items65.png | 65 件道具接入后的战斗（多重泪 + 掉落拾取提示） | `smoke-items65.mjs` |
| 26-item-visuals.png | 外观道具叠加（体型 / 骨翼 / 光环 / 环绕 / 泡膜 / 炮台） | `smoke-items55.mjs` |
| 27-shop-bought.png | 商店购买后（SOLD 货架、金币扣减） | `smoke-economy.mjs` |
| 28-chest-opened.png | 开箱后的普通房（奖励散落） | `smoke-economy.mjs` |
| 29-spawn-grace.png | 进房出场动画：敌人套白圈、从 35% 放大到正常 | `smoke-feel.mjs` |
| 30-hit-burst.png | 击杀粒子 + hit-stop | `smoke-feel.mjs` |
| 31-bomb.png | 炸弹爆炸后的战场（敌人掉血、HUD 消耗品） | `smoke-final.mjs` |
| 32-victory.png | 第 15 层通关结算画面 | `smoke-final.mjs` |
| 33-continue.png | 起始房的「有存档」继续提示 | `smoke-save.mjs` |
| 34-pause.png | 暂停面板（音量滑条 / 静音 / 震屏 / 命中停顿 / 继续 / 返回主界面） | 手动 |
| 35-menu.png | 主界面（标题、简介、操作说明、开始探索、继续游戏、槽位） | 手动 |
| 36-hud.png | 新版 HUD：左上图标计数、血条下一行、金边小地图、左下道具图标 | 手动 |
| 37-menu-save.png | 主界面读取存档：继续游戏显示 B6，槽 1 有档 | 手动 |
| 38-enemy-death.png | 敌人死亡瞬间：白闪 + 扩散血环 + 粒子 + 地面血迹 | 手动 |
| 39-hud-items.png | 65 件道具图标在左下全部展开（向上堆叠） | 手动 |
| 40-slide.png | 进门滑屏过渡：新房间滑入、旧画面滑出、HUD 固定 | 手动 |
| 41-feet-rock.png | 脚部碰撞盒：走到石头边缘停住，不从石头中间穿过 | 手动 |
| 42-feet-wall.png | 脚停在墙带上方，不再卡进墙里 | 手动 |
| 43-death.png | 死亡结算：六项统计、道具列表、再来一次 / 返回主界面 | 手动 |
| 44-spawn.png | 敌人出场动画：白圈扩散 + 缩放显现 | 手动 |
| 45-boss-spawn.png | Boss 出场：大圈 + 缩放，0.9s 无敌 | 手动 |
| 46-shop.png | 商店货架上方的商品名称与说明 | 手动 |
| 47-shop-sold.png | 购买后显示 SOLD，名称与说明保留 | 手动 |
| 48-stats.png | 左侧中间的六项玩家属性（无底板、数值左对齐） | 手动 |
| 49-behind-rock.png | 层级：玩家在石头后面，被石头遮住下半身 | 手动 |
| 50-front-rock.png | 层级：玩家在石头前面 | 手动 |
| 51-beam.png | 五层红色等离子激光 + 枪口光晕 | 手动 |
| 52-shop-icons.png | 商店货架使用真实道具图标 + 名称说明 | 手动 |
| 53-room-juice.png | 敌人呼吸/振翅、房间灰烬与扬尘的实战画面 | 手动 |
| 54-dust.png | 移动时脚下扬起的浅色尘土 | 手动 |
| 55-gm.png | GM 调试面板：跳层 + 道具列表 | 手动 |
| 56-gm-b10.png | GM 跳到 B10 后 HUD/楼层同步 | 手动 |
| 57-gm-item.png | GM 添加道具后的状态提示 | 手动 |
| 58-wall-room.png | 内部墙体布局：八角形战斗区 | 手动 |
| 59-theme-b1.png | B1 楼层主题 | 手动 |
| 60-theme-b9.png | B9 楼层主题 | 手动 |
| 61-theme-b15.png | B15 楼层主题 | 手动 |
| 62-laser-charge.png | 激光头顶进度环（充满自动发射） | 手动 |
| 63-gm-all.png | GM 一键全加，已拥有道具打勾（再点取消） | 手动 |
| 64-gm-debug.png | GM 无敌开关与跳到 Boss | 手动 |
| 65-gm-boss.png | GM 跳到当前层 Boss 房（B5 排水管虫） | 手动 |
