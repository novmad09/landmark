# 네이티브(Capacitor) 묶을 때 챙길 것 — 스토어 심사 기준

## iOS — Info.plist 문구 (한국어)
```
NSLocationWhenInUseUsageDescription = 랜드마크 인증 반경 안에 있는지 확인할 때만 위치를 씁니다. 위치는 서버로 보내지 않아요.
NSCameraUsageDescription            = 다녀온 곳의 사진을 찍어 남길 때 카메라를 씁니다.
NSPhotoLibraryUsageDescription      = 사진첩에서 골라 랜드마크 사진으로 올릴 때 씁니다.
NSPhotoLibraryAddUsageDescription   = 만든 그림(여행 카드·뱃지)을 사진첩에 저장할 때 씁니다.
# 근처 알림(지오펜싱)을 켤 때만:
NSLocationAlwaysAndWhenInUseUsageDescription = 앱을 닫아 둬도 랜드마크 근처에 가면 알려 드리기 위해 씁니다. 꺼도 도장은 찍을 수 있어요.
```
- `PrivacyInfo.xcprivacy` 필수: UserDefaults(CA92.1), FileTimestamp(C617.1) 사유 선언. Capacitor 기본 플러그인이 쓰는 항목.
- 소셜 로그인(카카오)을 넣으면 **Sign in with Apple 도 반드시** 함께 제공 (지침 4.8).
- 계정 생성이 있으면 앱 안에서 **계정 삭제** 제공 (5.1.1(v)) → 내 정보 → 계정·기록 삭제 (구현됨).
- 사용자 생성 콘텐츠(1.2): 신고 · 차단 · 필터 · 운영 연락처 — 신고/차단/욕설 필터 구현됨, 연락처는 개인정보처리방침에.
- 제출 빌드에서 `testMode`가 켜진 흔적(테스트 배지·테스트 위치 칩)이 보이면 2.1 위반 → config.js `testMode:false` 확인.
- 앱 심사용 메모에 "서울 종로구 경복궁 광화문 앞에서 도장 테스트 가능" + 테스트 계정 적기.

## Android — AndroidManifest
```
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>   <!-- Android 13+ 런타임 요청 -->
<uses-permission android:name="android.permission.VIBRATE"/>
<!-- READ_MEDIA_IMAGES 는 쓰지 않는다: 사진은 시스템 사진 선택기(Photo Picker)로 -->
<!-- 근처 알림을 켤 때만: ACCESS_BACKGROUND_LOCATION + 플레이 콘솔 '민감 권한 선언' + 앱 안 '눈에 띄는 고지' 화면 -->
```
- 타겟 SDK: 신규 앱 35 이상(2026년 8월 이후 36). 16KB 페이지 크기 지원(네이티브 라이브러리 확인).
- 데이터 안전 양식: 위치(앱 사용 중, 수집·미공유), 사진(사용자 콘텐츠), 닉네임, 앱 활동. 암호화 전송 예, 삭제 요청 가능 예, 삭제 링크 = legal/delete.html 주소.
- 계정 삭제: 앱 안(구현됨) + 웹 페이지(legal/delete.html) 둘 다 필요.
- 사용자 생성 콘텐츠 정책: 신고·차단 구현됨.

## 둘 다
- 알림: 네이티브는 `@capacitor/local-notifications`(밤 10시 로컬 알림, 코드에 이미 연결됨), 공유는 `@capacitor/share` + `@capacitor/filesystem` (코드에 연결됨). `npm i @capacitor/local-notifications @capacitor/share @capacitor/filesystem` 후 sync.
- 개인정보처리방침 URL을 스토어 메타데이터와 앱 안(내 정보) 둘 다에.
- 사진 업로드는 Capacitor Camera 플러그인(시스템 선택기) 사용 → 앨범 전체 권한 요청 안 함.
- 알림 권한은 첫 도장 뒤 한 번만 묻는다(구현됨). 거부해도 기능 막지 않음.
- 산·바다 안전 고지(약관 3조).
