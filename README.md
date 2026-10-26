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
