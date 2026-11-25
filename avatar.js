(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.Avatar = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // 탐험가 캐릭터와 탈것 그림. 모든 색과 모양은 아래 목록에서만 고르므로,
  // 저장된 값이 무엇이든 그림에 다른 글자가 끼어들 수 없습니다.
  const SKINS = [['#FBE3CF', '밝은 피부'], ['#F2C9A5', '중간 피부'], ['#D9A27A', '갈색 피부'], ['#9C6A47', '진한 피부']];
  const HAIR_COLORS = [['#2B2321', '검은색'], ['#5A3A24', '갈색'], ['#A8692E', '밤색'], ['#D9A93E', '금색'], ['#7A4FA0', '보라색']];
  const HAIRS = [['short', '짧은 머리'], ['bob', '단발'], ['long', '긴 머리'], ['curly', '곱슬']];
  const BODIES = [['boy', '남자 탐험가'], ['girl', '여자 탐험가']];
  // 대륙에 도착할 때마다 바뀌는 탈것. 순서는 JourneyModel.STOPS와 같습니다(남극 = 세계 일주).
  const VEHICLES = [
    {id: 'walk', name: '걸어서'}, {id: 'bike', name: '자전거'}, {id: 'car', name: '자동차'}, {id: 'boat', name: '배'},
    {id: 'train', name: '기차'}, {id: 'plane', name: '비행기'}, {id: 'rocket', name: '우주선'},
  ];
  const DEFAULT_LOOK = {body: 'boy', skin: 1, hair: 'short', hairColor: 0};
  const SAFE_COLOR = /^#[0-9A-Fa-f]{6}$/;

  function normalize(look) {
    const pick = (value, list, fallback) => (list.some(([id]) => id === value) ? value : fallback);
    const index = (value, list, fallback) => (Number.isInteger(Number(value)) && list[Number(value)] ? Number(value) : fallback);
    return {
      body: pick(look && look.body, BODIES, DEFAULT_LOOK.body),
      skin: index(look && look.skin, SKINS, DEFAULT_LOOK.skin),
      hair: pick(look && look.hair, HAIRS, DEFAULT_LOOK.hair),
      hairColor: index(look && look.hairColor, HAIR_COLORS, DEFAULT_LOOK.hairColor),
    };
  }
  const color = c => (SAFE_COLOR.test(c) ? c : '#4A5D82');
  const describe = look => {
    const l = normalize(look);
    const name = (list, id) => list.find(([key]) => key === id)[1];
    return `${name(BODIES, l.body)}, ${SKINS[l.skin][1]}, ${HAIR_COLORS[l.hairColor][1]} ${name(HAIRS, l.hair)}`;
  };
  function vehicleIndex(journey) {
    return Math.max(0, Math.min(VEHICLES.length - 1, (journey && journey.visited ? journey.visited.length : 1) - 1));
  }

  // 작은 머리(지도 표시용). (cx, cy) 중심, 반지름 r.
  // 긴 머리의 뒷머리. length = 얼굴 중심에서 아래로 내려오는 길이(머리 반지름의 1/6 단위).
  function backHairMarkup(look, cx, cy, r, length) {
    const l = normalize(look);
    if (l.hair !== 'long') return '';
    const k = r / 6, X = v => (cx + v * k).toFixed(2), Y = v => (cy + v * k).toFixed(2);
    return `<path d="M${X(-6.4)} ${Y(-1)} C${X(-6.4)} ${Y(-8)} ${X(6.4)} ${Y(-8)} ${X(6.4)} ${Y(-1)} L${X(6.6)} ${Y(length)} C${X(4)} ${Y(length + 1)} ${X(-4)} ${Y(length + 1)} ${X(-6.6)} ${Y(length)} Z" fill="${HAIR_COLORS[l.hairColor][0]}"/>`;
  }
  function headMarkup(look, cx, cy, r, withBack = true) {
    const l = normalize(look), skin = SKINS[l.skin][0], hair = HAIR_COLORS[l.hairColor][0];
    const k = r / 6, X = v => (cx + v * k).toFixed(2), Y = v => (cy + v * k).toFixed(2);
    const back = withBack ? backHairMarkup(l, cx, cy, r, 7) : '';
    let top;
    if (l.hair === 'curly') top = [[-4.5, -4], [-1.5, -6], [1.5, -6], [4.5, -4]].map(([x, y]) => `<circle cx="${X(x)}" cy="${Y(y)}" r="${(2.6 * k).toFixed(2)}" fill="${hair}"/>`).join('');
    else if (l.hair === 'bob') top = `<path d="M${X(-6.6)} ${Y(1)} C${X(-7)} ${Y(-8.5)} ${X(7)} ${Y(-8.5)} ${X(6.6)} ${Y(1)} L${X(6.6)} ${Y(4)} L${X(4.6)} ${Y(4)} L${X(4.4)} ${Y(-2.5)} C${X(2)} ${Y(-4.5)} ${X(-2)} ${Y(-4.5)} ${X(-4.4)} ${Y(-2.5)} L${X(-4.6)} ${Y(4)} L${X(-6.6)} ${Y(4)} Z" fill="${hair}"/>`;
    else top = `<path d="M${X(-6.2)} ${Y(-0.5)} C${X(-6.6)} ${Y(-8.4)} ${X(6.6)} ${Y(-8.4)} ${X(6.2)} ${Y(-0.5)} C${X(4)} ${Y(-4)} ${X(-4)} ${Y(-4)} ${X(-6.2)} ${Y(-0.5)} Z" fill="${hair}"/>`;
    return `${back}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${skin}"/>${top}` +
      `<circle cx="${X(-2.2)}" cy="${Y(0.6)}" r="${(0.8 * k).toFixed(2)}" fill="#172A57"/><circle cx="${X(2.2)}" cy="${Y(0.6)}" r="${(0.8 * k).toFixed(2)}" fill="#172A57"/>`;
  }

  // 탈것(32×24 상자 안, 아래쪽). c = 반 색.
  function vehicleMarkup(index, c) {
    c = color(c);
    const dark = '#2B2F45';
    switch (VEHICLES[index] ? VEHICLES[index].id : 'walk') {
      case 'bike': return `<circle cx="8" cy="19" r="4" fill="none" stroke="${dark}" stroke-width="1.8"/><circle cx="24" cy="19" r="4" fill="none" stroke="${dark}" stroke-width="1.8"/><path d="M8 19 L14 12 L24 19 M14 12 L19 12 M12 19 H18" stroke="${c}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      case 'car': return `<path d="M9 13 L12 9 H21 L24 13 Z" fill="${c}"/><rect x="3" y="12.5" width="26" height="7" rx="3" fill="${c}"/><circle cx="9" cy="20" r="2.8" fill="${dark}"/><circle cx="23" cy="20" r="2.8" fill="${dark}"/>`;
      case 'boat': return `<path d="M2 15 H30 L25.5 22 H6.5 Z" fill="${c}"/><path d="M22 15 V5" stroke="${dark}" stroke-width="1.5"/><path d="M23 6 L29 14 H23 Z" fill="#FFFFFF" stroke="${c}" stroke-width="1.2"/>`;
      case 'train': return `<rect x="3" y="11.5" width="26" height="9" rx="2" fill="${c}"/><rect x="6" y="13.5" width="5" height="3.5" rx="1" fill="#E4ECF7"/><rect x="13.5" y="13.5" width="5" height="3.5" rx="1" fill="#E4ECF7"/><circle cx="9" cy="21.5" r="2.4" fill="${dark}"/><circle cx="23" cy="21.5" r="2.4" fill="${dark}"/>`;
      case 'plane': return `<path d="M2 17 L26 15 C31 15 31 19 26 19 L2 19 Z" fill="${c}"/><path d="M12 15.5 L7 9 H10 L17 15.5 Z M12 18.5 L8 23.5 H11 L17 18.5 Z M3 17 L1 12 H3.5 L7 17 Z" fill="${c}"/>`;
      case 'rocket': return `<path d="M16 9 C21 11 23 16 22 21 H10 C9 16 11 11 16 9 Z" fill="${c}"/><circle cx="16" cy="15" r="2" fill="#E4ECF7"/><path d="M10 18 L6 23 H10 Z M22 18 L26 23 H22 Z" fill="${c}"/><path d="M13 21 L16 24 L19 21 Z" fill="#E8B931"/>`;
      default: return `<rect x="12" y="12" width="8" height="7" rx="3" fill="${c}"/><path d="M14 19 L12.5 23 M18 19 L19.5 23" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>`;
    }
  }

  function svgElement(doc, viewBox, markup, label) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', viewBox);
    if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); }
    else svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = markup;
    return svg;
  }
  // 지도 위 탐험가: 머리 + 탈것.
  function rider(doc, look, index, classColor) {
    const head = VEHICLES[index] && VEHICLES[index].id === 'walk' ? headMarkup(look, 16, 6.5, 5.5)
      : VEHICLES[index] && VEHICLES[index].id === 'rocket' ? headMarkup(look, 16, 4.5, 4.5)
      : headMarkup(look, 16, 6, 5.5);
    return svgElement(doc, '0 0 32 24', vehicleMarkup(index, classColor) + head);
  }
  // 사다리 아이콘: 걸어서는 머리 없이 몸만 남으면 알아보기 어려워 발자국으로 그립니다.
  function vehicleIcon(doc, index, classColor) {
    if (!VEHICLES[index] || VEHICLES[index].id === 'walk') {
      const c = color(classColor);
      return svgElement(doc, '0 0 32 24', `<ellipse cx="11" cy="15" rx="3.2" ry="5" fill="${c}" transform="rotate(-12 11 15)"/><ellipse cx="21" cy="9" rx="3.2" ry="5" fill="${c}" transform="rotate(12 21 9)"/><circle cx="9.5" cy="21.5" r="1.6" fill="${c}"/><circle cx="22.5" cy="15.5" r="1.6" fill="${c}"/>`);
    }
    return svgElement(doc, '0 0 32 24', vehicleMarkup(index, classColor));
  }
  // 캐릭터 만들기와 여권에 쓰는 전신 그림(200×260).
  function fullBody(doc, look, vestColor) {
    const l = normalize(look), skin = SKINS[l.skin][0], vest = color(vestColor);
    const legs = l.body === 'girl'
      ? `<rect x="76" y="200" width="16" height="36" rx="7" fill="${skin}"/><rect x="108" y="200" width="16" height="36" rx="7" fill="${skin}"/><path d="M66 178 L134 178 L146 214 L54 214 Z" fill="#2E3C66"/>`
      : `<rect x="72" y="186" width="24" height="50" rx="8" fill="#2E3C66"/><rect x="104" y="186" width="24" height="50" rx="8" fill="#2E3C66"/>`;
    const markup = `<ellipse cx="100" cy="248" rx="70" ry="10" fill="#C3D1E6"/>` + backHairMarkup(l, 100, 78, 42, 11) +
      `<rect x="66" y="232" width="30" height="12" rx="6" fill="#2B2F45"/><rect x="104" y="232" width="30" height="12" rx="6" fill="#2B2F45"/>${legs}` +
      `<rect x="42" y="124" width="22" height="66" rx="11" fill="${skin}"/><rect x="136" y="124" width="22" height="66" rx="11" fill="${skin}"/>` +
      `<rect x="42" y="122" width="22" height="34" rx="11" fill="#F7F3E8"/><rect x="136" y="122" width="22" height="34" rx="11" fill="#F7F3E8"/>` +
      `<rect x="60" y="116" width="80" height="80" rx="24" fill="#F7F3E8"/>` +
      `<path d="M60 140 C60 126 70 116 84 116 L88 116 L88 196 L74 196 C66 196 60 190 60 182 Z" fill="${vest}"/><path d="M140 140 C140 126 130 116 116 116 L112 116 L112 196 L126 196 C134 196 140 190 140 182 Z" fill="${vest}"/>` +
      `<circle cx="126" cy="150" r="6" fill="#E8B931"/><rect x="90" y="104" width="20" height="16" rx="6" fill="${skin}"/>` +
      headMarkup(l, 100, 78, 42, false) +
      `<circle cx="76" cy="96" r="6" fill="#F28B82" opacity="0.45"/><circle cx="124" cy="96" r="6" fill="#F28B82" opacity="0.45"/><path d="M90 100 Q100 109 110 100" stroke="#172A57" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    return svgElement(doc, '0 0 200 260', markup, describe(l));
  }
  return {SKINS, HAIR_COLORS, HAIRS, BODIES, VEHICLES, DEFAULT_LOOK, normalize, describe, vehicleIndex, rider, vehicleIcon, fullBody};
});
