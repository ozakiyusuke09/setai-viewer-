'use strict';

/**
 * build-data.js — 世帯数ビューア データ生成スクリプト（TopoJSON廃止版）
 *
 * 使い方:
 *   node tools/build-data.js
 *
 * 出力:
 *   data/index.json   … 都道府県一覧
 *   data/01.json〜47.json … 府県別町丁目データ
 */

var fs   = require('fs');
var path = require('path');

// ============================================================
//  定数
// ============================================================

var ESTAT_APP_ID = '61e89c03ae461dcfb60c7cfe0f235d92fcf4a111';
var ESTAT_BASE   = 'https://api.e-stat.go.jp/rest/3.0/app/json';
var OUT_DIR      = path.resolve(__dirname, '..', 'data');

var PREFS = [
  { code:'01', name:'北海道'   },
  { code:'02', name:'青森県'   },
  { code:'03', name:'岩手県'   },
  { code:'04', name:'宮城県'   },
  { code:'05', name:'秋田県'   },
  { code:'06', name:'山形県'   },
  { code:'07', name:'福島県'   },
  { code:'08', name:'茨城県'   },
  { code:'09', name:'栃木県'   },
  { code:'10', name:'群馬県'   },
  { code:'11', name:'埼玉県'   },
  { code:'12', name:'千葉県'   },
  { code:'13', name:'東京都'   },
  { code:'14', name:'神奈川県' },
  { code:'15', name:'新潟県'   },
  { code:'16', name:'富山県'   },
  { code:'17', name:'石川県'   },
  { code:'18', name:'福井県'   },
  { code:'19', name:'山梨県'   },
  { code:'20', name:'長野県'   },
  { code:'21', name:'岐阜県'   },
  { code:'22', name:'静岡県'   },
  { code:'23', name:'愛知県'   },
  { code:'24', name:'三重県'   },
  { code:'25', name:'滋賀県'   },
  { code:'26', name:'京都府'   },
  { code:'27', name:'大阪府'   },
  { code:'28', name:'兵庫県'   },
  { code:'29', name:'奈良県'   },
  { code:'30', name:'和歌山県' },
  { code:'31', name:'鳥取県'   },
  { code:'32', name:'島根県'   },
  { code:'33', name:'岡山県'   },
  { code:'34', name:'広島県'   },
  { code:'35', name:'山口県'   },
  { code:'36', name:'徳島県'   },
  { code:'37', name:'香川県'   },
  { code:'38', name:'愛媛県'   },
  { code:'39', name:'高知県'   },
  { code:'40', name:'福岡県'   },
  { code:'41', name:'佐賀県'   },
  { code:'42', name:'長崎県'   },
  { code:'43', name:'熊本県'   },
  { code:'44', name:'大分県'   },
  { code:'45', name:'宮崎県'   },
  { code:'46', name:'鹿児島県' },
  { code:'47', name:'沖縄県'   },
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
//  fetchMetaAreas — メタデータから町丁目CLASS一覧を取得
// ============================================================

async function fetchMetaAreas(statsDataId) {
  var url = ESTAT_BASE + '/getStatsData'
    + '?appId=' + ESTAT_APP_ID
    + '&lang=J'
    + '&statsDataId=' + statsDataId
    + '&limit=1'
    + '&metaGetFlg=Y';

  var json = await fetchJson(url);
  var sd = json.GET_STATS_DATA;
  if (!sd) return [];

  var classObjs = sd.STATISTICAL_DATA
    && sd.STATISTICAL_DATA.CLASS_INF
    && sd.STATISTICAL_DATA.CLASS_INF.CLASS_OBJ;
  if (!classObjs) return [];
  if (!Array.isArray(classObjs)) classObjs = [classObjs];

  var areaObj = classObjs.find(function(obj) { return obj['@id'] === 'area'; });
  if (!areaObj) return [];

  var classes = areaObj.CLASS;
  if (!classes) return [];
  if (!Array.isArray(classes)) classes = [classes];
  return classes;
}

// ============================================================
//  buildAreaList — CLASS一覧からareaMap（Map）を構築
// ============================================================

function buildAreaList(areaClasses) {
  // code → CLASS entry
  var classMap = new Map();
  areaClasses.forEach(function(c) { classMap.set(c['@code'], c); });

  // 親として登場するコードのセット（＝非末端）
  var parentCodes = new Set();
  areaClasses.forEach(function(c) {
    if (c['@parentCode']) parentCodes.add(c['@parentCode']);
  });

  // level1 ancestor を辿って @name を返す
  function findLevel1Name(code) {
    var visited = new Set();
    var cur = code;
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      var entry = classMap.get(cur);
      if (!entry) return '';
      if (String(entry['@level']) === '1') return entry['@name'];
      cur = entry['@parentCode'];
    }
    return '';
  }

  var map = new Map();
  areaClasses.forEach(function(c) {
    var level = String(c['@level']);
    // level1（市区町村）自体は除外
    if (level === '1') return;
    // 子を持つ中間階層は除外
    if (parentCodes.has(c['@code'])) return;

    var fullName  = c['@name'];
    var level1Name = findLevel1Name(c['@code']);
    if (!level1Name) return;

    // m = fullName から level1Name のプレフィックスを除去
    var m = fullName.startsWith(level1Name) ? fullName.substring(level1Name.length) : fullName;
    if (!m) return;

    // level1Name から ct / w を分解
    var ct, w;
    if (level1Name.includes('区')) {
      var idxShi = level1Name.indexOf('市');
      if (idxShi >= 0) {
        ct = level1Name.substring(0, idxShi + 1);  // 例: "大阪市"
        w  = level1Name.substring(idxShi + 1);      // 例: "北区"
      } else {
        // 東京都特別区など（市なし）
        ct = level1Name;  // 例: "千代田区"
        w  = '';
      }
    } else {
      ct = level1Name;  // 例: "高槻市"
      w  = '';
    }

    map.set(c['@code'], { c: c['@code'], ct: ct, w: w, m: m, s: 0, k: 0, ky: 0, jinko: 0 });
  });

  return map;
}

