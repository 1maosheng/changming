/* public-links.js —— 顶栏外链入口
 * 点击用系统浏览器打开；不改余额/连接逻辑；无新依赖。
 * 商品版已清空：原模板里的作者个人站 / 赞助页 / 第三方集市入口全部移除。
 * 以后要加自己的链接，往 LINKS 里加一项即可（第一项 = 按钮 id，第二项 = 网址）。
 */
(function () {
  var LINKS = [];
  function openExternal(url) {
    try {
      if (window.app && window.app.app && window.app.app.openPath) {
        window.app.app.openPath(url);
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }
  function bind() {
    for (var i = 0; i < LINKS.length; i++) {
      var el = document.getElementById(LINKS[i][0]);
      if (!el || el.getAttribute('data-bound') === '1') continue;
      el.setAttribute('data-bound', '1');
      el.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var btn = ev.currentTarget;
        var url = (btn && btn.getAttribute('data-url')) || '';
        if (url) openExternal(url);
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  setInterval(bind, 1500);   // 顶栏重绘后仍能挂上（幂等）
})();