/* brand.js —— 把「shell/brand.json」里的产品名贴到界面上
 * 品牌真源只有 brand.json 一处（主进程 / preload / 渲染层 / 打包脚本共读）。
 * 这里只做"显示"：标题栏文字 + 主窗口标题；不要在这里写死任何品牌串。
 */
(function () {
  var applied = false;
  function apply() {
    var b = (window.app && window.app.brand) || {};
    var name = b.name || '工作台';
    var el = document.querySelector('.brand-name');
    if (el && el.textContent !== name) el.textContent = name;
    if (!applied) {
      applied = true;
      // 只认领"还是静态占位"的标题；场景分离窗口自己设的标题不抢
      if (!document.title || document.title === '工作台') document.title = name;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
  setInterval(apply, 1500);   // 顶栏重绘后仍能贴住（幂等）
})();