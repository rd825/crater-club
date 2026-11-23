import os, sys, time
from playwright.sync_api import sync_playwright
url='file://'+sys.argv[1]
FAST="""let ft=0; const st=window.setTimeout.bind(window);
window.requestAnimationFrame=cb=>st(()=>{ft+=50; cb(ft)},0);
window.setTimeout=(f,ms,...a)=>st(f,(ms||0)/12,...a);"""
def ready(pg, limit=60):
    t0=time.time()
    while time.time()-t0<limit:
        if pg.evaluate("!document.getElementById('fire').disabled"): return True
        pg.wait_for_timeout(25)
    return False
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1180,'height':820}); pg.add_init_script(FAST)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(1000)
    pg.select_option('#set-confirm','off'); pg.select_option('#set-biome','hills'); pg.select_option('#set-time','noon')
    pg.click('#btnPlay'); ready(pg)
    cards=pg.locator('#seats .pcard').count()
    print('round:',pg.inner_text('#round'),'| tanks',cards,'| chips',pg.locator('.chip').count(),'| shape note:',pg.inner_text('#shapeNote'),'| fuel:',pg.inner_text('#fuel'),'| sandbar hidden:',pg.evaluate("document.getElementById('sandbar').hidden"))
    # shape twice and drive three times in one turn
    pg.keyboard.press('z'); pg.keyboard.press('c'); d1=pg.evaluate("document.getElementById('tool-dig').disabled")
    for _ in range(3): pg.keyboard.press('d'); pg.wait_for_timeout(120)
    print('dig still enabled after two shape actions:', not d1, '| fuel text:', pg.inner_text('#fuel'))
    pg.keyboard.press('w'); pg.wait_for_timeout(100)
    print('picker open:', pg.evaluate("document.getElementById('picker').classList.contains('open')"), '| cards', pg.locator('#pickCards .card').count())
    pg.screenshot(path='/tmp/p_picker.png')
    ids=pg.evaluate("[...document.querySelectorAll('#pickCards .card')].map(c=>c.id.slice(5))")
    pg.keyboard.press('Escape')
    fired=0; stuck=[]
    for i,wid in enumerate(ids):
        if not ready(pg): stuck.append(wid); break
        pg.click('#btnAll'); pg.click('#pick-'+wid); 
        if i%4==0: pg.keyboard.press('Shift+ArrowUp')
        if i%7==3: pg.keyboard.press('ArrowLeft')
        pg.keyboard.press('Space'); fired+=1
        if wid=='crater': pg.wait_for_timeout(180); pg.screenshot(path='/tmp/p_crater.png')
    ok=ready(pg)
    print('fired',fired,'of',len(ids),'| ready after last:',ok,'| stuck',stuck,'| chips still',pg.locator('.chip').count(),'| score',pg.inner_text('#sc0'),'| targets took',[pg.inner_text('#sc%d'%k) for k in range(1,cards)],'|',pg.inner_text('#round'))
    pg.screenshot(path='/tmp/p_after.png')
    pg.click('#btnNewMap'); ready(pg); print('new map ok, score reset:', pg.inner_text('#sc0'))
    pg.click('#btnMenu'); print('resume shown:', pg.evaluate("!document.getElementById('btnResume').hidden")); pg.click('#btnResume'); print('ready after resume', ready(pg))
    print('errs',errs[:5],len(errs))
    b.close()
