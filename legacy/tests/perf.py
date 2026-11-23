import os, sys, time
from playwright.sync_api import sync_playwright
url='file://'+sys.argv[1]
HOOK="""window.__ft=[]; const raf=window.requestAnimationFrame.bind(window);
window.requestAnimationFrame=cb=>raf(t=>{const a=performance.now(); cb(t); window.__ft.push(performance.now()-a);});"""
def stats(pg,label):
    r=pg.evaluate("(()=>{const a=window.__ft.splice(0); a.sort((x,y)=>x-y); const n=a.length; return n?[n, a.reduce((s,v)=>s+v,0)/n, a[Math.floor(n*0.95)], a[n-1]]:[0,0,0,0]})()")
    print('%-34s frames %4d  avg %.1f ms  p95 %.1f ms  max %.1f ms'%(label,r[0],r[1],r[2],r[3]), flush=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1440,'height':900}, device_scale_factor=2)
    pg.add_init_script(HOOK)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(1500)
    for biome,wx,n in [('islands','storm',8),('caldera','clear',8),('hills','rain',4)]:
        k=pg.locator('#playerRows select').count()
        while k<n: pg.click('#pPlus'); k+=1
        while k>n: pg.click('#pMinus'); k-=1
        for i in range(n): pg.select_option('#ptype-%d'%i,'veteran')
        pg.select_option('#set-deal','random'); pg.select_option('#set-biome',biome); pg.select_option('#set-weather',wx); pg.select_option('#set-size','large'); pg.select_option('#set-mode','volleys')
        pg.fill('#set-amount','4'); pg.dispatch_event('#set-amount','change')
        pg.click('#btnStart'); pg.wait_for_timeout(1000); pg.evaluate("window.__ft.length=0")
        pg.wait_for_timeout(16000); stats(pg, '%s %s, %d tanks, large, 2x'%(biome,wx,n))
        pg.click('#btnMenu'); pg.wait_for_timeout(300)
    print('errs',errs[:5])
    b.close()
