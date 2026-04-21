'use strict';

/**
 * build-data.js — 世帯数ビューア データ生成スクリプト
 *
 * 使い方:
 *   npm install topojson-client
 *   node tools/build-data.js
 *
 * 出力:
 *   data/index.json   … 都道府県一覧
 *   data/01.json〜47.json … 府県別町丁目データ
 */

var fs      = require('fs');
var path    = require('path');
var topojson = require('topojson-client');

// ============================================================
//  定数
// ============================================================

var ESTAT_APP_ID = '61e89c03ae461dcfb60c7cfe0f235d92fcf4a111';
var ESTAT_BASE   = 'https://api.e-stat.go.jp/rest/3.0/app/json';
var TOPO_BASE    = 'https://raw.githubusercontent.com/nyampire/jp_chome_boundary/master/TopoJSON';
var OUT_DIR      = path.resolve(__dirname, '..', 'data');

var PREFS = [
  { code:'01', name:'北海道',   slug:'hokkaido'  },
  { code:'02', name:'青森県',   slug:'aomori'    },
  { code:'03', name:'岩手県',   slug:'iwate'     },
  { code:'04', name:'宮城県',   slug:'miyagi'    },
  { code:'05', name:'秋田県',   slug:'akita'     },
  { code:'06', name:'山形県',   slug:'yamagata'  },
  { code:'07', name:'福島県',   slug:'fukushima' },
  { code:'08', name:'茨城県',   slug:'ibaraki'   },
  { code:'09', name:'栃木県',   slug:'tochigi'   },
  { code:'10', name:'群馬県',   slug:'gunma'     },
  { code:'11', name:'埼玉県',   slug:'saitama'   },
  { code:'12', name:'千葉県',   slug:'chiba'     },
  { code:'13', name:'東京都',   slug:'tokyo'     },
  { code:'14', name:'神奈川県', slug:'kanagawa'  },
  { code:'15', name:'新潟県',   slug:'niigata'   },
  { code:'16', name:'富山県',   slug:'toyama'    },
  { code:'17', name:'石川県',   slug:'ishikawa'  },
  { code:'18', name:'福井県',   slug:'fukui'     },
  { code:'19', name:'山梨県',   slug:'yamanashi' },
  { code:'20', name:'長野県',   slug:'nagano'    },
  { code:'21', name:'岐阜県',   slug:'gifu'      },
  { code:'22', name:'静岡県',   slug:'shizuoka'  },
  { code:'23', name:'愛知県',   slug:'aichi'     },
  { code:'24', name:'三重県',   slug:'mie'       },
  { code:'25', name:'滋賀県',   slug:'shiga'     },
  { code:'26', name:'京都府',   slug:'kyoto'     },
  { code:'27', name:'大阪府',   slug:'oosaka'    },
  { code:'28', name:'兵庫県',   slug:'hyogo'     },
  { code:'29', name:'奈良県',   slug:'nara'      },
  { code:'30', name:'和歌山県', slug:'wakayama'  },
  { code:'31', name:'鳥取県',   slug:'tottori'   },
  { code:'32', name:'島根県',   slug:'shimane'   },
  { code:'33', name:'岡山県',   slug:'okayama'   },
  { code:'34', name:'広島県',   slug:'hiroshima' },
  { code:'35', name:'山口県',   slug:'yamaguchi' },
  { code:'36', name:'徳島県',   slug:'tokushima' },
  { code:'37', name:'香川県',   slug:'kagawa'    },
  { code:'38', name:'愛媛県',   slug:'ehime'     },
  { code:'39', name:'高知県',   slug:'kouchi'    },
  { code:'40', name:'福岡県',   slug:'fukuoka'   },
  { code:'41', name:'佐賀県',   slug:'saga'      },
  { code:'42', name:'長崎県',   slug:'nagasaki'  },
  { code:'43', name:'熊本県',   slug:'kumamoto'  },
  { code:'44', name:'大分県',   slug:'ooita'     },
  { code:'45', name:'宮崎県',   slug:'miyazaki'  },
  { code:'46', name:'鹿児島県', slug:'kagoshima' },
  { code:'47', name:'沖縄県',   slug:'okinawa'   },
];

