/* The footer newsletter sign-up, end to end on the private test copy (storefront :8890 → /newsletter → her
   WordPress copy :8800 → table wp_sndr_newsletter). Drives the real form like a visitor (EN at 1440, IS at 390
   with touch), then reads her database through wp-cli. Built 6 Nov for Anna's "Can we make a newsletter".

     node tools/check-newsletter.mjs

   Scenarios: nothing focused and both languages shown; a wrong address is refused in the page; a new address
   is saved with its language and page; the same address again gives the same answer and no second row; the
   hidden bot field saves nothing; the sixth try in an hour is refused kindly; a forged, replayed or expired
   signature is refused by WordPress itself; WooCommerce > Newsletter lists the rows and the CSV downloads
   (formula cells defused); Mailchimp connected but failing still keeps the address, marked to send later.
   Test addresses end in @example.com and are removed afterwards, with the hourly counters. */
import { createRequire } from 'node:module'; import { execFileSync } from 'node:child_process'; import crypto from 'node:crypto';
const require = createRequire('/Users/sindri/Documents/Website redesign mockups/package.json');
const puppeteer = require('puppeteer-core');
const SF = 'http://localhost:8890/storefront', WP = 'http://localhost:8800';
const wp = php => execFileSync('docker', ['exec', 'mjuk-offline-php-1', 'wp', '--allow-root', 'eval', php], { encoding: 'utf8' }).split('\n').filter(l => !/Deprecated|^\s*$/.test(l)).join('\n').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) fails++; };
const tag = Date.now().toString(36);
const A = `news-en-${tag}@example.com`, B = `news-is-${tag}@example.com`;
const reset = () => wp(`global $wpdb; $wpdb->query("DELETE FROM {$wpdb->prefix}sndr_newsletter WHERE email LIKE 'news-%@example.com'"); $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '\\\\_transient%sndr\\\\_news\\\\_%'"); echo 'ok';`);
const rows = () => JSON.parse(wp(`global $wpdb; sndr_news_install(); echo json_encode($wpdb->get_results("SELECT email, lang, source, mc FROM {$wpdb->prefix}sndr_newsletter WHERE email LIKE 'news-%@example.com' ORDER BY id"));`) || '[]');
const secret = wp('echo SNDR_BAG_SECRET;');
const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signed = (doc, key = secret) => { const payload = b64url(JSON.stringify(doc)); return { payload, sig: b64url(crypto.createHmac('sha256', key).update('news:' + payload).digest()) }; };
const post = body => fetch(`${WP}/wp-json/sndr/v1/newsletter`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));

