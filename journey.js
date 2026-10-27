/* Shared expedition view. No production writes or additional service dependencies. */
const JourneyUI = (() => {
  const colors = ['#d47839', '#408877', '#b56a85', '#557ead', '#8c77ae', '#9a8737'];
  const classes = ['오세아니아반', '아시아반', '아프리카반', '아메리카반', '유럽반', '아틀랜틱반'];
  let roster = [], selectedKey = null, currentGroup = '', previousSteps = new Map();
  const $ = id => document.getElementById(id);
  const gradeNumber = value => String(value ?? '').trim().replace(/학년$/, '').trim();
  function getStudents(db, logs, group) {
    const result = new Map();
    for (const [grade, groups] of Object.entries(db || {})) {
      if (!groups || typeof groups !== 'object') continue;
      for (const [className, names] of Object.entries(groups)) {
        if ((group !== '전체' && group !== className) || !Array.isArray(names)) continue;
        for (const name of names) {
          const g = gradeNumber(grade), n = String(name), key = JSON.stringify([g, className, n]);
          if (result.has(key)) continue;
          const records = logs.filter(r => gradeNumber(r[1]) === g && r[2] === className && r[3] === n).sort((a, b) => new Date(b[0]) - new Date(a[0]));
          const total = records.reduce((sum, r) => sum + (Number.isFinite(Number(r[7])) ? Number(r[7]) : 0), 0);
          const journey = JourneyModel.getJourney(total);
          result.set(key, { key, g, n, c: className, logs: records, steps: journey.steps, journey, x: journey.x, y: journey.y, color: colors[Math.max(0, classes.indexOf(className))] });
        }
      }
    }
    return [...result.values()].sort((a, b) => a.c.localeCompare(b.c, 'ko') || a.n.localeCompare(b.n, 'ko') || a.g.localeCompare(b.g));
  }
  function svg(tag, attributes, text) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function route(points) { return points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' '); }
  function render(students, group) {
    roster = students;
    const changedGroup = group !== currentGroup; currentGroup = group;
    const {MARKER_WIDTH, MARKER_HEIGHT, MAP_PADDING} = JourneyModel;
    const columns = Math.floor((1200 - 2 * MAP_PADDING) / MARKER_WIDTH);
    let height = Math.max(780, 2 * MAP_PADDING + MARKER_HEIGHT * Math.ceil(students.length / columns));
    const reserved = JourneyModel.STOPS.map(stop => {
      const width = Math.max(96, stop.name.length * 19 + 32);
      return {x:stop.x - width / 2, y:stop.y - 70, width, height:44};
    });
    let placed;
    // Grow the canvas instead of omitting children when nameplates need more space.
    while (!placed) {
      try { placed = JourneyModel.layoutTravelers(students, 1200, height, reserved); }
      catch (error) { if (!(error instanceof RangeError)) throw error; height += MARKER_HEIGHT; }
    }
    const map = $('mapZoomWrapper'); map.style.aspectRatio = `1200 / ${height}`;
    $('journeyOverlay').setAttribute('viewBox', `0 0 1200 ${height}`);
    $('expeditionCount').textContent = students.length.toLocaleString();
    $('expeditionFinished').textContent = students.filter(s => s.journey.complete).length.toLocaleString();
    $('journeyRoute').setAttribute('d', route(JourneyModel.STOPS));
    const destinations = $('journeyDestinations'); destinations.replaceChildren();
    JourneyModel.STOPS.forEach((stop, i) => {
      const group = svg('g', {});
      group.append(svg('circle', {cx:stop.x, cy:stop.y, r:8, class:'destination-point'}));
      group.append(svg('text', {x:stop.x, y:stop.y - 48, 'text-anchor':'middle', class:'atlas-place'}, `${i+1}. ${stop.name}`));
      group.append(svg('text', {x:stop.x, y:stop.y - 30, 'text-anchor':'middle', class:'atlas-distance'}, `${stop.min.toLocaleString()}걸음${i === 0 ? ' · 출발!' : ''}`));
      destinations.append(group);
    });
    const legend = $('journeyClassLegend'); legend.replaceChildren();
    classes.filter(c => students.some(s => s.c === c)).forEach(c => {
      const item = document.createElement('span'); item.style.setProperty('--class-color', colors[classes.indexOf(c)]);
      const dot = document.createElement('i'); item.append(dot, document.createTextNode(c)); legend.append(item);
    });
    const layer = $('markerLayer'); const old = new Map([...layer.children].map(el => [el.dataset.key, el]));
    const retained = new Set(); const arrivals = [];
    placed.forEach(s => {
      retained.add(s.key);
      let marker = old.get(s.key);
      if (!marker) {
        marker = document.createElement('button'); marker.type = 'button'; marker.className = 'traveler'; marker.dataset.key = s.key;
        const avatar = document.createElement('span'); avatar.className = 'traveler-avatar'; avatar.setAttribute('aria-hidden', 'true');
        avatar.innerHTML = '<svg viewBox="0 0 30 30"><rect x="4" y="15" width="8" height="11" rx="3" fill="currentColor"/><path d="M10 28v-9q5-6 10 0v9" fill="currentColor"/><circle cx="15" cy="10" r="7" fill="#ffe1b0"/><path d="M7 9q0-9 8-8t8 8M5 9h20" fill="currentColor" stroke="currentColor" stroke-width="2"/><circle cx="13" cy="11" r=".8" fill="#3c4842"/><circle cx="18" cy="11" r=".8" fill="#3c4842"/><path d="M13 14q2 2 4 0" fill="none" stroke="#aa694e"/></svg>';
        const name = document.createElement('span'); name.className = 'traveler-name'; marker.append(avatar, name);
        marker.onclick = () => select(s.key, true); layer.append(marker);
      }
      const label = marker.querySelector('.traveler-name'); label.textContent = s.n;
      marker.style.setProperty('--class-color', s.color);
      marker.classList.toggle('no-travel-motion', changedGroup);
      marker.style.left = `${s.displayX / 12}%`; marker.style.top = `${s.displayY / height * 100}%`;
      marker.title = `${s.g}학년 ${s.c} · ${s.n} · ${s.steps.toLocaleString()}걸음`;
      marker.setAttribute('aria-label', `${marker.title} · ${s.journey.current.name}${s.journey.next ? '에서 ' + s.journey.next.name + '(으)로 여행 중' : ' 세계 일주 완료'}`);
      const previous = previousSteps.get(s.key);
      if (previous !== undefined && s.steps > previous && JourneyModel.getJourney(previous).current.min < s.journey.current.min) {
        marker.classList.remove('just-arrived'); void marker.offsetWidth; marker.classList.add('just-arrived');
        arrivals.push(`${s.n} 탐험가가 ${s.journey.current.name}에 도착했어요!`);
      }
      previousSteps.set(s.key, s.steps);
      s.marker = marker;
      const original = roster.find(r => r.key === s.key); original.displayX = s.displayX; original.displayY = s.displayY;
    });
    for (const [key, el] of old) if (!retained.has(key)) el.remove();
    if (!retained.has(selectedKey)) selectedKey = null;
    $('journeyStatus').textContent = arrivals.length ? arrivals.join(' ') : students.length ? `${group === '전체' ? '전교생' : group} ${students.length}명의 탐험가가 함께 여행하고 있어요. 친구를 누르면 정확한 여행 위치와 다음 목적지를 볼 수 있어요.` : '이 반에는 아직 등록된 탐험가가 없어요.';
    $('closeJourney').onclick = closeDetail;
    updateDetail();
  }
  function closeDetail() {
    const marker = [...$('markerLayer').children].find(el => el.dataset.key === selectedKey);
    selectedKey = null; updateDetail(); marker?.focus({preventScroll:true});
  }
  function select(key, reveal = false) {
    selectedKey = key; updateDetail();
    if (reveal) $('journeyDetail').scrollIntoView({block:'nearest', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }
  function updateDetail() {
    const student = roster.find(s => s.key === selectedKey);
    for (const marker of $('markerLayer').children) { const active = marker.dataset.key === selectedKey; marker.classList.toggle('is-selected', active); marker.setAttribute('aria-pressed', String(active)); }
    $('journeyDetail').hidden = !student;
    $('journeyLeaders').replaceChildren(); $('journeyHighlight').setAttribute('d', '');
    if (!student) return;
    const j = student.journey;
    $('detailClass').textContent = `${student.g}학년 · ${student.c}`;
    $('detailName').textContent = `${student.n} 탐험가의 여행`;
    $('detailRoute').textContent = j.next ? `${j.current.emoji} ${j.current.name} → ${j.next.emoji} ${j.next.name}` : '🌏 일곱 대륙 여행 완료! 멋진 독서 탐험을 계속해 봐요.';
    $('detailProgress').value = j.complete ? 100 : j.segmentProgress * 100;
    $('detailRemaining').textContent = `${j.steps.toLocaleString()}걸음 걸었어요 · ${j.next ? j.next.name + '까지 ' + j.remaining.toLocaleString() + '걸음 남았어요!' : '세계 일주 성공!'}`;
    $('journeyHighlight').setAttribute('d', route([...j.visited, {x:j.x,y:j.y}]));
    const leaders = $('journeyLeaders');
    leaders.append(svg('path', {d:`M${student.displayX},${student.displayY} L${j.x},${j.y}`, class:'traveler-tether'}));
    leaders.append(svg('circle', {cx:j.x, cy:j.y, r:11, class:'traveler-position'}));
    leaders.append(svg('text', {x:j.x+16,y:j.y+5,class:'actual-location'}, '현재 여행 위치'));
    const stamps = $('journeyPassport'); stamps.replaceChildren();
    JourneyModel.STOPS.forEach(stop => {
      const earned = j.steps >= stop.min; const stamp = document.createElement('div'); stamp.className = `journey-stamp${earned ? ' earned' : ''}`;
      const icon = document.createElement('span'); icon.textContent = stop.emoji; icon.setAttribute('aria-hidden','true');
      const name = document.createElement('b'); name.textContent = stop.name;
      const status = document.createElement('small'); status.textContent = earned ? (stop.min === 0 ? '여행 시작' : '도착 완료 ✓') : `${stop.min.toLocaleString()}걸음`;
      stamp.append(icon,name,status); stamps.append(stamp);
    });
    $('journeyBooks').onclick = () => { showStudentProfile(student); $('dashProfile').scrollIntoView({block:'nearest'}); };
  }
  return {getStudents, render, select};
})();
