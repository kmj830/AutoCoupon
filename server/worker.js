/**
 * Cloudflare Worker: FC 온라인 쿠폰 중앙 배포 + 다중 소스 자동 크롤링 서버
 * 
 * [수집 대상]
 * 1. FC 온라인 인벤 팁과 노하우 (쿠폰 탭)
 * 2. FC 온라인 공식 홈페이지 공지사항 (공식 쿠폰 및 이벤트)
 */

export default {
  // 1. Cron Trigger: 주기적 백그라운드 자동 수집
  async scheduled(event, env, ctx) {
    ctx.waitUntil(crawlAllSources(env));
  },

  // 2. HTTP 요청 핸들러
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // [API] 쿠폰 목록 조회 (클라이언트가 1시간마다 조회)
    if (url.pathname === "/api/coupons" && request.method === "GET") {
      // 마지막 크롤링 후 30분 이상 지났으면 자동 크롤링 수행
      const lastCrawl = await getLastCrawlTime(env);
      if (Date.now() - lastCrawl > 30 * 60 * 1000) {
        ctx.waitUntil(crawlAllSources(env));
      }

      const coupons = await getCoupons(env);
      return new Response(JSON.stringify(coupons), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // [API] 즉시 자동 크롤링 실행 (웹 버튼 또는 API)
    if (url.pathname === "/api/crawl" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        if (env.ADMIN_PASSWORD && body.password !== env.ADMIN_PASSWORD) {
          return new Response(JSON.stringify({ error: "비밀번호가 올바르지 않습니다." }), {
            status: 403,
            headers: corsHeaders,
          });
        }

        const crawled = await crawlAllSources(env);
        return new Response(JSON.stringify({ success: true, count: crawled.length, coupons: crawled }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // [API] 수동 쿠폰 등록
    if (url.pathname === "/api/coupons" && request.method === "POST") {
      try {
        const body = await request.json();
        if (env.ADMIN_PASSWORD && body.password !== env.ADMIN_PASSWORD) {
          return new Response(JSON.stringify({ error: "관리자 비밀번호가 일치하지 않습니다." }), {
            status: 403,
            headers: corsHeaders,
          });
        }

        const newCode = (body.code || "").trim();
        if (!newCode) {
          return new Response(JSON.stringify({ error: "쿠폰 코드를 입력하세요." }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        const coupons = await getCoupons(env);
        if (!coupons.includes(newCode)) {
          coupons.unshift(newCode);
          await saveCoupons(env, coupons);
        }

        return new Response(JSON.stringify({ success: true, coupons }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // [API] 실패/만료 쿠폰 자동 신고 및 즉시 영구 제외
    if (url.pathname === "/api/coupons/report" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const code = (body.code || "").trim();
        const status = body.status; // EXPIRED, INVALID
        if (code && (status === "EXPIRED" || status === "INVALID")) {
          // 1. 활성 쿠폰 목록에서 즉시 제거
          let coupons = await getCoupons(env);
          coupons = coupons.filter((c) => c !== code);
          await saveCoupons(env, coupons);

          // 2. 블랙리스트에 추가 (크롤러가 다시 긁어오지 않도록 차단)
          await addToBlacklist(env, code);

          return new Response(JSON.stringify({ success: true, removed: code, remaining: coupons.length }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ success: false, message: "무효한 신고" }), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 모바일/웹 관리자 UI
    if (url.pathname === "/") {
      return new Response(renderAdminHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};

// ==========================================
// 통합 크롤러 엔진 (인벤 + 넥슨 공식 공지)
// ==========================================
async function crawlAllSources(env) {
  const discovered = [];

  // 1. 인벤 팁과 노하우 (쿠폰 탭)
  try {
    const invenUrl = "https://www.inven.co.kr/board/fifaonline4/3145?category=%EC%BF%A0%ED%8F%B0";
    const res = await fetch(invenUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });

    if (res.ok) {
      const html = await res.text();
      const pattern = /<a[^>]+class=["'][^"']*subject-link[^"']*["'][^>]*>(.*?)<\/a>/gis;
      const matches = [...html.matchAll(pattern)];

      for (const match of matches) {
        let title = match[1].replace(/<[^>]+>/g, "").trim();
        if (title.includes("안내드립니다") || title.includes("공지") || title.includes("영상")) continue;
        title = title.replace(/\[.*?\]/g, "").trim();

        for (let p of title.split(/[\n/,|]/)) {
          p = p.replace(/^(쿠폰\s*[:\-]|\s*코드\s*[:\-]|\s*K리그\s*[:\-])/, "").trim();
          const code = p.replace(/[^가-힣a-zA-Z0-9]/g, "");
          if (isValidCoupon(code)) discovered.push(code);
        }
      }
    }
  } catch (e) {
    console.error("인벤 크롤링 실패:", e);
  }

  // 2. FC 온라인 공식 홈페이지 공지사항
  try {
    const noticeUrl = "https://fconline.nexon.com/news/notice/list";
    const res = await fetch(noticeUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });

    if (res.ok) {
      const html = await res.text();
      // 공지 제목 중 '쿠폰' 키워드가 들어간 글 탐색
      const noticePattern = /<a[^>]+href=["'][^"']*\/notice\/view[^"']*["'][^>]*>(.*?)<\/a>/gis;
      const matches = [...html.matchAll(noticePattern)];

      for (const match of matches) {
        const text = match[1].replace(/<[^>]+>/g, "").trim();
        if (text.includes("쿠폰")) {
          for (let p of text.split(/[\n/,|]/)) {
            p = p.replace(/^(쿠폰\s*[:\-]|\s*코드\s*[:\-])/, "").trim();
            const code = p.replace(/[^가-힣a-zA-Z0-9]/g, "");
            if (isValidCoupon(code)) discovered.push(code);
          }
        }
      }
    }
  } catch (e) {
    console.error("공식 공지 크롤링 실패:", e);
  }

  // 3. 에펨코리아 FC 온라인 게시판 (쿠폰 탭)
  try {
    const fmkoreaUrl = "https://www.fmkorea.com/index.php?mid=fifa_online&category=5746170222";
    const res = await fetch(fmkoreaUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (res.ok) {
      const html = await res.text();
      // 게시글 링크 추출 (document_srl 포함된 링크)
      const pattern = /<a[^>]+href=["'][^"']*document_srl=([0-9]+)[^"']*["'][^>]*>(.*?)<\/a>/gis;
      const matches = [...html.matchAll(pattern)];

      for (const match of matches) {
        let title = match[2].replace(/<[^>]+>/g, "").trim();
        if (title.includes("공지") || title.includes("팁글모음") || title.includes("안내") || /^\d+$/.test(title)) continue;

        for (let p of title.split(/[\n/,|]/)) {
          p = p.replace(/^(?:\d+차\s*(?:쿠폰)?|FC\s*PRO\s*(?:쿠폰)?|쿠폰\s*코드|쿠폰|코드|K리그)\s*[:\-]?\s*/i, "").trim();
          const code = p.replace(/[^가-힣a-zA-Z0-9]/g, "");
          if (isValidCoupon(code)) discovered.push(code);
        }
      }
    }
  } catch (e) {
    console.error("에펨코리아 크롤링 실패:", e);
  }

  // 기존 목록과 병합 (블랙리스트 제외)
  const blacklist = await getBlacklist(env);
  const current = await getCoupons(env);
  const set = new Set(current);
  for (const code of discovered) {
    if (!blacklist.has(code)) {
      set.add(code);
    }
  }

  const updated = Array.from(set).filter((c) => !blacklist.has(c));
  await saveCoupons(env, updated);
  await setLastCrawlTime(env, Date.now());

  return updated;
}

function isValidCoupon(code) {
  if (!code || code.length < 4 || code.length > 25) return false;
  // 게시글 제목 등에 흔히 쓰이는 문장형 단어 및 노이즈 완벽 차단
  const noise = [
    "안내드립니다", "감사합니다", "댓글", "추천", "쿠폰모음", 
    "정기점검", "사전안내", "오류안내", "이상한데", "3개", "CHAMPIONS",
    "싫어요", "누구", "시간", "수정", "완료", "기회", "가려라", "마지막",
    "페이지", "승부", "한걸음", "결승", "남은", "모음", "시작", "입니다",
    "진짜", "어쩌구", "알려", "확인", "등록", "팁글", "공지", "DAY", "day"
  ];
  if (noise.some((n) => code.includes(n))) return false;
  
  // 8자 이상인데 숫자가 전혀 없는 순수 한글 문장형 제목 제외 (FC 온라인 쿠폰은 통상 영문/숫자 혼용)
  if (/^[가-힣]{8,}$/.test(code) && !code.endsWith("쿠폰")) return false;
  
  return true;
}

// ==========================================
// 저장소 관리 헬퍼
// ==========================================
let memoryCoupons = ["한글날슛패스골MIX109", "대한민국팀LETSGO111", "지지않아GOGO333", "FIGHT싸워555", "베네수엘라전베네핏쿠폰"];
let memoryBlacklist = new Set();
let memoryLastCrawl = 0;

async function getBlacklist(env) {
  if (env && env.COUPONS_KV) {
    const raw = await env.COUPONS_KV.get("blacklist_coupons");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  }
  return memoryBlacklist;
}

async function addToBlacklist(env, code) {
  const bl = await getBlacklist(env);
  bl.add(code);
  const arr = Array.from(bl);
  if (env && env.COUPONS_KV) {
    await env.COUPONS_KV.put("blacklist_coupons", JSON.stringify(arr));
  } else {
    memoryBlacklist = bl;
  }
}

async function getCoupons(env) {
  if (env && env.COUPONS_KV) {
    const raw = await env.COUPONS_KV.get("active_coupons");
    return raw ? JSON.parse(raw) : [];
  }
  return memoryCoupons;
}

async function saveCoupons(env, coupons) {
  if (env && env.COUPONS_KV) {
    await env.COUPONS_KV.put("active_coupons", JSON.stringify(coupons));
  } else {
    memoryCoupons = coupons;
  }
}

async function getLastCrawlTime(env) {
  if (env && env.COUPONS_KV) {
    const raw = await env.COUPONS_KV.get("last_crawl_time");
    return raw ? parseInt(raw, 10) : 0;
  }
  return memoryLastCrawl;
}

async function setLastCrawlTime(env, timestamp) {
  if (env && env.COUPONS_KV) {
    await env.COUPONS_KV.put("last_crawl_time", timestamp.toString());
  } else {
    memoryLastCrawl = timestamp;
  }
}

function renderAdminHtml() {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FC 온라인 쿠폰 관리 서버</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 500px; margin: 20px auto; padding: 15px; background: #f8fafc; color: #1e293b; }
    h1 { font-size: 20px; text-align: center; color: #0284c7; }
    .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin-bottom: 20px; }
    input { width: 100%; box-sizing: border-box; padding: 12px; margin: 8px 0; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 16px; }
    button { width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 6px; }
    button:active { background: #0369a1; }
    .btn-sync { background: #10b981; margin-bottom: 15px; }
    .btn-sync:active { background: #059669; }
    .coupon-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #f1f5f9; }
    .del-btn { width: auto; padding: 6px 12px; background: #ef4444; font-size: 13px; margin: 0; }
  </style>
</head>
<body>
  <h1>⚽ FC 온라인 쿠폰 배포 서버 <span style="font-size: 13px; color: #10b981; font-weight: normal;">(v1.1 GitHub 자동 배포 연동됨)</span></h1>

  <div class="card">
    <button class="btn-sync" onclick="triggerCrawl()">🔄 인벤 + 펨코 + 공식홈 실시간 자동 수집</button>
    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
    <h3>수동 쿠폰 추가</h3>
    <input type="password" id="pw" placeholder="관리자 비밀번호 입력">
    <input type="text" id="code" placeholder="쿠폰 코드 직접 입력">
    <button onclick="addCoupon()">쿠폰 배포하기</button>
  </div>

  <div class="card">
    <h3>현재 활성 쿠폰 목록</h3>
    <div id="list">불러오는 중...</div>
  </div>

  <script>
    async function load() {
      const res = await fetch('/api/coupons');
      const list = await res.json();
      const div = document.getElementById('list');
      if (!list.length) { div.innerHTML = '<p style="color:#94a3b8">등록된 쿠폰이 없습니다.</p>'; return; }
      div.innerHTML = list.map(c => \`
        <div class="coupon-item">
          <b>\${c}</b>
          <button class="del-btn" onclick="delCoupon('\${c}')">삭제</button>
        </div>
      \`).join('');
    }

    async function triggerCrawl() {
      const pw = document.getElementById('pw').value || prompt('관리자 비밀번호 입력:');
      if (!pw) return;
      const btn = document.querySelector('.btn-sync');
      btn.innerText = '수집 중...';
      try {
        const res = await fetch('/api/crawl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pw })
        });
        const data = await res.json();
        if (data.error) alert(data.error);
        else {
          alert('최신 쿠폰 ' + data.count + '개를 자동 수집했습니다!');
          load();
        }
      } catch (e) {
        alert('수집 실패: ' + e.message);
      } finally {
        btn.innerText = '🔄 인벤 + 펨코 + 공식홈 실시간 자동 수집';
      }
    }

    async function addCoupon() {
      const pw = document.getElementById('pw').value;
      const code = document.getElementById('code').value.trim();
      if (!pw || !code) return alert('비밀번호와 코드를 모두 입력하세요');
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw, code })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else { alert('배포 완료!'); document.getElementById('code').value = ''; load(); }
    }

    async function delCoupon(code) {
      const pw = document.getElementById('pw').value || prompt('비밀번호 입력');
      if (!pw) return;
      await fetch('/api/coupons', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw, code })
      });
      load();
    }

    load();
  </script>
</body>
</html>`;
}
