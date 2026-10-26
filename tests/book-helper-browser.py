"""Book helper UI regression checks. All books and student data are fictional fixtures."""
import json
import pathlib
import threading
import urllib.parse
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT=pathlib.Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=ROOT))
threading.Thread(target=server.serve_forever,daemon=True).start()
css=pathlib.Path('/tmp/dadok-bulma.css')
if not css.exists():
    with urllib.request.urlopen('https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css',timeout=30) as r: css.write_bytes(r.read())

def volume(id,pages=216,author='한별',publisher='상상책방',date='2024-03-01',title='구름섬 탐험대'):
    info={'title':title,'authors':[author] if author else [],'publisher':publisher,'publishedDate':date,'industryIdentifiers':[{'type':'ISBN_13','identifier':'9781234567890'}]}
    if pages is not None:info['pageCount']=pages
    return {'id':id,'volumeInfo':info}
books={'editionA':volume('editionA'), 'editionB':volume('editionB',264,publisher='새로운책방',date='2025-05-02'),'missing':volume('missing',None,author='',title='쪽수를 모르는 책'),'unsafe':volume('unsafe',12,title='<img src=x onerror=alert(1)>')}
requests=[];writes=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium')
    context=browser.new_context(viewport={'width':1280,'height':1100},reduced_motion='reduce')
    context.route('https://cdn.jsdelivr.net/**',lambda route:route.fulfill(body=css.read_bytes(),content_type='text/css'))
    def existing_api(route):
        if route.request.method!='GET':writes.append(route.request.post_data);route.fulfill(json={});return
        route.fulfill(json={'3':{'아시아반':['테스트학생']}} if 'getStudentDB' in route.request.url else {'logs':[],'months':[],'allRequiredBooks':{}})
    context.route('https://script.google.com/**',existing_api)
    def catalog_api(route):
        requests.append(route.request.url)
        parsed=urllib.parse.urlsplit(route.request.url)
        if parsed.query:
            q=urllib.parse.parse_qs(parsed.query)['q'][0]
            if '빈결과' in q:route.fulfill(json={'totalItems':0});return
            if '이용제한' in q:route.fulfill(status=429,json={'error':{}});return
            if '연결오류' in q:route.abort();return
            if '잘못된응답' in q:route.fulfill(body='<html>Bad gateway</html>');return
            route.fulfill(json={'items':list(books.values()),'totalItems':4})
        else:route.fulfill(json=books[parsed.path.rsplit('/',1)[-1]])
    context.route('https://www.googleapis.com/**',catalog_api)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}');page.wait_for_function('journeyDataReady')
    page.select_option('#gradeSelect','3');page.select_option('#studentSelect','테스트학생')
    page.select_option('[name=reviewNote]','5점');page.fill('#pagesInput','37');page.fill('#bookTitleInput','기존 책(기존 저자)')
    date=page.locator('#recordDateInput').input_value()
    assert not requests
    page.locator('#bookHelper summary').click()
    page.wait_for_function('document.querySelector("#bookSearchQuery").value==="기존 책"')
    page.fill('#bookSearchQuery','구름섬 탐험대');page.locator('#bookSearchQuery').press('Enter')
    page.wait_for_function('document.querySelectorAll(".book-edition").length===4')
    assert not writes and page.locator('#pagesInput').input_value()=='37'
    assert page.locator('#bookTitleInput').input_value()=='기존 책(기존 저자)'
    # Choose exact revised edition; there are two volumes with the same title.
    page.locator('.book-edition').nth(1).click();page.wait_for_function('!document.querySelector("#bookSelection").hidden')
    assert page.locator('#selectedBookPages').inner_text()=='264쪽'
    assert '새로운책방' in page.locator('#selectedBookPublisher').inner_text()
    assert page.locator('#bookSourceLink').get_attribute('href').endswith('editionB')

    assert page.locator('.book-edition-list').evaluate('(e)=>e.scrollWidth<=e.clientWidth'), 'result list must not scroll sideways'
    page.locator('.book-edition-list li').nth(3).evaluate('(e)=>e.style.visibility="hidden"')
    page.locator('#bookHelper').screenshot(path='/tmp/dadok-book-helper.png')
    page.locator('.book-edition-list li').nth(3).evaluate('(e)=>e.style.visibility="visible"')
    page.click('#applyBookTitle')
    assert page.locator('#bookTitleInput').input_value()=='구름섬 탐험대(한별)'
    assert page.locator('#pagesInput').input_value()=='37'
    assert page.locator('#gradeSelect').input_value()=='3'
    assert page.locator('#classSelect').input_value()=='아시아반'
    assert page.locator('#studentSelect').input_value()=='테스트학생'
    assert page.locator('#recordDateInput').input_value()==date
    assert page.locator('[name=reviewNote]').input_value()=='5점'
    page.locator('#bookHelper summary').click();page.click('#applyBookPages')
    assert page.locator('#pagesInput').input_value()=='264'
    assert not writes
    page.locator('#bookHelper summary').click();page.locator('.book-edition').nth(2).click()
    page.wait_for_function('document.querySelector("#selectedBookPages").textContent==="쪽수 정보 없음"')
    assert page.locator('#applyBookPages').is_disabled()
    assert '지은이 정보 없음' in page.locator('#selectedBookAuthors').inner_text()
    page.click('#applyBookTitle');assert page.locator('#bookTitleInput').input_value()=='쪽수를 모르는 책'
    assert page.locator('#pagesInput').input_value()=='264'
    # Unsafe title strings are shown literally, never executed.
    page.locator('#bookHelper summary').click();page.locator('.book-edition').nth(3).click()
    page.wait_for_function('document.querySelector("#bookSelectionHeading").textContent.startsWith("<img")')
    assert page.locator('#bookSelectionHeading img').count()==0
    assert page.locator('#bookEditionList img').count()==0
    # Unavailable service and no-results are useful states and preserve manual input.
    for query,expected in [('빈결과','검색된 책이 없어요'),('이용제한','검색 이용량이 많아요'),('연결오류','연결하지 못했어요'),('잘못된응답','연결하지 못했어요')]:
        page.fill('#bookSearchQuery',query);page.click('#bookSearchButton')
        page.wait_for_function('(text)=>document.querySelector("#bookSearchStatus").textContent.includes(text)',arg=expected)
        assert page.locator('#bookSelection').is_hidden()
        assert page.locator('#pagesInput').input_value()=='264'
    # Out-of-order detail responses cannot replace the newest selected edition.
    page.fill('#bookSearchQuery','구름섬 탐험대');page.click('#bookSearchButton');page.wait_for_function('document.querySelectorAll(".book-edition").length===4')
    page.evaluate('''() => {window.originalDetails=BookCatalog.details;window.pendingDetails={};BookCatalog.details=(id)=>new Promise(resolve=>pendingDetails[id]=resolve);}''')
    page.locator('.book-edition').nth(0).click();page.locator('.book-edition').nth(1).click()
    page.evaluate('''() => pendingDetails.editionB({id:'editionB',title:'최신 선택',subtitle:'',authors:['한별'],publisher:'출판사',publishedDate:'2025',pageCount:300,isbn:'',infoUrl:'https://books.google.com/books?id=editionB'})''')
    page.wait_for_function('document.querySelector("#bookSelectionHeading").textContent==="최신 선택"')
    page.evaluate('''() => pendingDetails.editionA({id:'editionA',title:'오래된 선택',subtitle:'',authors:[],publisher:'',publishedDate:'',pageCount:5,isbn:'',infoUrl:'https://books.google.com/books?id=editionA'})''')
    assert page.locator('#bookSelectionHeading').inner_text()=='최신 선택'
    page.evaluate('() => {BookCatalog.details=originalDetails;}')
    # Out-of-order title searches cannot replace the newest search results.
    page.evaluate('''() => {window.originalSearch=BookCatalog.search;window.pendingSearch={};BookCatalog.search=(q)=>new Promise(resolve=>pendingSearch[q]=resolve);}''')
    page.fill('#bookSearchQuery','첫검색');page.locator('#bookSearchQuery').press('Enter')
    page.fill('#bookSearchQuery','둘째검색');page.locator('#bookSearchQuery').press('Enter')
    page.evaluate('pendingSearch["둘째검색"]([])');page.wait_for_function('document.querySelector("#bookSearchStatus").textContent.includes("검색된 책이 없")')
    page.evaluate('pendingSearch["첫검색"]([{id:"old",title:"늦은 결과",authors:[]}])')
    assert page.locator('.book-edition').count()==0
    page.evaluate('() => {BookCatalog.search=originalSearch;}')
    page.fill('#bookSearchQuery','구름섬 탐험대');page.click('#bookSearchButton');page.wait_for_function('document.querySelectorAll(".book-edition").length===4')
    page.locator('.book-edition').nth(0).focus();page.keyboard.press('Enter');page.wait_for_function('!document.querySelector("#bookSelection").hidden')
    page.set_viewport_size({'width':390,'height':844});page.locator('#bookHelper').screenshot(path='/tmp/dadok-book-helper-mobile.png')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not writes and not errors, errors
    assert all('테스트학생' not in urllib.parse.unquote(u) and '아시아반' not in urllib.parse.unquote(u) for u in requests)
    browser.close()
server.shutdown()
print('PASS: independent search, exact edition, missing metadata, apply-only form changes, protected existing fields, no reading writes, safe text, failures, stale requests, keyboard, mobile')
