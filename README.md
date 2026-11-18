# 랜드마크 도장

대한민국 랜드마크에 직접 가서 먹 도장을 찍어 모으는 여행 도감 앱. 웹앱(PWA)으로 만들었고 Capacitor로 감싸 iOS·Android 스토어에 올린다.

## 바로 실행 (로컬 모드)

```
npm run dev        # 또는 python3 -m http.server 8080
```
브라우저에서 http://localhost:8080 열기. 폰에서 보려면 같은 와이파이의 PC IP로 접속.
**GPS는 https 또는 localhost에서만 동작**한다. 폰 테스트는 아래 "폰에서 GPS 테스트" 참고.

로컬 모드는 Supabase 없이 돌아가며 도장·사진이 기기 안(localStorage/IndexedDB)에만 저장된다. 손맛·화면 확인용.

## 서버 모드 (Supabase)

1. https://supabase.com 에서 프로젝트 생성 (리전: Northeast Asia (Seoul) 권장)
2. SQL Editor에서 `supabase/schema.sql` 실행 → `supabase/seed.sql` 실행
3. Storage > New bucket: 이름 `photos`, **Public** 체크
4. Authentication > Providers: Kakao, Apple 켜기 (각 개발자 콘솔에서 발급한 키 입력)
   - Redirect URL에 앱 주소(예: `https://내도메인/`)와 Capacitor 스킴 추가
5. `js/config.js`에 `supabaseUrl`, `supabaseAnonKey` 입력
6. 새로고침하면 로그인 버튼이 카카오/Apple로 바뀌고 도장·사진이 서버에 저장된다

판정(거리·하루 1회·좋아요 집계)은 모두 서버 RPC(`stamp`, `toggle_like`)에서 한다. 앱은 표시만.

## 랜드마크 데이터 (한국관광 100선 100곳)

지금은 예시 33곳이 `js/data.js`에 들어 있다. 100곳 전체는:

```
export TOURAPI_KEY='공공데이터포털 인증키'
python3 tools/import_tourapi.py tools/landmarks.csv
```
- `tools/landmarks.csv`에 100곳의 id·이름·검색어·카테고리·반경을 적는다
- 생성된 `tools/landmarks.generated.js` → `js/data.js`의 `window.LANDMARKS`로 교체
- 생성된 `tools/seed.generated.sql` → Supabase에서 실행
- **좌표는 반드시 지도에서 하나씩 확인**하고 인증 지점(정문·정상석)으로 보정. TourAPI 좌표가 엉뚱한 경우가 있다.
- 공식 사진은 공공누리 유형을 확인해 `official_photo_license`에 기록 (3유형은 크롭·합성 금지)

## 폰에서 GPS 테스트

- 가장 쉬운 방법: `npx serve -s . --ssl-cert ...` 대신 **ngrok** 또는 **Cloudflare Tunnel**로 https 주소를 만들어 폰에서 연다
- 또는 Capacitor로 빌드해 실제 앱으로 설치 (아래)

## 스토어용 앱 빌드 (Capacitor)

```
npm install
npm run cap:init         # ios/, android/ 폴더 생성 (최초 1회)
npm run ios              # Xcode 열림 → 실기기 실행 / Archive
npm run android          # Android Studio 열림
```
- iOS: Xcode에서 Signing 설정, `Info.plist`의 `NSLocationWhenInUseUsageDescription` =
  "랜드마크에 도착했는지 확인하고 도장을 찍기 위해 현재 위치를 사용합니다."
- Android: `AndroidManifest.xml`에 `ACCESS_FINE_LOCATION`, `VIBRATE` 권한
- 백그라운드 위치는 요청하지 않는다 (심사 리스크)
- 햅틱은 웹 `navigator.vibrate` 기준. iOS에서 더 강한 햅틱이 필요하면 `@capacitor/haptics` 플러그인 추가

## 구조

```
index.html          화면 뼈대 (지도 / 도감 / 내 정보 / 상세)
css/app.css         디자인 토큰 + 전 화면 스타일 (라이트/다크)
js/config.js        설정 (Supabase 키, 타일 주소, 반경·정확도 기준)
js/data.js          랜드마크·세트·카테고리 데이터
js/store.js         저장소 (로컬 ↔ Supabase 같은 인터페이스)
js/map.js           지도 화면: MapLibre 스타일, 스티커 마커, 지역 묶음, 바텀시트, GPS
js/stamp.js         먹 도장 애니메이션 (타이밍은 T 상수)
js/app.js           탭, 도감, 상세, 사진·좋아요, 로그인, 흐름 연결
supabase/           schema.sql, seed.sql
tools/              TourAPI 수집 스크립트
vendor/             maplibre-gl 4.7.1, supabase-js 2.45.4 (오프라인 동작용)
```

## 라이선스 표기 (앱 안 "내 정보"에 표시됨)

- 지도 데이터 © OpenStreetMap 기여자 (ODbL) · 타일 OpenFreeMap / OpenMapTiles
- 서체: 도현체, IBM Plex Sans KR (SIL Open Font License)
- 라이브러리: MapLibre GL JS (BSD-3), supabase-js (MIT)

OpenFreeMap 공용 서버는 무료지만 대량 트래픽 시 자체 호스팅을 검토한다. 타일을 앱에 캐시·배포하지 않는다.
