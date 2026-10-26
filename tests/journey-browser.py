"""Run with Python + Playwright + Chromium; all API traffic uses fictional fixtures."""
import json
import os
import pathlib
import threading
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

classes = ['오세아니아반','아시아반','아프리카반','아메리카반','유럽반','아틀랜틱반']
names = ['하늘','바다','나래','다온','소담','지우']
steps = [0, 350, 700, 800, 900, 1200, 1600, 1700, 1800, 2100, 2300, 2800, 3000, 3200]
db, logs = {}, []
for ci, cls in enumerate(classes):
    grade = str(ci * 2 + 1)
    db[grade] = {cls: [f'{n}{ci+1}' for n in names]}
    for ni, name in enumerate(db[grade][cls]):
        logs.append(['2026-10-01', grade+'학년', cls, name, '상상 속 세계여행', 30, '2점', str(steps[(ci*6+ni)%len(steps)])])
# Same class, same name, different grade must have separate journeys.
db['2'] = {classes[0]: ['하늘1']}
logs.append(['2026-10-02', '2', classes[0], '하늘1', '다른 탐험가의 책', 40, '2점', 950])
full = {'logs': logs,'months':['10월'],'currentMonth':'10월','allRequiredBooks':{}}
css_path = pathlib.Path('/tmp/dadok-bulma.css')
if not css_path.exists():
    with urllib.request.urlopen('https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css',timeout=30) as r: css_path.write_bytes(r.read())
server = ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=ROOT))
threading.Thread(target=server.serve_forever,daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}'
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium')
    context = browser.new_context(viewport={'width':1440,'height':1150},reduced_motion='reduce')
    context.route('https://cdn.jsdelivr.net/**', lambda route:route.fulfill(body=css_path.read_bytes(),content_type='text/css'))
    def api(route):
        assert route.request.method == 'GET', 'Production writes are forbidden in smoke tests'
        payload = db if 'getStudentDB' in route.request.url else full
        route.fulfill(json=payload)
    context.route('https://script.google.com/**',api)
    page = context.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url);page.wait_for_function('document.querySelectorAll(".traveler").length===37')
    page.click('#tab-dashboard')
    assert page.locator('#expeditionCount').inner_text()=='37'
    page.locator('#dashboard-tab').screenshot(path='/tmp/dadok-expedition-desktop.png')
    page.locator('.journey-map').screenshot(path='/tmp/dadok-world-map.png')
    # Every child has a reachable button, and their nameplates do not collide.
    boxes = page.locator('.traveler').evaluate_all('(els)=>els.map(e=>{let r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})')
    for i,a in enumerate(boxes):
        for b in boxes[i+1:]:
            assert abs(a['x']-b['x'])>=79 or abs(a['y']-b['y'])>=43
    key = json.dumps(['1',classes[0],'바다1'],ensure_ascii=False,separators=(',',':'))
    page.evaluate('(key)=>JourneyUI.select(key)', key)
    assert '350' in page.locator('#detailRemaining').inner_text()
    assert '유럽까지 350걸음' in page.locator('#detailRemaining').inner_text()
    assert page.locator('.journey-stamp.earned').count()==1
    page.click('#journeyBooks'); assert page.locator('#dSteps').inner_text()=='350'
    page.locator('#dashProfile button').first.click()
    # Grade separation with the same class and name.
    page.evaluate('JourneyUI.select(JSON.stringify(["2","오세아니아반","하늘1"]))')
    page.click('#journeyBooks');assert page.locator('#dSteps').inner_text()=='950'
    page.evaluate('JourneyUI.select(JSON.stringify(["1","오세아니아반","하늘1"]))')
    page.click('#journeyBooks');assert page.locator('#dSteps').inner_text()=='0'
    page.select_option('#dashClassSelect',classes[1]);assert page.locator('.traveler').count()==6
    assert page.locator('#journeyDetail').is_hidden()
    assert page.locator('#classTableBody tr').count()==6
    # Keyboard activation and reset.
    marker=page.locator('.traveler').first;marker.focus();page.keyboard.press('Enter')
    assert page.locator('#journeyDetail').is_visible()
    page.click('#closeJourney');assert page.locator('#journeyDetail').is_hidden()
    page.get_by_role('button',name='지도 확대',exact=True).click();assert page.locator('#zoomLevel').inner_text()=='120%'
    page.get_by_role('button',name='지도 확대 초기화').click();assert page.locator('#zoomLevel').inner_text()=='100%'
    page.select_option('#dashClassSelect','전체')
    page.set_viewport_size({'width':390,'height':844});page.screenshot(path='/tmp/dadok-expedition-mobile.png',full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'page must not overflow on mobile'
    assert page.locator('.traveler').count()==37
    # Dense same-place roster, followed by a real threshold crossing and empty class.
    page.evaluate('''() => { studentDB={1:{오세아니아반:Array.from({length:240},(_,i)=>'친구'+i)}};globalData=[];renderClassTable(); }''')
    assert page.locator('.traveler').count()==240
    assert page.locator('#mapZoomWrapper').evaluate('e=>e.offsetHeight')>=880
    page.evaluate('''() => {globalData=[['2026-10-01','1','오세아니아반','친구0','새 책',30,'2점',700]];renderClassTable();}''')
    assert '유럽에 도착' in page.locator('#journeyStatus').inner_text()
    page.select_option('#dashClassSelect','유럽반');assert page.locator('.traveler').count()==0
    assert '아직 등록된' in page.locator('#journeyStatus').inner_text()
    assert not errors, errors
    # Network failure stays distinct from a successful empty roster.
    error_page=context.new_page()
    error_page.route('https://script.google.com/**',lambda route:route.fulfill(status=503,body='Unavailable'))
    error_page.goto(url);error_page.wait_for_function('document.querySelector("#journeyStatus").textContent.includes("불러오지 못")')
    error_page.click('#tab-dashboard')
    assert error_page.locator('#errorBox').is_visible()
    assert '불러오지 못' in error_page.locator('#journeyStatus').inner_text()
    browser.close()
server.shutdown()
print('PASS: 37 travelers, class filtering, grade identity, progress, stamps, keyboard, zoom, mobile, 240-child capacity, arrival and API error')
