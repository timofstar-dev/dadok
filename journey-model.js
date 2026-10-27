(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.JourneyModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STOPS = Object.freeze([
    { name: '아시아', min: 0, x: 960, y: 235, emoji: '⛩️' },
    { name: '유럽', min: 700, x: 650, y: 170, emoji: '🏰' },
    { name: '북아메리카', min: 900, x: 230, y: 200, emoji: '🗽' },
    { name: '남아메리카', min: 1600, x: 320, y: 460, emoji: '🦜' },
    { name: '아프리카', min: 1800, x: 630, y: 405, emoji: '🦁' },
    { name: '오세아니아', min: 2300, x: 1010, y: 540, emoji: '🐨' },
    { name: '남극', min: 3000, x: 660, y: 700, emoji: '🐧' }
  ].map(Object.freeze));
  const MARKER_WIDTH = 60;
  const MARKER_HEIGHT = 40;
  const MAP_PADDING = 8;

  function getJourney(value) {
    const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : 0;
    const steps = Number.isFinite(number) ? Math.max(0, number) : 0;
    const last = STOPS[STOPS.length - 1];
    const routeSteps = Math.min(steps, last.min);
    const visited = STOPS.filter(stop => stop.min <= routeSteps);
    const current = visited[visited.length - 1];
    const next = STOPS[visited.length] || null;
    const segmentProgress = next ? (routeSteps - current.min) / (next.min - current.min) : 1;
    return {
      steps,
      current,
      next,
      segmentProgress,
      x: current.x + (next ? (next.x - current.x) * segmentProgress : 0),
      y: current.y + (next ? (next.y - current.y) * segmentProgress : 0),
      remaining: next ? next.min - routeSteps : 0,
      complete: !next,
      visited
    };
  }

  // Stable names/keys determine seats, so API ordering does not shuffle children.
  // The UI can connect these non-overlapping seats to the actual route positions.
  function layoutTravelers(travelers, width = 1200, height = 780, reserved = []) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new RangeError('Map dimensions must be positive finite numbers.');
    }
    const columns = Math.floor((width - MAP_PADDING * 2) / MARKER_WIDTH);
    const rows = Math.floor((height - MAP_PADDING * 2) / MARKER_HEIGHT);
    if (columns < 1 || rows < 1 || travelers.length > columns * rows) {
      throw new RangeError('Increase the map dimensions to fit every traveler without overlap.');
    }
    const sorted = [...travelers].sort((a, b) => {
      const left = String(a.key), right = String(b.key);
      return left < right ? -1 : left > right ? 1 : 0;
    });
    const keys = new Set(sorted.map(traveler => String(traveler.key)));
    if (keys.size !== sorted.length) throw new TypeError('Each traveler must have a unique key.');

    const left = (width - columns * MARKER_WIDTH) / 2 + MARKER_WIDTH / 2;
    const top = (height - rows * MARKER_HEIGHT) / 2 + MARKER_HEIGHT / 2;
    const seats = [];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const seat = { x: left + column * MARKER_WIDTH, y: top + row * MARKER_HEIGHT };
        const blocked = reserved.some(rect => seat.x + MARKER_WIDTH / 2 > rect.x && seat.x - MARKER_WIDTH / 2 < rect.x + rect.width && seat.y + MARKER_HEIGHT / 2 > rect.y && seat.y - MARKER_HEIGHT / 2 < rect.y + rect.height);
        if (!blocked) seats.push(seat);
      }
    }
    if (travelers.length > seats.length) throw new RangeError('Increase the map dimensions to keep destination labels clear.');
    return sorted.map(traveler => {
      const x = Number.isFinite(traveler.x) ? traveler.x : width / 2;
      const y = Number.isFinite(traveler.y) ? traveler.y : height / 2;
      let best = 0;
      let bestDistance = Infinity;
      seats.forEach((seat, index) => {
        const distance = (seat.x - x) ** 2 + (seat.y - y) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      const seat = seats.splice(best, 1)[0];
      return { ...traveler, displayX: seat.x, displayY: seat.y };
    });
  }

  return { STOPS, getJourney, layoutTravelers, MARKER_WIDTH, MARKER_HEIGHT, MAP_PADDING };
});
