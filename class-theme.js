(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.ClassTheme = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // 반 색은 학년 순서(오세아니아 → 아시아 → 아프리카 → 아메리카 → 유럽 → 아틀랜틱)를 따릅니다.
  // 어떤 반을 골라 보더라도 같은 반은 늘 같은 색입니다. 모두 흰 글자와 4.5:1 이상 대비입니다.
  const COLORS = ['#0E7C86', '#C2412D', '#9A6312', '#2F7A4A', '#6A4C9C', '#1D4E89'];
  // 반 이름에 맞춘 상징. 모르는 반 이름은 동그라미로 표시합니다.
  const EMBLEMS = {
    '오세아니아반': ['M2 15c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1', 'M2 9c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1'],
    '아시아반': ['M3 20l6-10 4 6 3-4 5 8z'],
    '아프리카반': ['M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10', 'M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1'],
    '아메리카반': ['M5 19c0-9 6-14 15-14 0 9-5 15-14 15', 'M5 19l7-7'],
    '유럽반': ['M4 21V9h3V6h3v3h4V6h3v3h3v12z', 'M10 21v-5h4v5'],
    '아틀랜틱반': ['M12 3a2 2 0 1 0 0 4a2 2 0 1 0 0-4', 'M12 7v14M5 13a7 7 0 0 0 14 0M8 11h8'],
  };
  const FALLBACK = ['M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12'];

  function colorFor(className, order) {
    const index = (order || []).indexOf(className);
    return COLORS[(index === -1 ? 0 : index) % COLORS.length];
  }
  // 반 엠블럼 요소(<span class="class-emblem"><svg/></span>)를 만듭니다. 글자는 따로 붙입니다.
  function emblem(doc, className, order) {
    const box = doc.createElement('span');
    box.className = 'class-emblem';
    box.style.setProperty('--class-color', colorFor(className, order));
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    (EMBLEMS[className] || FALLBACK).forEach(d => {
      const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.append(path);
    });
    box.append(svg);
    return box;
  }
  return {COLORS, colorFor, emblem};
});
