// 0.6.0: a patient address read in an older session, a session the server forgot and
// a wrong password, against the mock in strict session mode.
'use strict';
const { startMock, launch, loggedInPage, hostFor, check, done } = require('./helpers');
const { createDriver, sessionUrl, usidOf } = require('../src/driver');

(async () => {
  check(sessionUrl('http://h/home.aspx?wpid=bacsidraw&usid=1_a&noitruid=x', '1_b') === 'http://h/home.aspx?wpid=bacsidraw&usid=1_b&noitruid=x', 'sessionUrl swaps usid');
  check(sessionUrl('http://h/home.aspx?wpid=x', '1_b') === 'http://h/home.aspx?wpid=x', 'sessionUrl leaves an address without usid');
  check(usidOf('http://h/a?usid=10.0.0.1_s3#x') === '10.0.0.1_s3', 'usidOf');
  const m = await startMock();
  const browser = await launch();
  const session = (b) => fetch(m.base + '/api/__session', { method: 'POST', body: JSON.stringify(b) }).then((r) => r.json());
  try {
    const page = await loggedInPage(browser, m.base);
    const logs = [];
    let account = { user: 'bs', pass: 'x' };
    let tries = 0;
    let d;
    d = createDriver({
      ...hostFor(page, logs),
      timeout: 15000,
      login: async () => {
        tries++;
        const r = await d.login(account.user, account.pass);
        if (!r.ok) logs.push('login failed: ' + r.error);
        return r.ok;
      },
    });
    const pts = await d.scanPatients();
    const u1 = usidOf(pts[0].url);
    check(/^10\.0\.0\.1_s\d+$/.test(u1), 'patient address carries the session usid: ' + u1);

    // A new session (the user logged in again): old addresses have the old usid.
    await session({ strict: true });
    await page.goto(m.base + '/login.aspx');
    await page.fill('#txtUser', 'bs');
    await page.fill('#txtPass', 'x');
    await Promise.all([page.waitForNavigation(), page.click('#btnLogin')]);
    const u2 = usidOf(page.url());
    check(u2 && u2 !== u1, 'second login has a new usid ' + u2);
    await d.openPatient(pts[0]);
    check((await d.where()).page === 'bacsi' && usidOf(page.url()) === u2, 'patient opened with the new usid: ' + page.url());
    check(tries === 0, 'no login needed for that');

    // The server forgot the session: the tool logs in again by itself and carries on.
    const before = (await session({})).logins;
    await session({ expire: true });
    await d.openPatient(pts[1]);
    const after = (await session({})).logins;
    check(tries === 1 && after === before + 1, 'logged in again by itself');
    check((await d.where()).page === 'bacsi' && (await d.where()).noitruid === pts[1].noitruid, 'patient 2 opened after the login');
    await d.gotoList(true);
    check((await d.where()).page === 'list', 'list opens in the new session');

    // A wrong password: stops with "Chưa đăng nhập" and the page's message.
    await session({ expire: true, badPass: 'sai' });
    account = { user: 'bs', pass: 'sai' };
    let err = '';
    await d.openPatient(pts[2]).catch((e) => (err = e.message));
    check(/Chưa đăng nhập/.test(err), 'wrong password stops the job: ' + err);
    check(logs.some((l) => /login failed: .*Sai tên tài khoản/.test(l)), 'the page message is reported');
    await session({ badPass: '' });

    // loginForm on the login page, nothing on other pages.
    await page.goto(m.base + '/login.aspx');
    const f = await d.call('loginForm');
    check(f.ok && f.user && f.button, 'loginForm finds account, password and button');
    account = { user: 'bs', pass: 'x' };
    const r = await d.login('bs', 'x');
    check(r.ok && (await d.where()).page !== 'login', 'login() gets past the login page');
    check(!(await d.call('loginForm')).ok, 'no login form on the start page');
  } catch (e) {
    console.log('ERROR', e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await m.close();
  }
  done();
})();