reset();
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
try {
  const submit = async (p, w, value, trap = '') => {
    await p.evaluate((v, tr) => { const f = document.querySelector('#newsForm'); f.elements.website.value = tr; document.querySelector('#newsEmail').value = ''; }, value, trap);
    await p.focus('#newsEmail'); await p.keyboard.type(value, { delay: 5 });
    await (w < 500 ? p.tap('#newsGo') : p.click('#newsGo'));
    await p.waitForFunction(() => { const m = document.querySelector('#newsMsg').textContent; return m && !/…$/.test(m); }, { timeout: 15000 }).catch(() => {});
    return p.evaluate(() => ({ msg: document.querySelector('#newsMsg').textContent, err: document.querySelector('#newsMsg').classList.contains('is-err'), val: document.querySelector('#newsEmail').value }));
  };
  for (const [lang, w, h, addr] of [['en', 1440, 900, A], ['is', 390, 844, B]]) {
    const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
    await p.setViewport({ width: w, height: h, ...(w < 500 ? { hasTouch: true } : {}) });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`${SF}/${lang === 'is' ? 'is/' : ''}shop.html`, { waitUntil: 'load' }); await sleep(1500);
    await p.evaluate(() => document.querySelector('#news').scrollIntoView({ block: 'center' })); await sleep(700);
    const look = await p.evaluate(() => { const n = document.querySelector('#news'), r = n.getBoundingClientRect(), f = document.querySelector('#newsEmail');
      return { text: n.innerText.replace(/\s+/g, ' '), ph: f.placeholder, focused: n.contains(document.activeElement), sw: document.documentElement.scrollWidth, iw: innerWidth, left: Math.round(r.left), right: Math.round(innerWidth - r.right), trapVisible: document.querySelector('.foot__newsTrap').getBoundingClientRect().left > 0 }; });
    check(lang === 'is' ? /Fréttabréf/i.test(look.text) && /Skrá mig/i.test(look.text) && look.ph === 'Netfangið þitt' : /Newsletter/i.test(look.text) && /Sign up/i.test(look.text) && look.ph === 'Your email', `${lang} ${w}: the box reads in its language ("${look.text.slice(0, 90)}")`);
    check(!look.focused && look.sw <= w + 1 && Math.abs(look.left - look.right) < 3 && !look.trapVisible, `${lang} ${w}: nothing focused, no sideways scroll, centred (${look.left}/${look.right}), bot field hidden`);
    await p.screenshot({ path: `/private/tmp/claude-501/-Users-sindri-Documents-Website-redesign-mockups/ffef1f31-35f2-4a14-8385-7fc28fe59fa1/scratchpad/news-${lang}-${w}.png` }).catch(() => {});
    const bad = await submit(p, w, 'anna@nowhere');
    check(bad.err && /(valid|gilt)/i.test(bad.msg) && rows().length === (lang === 'is' ? 1 : 0), `${lang}: a wrong address is refused in the page ("${bad.msg}"), nothing saved`);
    const ok = await submit(p, w, addr);
    const r1 = rows().filter(x => x.email === addr);
    check(!ok.err && /(on the list|á listanum)/.test(ok.msg) && ok.val === '' && r1.length === 1 && r1[0].lang === lang && /shop\.html/.test(r1[0].source) && /^waiting/.test(r1[0].mc), `${lang}: a new address is saved (${JSON.stringify(r1[0] || {})}), "${ok.msg}"`);
    const again = await submit(p, w, addr.toUpperCase());
    check(!again.err && again.msg === ok.msg && rows().filter(x => x.email === addr).length === 1, `${lang}: the same address again (in capitals) gives the same answer and no second row`);
    const bot = await submit(p, w, `news-bot-${tag}-${lang}@example.com`, 'http://spam.example');
    check(!bot.err && !rows().some(x => /news-bot/.test(x.email)), `${lang}: the hidden bot field gets a kind answer and saves nothing`);
    check(!errs.length, `${lang}: no script errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  // the hourly limit: 4 tries so far from this visitor; the 5th is the last allowed, the 6th is refused
  { const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1440, height: 900 });
    await p.goto(`${SF}/shop.html`, { waitUntil: 'load' }); await sleep(1200);
    const fifth = await submit(p, 1440, `news-five-${tag}@example.com`), sixth = await submit(p, 1440, `news-six-${tag}@example.com`);
    check(!fifth.err && sixth.err && /Too many tries/.test(sixth.msg) && !rows().some(x => /news-six/.test(x.email)), `the 6th sign-up in an hour from one visitor is refused kindly ("${sixth.msg}")`);
    await ctx.close(); }
  // WordPress refuses anything not signed by the shop
  const now = Math.floor(Date.now() / 1000), doc = { v: 1, exp: now + 300, n: 'x' + tag, e: `news-direct-${tag}@example.com`, l: 'en', s: '/t', h: 'abcd' };
  const forged = signed(doc, 'not-the-secret'); check((await post(forged)).status === 400, 'a sign-up signed with the wrong secret is refused (400)');
  check((await post({ payload: 'eyJ2IjoxfQ', sig: '' })).status === 400, 'an unsigned sign-up is refused (400)');
  const late = signed({ ...doc, exp: now - 5 }); check((await post(late)).status === 400, 'an expired sign-up is refused (400)');
  const good = signed(doc), first = await post(good), replay = await post(good);
  check(first.status === 200 && first.body.ok === true && replay.status === 409, `a signed sign-up works once (${first.status}), its replay is refused (${replay.status})`);
  // WooCommerce > Newsletter and the CSV
  wp(`global $wpdb; $wpdb->insert($wpdb->prefix.'sndr_newsletter', array('email'=>'news-=cmd-${tag}@example.com','lang'=>'en','source'=>'=HYPERLINK(1)','created'=>current_time('mysql',true),'updated'=>current_time('mysql',true),'mc'=>'waiting'));`);
  const admin = wp(`$u = get_users(array('role'=>'administrator','number'=>1)); wp_set_current_user($u[0]->ID); ob_start(); sndr_news_admin_page(); echo ob_get_clean();`);
  check(admin.includes(A) && admin.includes(B) && /Download CSV/.test(admin) && /not connected yet/.test(admin), 'WooCommerce > Newsletter lists the sign-ups, offers the CSV and says Mailchimp is not connected');
  const csv = wp(`global $wpdb; $rows = $wpdb->get_results('SELECT email, lang, source, created, mc FROM '.sndr_news_table().' WHERE email LIKE "news-%@example.com" ORDER BY created', ARRAY_N); $o = fopen('php://output','w'); foreach ($rows as $r) fputcsv($o, array_map(function ($v) { return preg_match('/^[=+\\-@]/', (string) $v) ? "'" . $v : $v; }, $r)); fclose($o);`);
  check(csv.includes(A) && csv.includes("'=HYPERLINK(1)") && !/,=HYPERLINK/.test(csv), 'the CSV holds the rows and a formula-looking cell is defused');
  // Mailchimp connected but failing: the address is still kept, marked to send later
  const mc = wp(`if (!function_exists('mailchimp_get_api')) { echo 'no plugin'; return; } $f = function ($o) { $o = is_array($o) ? $o : array(); $o['mailchimp_api_key'] = 'fake0000000000000000000000000000-us1'; $o['mailchimp_list'] = 'fakelist'; return $o; }; add_filter('option_mailchimp-woocommerce', $f); wp_cache_delete('mailchimp-woocommerce-options', 'mailchimp-woocommerce'); $ready = sndr_news_mailchimp_ready() ? 'ready' : 'not ready'; $r = sndr_news_save(array('email'=>'news-mc-${tag}@example.com','lang'=>'en','source'=>'/t','who'=>'')); remove_filter('option_mailchimp-woocommerce', $f); echo $ready . '|' . $r;`);
  const mcRow = rows().find(x => /news-mc-/.test(x.email)), [mcReady, mcState] = mc.split('|');
  check(mcReady === 'ready' && /^error/.test(mcState) && mcRow && mcRow.mc === mcState, `Mailchimp connected but failing keeps the address (mc: "${mc}")`);
} finally { await b.close(); console.log('cleanup', reset()); }
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
