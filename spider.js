/**
 * vv3nwjk.com Spider JS
 * 适用: TVBox OSC / 影视TV / TVBox
 * 用法: 将此文件与 config.json 一起上传到 GitHub 仓库（需公开）
 *       开启 GitHub Pages 后，config.json 中 api 字段指向此 JS 的 URL
 */

var rule = {
  title: '金牌影院',
  host: 'https://www.vv3nwjk.com',
  homeUrl: '/vod/show/id/1',
  url: '/vod/show/id/fyclass',
  searchUrl: '/vod/search/page/fypage/wd/**',

  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  },

  // 分类列表 —— 从首页导航提取，或手动指定
  class_name: '电影&电视剧&综艺&动漫&短剧',
  class_url: '1&2&3&4&88',
  class_parse: 'ul.nav-menu-items&&li:has(a[href*="/vod/show/id/"]):gt(0);a&&Text;a&&href;id/(\\d+)',

  // 首页推荐
  推荐: 'div.module-item;img&&alt;a&&href;img&&src;.module-item-text&&Text',

  // 一级列表（分类页）
  一级: 'div.module-item;img&&alt;a&&href;img&&src;.module-item-text&&Text',

  // 二级详情
  二级: {
    "title": "h1&&Text",
    "img": ".module-info&&img&&src",
    "desc": ".module-info&&Text;;;.module-info&&Text",
    "content": ".module-info&&Text",
    "tabs": "h2&&Text",
    "lists": "div.module-play-list:eq(#id) a"
  },

  // 搜索
  搜索: 'div.module-item;img&&alt;a&&href;img&&src;.module-item-text&&Text',

  // 播放
  lazy: {
    flag: true,
    parse: 1
  },

  timeout: 15000
};

// ===== Spider 实现 =====
var SPIDER = {};

SPIDER.init = function () {};

SPIDER.homeContent = function (pg) {
  var classes = rule.class_name.split('&');
  var urls = rule.class_url.split('&');
  var result = { class: [] };
  for (var i = 0; i < classes.length; i++) {
    result.class.push({
      type_id: urls[i],
      type_name: classes[i]
    });
  }
  return JSON.stringify(result);
};

SPIDER.homeVodContent = function () {
  var html = req(rule.host + rule.homeUrl);
  return parseList(html, '推荐');
};

SPIDER.categoryContent = function (tid, pg, filter, extend) {
  var url = rule.host + rule.url.replace('fyclass', tid);
  if (pg && parseInt(pg) > 1) {
    url += '/page/' + pg;
  }
  var html = req(url);
  return parseList(html, '一级');
};

SPIDER.detailContent = function (ids) {
  var url = rule.host + '/detail/' + ids;
  var html = req(url);
  return parseDetail(html);
};

SPIDER.searchContent = function (wd, quick) {
  var url = rule.host + rule.searchUrl.replace('**', wd).replace('fypage', '1');
  var html = req(url);
  return parseList(html, '搜索');
};

SPIDER.playContent = function (flag, id, flags) {
  var url = rule.host + id;
  var html = req(url);
  // 从播放页提取 m3u8 链接
  var m3u8 = extractPlayUrl(html);
  if (m3u8) {
    return JSON.stringify({
      parse: 0,
      header: {
        'Referer': rule.host + '/',
        'User-Agent': rule.headers['User-Agent']
      },
      url: m3u8
    });
  }
  // 找不到直链，交给解析接口
  return JSON.stringify({ parse: 1, url: url });
};

// ===== 解析函数 =====

function req(url) {
  var headers = { 'User-Agent': rule.headers['User-Agent'] };
  return fetch(url, { headers: headers }).then(function (r) {
    return r.text();
  });
}

function parseList(html, mode) {
  var result = { list: [] };
  // 通用选择器：匹配包含 /detail/ 的卡片
  var regex = /<div[^>]*class="[^"]*module-item[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*\/detail\/\d+)"[^>]*>[\s\S]*?<img[^>]*(?:alt="([^"]*)"[^>]*|src="([^"]*)"[^>]*)/g;
  var m;
  while ((m = regex.exec(html)) !== null) {
    var href = m[1];
    var title = m[2] || m[3] || '';
    var img = m[3] || '';
    if (title && href) {
      var id = href.match(/\/detail\/(\d+)/);
      if (id) {
        result.list.push({
          vod_id: id[1],
          vod_name: title.replace(/[<>"'&]/g, ''),
          vod_pic: img || rule.host + '/static/img/default.jpg',
          vod_remarks: ''
        });
      }
    }
  }
  return JSON.stringify(result);
}

function parseDetail(html) {
  var result = {
    vod_list: [{
      vod_id: '',
      vod_name: '',
      vod_pic: '',
      type_name: '',
      vod_year: '',
      vod_area: '',
      vod_actor: '',
      vod_director: '',
      vod_content: '',
      vod_play_from: '',
      vod_play_url: ''
    }]
  };

  // 提取标题
  var nameM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (nameM) result.vod_list[0].vod_name = nameM[1].replace(/<[^>]+>/g, '').trim();

  // 提取封面
  var imgM = html.match(/<img[^>]*class="[^"]*lazyload[^"]*"[^>]*(?:data-src|src)="([^"]+)"/);
  if (imgM) result.vod_list[0].vod_pic = imgM[1];

  // 提取播放线路和列表
  var playData = extractPlayList(html);
  if (playData.length > 0) {
    result.vod_list[0].vod_play_from = playData.map(function (p) { return p.from; }).join('$$$');
    result.vod_list[0].vod_play_url = playData.map(function (p) {
      return p.urls.map(function (u) {
        return u.name + '$' + u.url;
      }).join('$$$');
    }).join('$$$$$');
  }

  return JSON.stringify(result);
}

function extractPlayList(html) {
  var plays = [];
  // 匹配播放线路 tab 和对应的播放列表
  var tabs = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/g);
  if (tabs) {
    tabs.forEach(function (tabHtml, idx) {
      var tabText = tabHtml.replace(/<[^>]+>/g, '').trim();
      // 在每个 tab 后面找播放列表
      var afterTab = html.substring(html.indexOf(tabHtml) + tabHtml.length);
      var listMatch = afterTab.match(/<div[^>]*class="[^"]*module-play-list[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      if (listMatch) {
        var links = listMatch[1].match(/<a[^>]*href="([^"]+\/vod\/play\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g);
        if (links) {
          var urls = links.map(function (l) {
            var parts = l.match(/href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
            var name = parts ? parts[2].replace(/<[^>]+>/g, '').trim() : '第' + (links.indexOf(l) + 1) + '集';
            var url = parts ? parts[1] : '';
            return { name: name, url: url };
          });
          plays.push({ from: tabText || '线路' + (idx + 1), urls: urls });
        }
      }
    });
  }
  return plays;
}

function extractPlayUrl(html) {
  // 提取 m3u8 链接
  var m = html.match(/https?:\/\/[^\s"']+\.(?:m3u8|m3u)(?:\?[^\s"']*)?/);
  if (m) return m[0];
  // 提取 mp4 链接
  var m2 = html.match(/https?:\/\/[^\s"']+\.(?:mp4)(?:\?[^\s"']*)?/);
  if (m2) return m2[0];
  // 提取 player 相关变量
  var m3 = html.match(/var\s+\w+\s*=\s*["']([^"']+\.(?:m3u8|m3u|mp4))["']/);
  if (m3) return m3[1];
  return null;
}
