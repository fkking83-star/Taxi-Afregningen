const { chromium } = require('playwright'); const path = require('path');
const BASE='https://vehgabygvxnkrqsoazfs.supabase.co';
const lon=(c,u)=>({chauffor:c,regnskabsmaaned:'2026-09',antal_ture:6,indkort_i_alt:10000,overfort_i_alt:10000,afregn_difference:0,kontant_i_alt:0,bro_faerge_i_alt:0,model:'45%',andel_brutto:4500,til_udbetaling:u});
const t=(id,nr,dato,ch='Fuad',vs='06:00')=>({id,dato,slutrapport_nr:nr,chauffor:ch,indkort:2500+Number(id.slice(1)),overfort:2500+Number(id.slice(1)),kontant:0,vagt_start:vs,vagt_slut:'14:00',billede_url:null,bekraeftet:false});
const TURE=[t('f1','1810','2026-09-01'),t('f2','1811','2026-09-02'),t('f3','1912','2026-09-03'),t('f4','1813','2026-09-04'),
            t('f5','ABC','2026-09-05'),t('f6','1814','2026-09-06'),t('f7','1815','2026-09-06','Fuad','22:00'),
            t('a1','1514','2026-09-01','Adan'),t('a2','1614','2026-09-02','Adan'),   // Adan: to vagter der ikke passer sammen
            // Qaalid kører bil 18xx, men låner Faysals bil (10xx) 3/9: ingen alarm, fordi Faysals vagter tæller med
            t('q1','1850','2026-09-01','Qaalid','18:00'),t('q2','1851','2026-09-02','Qaalid','18:00'),t('q3','1087','2026-09-03','Qaalid','18:00'),
            t('q4','1852','2026-09-04','Qaalid','18:00'),t('y1','1085','2026-09-02','Faysal'),t('y2','1086','2026-09-03','Faysal'),t('y3','1088','2026-09-04','Faysal')];
let fails=0; const check=(c,m)=>{console.log(`${c?'PASS':'FAIL'}  ${m}`); if(!c) fails++;};
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1440,height:900}}); const errs=[];
  p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text())});
  await p.route('**/*',r=>{const u=r.request().url();
    if(u.startsWith(`${BASE}/rest/v1/rpc/`)){const fn=u.split('/rpc/')[1];
      if(fn==='hent_alle')return r.fulfill({json:[lon('Fuad',45170),lon('Adan',47415.2)]});
      if(fn==='hent_ture')return r.fulfill({json:TURE}); return r.fulfill({json:[]});}
    if(u.startsWith('file://'))return r.continue(); return r.fulfill({status:404,body:''});});
  await p.goto('file://'+path.join(__dirname,'..','..','site','dashboard.html')+'?k=t'); await p.waitForSelector('#rapporter table'); await p.waitForTimeout(400);
  const gul=async id=>p.$eval(`#row-${id} td:nth-child(2)`,td=>td.classList.contains('nr-afvig')?td.title:'');
  check((await gul('f3')).includes('Måske 1812'),'1912 mellem 1811 og 1813 markeres gult med forslag 1812');
  for(const id of ['f1','f2','f4','f5','f6','f7']) check(await gul(id)==='',`${id}: normalt nummer ikke markeret`);
  check((await p.textContent('#row-f3 td:nth-child(2)')).includes('⚠ 1912'),'Gul celle viser ⚠ foran nummeret');
  check((await p.textContent('#lonBody')).includes('45.170,00'),'Lønseddel uændret');
  check(await p.$eval('#row-f3',tr=>tr.cells.length)===11,'Rækken har stadig 11 kolonner');
  await p.selectOption('#driver','Adan'); await p.waitForTimeout(400);
  check((await gul('a1'))!=='' && (await gul('a2'))!=='','Kun to vagter i bilen (1514/1614), og ingen andre i nærheden: begge markeres');
  await p.selectOption('#driver','Qaalid'); await p.waitForTimeout(400);
  check((await gul('q3'))==='' && (await gul('q1'))==='' && (await gul('q4'))==='','Qaalid låner Faysals bil (1087 mellem 1851 og 1852): ingen falsk alarm');
  await p.selectOption('#driver','Faysal'); await p.waitForTimeout(400);
  check((await gul('y1'))==='' && (await gul('y2'))==='' && (await gul('y3'))==='','Faysal: nummerspring (1086 -> 1088) pga. delt bil giver ingen alarm');
  check(errs.length===0,'Ingen JS-fejl'+(errs.length?': '+errs.join(' | '):''));
  await b.close(); console.log(fails?`\n${fails} FEJL`:'\nALLE TESTS BESTÅET'); process.exit(fails?1:0);})();
