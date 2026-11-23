import os
import sys, json
from playwright.sync_api import sync_playwright
url='file://'+sys.argv[1]
INIT="""window.claude={hot:{snapshot:f=>{window.__snap=f;},ready:f=>f(JSON.parse(sessionStorage.getItem('snap')||'{}'))}};"""
def wait_turn(pg):
    for _ in range(400):
        if pg.evaluate("!document.getElementById('fire').disabled"): return True
        pg.wait_for_timeout(100)
    return False
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1180,'height':820}); pg.add_init_script(INIT)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(800)
    pg.select_option('#set-deal','random'); pg.select_option('#set-confirm','on'); pg.select_option('#set-biome','caldera'); pg.select_option('#set-mode','health')
    pg.click('#btnStart'); wait_turn(pg)
    pg.keyboard.press('Space'); a=pg.inner_text('#fire'); pg.keyboard.press('Space')          # tracer: arm, confirm
    wait_turn(pg); r1=pg.inner_text('#round')
    pg.keyboard.press('z'); note=pg.inner_text('#shapeNote'); dis=pg.evaluate("document.getElementById('tool-wall').disabled")
    pg.keyboard.press('a'); pg.wait_for_timeout(900); fuel=pg.inner_text('#fuel')
    pg.keyboard.press('Space'); pg.keyboard.press('Escape'); c=pg.inner_text('#fire'); pg.keyboard.press('Space'); pg.keyboard.press('Space')
    wait_turn(pg)
    snap=pg.evaluate("JSON.stringify(window.__snap())"); pg.evaluate("s=>sessionStorage.setItem('snap',s)", snap)
    before=[pg.inner_text('#round'), pg.inner_text('#sc0'), pg.inner_text('#sc1'), pg.locator('.chip').count(), pg.inner_text('#env')]
    print('armed label:',a,'| after tracer:',r1,'| after dig:',note,'| wall disabled:',dis,'| after one drive:',fuel,'| after Esc:',c)
    print('snapshot bytes', len(snap), 'grid runs', len(json.loads(snap)['grid'])//2)
    pg.reload(); pg.wait_for_timeout(1500)
    after=[pg.inner_text('#round'), pg.inner_text('#sc0'), pg.inner_text('#sc1'), pg.locator('.chip').count(), pg.inner_text('#env')]
    print('before reload', before); print('after reload ', after, '| menu open:', pg.evaluate("document.getElementById('menu').classList.contains('open')"))
    wait_turn(pg); pg.keyboard.press('Space'); pg.keyboard.press('Space'); ok=wait_turn(pg)
    print('played on after resume:', ok, pg.inner_text('#round'), '| errs', errs)
    b.close()