// ============================================================
//  ユーティリティ
// ============================================================

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

async function fetchJson(url, retries) {
  retries = retries || 3;
  for (var i = 0; i < retries; i++) {
    try {
      var res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      console.warn('    [リトライ ' + (i + 1) + '/' + retries + '] ' + e.message);
      await sleep(1000 * (i + 1));
    }
  }
}

// GeoJSON featureの全頂点平均から重心を算出（小数5桁丸め）
function calcCentroid(feature) {
  var coords = [];
  function extract(c, type) {
    if (type === 'Polygon') {
      c[0].forEach(function(p) { coords.push(p); });
    } else if (type === 'MultiPolygon') {
      c.forEach(function(poly) { poly[0].forEach(function(p) { coords.push(p); }); });
    }
  }
  extract(feature.geometry.coordinates, feature.geometry.type);
  if (!coords.length) return [0, 0];
  var sumLng = 0, sumLat = 0;
  coords.forEach(function(p) { sumLng += p[0]; sumLat += p[1]; });
  var n = coords.length;
  return [
    Math.round(sumLng / n * 100000) / 100000,  // lng
    Math.round(sumLat / n * 100000) / 100000,  // lat
  ];
}

// e-Stat TABLE_INF から文字列を取り出す（$プロパティ or 文字列直接）
function extractStr(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (v.$) return v.$;
  return '';
}

// ============================================================
//  e-Stat getStatsList — statsCode=00200521 の全テーブル取得
// ============================================================

async function fetchAllStatsList() {
  console.log('[StatsList] 令和2年国勢調査 小地域集計 テーブル一覧を取得中...');
  var tables = [];
  var startPos = 1;

  while (true) {
    var url = ESTAT_BASE + '/getStatsList'
      + '?appId=' + ESTAT_APP_ID
      + '&lang=J'
      + '&statsCode=00200521'
      + '&surveyYears=2020'
      + '&searchKind=2'
      + '&startPosition=' + startPos
      + '&limit=100';

    var json = await fetchJson(url);
    var inf = json.GET_STATS_LIST && json.GET_STATS_LIST.DATALIST_INF;
    if (!inf) {
      console.warn('[StatsList] DATALIST_INF が取得できませんでした');
      break;
    }

    var items = inf.TABLE_INF;
    if (!items) break;
    if (!Array.isArray(items)) items = [items];
    tables = tables.concat(items);

    console.log('  取得中... ' + tables.length + ' 件');

    var next = inf.RESULT_INF && inf.RESULT_INF.NEXT_KEY;
    if (!next) break;
    startPos = next;
    await sleep(200);
  }

  console.log('[StatsList] 合計 ' + tables.length + ' テーブル取得完了\n');
  return tables;
}

// ============================================================
//  都道府県 × タイプ ('pop'|'house') の statsDataId を検索
// ============================================================

function findStatsId(tables, prefCode, prefName, type) {
  for (var i = 0; i < tables.length; i++) {
    var t = tables[i];
    if (t.SMALL_AREA !== 1) continue;
    var sname = extractStr(t.STATISTICS_NAME);
    if (!sname.includes('国勢調査')) continue;
    var titleSpec = t.TITLE_SPEC || {};
    var subCat1 = extractStr(titleSpec.TABLE_SUB_CATEGORY1);
    var titleObj = t.TITLE || {};
    var titleNo = titleObj['@no'] || '';
    var titleStr = extractStr(t.TITLE);
    var area = extractStr(t.COLLECT_AREA);
    var prefMatch = subCat1.includes(prefName)
                 || titleStr.includes(prefName)
                 || area.includes(prefName)
                 || titleNo === String(parseInt(prefCode, 10));
    if (!prefMatch) continue;
    var tableName = extractStr(titleSpec.TABLE_NAME) || '';
    var full = titleStr + ' ' + tableName;
    if (type === 'pop') {
      if ((full.includes('人口') || full.includes('世帯')) && !full.includes('建て方')) return t['@id'];
    } else if (type === 'house') {
      if (full.includes('建て方')) return t['@id'];
    }
  }
  return null;
}

// ============================================================
//  e-Stat getStatsData — ページネーション対応
// ============================================================

