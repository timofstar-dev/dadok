const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {
  STOPS, getJourney, layoutTravelers, MARKER_WIDTH, MARKER_HEIGHT, MAP_PADDING
} = require('../journey-model.js');

test('departure, intermediate positions and destination boundaries follow the original thresholds', () => {
  const departure = getJourney(0);
  assert.equal(departure.current.name, '아시아');
  assert.equal(departure.next.name, '유럽');
  assert.equal(departure.remaining, 700);
  assert.equal(departure.segmentProgress, 0);
  assert.deepEqual([departure.x, departure.y], [960, 235]);
  assert.equal(departure.visited.length, 1);
  const middle = getJourney(350);
  assert.equal(middle.segmentProgress, 0.5);
  assert.deepEqual([middle.x, middle.y], [805, 202.5]);
  assert.equal(middle.remaining, 350);
  const europe = getJourney(700);
  assert.equal(europe.current.name, '유럽');
  assert.equal(europe.next.name, '북아메리카');
  assert.equal(europe.segmentProgress, 0);
  assert.equal(europe.visited.length, 2);
  assert.deepEqual([getJourney(800).x, getJourney(800).y], [440, 185]);
  for (const stop of STOPS) {
    const arrival = getJourney(stop.min);
    assert.equal(arrival.current, stop);
    assert.deepEqual([arrival.x, arrival.y], [stop.x, stop.y]);
  }
});

test('finishing clamps position but preserves the actual accumulated steps', () => {
  for (const steps of [3000, 3001, 4500]) {
    const journey = getJourney(steps);
    assert.equal(journey.steps, steps);
    assert.equal(journey.complete, true);
    assert.equal(journey.next, null);
    assert.equal(journey.remaining, 0);
    assert.equal(journey.segmentProgress, 1);
    assert.equal(journey.visited.length, 7);
    assert.deepEqual([journey.x, journey.y], [660, 700]);
  }
});

test('numeric strings work; missing, invalid and negative values stay at departure', () => {
  assert.equal(getJourney('800').steps, 800);
  assert.equal(getJourney(' 350 ').segmentProgress, 0.5);
  for (const input of [undefined, null, '', 'invalid', NaN, Infinity, -Infinity, -20, {}, Symbol('bad')]) {
    assert.equal(getJourney(input).steps, 0);
    assert.equal(getJourney(input).current.name, '아시아');
  }
});

function checkBoundsAndCollisions(layout, width, height) {
  for (const traveler of layout) {
    assert.ok(traveler.displayX - MARKER_WIDTH / 2 >= MAP_PADDING);
    assert.ok(traveler.displayX + MARKER_WIDTH / 2 <= width - MAP_PADDING);
    assert.ok(traveler.displayY - MARKER_HEIGHT / 2 >= MAP_PADDING);
    assert.ok(traveler.displayY + MARKER_HEIGHT / 2 <= height - MAP_PADDING);
  }
  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) {
      const horizontal = Math.abs(layout[i].displayX - layout[j].displayX);
      const vertical = Math.abs(layout[i].displayY - layout[j].displayY);
      assert.ok(horizontal >= MARKER_WIDTH || vertical >= MARKER_HEIGHT, `overlap: ${i}, ${j}`);
    }
  }
}

test('200 children at one departure point are all retained without overlapping or leaving the map', () => {
  const travelers = Array.from({ length: 200 }, (_, i) => ({ key: `child-${i}`, x: 960, y: 235, steps: 0 }));
  const layout = layoutTravelers(travelers);
  assert.equal(layout.length, 200);
  assert.equal(new Set(layout.map(traveler => traveler.key)).size, 200);
  assert.ok(layout.every(traveler => traveler.x === 960 && traveler.y === 235));
  checkBoundsAndCollisions(layout, 1200, 780);
  assert.deepEqual(layoutTravelers([...travelers].reverse()), layout);
});

test('mixed route progress preserves data and has deterministic seats', () => {
  const travelers = Array.from({ length: 80 }, (_, i) => ({
    key: `class-${i % 6}/student-${i}`, ...getJourney(i * 45), displayName: `student ${i}`
  }));
  const snapshot = JSON.stringify(travelers);
  const layout = layoutTravelers(travelers);
  checkBoundsAndCollisions(layout, 1200, 780);
  assert.equal(JSON.stringify(travelers), snapshot);
  assert.ok(layout.every(traveler => traveler.displayName));
  assert.deepEqual(layoutTravelers(travelers), layout);
});

test('larger rosters fit an expanded map and impossible dimensions fail explicitly', () => {
  const travelers = Array.from({ length: 300 }, (_, i) => ({ key: String(i), x: 960, y: 235 }));
  assert.throws(() => layoutTravelers(travelers), RangeError);
  const layout = layoutTravelers(travelers, 1200, 1100);
  assert.equal(layout.length, 300);
  checkBoundsAndCollisions(layout, 1200, 1100);
  assert.throws(() => layoutTravelers([], 0, 780), RangeError);
  assert.throws(() => layoutTravelers([{ key: 'a' }, { key: 'a' }]), TypeError);
  assert.deepEqual(layoutTravelers([]), []);
});

test('the same model loads as a browser global without a bundler', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../journey-model.js'), 'utf8'), context);
  assert.equal(context.JourneyModel.getJourney(800).current.name, '유럽');
  assert.equal(context.JourneyModel.STOPS.length, 7);
});

test('nameplates leave destination names visible', () => {
  const reserved = STOPS.map(stop => ({x:stop.x-80,y:stop.y-70,width:160,height:48}));
  const travelers = Array.from({length:100}, (_, i) => ({key:String(i),x:960,y:235}));
  const layout = layoutTravelers(travelers,1200,780,reserved);
  checkBoundsAndCollisions(layout,1200,780);
  for (const seat of layout) for (const rect of reserved) {
    assert.ok(seat.displayX+MARKER_WIDTH/2<=rect.x || seat.displayX-MARKER_WIDTH/2>=rect.x+rect.width || seat.displayY+MARKER_HEIGHT/2<=rect.y || seat.displayY-MARKER_HEIGHT/2>=rect.y+rect.height);
  }
});
