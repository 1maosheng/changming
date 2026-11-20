#!/usr/bin/env bash
# 把「B 长明」按每个尺寸单独绘制一遍（不是缩小），再打成 ICON.ico
# 原因：细环直接缩小会糊，小尺寸要按比例加粗；≤24px 干脆去掉缺口保证辨识度。
set -e
cd "$(dirname "$0")"
OUT=图标候选/长明-多尺寸
mkdir -p "$OUT"

for N in 16 24 32 48 64 128 256 512; do
  R_TILE=$(awk "BEGIN{printf \"%.1f\", $N*0.219}")
  R_RING=$(awk "BEGIN{printf \"%.3f\", $N*0.258}")
  STROKE=$(awk "BEGIN{s=$N*0.051; if(s<1.8) s=1.8; printf \"%.2f\", s}")
  DOT=$(awk "BEGIN{d=$N*0.109; if(d<2.2) d=2.2; printf \"%.3f\", d}")
  C=$(awk "BEGIN{printf \"%.2f\", $N/2}")
  # 缺口顶点：40° / 80°，半径取到画布边缘
  P1X=$(awk "BEGIN{printf \"%.1f\", $C+$N*0.5*cos(40*3.14159265/180)}")
  P1Y=$(awk "BEGIN{printf \"%.1f\", $C+$N*0.5*sin(40*3.14159265/180)}")
  P2X=$(awk "BEGIN{printf \"%.1f\", $C+$N*0.5*cos(80*3.14159265/180)}")
  P2Y=$(awk "BEGIN{printf \"%.1f\", $C+$N*0.5*sin(80*3.14159265/180)}")
  # 小尺寸保留缺口，更小(<=24)封死
  GAP=()
  if [ "$N" -gt 24 ]; then
    GAP=(-draw "polygon $C,$C $P1X,$P1Y $P2X,$P2Y")
  fi
  convert -size ${N}x${N} xc:none \
    -fill '#0F1218' -draw "roundrectangle 0,0,$((N-1)),$((N-1)),$R_TILE,$R_TILE" \
    -stroke white -strokewidth $STROKE -fill none \
    -draw "ellipse $C,$C $R_RING,$R_RING 0,360" \
    -stroke none -fill '#0F1218' "${GAP[@]}" \
    -fill '#FFC24B' -draw "circle $C,$C $C,$(awk "BEGIN{printf \"%.2f\", $C-$DOT}")" \
    "$OUT/$N.png"
done

# ICO = 多尺寸合集（Windows 任务栏/资源管理器按需取）
convert "$OUT/16.png" "$OUT/24.png" "$OUT/32.png" "$OUT/48.png" "$OUT/64.png" \
        "$OUT/128.png" "$OUT/256.png" "$OUT/512.png" "$OUT/icon.ico"

echo "尺寸:"; identify -format "%f %wx%h\n" "$OUT"/*.png | tr '\n' ' '; echo; ls -la "$OUT/icon.ico"