async function fetchEstat(statsDataId, cdCat01, cdCat02) {
  var allVals = [];
  var startPos = 1;
  var limit = 100000;

  while (true) {
    var url = ESTAT_BASE + '/getStatsData'
      + '?appId=' + ESTAT_APP_ID
      + '&lang=J'
      + '&statsDataId=' + statsDataId
      + '&cdCat01=' + cdCat01
      + (cdCat02 ? '&cdCat02=' + cdCat02 : '')
      + '&limit=' + limit
      + '&startPosition=' + startPos
      + '&metaGetFlg=N';

    var json = await fetchJson(url);
    var sd = json.GET_STATS_DATA;
    if (!sd || sd.RESULT.STATUS !== 0) {
      console.warn('    e-Stat STATUS=' + (sd ? sd.RESULT.STATUS : 'N/A') + ' statsDataId=' + statsDataId);
      break;
    }

    var vals = (sd.STATISTICAL_DATA.DATA_INF && sd.STATISTICAL_DATA.DATA_INF.VALUE) || [];
    if (!Array.isArray(vals)) vals = [vals];
    allVals = allVals.concat(vals);

    var nk = sd.STATISTICAL_DATA.RESULT_INF && sd.STATISTICAL_DATA.RESULT_INF.NEXT_KEY;
    if (!nk) break;
    startPos = nk;
    await sleep(200);
  }

  return allVals;
}

// ============================================================
//  都道府県1件処理
// ============================================================

async function processPref(pref, statsTables) {
  console.log('[' + pref.code + '] ' + pref.name + ' 処理開始');

  // ---- 1. TopoJSON取得 ----
  var topoUrl = TOPO_BASE + '/' + pref.code + '-' + pref.slug + '-all.topojson';
  console.log('  TopoJSON取得: ' + topoUrl);
  var topo;
  try {
    topo = await fetchJson(topoUrl);
  } catch (e) {
    throw new Error('TopoJSON取得失敗: ' + e.message);
  }
  await sleep(200);

  var objKey = Object.keys(topo.objects)[0];
  var geo = topojson.feature(topo, topo.objects[objKey]);

  // ---- 2. areaMap 構築 ----
  var areaMap = new Map();
  geo.features.forEach(function(f) {
    var p    = f.properties;
    var code = String(p.KEY_CODE || '');
    if (!code.startsWith(pref.code)) return;
    var ct = calcCentroid(f);
    areaMap.set(code, {
      c:  code,
      ct: p.GST_NAME || '',
      w:  p.CSS_NAME || '',
      m:  p.MOJI     || '',
      s:  0, k: 0, ky: 0,
      jinko: 0,
      la: ct[1],
      lo: ct[0],
    });
  });
  console.log('  TopoJSON: ' + areaMap.size + ' エリア');

  // KEY_CODEマッチング（11桁→10桁→9桁フォールバック）
  function applyToArea(code, fn) {
    var a = areaMap.get(code);
    if (!a && code.length === 11) {
      a = areaMap.get(code.substring(0, 10)) || areaMap.get(code.substring(0, 9));
    }
    if (a) fn(a);
  }

  // ---- 3. statsDataId を特定 ----
  var popId   = findStatsId(statsTables, pref.code, pref.name, 'pop');
  var houseId = findStatsId(statsTables, pref.code, pref.name, 'house');
  console.log('  popId=' + (popId || '未取得') + '  houseId=' + (houseId || '未取得'));

  // ---- 4. e-Stat: 人口・世帯数 ----
  if (popId) {
    console.log('  人口・世帯数 取得中...');
    var popVals = await fetchEstat(popId, '0010,0040', '1');
    await sleep(200);
    popVals.forEach(function(v) {
      var code = v['@area'];
      if (!code) return;
      var num = parseInt(v['$'], 10);
      if (isNaN(num) || v['$'] === '-') num = 0;
      applyToArea(code, function(a) {
        if (v['@cat01'] === '0010') a.jinko = Math.max(a.jinko, num);  // 人口
        if (v['@cat01'] === '0040') a.s     = Math.max(a.s,     num);  // 世帯数
      });
    });
    console.log('  人口・世帯: ' + popVals.length + ' 件');
  } else {
    console.warn('  人口・世帯データのstatsDataIdが見つかりませんでした');
  }

  // ---- 5. e-Stat: 住宅建て方別 ----
  if (houseId) {
    console.log('  住宅建て方 取得中...');
    var houseVals = await fetchEstat(houseId, '0020,0040', null);
    await sleep(200);
    houseVals.forEach(function(v) {
      var code = v['@area'];
      if (!code) return;
      var num = parseInt(v['$'], 10);
      if (isNaN(num) || v['$'] === '-') num = 0;
      applyToArea(code, function(a) {
        if (v['@cat01'] === '0020') a.k  = Math.max(a.k,  num);  // 一戸建
        if (v['@cat01'] === '0040') a.ky = Math.max(a.ky, num);  // 共同住宅
      });
    });
    console.log('  住宅建て方: ' + houseVals.length + ' 件');
  } else {
    console.warn('  住宅建て方データのstatsDataIdが見つかりませんでした');
  }

  // ---- 6. setai フォールバック（jinko から推計） ----
  areaMap.forEach(function(a) {
    if (a.s === 0 && a.jinko > 0) a.s = Math.round(a.jinko / 2.1);
  });

  // ---- 7. 出力配列を生成（jinko は除外） ----
  var areas = [];
  areaMap.forEach(function(a) {
    areas.push({ c: a.c, ct: a.ct, w: a.w, m: a.m, s: a.s, k: a.k, ky: a.ky, la: a.la, lo: a.lo });
  });

  console.log('  完了: ' + areas.length + ' エリア');
  return areas;
}

