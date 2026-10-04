/* Static snapshot adapter: every history value comes from published engine output. */
window.BTC_PAGES=true;
(() => {
 const base=new URL('./',location.href),cache=new Map(),key='btc-contract-research-pages.records.v1';
 const safe=s=>{if(!/^[\w.-]+$/.test(s||''))throw Error('无效记录标识');return s;};
 async function unpack(path){const r=await fetch(new URL(path,base));if(!r.ok)throw Error(`文件读取失败 (${r.status})：${path}`);const buffer=await r.arrayBuffer(),bytes=new Uint8Array(buffer);if(bytes[0]===31&&bytes[1]===139){if(!globalThis.DecompressionStream)throw Error('请使用新版 Chrome、Edge、Firefox 或 Safari 打开');return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).text();}return new TextDecoder().decode(buffer);}
 async function json(path){if(!cache.has(path)){if(cache.size>=12)cache.delete(cache.keys().next().value);cache.set(path,unpack(path+'.gz').then(JSON.parse).catch(e=>{cache.delete(path);throw e;}));}return cache.get(path);}
 const records=()=>JSON.parse(localStorage.getItem(key)||'[]');
 const persist=rows=>{try{localStorage.setItem(key,JSON.stringify(rows));}catch{throw Error('浏览器存储已满或被禁止。请先导出记录，或允许此站点使用本地存储。');}};
 async function mutate(action,body){
  const rows=records();let value;
  if(action==='save'){
   if(rows.length>=5000)throw Error('记录达到 5,000 条上限，请导出备份');
   const inputs={...body.inputs},parent=rows.find(r=>r.id===body.parentId&&!r.deletedAt);
   if(body.parentId&&!parent)throw Error('上期记录已删除或不存在，请重新选择');
   if(parent){inputs.capital=parent.result.endingCapital;if(inputs.capital<1)throw Error('上期剩余本金不足 1 USDT，不能继续复利');}
   value={id:crypto.randomUUID().replaceAll('-',''),createdAt:new Date().toISOString(),parentId:parent?.id||null,period:parent?parent.period+1:1,inputs,result:calculateScenario(inputs),note:String(body.note||'').slice(0,200)};rows.push(value);
  }else{value=rows.find(r=>r.id===body.id);if(!value)throw Error('记录不存在');if(action==='delete')value.deletedAt=new Date().toISOString();else if(action==='restore')delete value.deletedAt;else throw Error('无效操作');}
  persist(rows);return value;
 }
 async function market(){
  try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);let results;
   try{results=await Promise.all(['/fapi/v1/premiumIndex','/fapi/v2/ticker/price'].map(async p=>{const r=await fetch('https://fapi.binance.com'+p+'?symbol=BTCUSDT',{signal:controller.signal});if(!r.ok)throw Error(String(r.status));return r.json();}));}finally{clearTimeout(timer);}
   const [m,t]=results,price=Number(t.price),markPrice=Number(m.markPrice),fundingRate=Number(m.lastFundingRate),exchangeTime=Number(m.time);
   if(![price,markPrice,fundingRate,exchangeTime].every(Number.isFinite)||price<=0||markPrice<=0||!exchangeTime)throw Error('无效报价');
   return {symbol:'BTCUSDT',price,markPrice,fundingRate,exchangeTime,stale:Math.abs(Date.now()-exchangeTime)>180000||Math.abs(Date.now()-Number(t.time))>180000,fetchedAt:new Date().toISOString()};
  }catch{return {error:'无法从当前网络读取币安官方行情，请刷新重试或手动填写参考价。不会用虚构价格替代。'};}
 }
 const sorts={FinalEquity:['FinalEquity',-1],NetProfit:['NetProfit',-1],Return:['TotalReturnPct',-1],MaxDrawdown:['MaxDrawdownPct',1],RiskAdjustedReturn:['RiskAdjustedReturn',-1],Funding:['TotalFunding',1],TradeCount:['TotalTrades',-1],CAGR:['CAGRPct',-1],Sharpe:['DailySharpeRatio',-1],Sortino:['DailySortinoRatio',-1],Calmar:['CalmarRatio',-1],ProfitFactor:['ProfitFactor',-1],UnderwaterDays:['LongestCloseDrawdownDays',1],CloseDrawdown:['CloseToCloseMaxDrawdownPct',1]};
 const modelData=run=>json(`data/${safe(run)}/models.json`);
 async function tradeData(run,id){const index=await json(`data/${safe(run)}/trade-index.json`),shard=index[safe(id)];if(shard===undefined)throw Error('未找到该策略逐笔记录');return (await json(`data/${run}/trades-${shard}.json`))[id];}
 window.btcStaticApi=async(path,body)=>{
  const u=new URL(path,base),p=u.pathname,q=u.searchParams,run=q.get('run');
  switch(p){
   case '/api/health':return {mode:'GITHUB_PAGES',version:'1.7.9'};
   case '/api/system':return json('data/snapshot.json');
   case '/api/config':return json('data/config.json');
   case '/api/runs':return json('data/runs.json');
   case '/api/report':return json(`data/${safe(run)}/report-meta.json`);
   case '/api/cycle-risk':{const index=await json('data/risk-index.json'),key=index[safe(run)];if(!key)throw Error('本快照未生成跨周期核验');return json(`data/risk/${safe(key)}.json`);}
   case '/api/models':{let rows=[...await modelData(run)];const group=q.get('group'),max=q.get('maxDrawdown'),min=Number(q.get('minTrades')||0);rows=rows.filter(m=>(!group||group==='ALL'||m.Group===group||group==='FUTURES'&&m.Market==='FUTURES')&&(max===null||max===''||m.MaxDrawdownPct!=null&&m.MaxDrawdownPct<=Number(max))&&(m.ClosedTrades||0)>=min&&(q.get('excludeLiquidated')!=='1'||!m.Liquidated));const outcome=q.get('outcome')||'ALL';if(!['ALL','SURVIVED','LIQUIDATED','PROFIT','LOSS','FLAT','NO_TRADE','UNKNOWN'].includes(outcome))throw Error('Invalid outcome filter');rows=rows.filter(m=>outcome==='ALL'||(outcome==='SURVIVED'?['PROFIT','LOSS','FLAT'].includes(outcomeState(m)):outcomeState(m)===outcome));const [field,sign]=sorts[q.get('sort')]||sorts.FinalEquity;rows.sort((a,b)=>a[field]==null?(b[field]==null?b.FinalEquity-a.FinalEquity:1):b[field]==null?-1:(a[field]-b[field])*sign||b.FinalEquity-a.FinalEquity);const limit=Number(q.get('limit')||20),page=Number(q.get('page')||0);return {total:rows.length,page,rows:rows.slice(page*limit,(page+1)*limit)};}
   case '/api/trades':{const id=q.get('strategy'),model=(await modelData(run)).find(m=>m.StrategyID===id);if(!model)throw Error('模型不存在');return {model,trades:await tradeData(run,id),curve:null};}
   case '/api/lab/defaults':return json('data/lab-defaults.json');
   case '/api/lab/latest':return json('data/lab-latest.json');
   case '/api/lab/portfolio':return json(`lab-files/${safe(q.get('id'))}/${safe(q.get('portfolio'))}.json`);
   case '/api/sim/reference':return {maker:.0002,taker:.0005,feeMode:'PUBLIC_REFERENCE',feeLabel:'普通用户公开参考费率（非账户自动获取）',referenceCheckedDate:'2026-10-03',brackets:null,marginLabel:'手动维持保证金率 · 简化估算'};
   case '/api/sim/market':return market();
   case '/api/sim/calculate':return calculateScenario(body.inputs);
   case '/api/sim/records':return records().filter(r=>!r.deletedAt);
   case '/api/sim/save':return mutate('save',body);
   case '/api/sim/delete':return mutate('delete',body);
   case '/api/sim/restore':return mutate('restore',body);
   case '/api/estimate':if(!body?.config?.Symbol)throw Error('配置缺少 Symbol');return {};
   case '/api/run':case '/api/lab/start':throw Error('免费站不运行批量回测。请在本地完整版执行，然后发布更新结果。');
   case '/api/active':case '/api/job':case '/api/research':case '/api/lab/active':case '/api/lab/status':return {status:'IDLE'};
   default:throw Error('免费版未提供此接口：'+p);
  }
 };
 function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 function csv(rows){if(!rows.length)return '';const fields=Object.keys(rows[0]),cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';return '\ufeff'+[fields,...rows.map(r=>fields.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n');}
 document.addEventListener('click',async e=>{
  const a=e.target.closest('a');if(!a||!a.href)return;const u=new URL(a.href);if(u.origin!==location.origin)return;
  let p=u.pathname.slice(base.pathname.length);if(u.pathname==='/api/lab/export')p='api/lab/export';
  if(!/^(files|lab-files)\//.test(p)&&p!=='api/lab/export')return;e.preventDefault();const old=a.textContent;a.textContent='准备下载…';
  try{
   if(p==='api/lab/export'){const q=u.searchParams,kind=q.get('kind'),suffix=kind==='curve'?(q.get('window')||'0'):(q.get('segment')||'Test');p=`lab-files/${safe(q.get('id'))}/exports/${safe(q.get('portfolio'))}-${safe(kind)}-${safe(suffix)}.csv`;}
   const m=p.match(/^files\/([^/]+)\/trade_history\/([^/]+)\.csv$/);let data;
   if(m)data=csv(await tradeData(m[1],m[2]));else data=await unpack(p+'.gz');
   download(data,p.split('/').pop(),p.endsWith('.json')?'application/json':'text/csv;charset=utf-8');
  }catch(ex){alert(ex.message);}finally{a.textContent=old;}
 });
})();
