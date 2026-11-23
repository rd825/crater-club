import os, sys, time
from playwright.sync_api import sync_playwright
url='file://'+sys.argv[1]
which=sys.argv[2:] 
errs=[]
FAST="""let ft=0; const st=window.setTimeout.bind(window);
window.requestAnimationFrame=cb=>st(()=>{ft+=50; cb(ft)},0);
window.setTimeout=(f,ms,...a)=>st(f,(ms||0)/12,...a);"""
def setup(pg, players, **opts):
    n=pg.locator('#playerRows select').count()
    while n<len(players): pg.click('#pPlus'); n+=1
    while n>len(players): pg.click('#pMinus'); n-=1
    for i,t in enumerate(players): pg.select_option('#ptype-%d'%i, t)
    amount=opts.pop('amount',None)
    for k,v in opts.items(): pg.select_option('#set-'+k, v)
    if amount is not None: pg.fill('#set-amount', str(amount)); pg.dispatch_event('#set-amount','change')
def play(pg, label, draft=False, snaps=(), limit=300):
    pg.click('#btnStart')
    presses=0; t0=time.time(); picks=0; real=0; tools=['z','c','v','x']
    while time.time()-t0<limit:
        if pg.evaluate("document.getElementById('over').classList.contains('open')"): break
        if draft and pg.evaluate("document.getElementById('draft').classList.contains('open')"):
            c=pg.locator('.card:not([disabled])')
            if c.count(): c.first.click(); picks+=1
            pg.wait_for_timeout(10); continue
        if pg.evaluate("!document.getElementById('fire').disabled"):
            rnd=pg.inner_text('#round')
            if rnd!='Tracer round':
                real+=1
                if real%2==1: pg.keyboard.press(tools[(real//2)%4])
                if real==2 and 'shape' in snaps: pg.hover('#tool-wall'); pg.wait_for_timeout(120); pg.screenshot(path='/tmp/h_%s_shape.png'%label)
            if presses%3==0: pg.keyboard.press('e'); pg.keyboard.press('Shift+ArrowUp')
            if presses%5==2: pg.keyboard.press('d')
            pg.wait_for_timeout(40); pg.keyboard.press('Space'); presses+=1
            for k,(n,ms) in {'a':(2,170),'b':(4,260),'c':(7,330)}.items():
                if real==n and k in snaps: pg.wait_for_timeout(ms); pg.screenshot(path='/tmp/h_%s_%s.png'%(label,k))
        pg.wait_for_timeout(22)
    over=pg.evaluate("document.getElementById('over').classList.contains('open')")
    print(label,'presses',presses,'picks',picks,'over',over,'|',pg.inner_text('#overTitle'),'|',pg.inner_text('#finals').replace('\n',' ')[:140],'|',pg.inner_text('#env'),'|',pg.inner_text('#round'),'| secs',round(time.time()-t0), flush=True)
    if not over: pg.screenshot(path='/tmp/h_%s_STUCK.png'%label)
    return over
RUNS={
 'A':(['human','veteran'], dict(mode='volleys', amount=25, deal='random', confirm='off', biome='hills', time='noon', weather='clear', wind='calm'), dict(snaps=('shape','a','b','c'))),
 'B':(['human','rookie','regular','veteran','ace','regular'], dict(mode='health', amount=100, deal='random', confirm='off', biome='islands', time='dusk', weather='storm'), dict(snaps=('b',))),
 'C':(['ace','veteran','regular','rookie','ace','veteran','regular','rookie'], dict(mode='volleys', amount=6, deal='draft', biome='caldera', weather='clear', time='night'), dict(draft=True)),
 'D':(['human','ace'], dict(mode='volleys', amount=25, deal='random', confirm='off', biome='canyon', weather='rain', time='dawn', wind='breeze'), dict(snaps=('c',))),
 'E':(['human','veteran','veteran'], dict(mode='volleys', amount=17, deal='random', confirm='off', biome='moon', weather='meteors', size='large'), dict()),
 'F':(['human','human','veteran','veteran'], dict(mode='health', amount=120, deal='draft', teams='teams', confirm='off', biome='peaks', weather='snow', size='small'), dict(draft=True)),
 'G':(['human','regular','ace'], dict(mode='volleys', amount=17, deal='random', confirm='off', biome='mesa', weather='fog', wind='gusty', size='medium'), dict(snaps=('b',))),
}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1180,'height':820})
    pg.add_init_script(FAST)
    pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE '+m.text) if m.type=='error' and 'ERR_' not in m.text and 'Failed to load' not in m.text else None)
    pg.goto(url); pg.wait_for_timeout(2500)
    pg.screenshot(path='/tmp/h_menu.png')
    print('boot errors', errs, flush=True)
    first=True
    for k in (which or list(RUNS)):
        players,opts,kw=RUNS[k]
        if not first: pg.click('#btnSetup')
        first=False
        setup(pg, players, **opts)
        ok=play(pg, k, **kw)
        if errs: print('ERRORS so far', errs[:6], len(errs), flush=True)
        if not ok: pg.reload(); pg.wait_for_timeout(1500); first=True
    b.close()
print('ERRORS',errs[:8], len(errs))
