const f=require('../hjaelpere/nr_advarsler.cjs');
const d=`2026-08-28 1830 15:04|2026-08-29 1831 17:08|2026-08-30 1832 14:57|2026-08-31 1833 15:41|2026-09-01 1834 16:05|2026-09-02 1835 15:41|2026-09-03 1836 16:28|2026-09-04 1840 16:48|2026-09-05 1337 06:04|2026-09-05 1837 15:56|2026-09-06 1841 16:26|2026-09-07 1842 16:28|2026-09-08 1843 16:41|2026-09-09 1844 16:25|2026-09-10 1845 17:32|2026-09-11 1846 15:46|2026-09-12 1087 17:45|2026-09-13 2303 17:58|2026-09-13 1849 18:07|2026-09-14 1850 16:09|2026-09-15 1852 21:52|2026-09-17 1855 19:13|2026-09-18 1857 18:41|2026-09-19 1958 16:05|2026-09-21 1859 16:02|2026-09-21 1951 16:45|2026-09-22 1866 15:48|2026-09-23 1861 18:38|2026-09-24 1862 14:21`;
const r=f(d.split('|').map(x=>{const [dato,nr,vs]=x.split(' ');return{id:nr,dato,slutrapport_nr:nr,vagt_start:vs}}));
let fails=0; const check=(c,m)=>{console.log(`${c?'PASS':'FAIL'}  ${m}`); if(!c) fails++;};
check(JSON.stringify(Object.keys(r).sort())===JSON.stringify(['1087','1337','1951','1958','2303']),'Qaalids rigtige data: præcis 1087, 1337, 1951, 1958, 2303 markeres');
check(!r['1859'],'1859 markeres IKKE, selvom begge nærmeste naboer (1958, 1951) er fejllæst');
check(r['1958'].includes('Måske 1858?') && r['1951'].includes('Måske 1851?'),'18/19-forslag: 1958 -> 1858, 1951 -> 1851');
check(r['1087'].includes('forventet ca. 1848') && r['1087'].includes('Tjek billedet'),'Uden 18/19-forslag vises forventet nummer + "Tjek billedet"');
console.log(fails?`\n${fails} FEJL`:'\nALLE TESTS BESTÅET'); process.exit(fails?1:0);
