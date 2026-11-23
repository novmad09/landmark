// 네이버 회원 정보를 Supabase 로그인(직접 추가한 로그인 수단)이 읽는 모양으로 풀어서 돌려준다.
// 네이버는 { response: { id, ... } } 처럼 한 겹 감싸서 주는데, Supabase 는 맨 바깥의 sub 를 찾는다.
// 받은 네이버 토큰을 그대로 네이버에 전달할 뿐, 어디에도 저장하지 않는다. 이메일은 넘기지 않는다.
// 배포: Supabase 대시보드 > Edge Functions > naver-userinfo (Verify JWT 끔)
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  const auth = req.headers.get("authorization") || "";
  if (!/^bearer\s+\S+/i.test(auth)) return json({ error: "missing_token" }, 401);
  let r: Response;
  try {
    r = await fetch("https://openapi.naver.com/v1/nid/me", { headers: { Authorization: auth } });
  } catch (_e) {
    return json({ error: "naver_unreachable" }, 502);
  }
  const j = await r.json().catch(() => ({}));
  const p = j && j.response;
  if (!r.ok || !p || !p.id) return json({ error: "naver_rejected", code: (j && j.resultcode) || String(r.status) }, 401);
  const name = p.nickname || p.name || "";
  return json({ sub: String(p.id), name, nickname: name, preferred_username: name, picture: p.profile_image || "" });
});
