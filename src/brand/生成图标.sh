#!/usr/bin/env bash
# 生成三个图标候选（512 PNG + 多尺寸 ICO + 对比图）
# 依赖：ImageMagick(convert) + Noto Sans CJK（系统自带）
set -e
cd "$(dirname "$0")"
OUT=图标候选
mkdir -p "$OUT"
FONT="Noto-Sans-CJK-SC-Bold"

# ---------- 候选 A：四格（场景 = 格子，其中一格是"当前场景"）----------
convert -size 512x512 xc:none \
  -fill '#2B6CF6' -draw 'roundrectangle 0,0,511,511,112,112' \
  -stroke white -strokewidth 17 -fill none \
  -draw 'roundrectangle 124,124,242,242,30,30' \
  -draw 'roundrectangle 270,124,388,242,30,30' \
  -draw 'roundrectangle 124,270,242,388,30,30' \
  -stroke none -fill white \
  -draw 'roundrectangle 270,270,388,388,30,30' \
  "$OUT/A-四格.png"

# ---------- 候选 B：长明（常驻会话 = 一盏不灭的灯，记忆 = 光点）----------
convert -size 512x512 xc:none \
  -fill '#0F1218' -draw 'roundrectangle 0,0,511,511,112,112' \
  -stroke white -strokewidth 26 -fill none \
  -draw 'ellipse 256,256 132,132 0,360' \
  -stroke none -fill '#0F1218' \
  -draw 'polygon 256,256 409,385 291,453' \
  -fill '#FFC24B' -draw 'circle 256,256 256,200' \
  "$OUT/B-长明.png"

# ---------- 候选 C：叠层（场景 = 一层层摞起来的面板）----------
convert -size 512x512 xc:none \
  -fill '#101826' -draw 'roundrectangle 0,0,511,511,112,112' \
  -stroke none \
  -fill 'rgba(255,255,255,0.16)' -draw 'roundrectangle 132,104,364,336,26,26' \
  -fill 'rgba(255,255,255,0.38)' -draw 'roundrectangle 158,140,390,372,26,26' \
  -fill 'white'                 -draw 'roundrectangle 184,176,408,400,26,26' \
  -fill '#101826'               -draw 'roundrectangle 212,204,380,372,14,14' \
  -fill '#2B6CF6'               -draw 'circle 296,300 296,266' \
  "$OUT/C-叠层.png"

# ---------- 多尺寸 ICO（Windows 任务栏 + 资源管理器要用）----------
for f in A-四格 B-长明 C-叠层; do
  convert "$OUT/$f.png" -define icon:auto-resize=256,128,64,48,32,16 "$OUT/$f.ico"
done

# ---------- 对比图（给客户/自己挑）----------
convert -size 1080x460 xc:'#F5F6F8' \
  \( "$OUT/A-四格.png" -resize 280x280 \) -geometry +60+50  -composite \
  \( "$OUT/B-长明.png" -resize 280x280 \) -geometry +400+50 -composite \
  \( "$OUT/C-叠层.png" -resize 280x280 \) -geometry +740+50 -composite \
  -font "$FONT" -pointsize 30 -fill '#1A1D23' \
  -annotate +85+390  'A 四格 · 栖格/Qige' \
  -annotate +420+390 'B 长明 · 常明/Beacon' \
  -annotate +750+390 'C 叠层 · 工作台/Deskpad' \
  -pointsize 20 -fill '#6B7280' \
  -annotate +60+430 '场景=格子，亮的那格是你正在干的活' \
  -annotate +400+430 '常驻会话=灯，记忆=光点' \
  -annotate +740+430 '多个场景=多层抽屉，随手抽一层' \
  "$OUT/对比图.png"

echo "已生成："
ls -1 "$OUT"