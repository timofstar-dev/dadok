# 다독다독 세계여행

정적 HTML/CSS/JavaScript 독서 기록 앱입니다. 별도 빌드나 npm 설치 없이 실행할 수 있습니다.

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

대시보드는 전교생·반별 탐험가를 표시합니다. 기존 대륙 도착 기준(0, 700, 900, 1600, 1800, 2300, 3000걸음)을 유지하며, 대륙 사이의 진행 위치를 계산합니다. 이름표는 충돌하지 않는 가까운 자리에 표시하고, 탐험가를 누르면 경로상의 정확한 위치와 남은 걸음, 도착 도장을 확인할 수 있습니다. 학생 수가 많으면 지도가 세로로 늘어납니다. 작은 화면에서는 지도 안을 스크롤해 이동합니다.

- `journey-model.js`: 이동 거리와 겹치지 않는 이름표 배치 계산
- `journey.js`: 반별 조회, 탐험가 선택, 도장, 도착 효과
- `journey.css`, `images/travel-world.svg`: 대시보드와 그림 지도
- `index.html`: 기존 기록·리더보드·대시보드 통합

앱 데이터는 `index.html`의 Google Apps Script API에서 읽습니다. API 서버 코드는 이 저장소에 포함되어 있지 않습니다. 도착 효과는 이 페이지가 이미 읽었던 기록보다 새로 조회한 걸음이 늘어 대륙 기준을 넘었을 때 표시합니다. 자동 폴링이나 서버 점수 계산 방식은 변경하지 않았습니다.

## 검증

```sh
node --test tests/journey-model.test.js
python3 tests/journey-browser.py
```

브라우저 검증에는 Python Playwright와 `/usr/bin/chromium`이 필요합니다. 테스트는 임시 로컬 서버와 가상 학생 데이터로 실행되며 실제 API로 기록을 전송하지 않습니다. 기존 Bulma CSS만 TLS 검증을 유지한 채 내려받아 `/tmp/dadok-bulma.css`에 캐시합니다. 화면 캡처는 `/tmp/dadok-world-map.png`, `/tmp/dadok-expedition-desktop.png`, `/tmp/dadok-expedition-mobile.png`에 생성합니다.

## 책 검색 도우미

`기록하기` 탭 위의 **책 검색 도우미**를 열면 제목 검색 → 판본 선택 → 저자·전체 쪽수 확인 → 적용 순서로 사용할 수 있습니다. **제목·지은이만 적용**은 기존 읽은 페이지 수를 보존합니다. **다 읽었어요**는 제목과 전체 쪽수를 함께 입력합니다. 검색이나 판본 선택만으로 입력값을 바꾸거나 독서 기록을 저장하지 않습니다.

- `book-catalog.js`: Google Books 공개 Volumes API의 검색·개별 판본 조회. 학생 정보는 보내지 않고 검색 제목만 전송합니다.
- `book-helper.js`, `book-helper.css`: 독립 검색 메뉴, 판본 목록, 정보 확인·적용. 저자 또는 쪽수가 없으면 추측하지 않으며, 쪽수 적용 버튼을 비활성화합니다.
- 별도 API 키나 Apps Script 변경 없이 공개 API를 호출합니다. Google Books의 검색 범위·할당량·CORS 정책에 따라 검색이 제한될 수 있으며, 검색 실패 시 기존 직접 입력은 계속 사용할 수 있습니다. YES24·교보문고 연동은 포함하지 않습니다.
- 클라우드 검증에는 `www.googleapis.com` HTTPS 접근이 필요합니다. 도메인 추가는 환경 설정 초안에 저장했으나, 이번 작업에서 실제 API 응답은 네트워크 정책에 막혀 검증하지 못했습니다. 테스트 성공은 외부 서비스 가용성을 보장하지 않습니다.

```sh
node --test tests/book-catalog.test.js
python3 tests/book-helper-browser.py
```

브라우저 테스트는 가상 도서와 학생 데이터로 판본 선택, 기존 입력값 보존, 쪽수 누락, 검색 실패, 응답 순서 역전, 키보드·모바일 화면을 검증합니다. 실제 API로 독서 기록을 전송하지 않습니다. 예시 화면은 `/tmp/dadok-book-helper.png`에 생성됩니다.