// ============================================================
//  メイン
// ============================================================

async function main() {
  console.log('=== 世帯数ビューア データ生成スクリプト ===');
  console.log('開始: ' + new Date().toLocaleString('ja-JP'));
  console.log('出力先: ' + OUT_DIR + '\n');

  // 出力ディレクトリ確保
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log('data/ ディレクトリを作成しました');
  }

  // e-Stat テーブル一覧を一括取得（全47県分のIDをここで解決）
  var statsTables = await fetchAllStatsList();

  var indexData  = { prefectures: [], generated: new Date().toISOString().slice(0, 10) };
  var totalAreas = 0;
  var totalBytes = 0;
  var errors     = [];

  // 47都道府県を順次処理
  for (var i = 0; i < PREFS.length; i++) {
    var pref = PREFS[i];
    try {
      var areas = await processPref(pref, statsTables);

      // data/XX.json 書き込み
      var outPath  = path.join(OUT_DIR, pref.code + '.json');
      var jsonStr  = JSON.stringify(areas);
      fs.writeFileSync(outPath, jsonStr, 'utf8');

      totalAreas += areas.length;
      totalBytes += Buffer.byteLength(jsonStr, 'utf8');

      indexData.prefectures.push({ code: pref.code, name: pref.name, areas: areas.length });
      console.log('→ ' + pref.code + '.json 書き込み完了 ('
        + areas.length + ' エリア, '
        + (Buffer.byteLength(jsonStr, 'utf8') / 1024).toFixed(1) + ' KB)\n');

    } catch (e) {
      console.error('[ERROR] ' + pref.name + ': ' + e.message + '\n');
      errors.push(pref.name + ': ' + e.message);
      indexData.prefectures.push({ code: pref.code, name: pref.name, areas: 0 });
    }

    await sleep(200);
  }

  // data/index.json 書き込み
  var indexJson = JSON.stringify(indexData, null, 2);
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), indexJson, 'utf8');
  console.log('index.json 書き込み完了');

  // ---- 完了サマリ ----
  console.log('\n=== 完了 ===');
  console.log('終了: ' + new Date().toLocaleString('ja-JP'));
  console.log('総エリア数:    ' + totalAreas.toLocaleString('ja-JP') + ' 件');
  console.log('合計サイズ:    ' + (totalBytes / 1024 / 1024).toFixed(2) + ' MB');
  console.log('生成ファイル:  data/index.json + data/{01〜47}.json');

  if (errors.length > 0) {
    console.warn('\n--- エラーあり (' + errors.length + ' 件) ---');
    errors.forEach(function(e) { console.warn('  ' + e); });
  }
}

main().catch(function(e) {
  console.error('Fatal error:', e);
  process.exit(1);
});
