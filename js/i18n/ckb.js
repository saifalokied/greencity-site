/* قاموس الكردية (السورانية، بالحرف العربي) — مجموع أجزائه.
   كل جزء لشاشاتٍ متقاربة، فمن يصحّح ترجمةً يجدها قرب أخواتها.
   وإن تكرّر مفتاح في جزأين غلب الأخير — والفحص (test/d-i18n.test.js)
   يمنع أن يختلفا، ويمنع جزءاً في المجلّد لا يُدمج هنا. */
import shell from './ckb/shell.js';
import reports from './ckb/reports.js';
import dashboard from './ckb/dashboard.js';
import stock from './ckb/stock.js';
import vouchers from './ckb/vouchers.js';
import custody from './ckb/custody.js';
import siteplan from './ckb/siteplan.js';
import people from './ckb/people.js';
import cloud from './ckb/cloud.js';
import server from './ckb/server.js';
import setup from './ckb/setup.js';
import v2 from './ckb/v2.js';
import v2more from './ckb/v2more.js';
import v2admin from './ckb/v2admin.js';
import v3 from './ckb/v3.js';
import v4fixa from './ckb/v4-fix-a.js';
import v4fixb from './ckb/v4-fix-b.js';
import v4fixc from './ckb/v4-fix-c.js';
import v4fixd from './ckb/v4-fix-d.js';
import v4web from './ckb/v4-web.js';
import v4desk from './ckb/v4-desk.js';
import v4srv from './ckb/v4-srv.js';

export default {
  ...shell, ...reports, ...dashboard, ...stock, ...vouchers,
  ...custody, ...siteplan, ...people, ...cloud, ...server, ...setup,
  /* الإصدار الثاني أخيراً: عباراته تغلب ما سبقها إن اختلفت. */
  ...v2, ...v2more, ...v2admin,
  /* والثالث بعدهما. */
  ...v3,
  /* والرابع أخيراً. */
  ...v4fixa, ...v4fixb, ...v4fixc, ...v4fixd, ...v4web, ...v4desk, ...v4srv,
};
