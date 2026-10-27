# 다독다독 세계여행

HTML/CSS/JavaScript 독서 기록 앱입니다. Cloudflare Pages에서 제공하며, 책 검색은 Pages Functions를 사용합니다. 화면만 확인할 때는 별도 빌드 없이 실행할 수 있습니다(이 서버에서는 책 검색 API를 제공하지 않습니다).

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

- `book-catalog.js`: 같은 앱의 `/api/books/search`, `/api/books/details` 호출과 판본 검증.
- `functions/api/books/`, `functions/_lib/yes24.js`: YES24 검색 페이지와 선택한 상품의 상세 정보를 서버에서 읽습니다. 제목·저자·출판사·출간일·ISBN·전체 쪽수를 반환합니다. 학생 정보는 보내지 않고 검색 제목과 상품 번호만 전송합니다.
- `book-helper.js`, `book-helper.css`: 독립 검색 메뉴, 판본 목록, 정보 확인·적용. 저자 또는 쪽수가 없으면 추측하지 않으며, 쪽수 적용 버튼을 비활성화합니다.
- 자동 정보 조회는 YES24를 사용합니다. **YES24에서 검색**, **교보문고에서 검색**은 현재 제목을 해당 서점의 새 창으로 전달합니다. 교보문고 정보를 자동으로 입력하는 기능은 아닙니다.
- 별도 API 키나 Apps Script 변경은 필요 없습니다. Cloudflare Pages 배포 시 `functions/`와 `_routes.json`을 포함해야 합니다. `_routes.json`은 `/api/books/*`만 함수로 처리합니다. 일반 정적 호스팅에서는 자동 검색이 동작하지 않습니다.
- YES24 공개 HTML을 읽는 방식이므로 서점의 페이지 구조 변경이나 접속 제한 시 조회가 실패할 수 있습니다. 오류 응답은 캐시하지 않으며 검색 결과는 10분, 상세 정보는 6시간 서버 캐시합니다. 실패할 때에도 서점 직접 검색과 기존 수동 입력은 사용할 수 있습니다.

Functions를 포함한 로컬 실행(최초 실행 시 Wrangler 설치):

```sh
npx wrangler@4.153.0 pages dev . --compatibility-date=2026-07-01
```

서버 테스트는 Cloudflare의 실제 HTMLRewriter 런타임(Miniflare)을 사용합니다. 개발 의존성 설치 후 실행합니다.

```sh
npm ci
npm test
python3 tests/book-helper-browser.py
```

브라우저 테스트는 가상 도서와 학생 데이터로 판본 선택, 기존 입력값 보존, 쪽수 누락, 검색 실패, 응답 순서 역전, 서점 바로가기, 키보드·모바일 화면을 검증합니다. 실제 API로 독서 기록을 전송하지 않습니다. 예시 화면은 `/tmp/dadok-book-helper.png`에 생성됩니다. 외부 서비스 가용성은 이 회귀 테스트와 별도로 배포 후 실제 검색으로 확인해야 합니다.

2026-10-27 YES24 실제 검색·상세 HTML에서 『푸른 사자 와니니』(상품 번호 18841857, 이현, 창비, 216쪽, ISBN 9788936442804)를 확인했습니다. `tests/fixtures/yes24/`는 이때 받은 공개 페이지에서 파싱에 필요한 부분을 발췌한 회귀 테스트 자료입니다.
