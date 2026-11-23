/* 앱 설정. Supabase 값을 채우면 서버 모드, 비우면 로컬 모드(기기 안에만 저장) */
window.APP_CONFIG = {
  version: '0.81',          // 내 정보 하단에 표시. 배포마다 올린다
  cloudUrl: 'https://sdsahthvnasdvlqqxtjo.supabase.co',           // 서버(Supabase) 주소
  cloudKey: 'sb_publishable_22LDwk-_OAQ_NfRu5uzrSQ_BaaDVEOk',    // 공개용 키 (앱에 넣어도 되는 키. secret 키는 절대 넣지 않는다)
  logins: ['google', 'kakao', 'naver'],      // 로그인 수단. 서버에 설정을 마친 것만 적는다: 'google', 'kakao', 'naver', 'apple'
  supabaseUrl: '',          // 예: 'https://xxxx.supabase.co'
  supabaseAnonKey: '',      // Supabase 프로젝트 anon public key
  tiles: 'https://tiles.openfreemap.org/planet', // OpenStreetMap 벡터 타일 (OpenFreeMap, 키 불필요)
  radiusDefault: 50,       // 기본 인증 반경 (m)
  maxAccuracy: 60,          // 이보다 GPS 오차가 크면 도장 버튼 비활성 (m)
  photoMaxEdge: 1600,       // 업로드 사진 긴 변 (px)
  photosPerDay: 1,          // 한 명소에 하루 한 장 (명소가 다르면 각각 한 장씩)
  testMode: true,           // true면 반경 밖에서도 도장 찍기 가능 (출시 전 false 로!)
};
