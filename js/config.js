/* 앱 설정. Supabase 값을 채우면 서버 모드, 비우면 로컬 모드(기기 안에만 저장) */
window.APP_CONFIG = {
  version: '0.96',          // 내 정보 하단에 표시. 배포마다 올린다
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
  memory: false,            // 사진첩에서 다녀온 곳 찾기(추억 사진). 뺐다. true로 바꾸면 메뉴와 첫 실행 안내가 다시 나온다
  coverLikes: 10,           // 명소 대표 사진이 되려면 받아야 하는 추천 수
  testMode: false,          // true면 처음부터 테스트 모드. false면 숨은 문(지도 위쪽 '랜드마크' 글자 10번 + 암호)을 연 폰에서만 켤 수 있다
  devKey: '1h09ufc',         // 테스트 메뉴 암호의 해시 (암호 자체는 적지 않는다)
};