// ============================================================
//  都道府県1件処理
// ============================================================

async function processPref(pref, statsTables) {
  console.log('[' + pref.code + '] ' + pref.name + ' 処理開始');

  // 1. statsDataId 取得
  var popId   = findStatsId(statsTables, pref.code, pref.name, 'pop');
  var houseId = findStatsId(statsTables, pref.code, pref.name, 'house');
  console.log('  popId=' + (popId || '未取得') + '  houseId=' + (houseId || '未取得'));

  // 2. popId が見つからなければスキップ
  if (!popId) {
    console.warn('  人口・世帯データのstatsDataIdが見つかりません → スキップ');
    return [];
  }

  // 3. メタデータから町丁目CLASS一覧を取得
  console.log('  メタデータ（町丁目一覧）取得中...');
  var areaClasses = await fetchMetaAreas(popId);
  await sleep(200);
  console.log('  CLASS件数: ' + areaClasses.length);

  // 4. areaMap 構築
  var areaMap = buildAreaList(areaClasses);
  console.log('  areaMap: ' + areaMap.size + ' エリア');

  // コードフォールバック（11桁→10桁→9桁）
  function lookupArea(code) {
    var a = areaMap.get(code);
    if (!a && code.length === 11) {
      a = areaMap.get(code.substring(0, 10)) || areaMap.get(code.substring(0, 9));
    }
    return a;
  }

  // 5. 人口・世帯数取得
  console.log('  人口・世帯数 取得中...');
  var popVals = await fetchEstat(popId, '0010,0040', '1');
  await sleep(200);
  popVals.forEach(function(v) {
    var code = v['@area'];
    if (!code) return;
    var a = lookupArea(code);
    if (!a) return;
    var num = parseInt(v['$'], 10);
    if (isNaN(num) || v['$'] === '-') num = 0;
    if (v['@cat01'] === '0010') a.jinko = Math.max(a.jinko, num);
    if (v['@cat01'] === '0040') a.s     = Math.max(a.s,     num);
  });
  console.log('  人口・世帯: ' + popVals.length + ' 件');

  // 6. 住宅建て方取得
  if (houseId) {
    console.log('  住宅建て方 取得中...');
    var houseVals = await fetchEstat(houseId, '0020,0040', '1');
    await sleep(200);
    houseVals.forEach(function(v) {
      var code = v['@area'];
      if (!code) return;
      var a = lookupArea(code);
      if (!a) return;
      var num = parseInt(v['$'], 10);
      if (isNaN(num) || v['$'] === '-') num = 0;
      if (v['@cat01'] === '0020') a.k  = Math.max(a.k,  num);
      if (v['@cat01'] === '0040') a.ky = Math.max(a.ky, num);
    });
    console.log('  住宅建て方: ' + houseVals.length + ' 件');
  } else {
    console.warn('  住宅建て方データのstatsDataIdが見つかりませんでした');
  }

  // 7. setai フォールバック（jinko から推計）
  areaMap.forEach(function(a) {
    if (a.s === 0 && a.jinko > 0) a.s = Math.round(a.jinko / 2.1);
  });

  // 8. ct+w+m で集約（調査区単位の複数エントリを合算）
  var aggregated = new Map();
  areaMap.forEach(function(a) {
    var key = a.ct + '\0' + a.w + '\0' + a.m;
    var g = aggregated.get(key);
    if (!g) {
      aggregated.set(key, { c: a.c, ct: a.ct, w: a.w, m: a.m, s: a.s, k: a.k, ky: a.ky });
    } else {
      g.s  += a.s;
      g.k  += a.k;
      g.ky += a.ky;
      if (a.c.length < g.c.length) g.c = a.c;
    }
  });

  // 9. 出力配列生成
  var areas = [];
  aggregated.forEach(function(a) {
    areas.push({ c: a.c, ct: a.ct, w: a.w, m: a.m, s: a.s, k: a.k, ky: a.ky });
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

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log('data/ ディレクトリを作成しました');
  }

  var statsTables = await fetchAllStatsList();

  var indexData  = { prefectures: [], generated: new Date().toISOString().slice(0, 10) };
  var totalAreas = 0;
  var totalBytes = 0;
  var errors     = [];

  for (var i = 0; i < PREFS.length; i++) {
    var pref = PREFS[i];
    try {
      var areas = await processPref(pref, statsTables);

      var outPath = path.join(OUT_DIR, pref.code + '.json');
      var jsonStr = JSON.stringify(areas);
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

  var indexJson = JSON.stringify(indexData, null, 2);
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), indexJson, 'utf8');
  console.log('index.json 書き込み完了');

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
